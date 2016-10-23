"use strict";

const http = require('http');
const sockjs = require('sockjs');
const PushrClient = require("./pushr-client");

const intent = {
  AUTH_REQ: 1,    // authentication request (inbound)
  AUTH_ACK: 2,    // authentication acknowledgement, credentials saved (outbound)
  AUTH_REJ: 3,    // authentication rejected, credentials were invalid (outbound)
  AUTH_ERR: 4,    // authentication error, client has already saved credentials (outbound)

  SUB_REQ: 5,     // subscription request (inbound)
  SUB_ACK: 6,     // subscription acknowledgement, authorized and subscribed (outbound)
  SUB_REJ: 7,     // subscription rejection, unauthorized (outbound)
  SUB_ERR: 8,     // subscription error (outbound)

  UNS_REQ: 9,     // unsubscribe request (inbound)
  UNS_ACK: 10,    // unsubscribe acknowledgement (outbound)
  UNS_REJ: 11,    // unsubscribe rejection (outbound)
  UNS_ERR: 12,    // unsubscribe error (outbound)

  CLOSE_REQ: 13,  // connection close request (inbound)
  CLOSE_ACK: 14,  // connection close acknowledgement (outbound)
  CLOSE_ERR: 15,  // connection close error (outbound)

  INVLD_INT: 16,  // invalid message intent (outbound)
  BAD_REQ: 17,    // invalid message shape (outbound)
  PUSH: 18        // message pushed to client (outbound)
}

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

    let prefix = stripSlashes(config.clientUrl);
    let publishUrl = stripSlashes(config.publishUrl);

    getter(this, 'applicationKey', () => config.applicationKey);
    getter(this, 'publicChannels', () => config.publicChannels);
    getter(this, 'protectedChannels', () => config.protectedChannels);
    getter(this, 'publishUrl', () => publishUrl);
    getter(this, 'verifyPublisher', () => config.verifyPublisher);

    getter(this, 'authenticate', () =>
      (client, auth = {}) => {
        return config.authenticate(auth)
          .catch( () => this.clientAuthenticationError(client));
      }
    );

    getter(this, 'authorize', () =>
      (client, topic, auth = {}) => {
        if(client.authenticated){
          return config.authorizeChannel(topic, client.credentials)
            .catch( () => this.clientNotAuthorizedError(client, topic) )
        }else{
          return this.authenticate(client, auth)
            .then( () => config.authorizeChannel(topic, auth) )
            .catch( () => this.clientNotAuthorizedError(client, topic) )
        }
      }
    );


    const service = (config.service || createSockService());
    const server = (config.server || http.createServer(this.handlePublishRequest.bind(this)));

    service.on('connection', conn => {

      let client = new PushrClient(conn);

      client.conn.on('data', message => {

        try {
          message = JSON.parse(message);
        } catch (err) {
          message = {};
          this.clientInvalidShapeError(client);
          return;
        }

        let {intent, topic, payload} = message;
        let auth = (payload || {}).auth;

        switch(intent){
          case intent.AUTH_REQ:
            this.handleClientAuthRequest(client, auth);
            break;
          case intent.SUB_REQ:
            this.handleClientSubRequest(client, topic, auth);
            break;
          case intent.UNS_REQ:
            this.handleClientUnsubRequest(client, topic);
            break;
          case intent.CLOSE_REQ:
            this.handleClientCloseRequest(client);
            client = null;
            conn = null;
            break;
          default:
            this.clientInvalidTypeError(client);
        }
      });
    });

    service.installHandlers(server, {prefix: `/${prefix}`});
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
  * @param {PushrClient} client
  * @param {object} payload
  */
  handleClientAuthRequest(client, payload = {}){
    if(!client.authenticated){
      this.authenticate(client, payload.auth)
        .then(() => {
          if(config.storeCredentials){
            client.storeCredentials(payload.auth);
            client.authenticated = true;
            client.send(intent.AUTH_ACK, null, null);
          }
        });
    }else{
      this.alreadyAuthenticatedError(client);
    }
  }

  handleClientSubRequest(client, topic, payload = {}){
    let subscribe = () => this.subscribe(client, topic);

    if(this.publicChannels.includes(topic)){
      subscribe();
    }else if(this.protectedChannels.includes(topic)){
      if(client.authenticated){
        subscribe();
      }else{
        this.authenticate(client, payload.auth).then(subscribe);
      }
    }else{
      this.authorize(client, topic, payload.auth).then(subscribe);
    }
  }

  handleClientUnsubRequest(client, topic){
    this.unsubscribe(client, topic);
  }

  handleClientCloseRequest(client){
    Object.keys(this.channels).forEach(topic => {
      this.unsubscribe(client, topic);
    });
    client.send(intent.CLOSE_ACK, null);
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
          let {topic, payload} = body;

          if( !this.verifyPublisher(req.headers, body, this.applicationKey) ){
            msg = 'unauthorized publish request';
            logError(`Error: ${msg}`)
            res.statusCode = 401;
            res.end(msg);
          }else{
            this.push(topic, payload)
              .then(n => {
                if(n){
                  msg = `pushed to ${n} clients subscribed to "${topic}"`;
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

    client.send(intent.SUB_ACK, topic);
    log(`client ${client.id} subscribed to "${topic}"`);
  }

  unsubscribe(client, topic){
    if(this.channels[topic]){
      this.channels[topic] = this.channels[topic].filter(_client => _client !== client);
    }
    if(!this.channels[topic].length){
      delete this.channels[topic];
    }

    client.send(intent.UNS_ACK, topic);
    log(`client ${client.id} unsubscribed from "${topic}"`);
  }

  push(topic, payload){
    return new Promise((resolve) => {
      if(this.channels[topic])
        this.channels[topic].forEach(client => client.send(intent.PUSH, topic, payload));
      resolve((this.channels[topic] || []).length);
    });
  }

  clientAuthenticationError(client){
    client.send(intent.AUTH_REJ, null, {
      reason: `Invalid credentials`
    });
    log(`client ${client.id} rejected with invalid credentials`);
  }

  clientNotAuthorizedError(client, topic){
    client.send(intent.SUB_REJ, topic, {
      reason: `Not authorized to subscribe to "${topic}"`
    });
    log(`client ${client.id} unauthorized to subscribe to "${topic}"`);
  }

  clientInvalidTypeError(client){
    client.send(intent.INVLD_INT, null, {
      reason: `invalid message intent`
    });
  }

  clientInvalidShapeError(client){
    client.send(intent.BAD_REQ, null, {
      reason: `invalid message format, could not parse`
    });
  }

  alreadyAuthenticatedError(client){
    client.send(intent.AUTH_ERR, null, {
      reason: 'already authenticated'
    });
  }
}

// utilities
function stripSlashes(path){
  return path
    .replace(/^(\/*)/, "")
    .replace(/(\/*)$/, "");
}

function timestamp(){
  return new Date().toString();
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
  process.stdout.write(`${timestamp()} -- ${msg}\n`);
}

function logError(msg){
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
