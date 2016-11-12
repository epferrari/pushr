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

  subscribe(topic){
    let {channels} = this.owner;
    if(channels[topic]){
      channels[topic].push(this);
    }else{
      channels[topic] = [this];
    }
    this.didSubscribe(topic);
  }

  unsubscribe(topic){
    let channel, {channels} = this.owner;
    if(channel = channels[topic]){
      channels[topic] = channel.filter(client => client.id !== this.id);
    }
    if(channel && !channel.length){
      delete channels[topic];
    }
    this.didUnsubscribe(topic);
  }

  close(){
    let {owner, unsubscribe} = this;
    Object.keys(owner.channels).forEach(unsubscribe.bind(this));
    this.didClose();
  }

  authorized(topic){
    let {owner} = this;
    if(owner.publicChannels.includes(topic)){
      return true;
    }else if(owner.protectedChannels.includes(topic) && this.authenticated){
      return true;
    }else{
      return !!(owner.channels[topic] && owner.channels[topic].includes(this));
    }
  }

  didAuthenticate(){
    this.authenticated = true;
    this.send(intents.AUTH_ACK, null, null);
  }

  didSubscribe(topic){
    let message = `Subscribed to "${topic}"`;
    this.send(intents.SUB_ACK, topic, {topic});
    this.log(message);
  }

  didUnsubscribe(topic){
    let message = `Unsubscribed from "${topic}"`;
    this.send(intents.UNS_ACK, topic, {topic});
    this.log(message);
  }

  didClose(){
    this.send(intents.CLOSE_ACK, null);
  }

  authenticationError(){
    let message = `Unable to authenticate. Invalid credentials.`;
    this.send(intents.AUTH_REJ, null, {message});
    this.log(message);
  }

  subscriptionNotAuthorizedError(topic){
    let message = `Unauthorized to subscribe to "${topic}"`;
    this.send(intents.SUB_REJ, topic, {message});
    this.log(message);
  }

  broadcastNotAuthorizedError(topic){
    let message = `Unauthorized to broadcast to "${topic}"`;
    this.send(intents.PUB_REJ, topic, {message});
    this.log(message);
  }

  alreadyAuthenticatedError(){
    let message = `Already authenticated`;
    this.send(intents.AUTH_ERR, null, {message});
    this.log(message);
  }

  invalidMessageError(){
    let message = `Invalid message format, could not parse.`
    this.send(intents.INVLD_MSG, null, {message});
    this.log(message);
  }

  invalidIntentError(){
    let message = `Invalid intent`;
    this.send(intents.INVLD_INTENT, null, {message});
    this.log(message);
  }

  log(message){
    log(`client id: ${this.id} -- ${message}`);
  }

  logError(message){
    logError(`client id: ${this.id} -- ${message}`);
  }
}
