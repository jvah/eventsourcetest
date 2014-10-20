
var redis = require('redis');
var express = require('express');
var bodyParser = require('body-parser');

var db = redis.createClient();
db.on('ready', function() {
  console.log('Redis connection ready');
});
db.on('error', function(err) {
  console.log('Error in redis: '+err);
});

var app = express();
app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.send('Hello World!');
});

app.post('/events/game/:id', function(req, res) {
  var gameId = req.params.id;
  var msg = JSON.stringify(req.body);

  var multi = db.multi();
  multi = multi.rpush('events:game:'+gameId, msg);
  multi = multi.publish('events:game:'+gameId, msg);
  multi.exec(function(err, replies) {
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

  var lastEventId = parseInt(req.get('Last-Event-ID'), 10);
  if (isNaN(lastEventId)) {
    // Not a valid number
    lastEventId = 0;
  }
  var gameId = req.params.id;
  var eventKey = 'events:game:'+gameId;

  var subscriber = redis.createClient();
  subscriber.once('error', function(err) {
    subscriber.end();
    subscriber = null;
    res.end();
  });

  subscriber.subscribe(eventKey, function(channel, count) {
    db.lrange(eventKey, lastEventId, -1, function(err, values) {
      if (!subscriber) {
        // This connection is not relevant any more
        return;
      }
      if (err) {
        // Error in subscription, propagate
        subscriber.emit('error', err);
        return;
      }
      lastEventId = sendEvents(res, lastEventId, values);
      subscriber.on('message', function(channel, value) {
        if (channel !== eventKey) {
          return;
        }
        lastEventId = sendEvents(res, lastEventId, [value]);
      });
    });
  });
  req.on('close', function() {
    if (subscriber) {
      subscriber.unsubscribe();
      subscriber.quit();
    }
  });
});

var server = app.listen(3000, function() {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Listening at http://%s:%s', host, port);
});

