# node-red-contrib-dashboard-barchart-data

<h2>Bar-Chart-data</h2>
<p>Transforms <code>msg.payload</code> to be displayed in the <code>dashboard-chart</code> node as bar-chart. Can handle measurements (e.g. current power consumption) or meter readings (e.g. gas/water/energy meter count). 
  Calculates the sum, min or max in customizable time range</p>

<h3> Properties :</h3>
  <dl class="message-properties">
    <dt>Name
      <dd>The name of this node</dd>
    </dt>

<dt>x-interval
      <dd>1 bar per:
        <li>second</li>
        <li>minute</li>
        <li>quarter-hour</li>
        <li>hour</li>
        <li>day</li> 
        <li>year</li> 
      </dd>
    </dt>
  
<dt>x-size
    <dd>How many bars should be displayed. Example: x-interval=hours, x-size=24 : 24 bars, each 1 hour. That means that the last 24 hours will be displayed</dd>
  </dt>  
  
  <dt>Unit
    <dd>The unit of the payload, will be displayed in the bar-chart</dd>
  </dt>  

  <dt>Precision
    <dd>Number of decimals</dd>
  </dt>  
  
  <dt>Meter reading
    <dd>Set this to "True" if msg.payload is a meter reading, so that this node will use the difference of the current and last value.
      <li>True: msg.payload is meter reading, like the total energy, gas or water meter value or operating hours</li>
      <li>False: msg.payload is a measurement, like power (watt), pressure or temperature</li> 
    </dd>
  </dt>  
  
  <dt>Aggregate by
    <dd>
      <li>sum: sum all values in x-interval</li>
      <li>min: just display the smallest value in x-interval</li> 
      <li>max: just display the largest value in x-interval</li> 
    </dd>
  </dt>  
  </dl>

  <h3>Clear and Restore</h3>
  <dl>
    <dd>A message with the payload "clear" and the same topic like the sensor messages will reset the data storage (so that the chart will be blank again).<br>
      If you put the output of this node to the input of this node (via <code>persist node</code>), the data will be restored. 
      This could be helpful to avoid getting a blank bar-chart after node-red has been restarted (reboot).
    </dd>  
  </dl>
  
  
  <h3>Additional output: Sum, Min, Max, Settings</h3>
  <dl>
    <dd>This is included in the output message (and could be used to set chart title etc.):
      <li>The node settings (unit, x_interval, x_size, precision, is_meter_reading, agg_by) as json in <code>msg.settings</code></li>
      <li>The smallest value of all bars (min) in <code>msg.min</code></li>
      <li>The largest value of all bars (max) in <code>msg.max</code></li>
      <li>The sum of all bars in <code>msg.sum</code></li>
    </dd>  
  </dl>
