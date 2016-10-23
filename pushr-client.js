"use strict";

const Chance = require("chance")
const chance = new Chance();

module.exports = class PushrClient {
  constructor(conn){
    this.id = chance.guid();
    this.conn = conn;
    this.authenticated = false;

    const credentials = {};

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
}
