"use strict";

const http = require('http');
const sockjs = require('sockjs');
const PushrClient = require("./pushr-client");

const MSG = {
  AUTH_REQ: 1,  // authentication request (inbound)
  AUTH_ACK: 2,  // authentication acknowledgement, credentials saved (outbound)
  AUTH_REJ: 3,  // authentication rejected, credentials were invalid (outbound)
  AUTH_ERR: 4,  // authentication error, client has already saved credentials (outbound)

  SUB_REQ: 5,   // subscription request (inbound)
  SUB_ACK: 6,   // subscription acknowledgement, authorized and subscribed (outbound)
  SUB_REJ: 7,   // subscription rejection, unauthorized (outbound)
  SUB_ERR: 8,   // subscription error (outbound)

  UNS_REQ: 9,   // unsubscribe request (inbound)
  UNS_ACK: 10,  // unsubscribe acknowledgement (outbound)
  UNS_REJ: 11,  // unsubscribe rejection (outbound)
  UNS_ERR: 12,  // unsubscribe error (outbound)

  CLS_REQ: 13,  // connection close request (inbound)
  CLS_ACK: 14,  // connection close acknowledgement (outbound)
  CLS_ERR: 15,  // connection close error (outbound)

  TYP_ERR: 16,  // invalid message type (outbound)
  BAD_REQ: 17,  // invalid message shape (outbound)
  PUSH: 18      // message pushed to client
}

const defaultConfig = {
  applicationKey: null,
  authenticate: dummyAuthenticate,
  authorizeChannel: dummyAuthorize,
  verifyPublisher: dummyVerifyPublisher,
  clientUrl: '/pushr',
  publishUrl: '/publish',
  publicChannels: [], // channels available without authentication
  protectedChannels: [], // channels available to any client who is authenticated
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
      (client, username, password) => {
        return config.authenticate(username, password)
          .catch(() => this.clientAuthenticationError(client));
      }
    );

    getter(this, 'authorize', () =>
      (client, channel, username, password) => {
        if(client.authenticated){
          return config.authorizeChannel(channel, client.credentials.username, client.credentials.password)
            .catch( () => this.clientNotAuthorizedError(client, channel) )
        }else{
          return this.authenticate(client, username, password)
            .then( () => config.authorizeChannel(channel, username, password) )
            .catch( () => this.clientNotAuthorizedError(client, channel) )
        }
      }
    );


    const service = (config.service || createSockService());
    const server = (config.server || http.createServer(this.handlePublishRequest.bind(this)));


    service.installHandlers(server, {prefix});

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

        let {type, channel, payload} = message;

        switch(type){
          case MSG.AUTH_REQ:
            this.handleClientAuthRequest(client, payload);
            break;
          case MSG.SUB_REQ:
            this.handleClientSubscriptionRequest(client, channel, payload);
            break;
          case MSG.UNS_REQ:
            this.handleClientUnsubscribeRequest(client, channel);
            break;
          case MSG.CLS_REQ:
            this.handleClientCloseRequest(client);
            client = null;
            conn = null;
            break;
          default:
            this.clientInvalidTypeError(client);
        }
      });
    });

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
      this.authenticate(client, payload.username, payload.password)
        .then(() => {
          if(config.storeCredentials){
            client.storeCredentials(username, password);
            client.authenticated = true;
            client.send(MSG.AUTH_ACK, null, null);
          }
        });
    }else{
      this.alreadyAuthenticatedError(client);
    }
  }

  handleClientSubscriptionRequest(client, channel, payload = {}){
    let subscribe = () => this.subscribe(client, channel);

    if(this.publicChannels.includes(channel)){
      subscribe();
    }else if(this.protectedChannels.includes(channel)){
      if(client.authenticated){
        subscribe();
      }else{
        this.authenticate(client, payload.username, payload.password).then(subscribe);
      }
    }else{
      this.authorize(client, channel, payload.username, payload.password).then(subscribe);
    }
  }

  handleClientUnsubscribeRequest(client, channel, payload){
    if(!client.authenticated){
      this.clientAuthenticationError(client);
    }else{
      this.unsubscribe(client, channel);
    }
  }

  handleClientCloseRequest(client){
    if(!client.authenticated){
      this.clientAuthenticationError(client);
    }else{
      Object.keys(this.channels).forEach(channel => {
        this.unsubscribe(client, channel);
      });
      client.send(MSG.CLS_ACK, null);
    }
  }

  handlePublishRequest(req, res){
    if(req.method === 'POST' && stripSlashes(req.url) === this.publishUrl){
      let body = [];

      req
      .on('data', chunk => body.push(chunk))
      .on('end', () => {
        body = Buffer.concat(body).toString();
        try {
          body = JSON.parse(body);
          if( !this.verifyPublisher(req.headers, req.body, this.applicationKey) ){
            let msg = 'Unauthorized publish request';
            log(`Error: ${msg}`)
            res.statusCode = 401;
            res.statusMessage = msg;
            res.end();
          }else{
            this.push(body.channel, body.payload)
            .then(n => {
              if(n)
                log(`Received message, pushed to ${n} clients on channel "${body.channel}"`);
              else
                log(`Received message, no clients subscribed to channel "${body.channel}"`);
              res.statusCode = 200;
              res.end('ok');
            });
          }
        }catch (err){
          let msg = 'Bad Request';
          log(`Error: ${msg}`)
          res.statusCode = 400;
          res.statusMessage = msg;
          res.end();
        }
      });
    }
  }

  subscribe(client, channel){
    if(this.channels[channel]){
      this.channels[channel].push(client);
    }else{
      this.channels[channel] = [client];
    }
    client.send(MSG.SUB_ACK, channel);
    log(`client ${client.id} subscribed to channel "${channel}"`);
  }

  unsubscribe(client, channel){
    if(this.channels[channel]){
      this.channels[channel] = this.channels[channel].filter(_client => _client !== client);
    }
    if(!this.channels[channel].length){
      delete this.channels[channel];
    }

    client.send(MSG.UNS_ACK, channel);
    log(`client ${client.id} unsubscribed from channel "${channel}"`);
  }

  push(channel, payload){
    return new Promise((resolve) => {
      if(this.channels[channel]){
        this.channels[channel].forEach(client =>
          client.send(MSG.PUSH, channel, payload)
        );
      }
      resolve((this.channels[channel] || []).length);
    });
  }

  clientAuthenticationError(client){
    client.send(MSG.AUTH_REJ, null, {
      reason: `Invalid credentials`
    });
    log(`Client ${client.id} rejected with invalid credentials`);
  }

  clientNotAuthorizedError(client, channel){
    client.send(MSG.SUB_REJ, channel, {
      reason: `Not authorized for channel ${channel}`
    });
    log(`Client ${client.id} unauthorized for channel "${channel}"`);
  }

  clientInvalidTypeError(client){
    client.send(MSG.TYP_ERR, null, {
      reason: `Invalid message type`
    });
  }

  clientInvalidShapeError(client){
    client.send(MSG.BAD_REQ, null, {
      reason: `Invalid message format, could not parse`
    });
  }

  alreadyAuthenticatedError(client){
    client.send(MSG.AUTH_ERR, null, {
      reason: 'Already authenticated'
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

function dummyAuthorize(channel, client){
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
