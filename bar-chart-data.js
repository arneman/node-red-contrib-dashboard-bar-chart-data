module.exports = function(RED) {

	function barChartDataNode(config) {
		RED.nodes.createNode(this, config);

		this.on('input', function(msg) {
			this.unit = config.unit;
			this.x_interval = config.interval || 'hours';
			this.x_size = config.x_size || 24;
			this.precision = config.precision || 2;
			this.is_meter_reading = config.is_meter_reading || false;
			this.agg_by = config.agg_by || 'sum';

			if (msg.payload == 'clear') 
				clearNode(msg,this);
			else if (msg.hasOwnProperty("bar_keys")) //restore
				restoreNode(msg,this);
			else       
				barChartData(msg,this);
			this.send(msg);
		});
	}

  RED.nodes.registerType("bar-chart-data", barChartDataNode);
}

function clearNode(msg, myNode) {
	flow.set(msg.topic + '_data', {});
	return {payload: {}, topic: msg.topic};
};


function restoreNode(msg, myNode) {
	var data = msg.payload[0].data[0];
	var keys = msg.bar_keys;
	var restored_data = {};
	for (var i = 0; i < data.length; i++) {
			restored_data[keys[i]] = data[i];
	}
	flow.set(msg.topic + '_data', restored_data);
	return msg; //update dashboard
};


function barChartData(msg,myNode) {
	var m={};
	var data = flow.get(msg.topic + '_data')||{};
	var reading = msg.payload;
	var curDate = new Date();

	//if is_meter_reading == true, use diff between last and current payload value
	if (myNode.is_meter_reading) {
		var last = Number(flow.get(msg.topic + '_last')||msg.payload);
		reading = last - Number(msg.payload);
		flow.set(msg.topic + '_last', msg.payload);
		return;
	}

	//remove outdated elements from data
	var newkeys = buildKeys(curDate);
	for (var oldkey in data) {
		if (!newkeys.includes(oldkey)) {
			delete data[oldkey];
		}
	}

	//current key
	var curKey = newkeys[newkeys.length-1];

	//calc new Value for the current period
	var oldVal = null;
	if (data.hasOwnProperty(curKey)) {
		oldVal = data[curKey];
	}
	var newVal = oldVal;
	if(myNode.agg_by == "sum") {
		newVal = Math.round(((oldVal||0) + Number(reading))*100000000)/100000000;
	}
	if(myNode.agg_by == "min") {
		newVal = Math.min(oldVal, reading);
	}
	if(myNode.agg_by == "max") {
		newVal = Math.max(oldVal, reading);
	}
	data[curKey] = newVal;

	//store new data in the context store
	flow.set(msg.topic + '_data', data);

	//build msg
	m.labels = buildLabels(curDate);
	m.series = [myNode.unit];
	m.data = [[]];
	//build factor for the rounding
	var precision = 1;
	if (myNode.precision > 0) {
		precision = 10 * Math.round(myNode.precision);
	}
	newkeys.forEach(function(key) {
		if (data.hasOwnProperty(key)) {
			m.data[0].push(Math.round(data[key]*precision)/precision);
		} else {
			m.data[0].push(0);
		}
	});
	msg.payload=[m];

	//send list of complete keys, used also as flag to be able to identify bar 
	//data at the input of this node, to restore the context store (after reboot)
	//this makes the use of persist nodes possible
	msg.bar_keys = newkeys; 

	//add min,max,sum
	msg.data_min = Math.min(...m.data[0]);
	msg.data_max = Math.max(...m.data[0]);
	const arrSum = arr => arr.reduce((a,b) => a + b, 0)
	msg.data_sum = arrSum(m.data[0]);

	//put all settings into msg (could be used for dynamic chart titles etc.)
	msg.settings = {unit: myNode.unit,
					x_interval: myNode.interval,
					x_size: myNode.x_size,
					precision: myNode.precision,
					is_meter_reading: myNode.is_meter_reading,
					agg_by: myNode.agg_by
				   };
				   
	return msg;
	
	function buildDateKey(date) {
		var fullKey = ("" + date.getFullYear()) + 
					  ("0" + (date.getMonth()+1)).slice(-2)  +
					  ("0" + date.getDate()).slice(-2)  +
					  ("0" + date.getHours()).slice(-2) + 
					  ("0" + date.getMinutes()).slice(-2) + 
					  ("0" + date.getSeconds()).slice(-2);
		
		if (myNode.x_interval == "seconds") {
			return fullKey;
		} 
		else if (myNode.x_interval == "minutes") {
			return fullKey.slice(0, -2);
		}
		else if (myNode.x_interval == "quarter_hours") {
			return fullKey.slice(0, -4) + "_" + getQuarterHour(date);
		} 
		else if (myNode.x_interval == "hours") {
			return fullKey.slice(0, -4);
		} 
		else if (myNode.x_interval == "days") {
			return fullKey.slice(0, -6);
		}
		else if (myNode.x_interval == "months") {
			return fullKey.slice(0, -8);
		}
		else if (myNode.x_interval == "years") {
			return fullKey.slice(0, -10);
		}
	};

	function getQuarterHour(date) {
		return Math.floor( (date.getMinutes() ) / 15 ) + 1;
	};

	function dateMinus(date_in, minus=1) {
		date = new Date(date_in);
		if (myNode.x_interval == "seconds") {
			date.setSeconds(date.getSeconds()-minus);
		}
		else if (myNode.x_interval == "minutes") {
			date.setMinutes(date.getMinutes()-minus);
		}
		else if (myNode.x_interval == "quarter_hours") {
			date.setMinutes(date.getMinutes()-(minus*15));
		}
		else if (myNode.x_interval == "hours") {
			date.setHours(date.getHours()-minus);
		}
		else if (myNode.x_interval == "days") {
			date.setDate(date.getDate()-minus);
		}
		else if (myNode.x_interval == "months") {
			date.setMonth(date.getMonth()-minus);
		}
		else if (myNode.x_interval == "years") {
			date.setFullYear(date.getFullYear()-minus);
		}
		return date;
	};

	function buildLabels(date) {
		var labels = [];
		for (var i = 0; i < myNode.x_size; i++) {
			var label;
			if (myNode.x_interval == "seconds") {
				label = ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2) + ":" + ("0" + date.getSeconds()).slice(-2);
			}
			else if (myNode.x_interval == "minutes") {
				label = ("0" + date.getHours()).slice(-2) + ":" + ("0" + date.getMinutes()).slice(-2);
			}
			else if (myNode.x_interval == "quarter_hours") {
				label_date = new Date(date);
				label_date.setMinutes(getQuarterHour(date)*15);
				label = ("0" + label_date.getHours()).slice(-2) + ":" + ("0" + label_date.getMinutes()).slice(-2);
			}
			else if (myNode.x_interval == "hours") {
				label = ("0" + date.getHours()).slice(-2);
			}
			else if (myNode.x_interval == "days") {
				label = ("0" + (date.getMonth()+1)).slice(-2) + "-" + ("0" + date.getDate()).slice(-2);
			}
			else if (myNode.x_interval == "months") {
				label = "" + date.getFullYear() + "-" + ("0" + (date.getMonth()+1)).slice(-2);
			}
			else if (myNode.x_interval == "years") {
				label = "" + date.getFullYear();
			}
			labels.push(label);
			date = dateMinus(date);
		}
		return labels.reverse();
	};

	function buildKeys(date) {
		var keys = [];
		for (var i = 0; i < myNode.x_size; i++) {
			keys.push (buildDateKey(date));
			date = dateMinus(date);
		}
		return keys.reverse();
	};
};




