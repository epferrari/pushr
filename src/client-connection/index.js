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

    this.subscribe("*");
    this.send(intents.CONN_ACK, {payload: {client_id: this.id}});
  }


  send(intent, message = {}){
    /*
    * {
    *   intent: <String intent>,
    *   topic: <String>,
    *   payload: <Object>,
    *   error: <String>,
    *   _self: <Boolean>,
    *   _sender: <Object>
    * }
    */
    message.intent = intent;
    // security precaution
    delete message.auth;
    this.conn.write(JSON.stringify(message));
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
    this.send(intents.AUTH_ACK);
  }

  didSubscribe(topic){
    let message = `Subscribed to '${topic}'`;
    this.send(intents.SUB_ACK, {topic});
    this.log(message);
  }

  didUnsubscribe(topic){
    let message = `Unsubscribed from '${topic}'`;
    this.send(intents.UNS_ACK, {topic});
    this.log(message);
  }

  didClose(){
    this.send(intents.CLOSE_ACK);
  }

  authenticationError(){
    let error = `Unable to authenticate. Invalid credentials.`;
    this.send(intents.AUTH_REJ, {error});
    this.log(error);
  }

  subscriptionNotAuthorizedError(topic){
    let error = `Unauthorized to subscribe to '${topic}'`;
    this.send(intents.SUB_REJ, {topic, error});
    this.log(error);
  }

  broadcastNotAuthorizedError(topic){
    let error = `Unauthorized to broadcast to '${topic}'`;
    this.send(intents.PUB_REJ, {topic, error});
    this.log(error);
  }

  alreadyAuthenticatedError(){
    let error = `Already authenticated`;
    this.send(intents.AUTH_ERR, {error});
    this.log(error);
  }

  invalidMessageError(){
    let error = `Invalid message format, could not parse.`
    this.send(intents.MSG_ERR, {error});
    this.log(error);
  }

  invalidIntentError(intent){
    let error = `Invalid intent '${intent}'`;
    this.send(intents.INTENT_ERR, {error});
    this.log(error);
  }

  log(message){
    log(`client id: ${this.id} -- ${message}`);
  }

  logError(message){
    logError(`client id: ${this.id} -- ${message}`);
  }
}
