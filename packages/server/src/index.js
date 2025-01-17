const path = require('path');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');

const debug = require('debug')('server');

const databaseApi = require('./api/database');
const eventsApi = require('./api/events');
const webapp = require('./webapp');

function shouldCompress (req, res) {
  if (req.headers['x-no-compression']) {
    return false
  }

  return compression.filter(req, res)
}

function createServer(key, cert, app) {
  if (key && cert) {
    const fs = require('fs');
    const https = require('https');
    var privateKey  = fs.readFileSync(key, 'utf8');
    var certificate = fs.readFileSync(cert, 'utf8');

    var credentials = {key: privateKey, cert: certificate};

    return https.createServer(credentials, app);
  } else {
    const http = require('http');
    return http.createServer({spdy: { plain: true, ssl: false} }, app);
  }
}

function startServer({host, port, storageDir, databaseFilename, eventsFilename, webappDir, key, cert}, cb) {
  const app = express();
  app.disable('x-powered-by');

  app.use(cors());
  app.use(compression({ filter: shouldCompress }))
  app.use('/files', express.static(storageDir, {index: false, maxAge: '2d', immutable: true}));

  app.use(morgan('tiny'));
  app.use(bodyParser.json({limit: '1mb'}))

  const { read: dbRead, init: dbInit, getEntries } = databaseApi();
  app.get('/api/database', dbRead);
  const { read, push, stream } = eventsApi(eventsFilename);
  app.get('/api/events', read);
  app.get('/api/events/stream', stream);
  app.post('/api/events', push);

  app.use(webapp(webappDir, getEntries, 50));

  const server = createServer(key, cert, app);
  server.listen(port, host)
    .on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log(`Address is already in use!`);
      }
      cb(e);
    })
    .on('listening', () => {
      console.log(`Open Home Gallery on ${key && cert ? 'https' : 'http'}://localhost:${port}`);
      dbInit(databaseFilename, (err) => {
        if (err) {
          cb(err);
          server.close();
        } else {
          cb(null, app);
        }
      })
    })

}

module.exports = startServer;
