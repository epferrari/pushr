"use strict";

const Chance = require("chance")
const chance = new Chance();

const intents = require("../intents");
const log = require("../utils/log");
const logError = require("../utils/log-error");

module.exports = class PushrClient {
  constructor(conn, pushr){
    this.id = chance.guid();
    this.conn = conn;
    this.owner = pushr;
    this.authenticated = false;

    let credentials = {};

    this.storeCredentials = (c = {}) => {
      credentials = c;
    };

    Object.defineProperty(this, 'credentials', {
      get: () => credentials,
      enumerable: false,
      configurable: false
    });
  }

  send(intent, topic, payload = {}){
    this.conn.write(JSON.stringify({ intent, topic, payload }));
  }

  push(topic, payload = {}){
    this.send(intents.PUSH, topic, payload);
  }

  subscribe(topic){
    let {channels} = this.owner;
    if(channels[topic]){
      channels[topic].push(this);
    }else{
      channels[topic] = [this];
    }

    let message = `Subscribed to "${topic}"`;
    this.send(intents.SUB_ACK, topic, {topic});
    log(`client id: ${this.id} -- ${message}`);
  }

  unsubscribe(topic){
    let channel, {channels} = this.owner;
    if(channel = channels[topic]){
      channels[topic] = channel.filter(client => client.id !== this.id);
    }
    if(channel && !channel.length){
      delete channels[topic];
    }

    let message = `Unsubscribed from "${topic}"`;
    this.send(intents.UNS_ACK, topic, {topic});
    log(`client id: ${this.id} -- ${message}`);
  }

  close(){
    Object.keys(this.owner.channels).forEach(topic => {
      this.unsubscribe(topic);
    });
    this.send(intents.CLOSE_ACK, null);
  }

  authenticationError(){
    let message = `Unable to authenticate. Invalid credentials.`;
    this.send(intents.AUTH_REJ, null, {message});
    log(`client id: ${this.id} -- ${message}`);
  }

  notAuthorizedError(topic){
    let message = `Unauthorized to subscribe to "${topic}"`;
    this.send(intents.SUB_REJ, topic, {message});
    log(`client id: ${this.id} -- ${message}`);
  }

  alreadyAuthenticatedError(){
    let message = `Already authenticated`;
    this.send(intents.AUTH_ERR, null, {message});
    log(`client id: ${this.id} -- ${message}`);
  }

  invalidMessageError(){
    let message = `Invalid message format, could not parse.`
    this.send(intents.INVLD_MSG, null, {message});
    log(`client id: ${this.id} -- ${message}`);
  }

  invalidIntentError(){
    let message = `Invalid intent`;
    this.send(intents.INVLD_INTENT, null, {message});
    log(`client id: ${this.id} -- ${message}`);
  }
}
