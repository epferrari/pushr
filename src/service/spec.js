"use strict";

const EventEmitter = require("events");
const mock = require("mock-require");
const Pushr = require("./");
const intents = require("../intents");

class MockConnection extends EventEmitter {
  constructor(){
    super();
    this.write = jasmine.createSpy('conn.write');
    this.mockMessage = message =>
      this.emit('data', JSON.stringify(message));
  }
}

describe("Pushr service", () => {
  let pushr, config;
  beforeEach(() => {
    // spying on config.authenticate because <Pushr>.authenticate is not writable
    config = {
      authenticate(){
        let resolve, reject;
        let p = new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        });
        p.resolve = resolve;
        p.reject = reject;
        return p;
      }
    };

    spyOn(config, 'authenticate').and.callThrough();

    pushr = new Pushr(config);

    spyOn(pushr, "clientInvalidMessageError");
    spyOn(pushr, "clientInvalidIntentError");
    spyOn(pushr, "handleClientAuthRequest").and.callThrough();
    spyOn(pushr, "alreadyAuthenticatedError");
    //spyOn(pushr, "");
    //spyOn(pushr, "");
    //spyOn(pushr, "");
    //spyOn(pushr, "");
    //spyOn(pushr, "");
    //spyOn(pushr, "");
    //spyOn(pushr, "");
  });

  describe("handling a client connection", () => {
    let conn;

    beforeEach(() => {
      conn = new MockConnection();
      pushr.service.emit("connection", conn);
    });

    describe("given the client's intent is authentication", () => {
      beforeEach(() => {
        conn.mockMessage({intent: intents.AUTH_REQ});
      });

      it("calls <Pushr>#handleClientAuthRequest", () => {
        expect(pushr.handleClientAuthRequest).toHaveBeenCalled();
      });

      describe("and given the client is not authenticated yet", () => {
        it("authenticates the client", () => {
          expect(config.authenticate).toHaveBeenCalled();
        });
      });

      describe("and given the client already authenticated", () => {
        it("sends the client an error", done => {
          expect(config.authenticate).toHaveBeenCalledTimes(1);
          config.authenticate.calls.mostRecent().returnValue.resolve();
          setTimeout(() => {
            conn.mockMessage({intent: intents.AUTH_REQ});
            expect(config.authenticate).toHaveBeenCalledTimes(1);
            expect(pushr.alreadyAuthenticatedError).toHaveBeenCalled();
            done();
          }, 0);
        });
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
        conn.mockMessage({
          "intent": "whizbang"
        });
        expect(pushr.clientInvalidIntentError).toHaveBeenCalled();
      });
    });
  });
});
