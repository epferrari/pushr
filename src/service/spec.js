"use strict";

const EventEmitter = require("events");
const mock = require("mock-require");
const Pushr = require("./");

class MockConnection extends EventEmitter {
  constructor(){
    super();
    this.write = jasmine.createSpy('conn.write');
  }
}

describe("Pushr service", () => {
  let pushr;
  beforeEach(() => {
    pushr = new Pushr();

    spyOn(pushr, "clientInvalidMessageError");
    spyOn(pushr, "clientInvalidIntentError");
  });

  describe("handling a client connection", () => {
    let conn;

    beforeEach(() => {
      conn = new MockConnection();
      pushr.service.emit("connection", conn);
    });

    describe("given the client's intent is authentication", () => {

    });

    describe("given the client's intent is subscribing", () => {

    });

    describe("given the client's intent is unsubscribing from a topic", () => {

    });

    describe("given the client's intent is to close their connection", () => {

    });

    describe("given the client's intent is unrecognized", () => {
      it("calls <Pushr>#invalidIntentError", () => {
        conn.emit("data", JSON.stringify({
          "intent": "whizbang"
        }));
        expect(pushr.clientInvalidIntentError).toHaveBeenCalled();
      });
    });

    describe("given the client sends an unparsable message", () => {
      it("calls <Pushr>#invalidMessageError", () => {
        conn.emit("data", function(){});
        expect(pushr.clientInvalidMessageError).toHaveBeenCalled();
      });
    });
  });
});
