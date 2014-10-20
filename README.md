EventSource test
================

To be able to use this software, you need to have Redis installed.

Running the server:

```
npm install
node app
```

Testing how it works (you need multiple consoles):

```
curl http://localhost:3000/events/game/1
curl http://localhost:3000/events/game/2
curl -H "Content-Type: application/json" http://localhost:3000/events/game/1 -d '{"foo":"bar"}'
curl -H "Content-Type: application/json" http://localhost:3000/events/game/2 -d '{"foo":"bar"}'
curl http://localhost:3000/events/game/1
curl -H "Content-Type: application/json" http://localhost:3000/events/game/1 -d '{"foo":"bar"}'
```

As you notice, when you connect to an event stream, you get all the existing
events plus you will subscribe to new events in real time.
