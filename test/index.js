var fork = require('child_process').fork;

var PUBLISHER_PROCESSES = 2;
var MESSAGES_PER_PUBLISHER = 1000;
var SUBSCRIBER_PROCESSES = 2;
var SUBSCRIBERS_PER_PROCESS = 100;
var EVENT_PATH = 'http://localhost:3000/events/game/';

var publishers = [];
var subscribers = [];
var i, j;

var publisherCount = 0;
for (i=0; i<PUBLISHER_PROCESSES; i++) {
  var pub = fork(__dirname + '/publisher.js');
  pub.on('message', function(msg) {
    console.log('PARENT got publisher result:', msg);
    publisherCount--;
    if (publisherCount === 0 && subscriberCount === 0) {
      console.log('All child processes finished');
      process.exit();
    }
  });
  var gameid = i+1;
  publisherCount++;
  pub.send({ url: EVENT_PATH+gameid, gameid: gameid, pid: i+1, msgs: MESSAGES_PER_PUBLISHER });
}

var subscriberCount = 0;
for (i=0; i<SUBSCRIBER_PROCESSES; i++) {
  var sub = fork(__dirname + '/subscriber.js');
  sub.on('message', function(msg) {
    console.log('PARENT got subscriber result:', msg);
    subscriberCount--;
    if (publisherCount === 0 && subscriberCount === 0) {
      process.exit();
    }
  });
  for (j=0; j<SUBSCRIBERS_PER_PROCESS; j++) {
    var gameid = Math.floor(Math.random() * PUBLISHER_PROCESSES)+1;
    subscriberCount++;
    sub.send({ url: EVENT_PATH+gameid, gameid: gameid, pid: i+1, cid: j+1, msgs: MESSAGES_PER_PUBLISHER });
  }
}
