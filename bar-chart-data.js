module.exports = function(RED) {

	function barChartDataNode(config) {
		RED.nodes.createNode(this, config);

		this.on('input', function(msg) {
			this.unit = config.unit;
			this.x_interval = config.x_interval || 'hours';
			this.x_size = config.x_size || 24;
			this.precision = config.precision || 2;
			this.is_meter_reading = (config.is_meter_reading == 'True') || false;
			this.agg_by = config.agg_by || 'sum';
			
			var store = this.context();
			
			if (msg.payload === 'clear') 
				clearNode(msg,this,store);
			else if (msg.hasOwnProperty("bar_keys")) //restore
				restoreNode(msg,this,store);
			else      
				barChartData(msg,this,store);
			this.send(msg);
		});
	}

  RED.nodes.registerType("bar-chart-data", barChartDataNode);
}

function clearNode(msg, myNode, store) {
	var topics = store.get('topics')||[];
	var topicsOld = store.get('topics')||[];
	//maybe only 1 specific topic should be cleared
	if (msg.topic != "") {
		topics = [msg.topic];
	}

	//for all topics
	for (var i = 0; i < topics.length; i++) {
		store.set(topics[i] + '_data', {});
		store.set(topics[i] + '_last', {});
	}
	
	//clear data_counter array
	var dataCounterNew = [];
	if (msg.topic != "" && topicsOld.length > 1) {
		dataCounterNew = store.get('data_counter')||[];
		dataCounterNew.splice(topicsOld.indexOf(msg.topic),1);
	}
	store.set('data_counter', dataCounterNew);

	//clear topic array (or only specific topic)
	var topicsNew = [];
	if (msg.topic != "" && topicsOld.length > 1) {
		topicsNew = topicsOld;
		topicsNew.splice(topicsOld.indexOf(msg.topic),1);
	}
	store.set('topics', topicsNew);

	msg.payload = {};
	msg.info = 'data cleared ' + msg.topic;
};

function restoreNode(msg, myNode, store) {
	var data = msg.payload[0].data;
	var keys = msg.bar_keys;
	var topics = msg.topics;
	
	//restore with older bar-chart-data version
	if (topics === undefined) { topics = [msg.topic]; }

	//restore data for all topics
	for (var i = 0; i < topics.length; i++) {
		var restoredData = {};
		var topicData = data[i];
		if (topicData === undefined) { topicData = []; };
		for (var i2 = 0; i2 < topicData.length; i2++) {
			restoredData[keys[i2]] = topicData[i2];
		}
		var topic = topics[i];
		store.set(topic + '_data', restoredData);
		store.set(topic + '_data_counter', msg.data_counter[i]);
		if (msg.hasOwnProperty(topic + '_last')) {
			store.set(topic + '_last', Number(msg[topic + '_last']));
		} else if (msg.hasOwnProperty('last')) {
			store.set(topic + '_last', Number(msg.last));
		}
	}
	//restore topics array
	store.set('topics', topics);

	msg.info = 'data restored';
};


function barChartData(msg,myNode, store) {
	var m={};
	var data = store.get(msg.topic + '_data')||{};
	var dataCounter = store.get(msg.topic + '_data_counter')||{};
	var reading = Number(msg.payload);
	var ts = msg.ts || msg.timestamp || (+ new Date());
	if (ts <= 9999999999) { ts *= 1000 }  //sec ts to millis ts, only works until 2286-11-20 :(
	var curDate = new Date(ts);
	saveTopic(msg.topic, store); //save topic to store (for cleaning and handling of multiple topics)
	var topics = store.get('topics');

	//if is_meter_reading == true, use diff between last and current payload value
	if (myNode.is_meter_reading) {
		var last = store.get(msg.topic + '_last') || reading;
		store.set(msg.topic + '_last', reading);
		msg[msg.topic + '_last'] = reading;
		reading = reading - last;
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
	else if(myNode.agg_by == "min") {
		if (oldVal === null) { oldVal = reading; } //Math.min() doesnt work with null values (other than max())
		newVal = Math.min(oldVal, reading);
	}
	else if(myNode.agg_by == "max") {
		newVal = Math.max(oldVal, reading);
	}
	else if(myNode.agg_by == "avg") {
		//in this case, we store the number of readings in "data_counter" json and use it to calc the avg
		//get weight of old value
		oldDataCounter = 0;
		if (dataCounter.hasOwnProperty(curKey)) {
			oldDataCounter = dataCounter[curKey];
		}
		//calc avg
		newVal = ((oldVal*oldDataCounter)+reading)/(oldDataCounter+1);
		//save to context
		dataCounter = {}; //we only need to remember the number of readings in the current period
		dataCounter[curKey] = oldDataCounter+1;
		store.set(msg.topic + '_data_counter', dataCounter);
	}
	data[curKey] = newVal;

	//store new data in the context store
	store.set(msg.topic + '_data', data);

	//build msg
	m.labels = buildLabels(curDate);
	m.series = topics;
	m.data = [];
	//build factor for the rounding
	var precision = 1;
	if (myNode.precision > 0) {
		precision = Math.pow(10,Math.round(myNode.precision));
	}

	//build data array for each topic
	var dataAll = []
	for (var i = 0; i < topics.length; i++) {
		m.data.push([]); //add new array
		topic = topics[i];
		data = store.get(topic + '_data')||[];
		newkeys.forEach(function(key) {
			if (data.hasOwnProperty(key)) {
				m.data[i].push(Math.round(data[key]*precision)/precision);
			} else {
				m.data[i].push(0);
			}
		});
		dataAll = dataAll.concat(m.data[i]);
	}
	msg.payload=[m];

	//send list of complete keys, used also as flag to be able to identify bar 
	//data at the input of this node, to restore the context store (after reboot)
	//this makes the use of persist nodes possible
	msg.bar_keys = newkeys; 	
	msg.data_counter = getDataCounters(store);
	msg.topics = topics;
	
	//put all "_last" values into msg (for restoring)
	addLastValues(store,msg);

	//add min,max,sum
	msg.data_min = Math.min(...dataAll);
	msg.data_max = Math.max(...dataAll);
	const arrSum = arr => arr.reduce((a,b) => a + b, 0);
	msg.data_sum = Math.round(arrSum(dataAll)*precision)/precision;  

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
			date.setDate(1); //to avoid issues with end of month
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

	function saveTopic(topic, store) {
		var topics = store.get('topics')||[];
		if (topics.indexOf(topic) == -1) {
			topics.push(topic);
			store.set('topics', topics);
		}
	};

	function getDataCounters(store) {
		var topics = store.get('topics')||[];
		var dataCounter = [];
		for (var i = 0; i < topics.length; i++) {
			dataCounter.push(store.get(topics[i]+'_data_counter')||0);
		}
		return dataCounter;
	};
	
	function addLastValues(store, msg) {
		for (var i = 0; i < topics.length; i++) {
			msg[topics[i]+'_last'] = store.get(topics[i]+'_last');
		}
	};
	
};




