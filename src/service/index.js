"use strict";

const http = require('http');
const sockjs = require('sockjs');
const ClientConnection = require("../client-connection");

const intents = require("../intents");
const log = require("../utils/log");
const logError = require("../utils/log-error");

const defaultConfig = {
  applicationKey: null,
  authenticate: dummyAuthenticate,
  authorizeChannel: dummyAuthorize,
  verifyPublisher: dummyVerifyPublisher,
  clientUrl: '/pushr',
  publishUrl: '/publish',
  publicChannels: [], // topics available without authentication
  protectedChannels: [], // topics available to any client who is authenticated
  storeCredentials: true,
  port: 9999,
  hostname: 'localhost'
  //enableOpenChannel: false // "*" channel
}

module.exports = class Pushr {
  constructor(config = {}){
    this.channels = {};

    config = Object.assign({}, defaultConfig, config);

    let prefix = stripSlashes(config.clientUrl),
        publishUrl = stripSlashes(config.publishUrl),
        sockService = (config.service || createSockService()),
        server = (config.server || http.createServer());

    getter(this, 'applicationKey', () => config.applicationKey);
    getter(this, 'publicChannels', () => config.publicChannels);
    getter(this, 'protectedChannels', () => config.protectedChannels);
    getter(this, 'publishUrl', () => publishUrl);
    getter(this, 'verifyPublisher', () => config.verifyPublisher);
    getter(this, 'storeCredentials', () => config.storeCredentials);

    getter(this, 'authenticate', () =>
      (auth = {}) => config.authenticate(auth)
    );

    getter(this, 'authorize', () =>
      (client, topic, auth = {}) => {
        if(client.authenticated){
          return config.authorizeChannel(topic, client.credentials)
        }else{
          return this.authenticate(auth)
            .then( () => config.authorizeChannel(topic, auth) )
        }
      }
    );

    server.on('request', this.handlePublishRequest.bind(this));

    sockService.on('connection', conn => {
      let client = new ClientConnection(conn, this);

      client.subscribe("*");

      let removeClient = () => {
        client.close();
        client = null;
        conn = null;
      };

      client.conn.on('close', removeClient);
      client.conn.on('data', message => {

        try {
          message = JSON.parse(message);
        } catch (err) {
          client.invalidMessageError();
          return;
        }

        let {intent, topic, payload} = message;
        let auth = (payload || {}).auth;

        switch(intent){
          case intents.AUTH_REQ:
            this.handleAuthRequest(client, auth);
            break;
          case intents.SUB_REQ:
            this.handleSubRequest(client, topic, auth);
            break;
          case intents.UNS_REQ:
            client.unsubscribe(topic);
            break;
          case intents.CLOSE_REQ:
            removeClient();
            break;
          default:
            client.invalidIntentError();
        }
      });
    });

    sockService.installHandlers(server, {prefix: `/${prefix}`});

    server.listen(config.port, config.hostname, () => {
      log(`listening for publish requests at ${config.hostname}:${config.port}/${publishUrl}`);
      log(`accepting socket clients on ${config.hostname}:${config.port}/${prefix}`);
    });
  }

  /**
  * authenticate a client and save their credentials for future subscription requests.
  * `owner.config.storeCredentials` must be set to `true` in order to save credentials
  * Responds with an acknowledgement that the credentials were saved only if
  * `owner.config.storeCredentials` is true.
  *
  * @param {PushrClientConnection}
  * @param {object} auth
  */
  handleAuthRequest(client, auth){
    if(!client.authenticated){
      this.authenticate(auth)
      .then(() => {
        if(this.storeCredentials){
          client.storeCredentials(auth);
          client.authenticated = true;
          client.send(intents.AUTH_ACK, null, null);
        }
      })
      .catch( () => client.authenticationError() );
    }else{
      client.alreadyAuthenticatedError();
    }
  }


  handleSubRequest(client, topic, auth = {}){
    let subscribe = () => client.subscribe(topic);

    if(this.publicChannels.includes(topic)){
      subscribe();
    }else if(this.protectedChannels.includes(topic)){
      if(client.authenticated){
        subscribe();
      }else{
        this.authenticate(auth)
        .then(subscribe)
        .catch( () => client.authenticationError() );
      }
    }else{
      this.authorize(client, topic, auth)
      .then(subscribe)
      .catch( () => client.notAuthorizedError(topic) );;
    }
  }

  push(topic, payload = {}){
    return new Promise((resolve) => {
      if(this.channels[topic])
        this.channels[topic].forEach(client => client.push(topic, payload));
      resolve((this.channels[topic] || []).length);
    });
  }

  handlePublishRequest(req, res){
    if(req.method === 'POST' && stripSlashes(req.url) === this.publishUrl){
      let body = [], msg;

      req
      .on('data', chunk => body.push(chunk))
      .on('end', () => {
        body = Buffer.concat(body).toString();
        try {
          body = JSON.parse(body);
          let {topic, event, data} = body;

          if( !this.verifyPublisher(req.headers, body, this.applicationKey) ){
            msg = 'unauthorized publish request';
            logError(`Error: ${msg}`)
            res.statusCode = 401;
            res.end(msg);
          }else{
            this.push(topic, {event, data})
              .then(n => {
                if(n){
                  msg = `pushed to ${n} clients subscribed to "${topic}"`;
                  event && (msg = `${msg}. event: "${event}"`);
                  log(`received message, ${msg}`);
                  res.statusCode = 200;
                  res.end(msg);
                }else{
                  msg = `no clients subscribed to "${topic}"`;
                  log(`received message, ${msg}`);
                  res.statusCode = 404;
                  res.end(msg);
                }
              });
          }
        }catch (err){
          msg = 'Bad Request';
          logError(`Error: ${msg}`)
          res.statusCode = 400;
          res.end(msg);
        }
      });
    }
  }


}

// utilities
function stripSlashes(path){
  return path
    .replace(/^(\/*)/, "")
    .replace(/(\/*)$/, "");
}

function createSockService(){
  return sockjs.createServer({ sockjs_url: 'http://cdn.jsdelivr.net/sockjs/1.0.1/sockjs.min.js' });
}

function dummyAuthenticate(username, password){
  return Promise.resolve();
}

function dummyAuthorize(topic, client){
  return Promise.resolve();
}

function dummyVerifyPublisher(headers, body, applicationKey){
  return true;
}

function getter(o, p, fn){
  Object.defineProperty(o, p, {
    get(){
      return fn();
    },
    enumerable: false,
    configurable: false
  });
}
