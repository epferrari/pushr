"use strict";

const EventEmitter = require("events");
const mock = require("mock-require");
const Pushr = require("./");
const intents = require("../intents");

class MockConnection extends EventEmitter {
  constructor(){
    super();
    this.write = jasmine.createSpy('conn.write');
  }
}

describe("Pushr service", () => {
  let pushr, server, service, createConnection, mockMessage;

  // configuration functions
  let authenticate, authorizeChannel, verifyPublisher;

  // allow for dynamic configuration per spec/scenario
  // stub out http server and sockjs service
  function configurePushr(config = {}){
    server = new EventEmitter();
    server.listen = jasmine.createSpy('server.listen');

    service = new EventEmitter();
    service.installHandlers = jasmine.createSpy("service.installHandlers");

    Object.assign(config, {server, service});

    pushr = new Pushr(config);

    createConnection = () => {
      let conn = new MockConnection();
      service.emit('connection', conn);
      return conn;
    };

    mockMessage = (conn, message) => {
      conn.emit('data', JSON.stringify(message));
    };

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
  }

  beforeEach(() => {
    // authenticate fn for Pushr config
    authenticate = jasmine.createSpy('authenticate')
      .and.callFake(() => {
        let resolve, reject;
        let p = new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        });
        p.resolve = resolve;
        p.reject = reject;
        return p;
      });
  });

  describe("handling a client connection", () => {
    let conn;

    beforeEach(() => {
      configurePushr({authenticate});
      conn = createConnection();
    });

    describe("given the client's intent is authentication", () => {
      beforeEach(() => {
        mockMessage(conn, {intent: intents.AUTH_REQ});
      });

      it("calls <Pushr>#handleClientAuthRequest", () => {
        expect(pushr.handleClientAuthRequest).toHaveBeenCalled();
      });

      describe("and given the client is not authenticated yet", () => {
        it("authenticates the client", () => {
          expect(authenticate).toHaveBeenCalled();
        });
      });

      describe("and given the client already authenticated", () => {
        it("sends the client an error", done => {
          expect(authenticate).toHaveBeenCalledTimes(1);
          authenticate.calls.mostRecent().returnValue.resolve();
          setTimeout(() => {
            mockMessage(conn, {intent: intents.AUTH_REQ});
            expect(authenticate).toHaveBeenCalledTimes(1);
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
        mockMessage(conn, {intent: "whizbang"});
        expect(pushr.clientInvalidIntentError).toHaveBeenCalled();
      });
    });
  });

  describe("#handleClientAuthRequest", () => {
    let client, auth;

    function configureAndSpy(config){
      configurePushr({authenticate});
      conn = createConnection();

      mockMessage(conn, {
        intent: intents.AUTH_REQ,
        payload: {
          auth: {
            username: "john_smith",
            password: "strong_password_1"
          }
        }
      });

      let lastCall = pushr.handleClientAuthRequest.calls.mostRecent();
      auth = lastCall.args[1];
      client = lastCall.args[0];

      spyOn(client, 'storeCredentials');
      spyOn(client, 'send');
    }


    describe("given an `authenticate` function is provided at configurtion", () => {
      it("authenticates the client using the function", () => {

      });
    });

    describe("when authentication is successful", () => {
      describe("and given <Pushr> instance is configured to store client credentials", () => {
        it("stores the clients credentials", () => {

        });

        it("flags the client as authenticated", () => {

        });

        it("sends acknowledgement to the client", () => {

        });
      });

      describe("and given <Pushr> instance is configured not to store client credentials", () => {
        it("does not store the clients credentials", () => {

        });

        it("does not flag the client as authenticated", () => {

        });
      });
    });

    describe("when authentication fails", () => {
      it("notifies the client of the authentication error", () => {

      });

      it("does not store the clients credentials", () => {

      });

      it("does not flag the client as authenticated", () => {

      });
    });
  });
});
