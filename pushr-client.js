"use strict";

const Chance = require("chance")
const chance = new Chance();

module.exports = class PushrClient {
  constructor(conn){
    this.id = chance.guid();
    this.conn = conn;
    this.authenticated = false;

    const credentials = {};

    this.storeCredentials = (u, p) => {
      credentials.username = u;
      credentials.password = p;
    }

    Object.defineProperty(this, 'credentials', {
      get: () => credentials,
      enumerable: false,
      configurable: false,
      writable: false
    });
  }

  send(type, channel, payload = {}){
    this.conn.write(JSON.stringify({
      type, channel, payload
    }));
  }
}
