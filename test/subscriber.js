var EventSource = require('eventsource');
var http = require('http');

http.globalAgent.maxSockets = Infinity;

process.on('message', function(msg) {
  var es = new EventSource(msg.url);
  var start = Date.now();

  es.onmessage = function(e) {
    var data = JSON.parse(e.data);
    if (parseInt(e.lastEventId, 10) !== data.id) {
      process.send({ error: 'Event ID mismatch, got '+data.id+' expected '+e.lastEventId, event: e });
    }
    if (data.id === msg.msgs) {
      var end = Date.now();
      process.send(JSON.stringify({
        message: 'Subscriber '+msg.pid+' client '+msg.cid+' received '+msg.msgs+' events for game '+msg.gameid+' in '+((end-start)/1000)+' seconds'
      }));
      es.close();
    }
  }
  es.onerror = function() {
    process.send({ error: 'Error in EventSource' });
    process.exit();
  }
});
