"use strict";

const http = require('http');
const sockjs = require('sockjs');

const defaultConfig = {
  authenticate: dummyAuthenticate,
  prefix: '/bully',
  openChannels: [],
  port: 9999,
  hostname: 'localhost'
}


module.exports = class Bully {
  constructor(appKey, config = {}){
    this.appKey = appKey;
    this.channels = {};

    config = Object.assign({}, config, defaultConfig);

    const service = (config.service || createSockService());
    const server = (config.server || http.createServer(this.handleRequest.bind(this)));

    service.installHandlers(server, {prefix: config.prefix});

    service.on('connection', conn => {
      conn.on('data', message => {
        try {
          message = JSON.parse(message)
        } catch (err) {
          message = {}
        }

        let {type, channel, payload} = message;

        if(type === 'sub'){
          if(openChannels.includes(channel)){
            this.subscribe(conn, channel);
          } else if(typeof payload === 'object'){
            authenticate(channel, payload)
            .then( () => this.subscribe(conn, channel) )
            .catch(err =>
              // notify client of failed subscription to channel
              conn.write(JSON.stringify({
                type: 'rej',
                channel: channel,
                reason: err
              }))
            );
          }
        }else if(type === 'uns'){
          this.unsubscribe(conn, channel);
        }
      });
    });


    server.listen(config.port, config.hostname, () => {
      console.log(`listening for POST requests on ${config.hostname}:${config.port}`);
      console.log(`accepting socket clients on ${config.prefix}`);
    });
  }

  subscribe(conn, channel){
    // add channel
    if(this.channels[channel]){
      this.channels[channel].push(conn);
    }else{
      this.channels[channel] = [conn];
    }

    // notify client of successful subscription to channel
    conn.write(JSON.stringify({
      type: 'sub',
      channel: channel
    }));
  }

  unsubscribe(conn, channel){
    if(this.channels[channel]){
      this.channels[channel] = this.channels[channel].filter(c => c !== conn);
    }
    if(!this.channels[channel].length){
      delete this.channels[channel];
    }

    conn.write(JSON.stringify({
      type: 'uns',
      channel: channel
    }));
  }

  push(channel, payload){
    return new Promise((resolve) => {
      if(this.channels[channel]){
        this.channels[channel].forEach(conn =>
          conn.write(JSON.stringify({
            type: 'msg',
            channel: channel,
            payload: payload
          }))
        );
      }
      resolve((this.channels[channel] || []).length);
    });
  }

  handleRequest(req, res){
    if(req.method === 'POST'){
      let body = [];
      req
      .on('data', chunk => body.push(chunk))
      .on('end', () => {
        body = Buffer.concat(body).toString();
        try {
          body = JSON.parse(body);
          if(body.appKey !== this.appKey){
            let msg = 'Unauthorized application key';
            process.stderr.write(`${timestamp()} Error: ${msg}`)
            res.statusCode = 401;
            res.statusMessage = msg;
            res.end();
          }else{
            this.push(body.channel, body.payload)
            .then(n => {
              if(n)
                process.stdout.write(
                  `${timestamp()} Received message, pushed to ${n} clients on channel "${body.channel}"\n`
                );
              else
                process.stdout.write(
                  `${timestamp()} Received message, no clients subscribed to channel "${body.channel}"\n`
                );
              res.statusCode = 200;
              res.end('ok');
            });
          }
        }catch (err){
          let msg = 'Bad Request';
          process.stderr.write(`${timestamp()} Error: ${msg}`)
          res.statusCode = 400;
          res.statusMessage = msg;
          res.end();
        }
      });
    }
  }
}

function timestamp(){
  return new Date().toString();
}

function createSockService(){
  return sockjs.createServer({ sockjs_url: 'http://cdn.jsdelivr.net/sockjs/1.0.1/sockjs.min.js' });
}

function dummyAuthenticate(channel, credentials){
  return Promise.resolve();
}
