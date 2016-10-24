"use strict";

const Chance = require("chance")
const chance = new Chance();
const intents = require("../intents");

module.exports = class PushrClient {
  constructor(conn){
    this.id = chance.guid();
    this.conn = conn;
    this.authenticated = false;

    let credentials = {};

    this.storeCredentials = (c = {}) => {
      credentials = c;
    }

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
}
