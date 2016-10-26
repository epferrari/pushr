"use strict";

const http = require('http');
const sockjs = require('sockjs');
const ClientConnection = require("../client-connection");

const intents = require("../intents");

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
      let client = new ClientConnection(conn);

      client.conn.on('data', message => {

        try {
          message = JSON.parse(message);
        } catch (err) {
          this.clientInvalidMessageError(client);
          return;
        }

        let {intent, topic, payload} = message;
        let auth = (payload || {}).auth;

        switch(intent){
          case intents.AUTH_REQ:
            this.handleClientAuthRequest(client, auth);
            break;
          case intents.SUB_REQ:
            this.handleClientSubRequest(client, topic, auth);
            break;
          case intents.UNS_REQ:
            this.handleClientUnsubRequest(client, topic);
            break;
          case intents.CLOSE_REQ:
            this.handleClientCloseRequest(client);
            client = null;
            conn = null;
            break;
          default:
            this.clientInvalidIntentError(client);
        }
      });

      client.conn.on("close", () => {
        this.handleClientCloseRequest(client);
        client = null;
        conn = null;
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
  * `options.storeCredentials` must be set to `true` in order to save credentials
  * Responds with an acknowledgement that the credentials were saved only if
  * `options.storeCredentials` is true.
  *
  * @param {ClientConnection} client
  * @param {object} payload
  */
  handleClientAuthRequest(client, auth){
    if(!client.authenticated){
      this.authenticate(auth)
      .then(() => {
        if(this.storeCredentials){
          client.storeCredentials(auth);
          client.authenticated = true;
          client.send(intents.AUTH_ACK, null, null);
        }
      })
      .catch( () => this.clientAuthenticationError(client));
    }else{
      this.alreadyAuthenticatedError(client);
    }
  }

  handleClientSubRequest(client, topic, auth = {}){
    let subscribe = () => this.subscribe(client, topic);

    if(this.publicChannels.includes(topic)){
      subscribe();
    }else if(this.protectedChannels.includes(topic)){
      if(client.authenticated){
        subscribe();
      }else{
        this.authenticate(auth)
        .then(subscribe)
        .catch( () => this.clientAuthenticationError(client));
      }
    }else{
      this.authorize(client, topic, auth)
      .then(subscribe)
      .catch( () => this.clientNotAuthorizedError(client, topic) );;
    }
  }

  handleClientUnsubRequest(client, topic){
    this.unsubscribe(client, topic);
  }

  handleClientCloseRequest(client){
    Object.keys(this.channels).forEach(topic => {
      this.unsubscribe(client, topic);
    });
    client.send(intents.CLOSE_ACK, null);
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

  subscribe(client, topic){
    if(this.channels[topic]){
      this.channels[topic].push(client);
    }else{
      this.channels[topic] = [client];
    }

    let message = `Subscribed to "${topic}"`;
    client.send(intents.SUB_ACK, topic, {topic});
    log(`client id: ${client.id} -- ${message}`);
  }

  unsubscribe(client, topic){
    let channel;
    if(channel = this.channels[topic]){
      this.channels[topic] = channel.filter(_client => _client !== client);
    }
    if(channel && !channel.length){
      delete this.channels[topic];
    }

    let message = `Unsubscribed from "${topic}"`;
    client.send(intents.UNS_ACK, topic, {topic});
    log(`client id: ${client.id} -- ${message}`);
  }

  push(topic, payload = {}){
    return new Promise((resolve) => {
      if(this.channels[topic])
        this.channels[topic].forEach(client => client.push(topic, payload));
      resolve((this.channels[topic] || []).length);
    });
  }

  clientAuthenticationError(client){
    let message = `Unable to authenticate. Invalid credentials.`;
    client.send(intents.AUTH_REJ, null, {message});
    log(`client id: ${client.id} -- ${message}`);
  }

  clientNotAuthorizedError(client, topic){
    let message = `Unauthorized to subscribe to "${topic}"`;
    client.send(intents.SUB_REJ, topic, {message});
    log(`client id: ${client.id} -- ${message}`);
  }

  clientInvalidIntentError(client){
    let message = `Invalid intent`;
    client.send(intents.INVLD_INTENT, null, {message});
    log(`client id: ${client.id} -- ${message}`);
  }

  clientInvalidMessageError(client){
    let message = `Invalid message format, could not parse.`
    client.send(intents.INVLD_MSG, null, {message});
    log(`client id: ${client.id} -- ${message}`);
  }

  alreadyAuthenticatedError(client){
    let message = `Already authenticated`;
    client.send(intents.AUTH_ERR, null, {message});
    log(`client id: ${client.id} -- ${message}`);
  }
}

// utilities
function stripSlashes(path){
  return path
    .replace(/^(\/*)/, "")
    .replace(/(\/*)$/, "");
}

function timestamp(){
  return `[ ${new Date().toISOString()} ]`;
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

function log(msg){
  if(!process.env.NODE_ENV === 'test')
    process.stdout.write(`${timestamp()} -- ${msg}\n`);
}

function logError(msg){
  if(!process.env.NODE_ENV === 'test')
    process.stderr.write(`${timestamp()} -- ${msg}\n`);
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
