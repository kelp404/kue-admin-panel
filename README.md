# kue-admin-panel
[![npm version](https://badge.fury.io/js/kue-admin-panel.svg)](https://www.npmjs.com/package/kue-admin-panel)
[![CircleCI](https://circleci.com/gh/kelp404/kue-admin-panel.svg?style=svg)](https://circleci.com/gh/kelp404/kue-admin-panel)

An admin panel of [Kue](https://github.com/Automattic/kue) based on WebSocket.

## Installation
```bash
npm install kue-admin-panel
```

## Screenshots
<img src="_screenshots/screenshots-01.png"/>

## Example
[more details...](/example)
```js
const express = require('express');
const http = require('http');
const kue = require('kue');
const KueAdminPanel = require('kue-admin-panel');

const app = express();
const server = http.createServer(app);
const queue = kue.createQueue({
  redis: {
    host: 'localhost',
    port: 6379,
    auth: '',
    db: 1
  }
});

app.use('/kue', new KueAdminPanel({
  basePath: '/kue',
  verifyClient: (info, callback) => {
    // Do authorization for web socket.
    callback(true);
  },
  queue: queue,
  server: server
}));

// Launch server
server.listen(8000, 'localhost', () => {
  const {address, port} = server.address();
  console.log(`Server listening at http://${address}:${port}`);
});
```
