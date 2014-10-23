var async = require('async');
var http = require('http');
var url = require('url');

http.globalAgent.maxSockets = 100;

function sendMessage(serverUrl, eventId, cb) {
  var options = url.parse(serverUrl);
  options.method = 'POST';
  options.headers = {
    'Content-Type': 'application/json'
  };
  var req = http.request(options, function(res) {
    if (res.statusCode != 200) {
      cb('Invalid status code '+res.statusCode, null);
    } else {
      cb(null, 'Sent event '+eventId+' successfully');
    }
    res.socket.end();
  });
  req.on('error', function(err) {
    cb('HTTP error: '+err.toString(), null);
  });
  req.write(JSON.stringify({ id: eventId }));
  req.end();
}

process.on('message', function(msg) {
  var start = Date.now();
  var end;
  var i;

  var requests = [];
  for (i=0; i<msg.msgs; i++) {
    (function() {
      var idx = i;
      requests.push(function(cb) {
        sendMessage(msg.url, idx+1, cb);
      });
    })();
  }
  async.series(requests, function(err, results) {
    if (err) {
      process.send(JSON.stringify({ error: err }));
    } else {
      end = Date.now();
      process.send(JSON.stringify({
        message: 'Publisher '+msg.pid+' sent '+msg.msgs+' events for game '+msg.gameid+' in '+((end-start)/1000)+' seconds'
      }));
    }
  });
});
