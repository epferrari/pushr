"use strict";

const EventEmitter = require("events");
const mock = require("mock-require");
const Pushr = require("./");
const intents = require("../intents");

class MockConnection extends EventEmitter {
  constructor(){
    super();
    this.write = jasmine.createSpy('conn.write');
    this.emulateData = message =>
      this.emit('data', JSON.stringify(message));
  }
}

describe("Pushr service", () => {
  let pushr;
  beforeEach(() => {
    pushr = new Pushr();

    spyOn(pushr, "clientInvalidMessageError");
    spyOn(pushr, "clientInvalidIntentError");
    spyOn(pushr, "handleClientAuthRequest");
  });

  describe("handling a client connection", () => {
    let conn;

    beforeEach(() => {
      conn = new MockConnection();
      pushr.service.emit("connection", conn);
    });

    describe("given the client's intent is authentication", () => {
      it("calls <Pushr>#handleClientAuthRequest", () => {
        conn.emulateData({
          intent: intents.AUTH_REQ
        });
        expect(pushr.handleClientAuthRequest).toHaveBeenCalled();
      });
    });

    describe("given the client's intent is subscribing", () => {

    });

    describe("given the client's intent is unsubscribing from a topic", () => {

    });

    describe("given the client's intent is to close their connection", () => {

    });

    describe("given the client's intent is unrecognized", () => {
      it("calls <Pushr>#invalidIntentError", () => {
        conn.emulateData({
          "intent": "whizbang"
        });
        expect(pushr.clientInvalidIntentError).toHaveBeenCalled();
      });
    });
  });
});
