
var redis = require('redis');
var express = require('express');
var bodyParser = require('body-parser');
var EventEmitter = require('events').EventEmitter;

var db = redis.createClient();
db.on('ready', function() {
  console.log('Database connection ready');
});
db.on('error', function(err) {
  console.log('Database error: '+err);
});

var subs = {};
var emitter = new EventEmitter();

var sub = redis.createClient();
sub.setMaxListeners(10000);
sub.on('ready', function() {
  console.log('Subscriber connection ready');
});
sub.on('error', function(err) {
  console.log('Subscriber error: '+err);
  Object.keys(subs).forEach(function(eventKey) {
    emitter.removeAllListeners(eventKey);
  });
  subs = {};
});
sub.on('message', function(channel, msg) {
  if (EventEmitter.listenerCount(emitter, channel) > 0) {
    emitter.emit(channel, msg);
  }
});

function subscribe(eventKey, cb) {
  if (!subs[eventKey]) {
    subs[eventKey] = 1;
    console.log('Subscribing to '+eventKey);
    sub.subscribe(eventKey, cb);
  } else {
    subs[eventKey] += 1;
    if (cb) cb(null, eventKey);
  }
}

function unsubscribe(eventKey, cb) {
  if (subs[eventKey] >= 1) {
    subs[eventKey] -= 1;
    if (!subs[eventKey]) {
      console.log('Unsubscribing from '+eventKey);
      sub.unsubscribe(eventKey, cb);
    } else {
      if (cb) cb(null, eventKey);
    }
  } else {
    if (cb) cb(new Error('No subscription'), null);
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
    sub.once('error', errorHandler);
    req.once('close', function() {
      emitter.removeListener('message', messageHandler);
      sub.removeListener('error', errorHandler);
      unsubscribe(eventKey);
    });

    function messageHandler(msg) {
      lastEventId = sendEvents(res, lastEventId, [msg]);
    }
    subscribe(eventKey, function(err, channel) {
      if (err) return res.end();

      db.lrange(eventKey, lastEventId, -1, function(err, values) {
        if (err) {
          emitter.removeListener('message', messageHandler);
          sub.removeListener('error', errorHandler);
          unsubscribe(eventKey);
          res.end();
        } else {
          lastEventId = sendEvents(res, lastEventId, values);
          emitter.on(eventKey, messageHandler);
        }
      });
    });
  });
});

var server = app.listen(3000, function() {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Listening at http://%s:%s', host, port);
});

