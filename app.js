
var redis = require('redis');
var express = require('express');
var bodyParser = require('body-parser');

var db = redis.createClient();
db.on('ready', function() {
  console.log('Database connection ready');
});
db.on('error', function(err) {
  console.log('Database error: '+err);
});

var subs = {};

var sub = redis.createClient();
sub.setMaxListeners(10000);
sub.on('ready', function() {
  console.log('Subscriber connection ready');
});
sub.on('error', function(err) {
  console.log('Subscriber error: '+err);
  Object.keys(subs).forEach(function(eventKey) {
    sub.removeAllListeners(eventKey);
  });
  subs = {};
});

function subscribe(eventKey, cb) {
  if (subs[eventKey] === undefined) {
    subs[eventKey] = 1;
    sub.subscribe(eventKey, cb);
  } else {
    subs[eventKey] += 1;
    if (cb) cb(null, eventKey);
  }
}

function unsubscribe(eventKey, cb) {
  if (subs[eventKey] === 1) {
    delete subs[eventKey];
    sub.unsubscribe(eventKey, cb);
  } else {
    if (subs[eventKey] > 1) {
      subs[eventKey] -= 1;
    }
    if (cb) cb(null, eventKey);
  }
}

var app = express();
app.use(bodyParser.json());
app.disable('x-powered-by');

app.get('/', function(req, res) {
  res.send('Hello World!');
});

app.post('/events/game/:id', function(req, res) {
  var gameId = req.params.id;
  var eventKey = 'events:game:'+gameId;

  var msg = JSON.stringify(req.body);
  db.multi()
    .rpush(eventKey, msg)
    .publish(eventKey, msg)
    .exec(function(err, replies) {
      if (err) {
        res.status(500).json({error: err.toString()});
      } else {
        res.send();
      }
    });
});

function sendEvents(res, lastEventId, values) {
  values.forEach(function(msg) {
    var data = msg.split('\n').map(function(line) {
      return 'data: '+line;
    }).join('\n');

    lastEventId += 1;
    res.write('id: '+lastEventId+'\n');
    res.write(data+'\n');
    res.write('\n');
  });
  return lastEventId;
}

app.get('/events/game/:id', function(req, res) {
  req.socket.setTimeout(Infinity);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('\n');

  var gameId = req.params.id;
  var eventKey = 'events:game:'+gameId;

  db.llen(eventKey, function(err, maxEventId) {
    if (err) return res.end();

    var lastEventId = parseInt(req.get('Last-Event-ID'), 10);
    if (isNaN(lastEventId) || lastEventId < 0 || lastEventId > maxEventId) {
      // Not a valid Last-Event-ID value
      lastEventId = 0;
    }

    function errorHandler(err) {
      // Message handlers already cleaned up
      res.end();
    }
    function messageHandler(channel, msg) {
      if (channel !== eventKey) return;
      lastEventId = sendEvents(res, lastEventId, [msg]);
    }

    subscribe(eventKey, function(err, channel) {
      console.log('Subscribed to channel '+channel);
      db.lrange(eventKey, lastEventId, -1, function(err, values) {
        if (err) {
          // Error in database, end connection
          unsubscribe(eventKey);
          res.end();
        } else {
          lastEventId = sendEvents(res, lastEventId, values);
          sub.on('message', messageHandler);
        }
      });
    });

    sub.once('error', errorHandler);
    req.on('close', function() {
      sub.removeListener('error', errorHandler);
      sub.removeListener('message', messageHandler);
      unsubscribe(eventKey);
    });
  });
});

var server = app.listen(3000, function() {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Listening at http://%s:%s', host, port);
});

