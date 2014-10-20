
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
  var gameId = parseInt(req.params.id);
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

  var lastEventId = 0;
  var gameId = parseInt(req.params.id);
  var eventKey = 'events:game:'+gameId;
  
  db.lrange(eventKey, 0, -1, function(err, values) {
    if (err) {
      res.status(500).json({error: err.toString()});
      return;
    }

    // Write all initial events to the client
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('\n');
    lastEventId = sendEvents(res, lastEventId, values);

    // Create a subscriber client and handle error
    var subscriber = redis.createClient();
    subscriber.on('error', function(err) {
      subscriber.end();
      res.end();
    });

    // Handle new messages in event array
    subscriber.on('message', function(ch, msg) {
      if (ch !== eventKey) {
        return;
      }
      db.lrange(eventKey, lastEventId, -1, function(err, values) {
        if (err) {
          console.log(err);
          return;
        }
        lastEventId = sendEvents(res, lastEventId, values);
      });

    });
    req.on('close', function() {
      subscriber.unsubscribe();
      subscriber.quit();
    });
    subscriber.subscribe(eventKey);
  });
});

var server = app.listen(3000, function() {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Listening at http://%s:%s', host, port);
});

