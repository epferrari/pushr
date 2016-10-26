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

    spyOn(pushr, "handleAuthRequest").and.callThrough();
    spyOn(pushr, "handleSubRequest").and.callThrough();
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
    let conn, client;

    beforeEach(() => {
      configurePushr({authenticate});
      conn = createConnection();
      client = pushr.channels["*"][0];

      spyOn(client, "invalidIntentError");
      spyOn(client, "unsubscribe").and.callThrough();
      spyOn(client, "close").and.callThrough();
    });

    it("it subscribes the client to the '*' channel by default", () => {
      expect(pushr.channels["*"].length).toBe(1);
    });

    describe("given the client's intent is authentication", () => {
      beforeEach(() => {
        mockMessage(conn, {intent: intents.AUTH_REQ});
      });

      it("calls <Pushr>#handleClientAuthRequest", () => {
        expect(pushr.handleAuthRequest).toHaveBeenCalled();
      });
    });

    describe("given the client's intent is subscribing", () => {
      beforeEach(() => {
        mockMessage(conn, {intent: intents.SUB_REQ});
      });

      it("calls <Pushr>#handleSubRequest", () => {
        expect(pushr.handleSubRequest).toHaveBeenCalled();
      });
    });

    describe("given the client's intent is unsubscribing from a topic", () => {
      beforeEach(() => {
        mockMessage(conn, {intent: intents.UNS_REQ});
      });

      it("unsubscribes the client", () => {
        expect(client.unsubscribe).toHaveBeenCalled();
      });
    });

    describe("given the client's intent is to close their connection", () => {
      beforeEach(() => {
        mockMessage(conn, {intent: intents.CLOSE_REQ});
      });

      it("closes the client's connection", () => {
        expect(client.close).toHaveBeenCalled();
        expect(pushr.channels["*"].length).toBe(0);
      });
    });

    describe("given the client's intent is unrecognized", () => {
      it("calls <Pushr>#invalidIntentError", () => {
        mockMessage(conn, {intent: "whizbang"});
        expect(client.invalidIntentError).toHaveBeenCalled();
      });
    });
  });

  describe("#handleAuthRequest", () => {
    let client, credentials, authentication;

    function configureAndSpy(config){
      configurePushr(config);

      mockMessage(createConnection(), {
        intent: intents.AUTH_REQ,
        payload: {
          auth: {
            username: "john_smith",
            password: "strong_password_1"
          }
        }
      });

      let lastCall = pushr.handleAuthRequest.calls.mostRecent();
      credentials = lastCall.args[1];
      client = lastCall.args[0];

      spyOn(client, 'storeCredentials');
      spyOn(client, 'send');
    }


    describe("given an `authenticate` function is provided at configurtion", () => {
      beforeEach( () => {
        configureAndSpy({authenticate});
      });

      it("authenticates the client using the function", () => {
        expect(authenticate).toHaveBeenCalledWith(credentials);
      });
    });

    describe("when authentication is successful", () => {
      describe("and given <Pushr> instance is configured to store client credentials", () => {

        beforeEach( () => {
          configureAndSpy({authenticate, storeCredentials: true});
          authentication = authenticate.calls.mostRecent().returnValue;
        });

        it("stores the client's credentials", done => {
          authentication
            .then(() => {
              expect(client.storeCredentials).toHaveBeenCalledWith(credentials);
              done();
            });

          authentication.resolve();
        });

        it("flags the client as authenticated", done => {
          authentication.then(() => {
            expect(client.authenticated).toBe(true);
            done();
          });

          authentication.resolve();
        });

        it("sends acknowledgement to the client", done => {
          authentication.then(() => {
            expect(client.send).toHaveBeenCalledWith(intents.AUTH_ACK, null, null);
            done();
          });

          authentication.resolve();
        });
      });

      describe("and given <Pushr> instance is configured not to store client credentials", () => {
        beforeEach( () => {
          configureAndSpy({authenticate, storeCredentials: false});
          authentication = authenticate.calls.mostRecent().returnValue;
        });

        it("does not store the clients credentials", done => {
          authentication
            .then(() => {
              expect(client.storeCredentials).not.toHaveBeenCalled();
              done();
            });

          authentication.resolve();
        });

        it("does not flag the client as authenticated", done => {
          authentication.then(() => {
            expect(client.authenticated).toBe(false);
            done();
          });

          authentication.resolve();
        });
      });
    });

    describe("when authentication fails", () => {
      beforeEach( () => {
        configureAndSpy({authenticate, storeCredentials: true});
        authentication = authenticate.calls.mostRecent().returnValue;
      });

      it("notifies the client of the authentication error", done => {
        setTimeout(() => {
          expect(client.send).toHaveBeenCalled()
          expect(client.send.calls.mostRecent().args[0]).toBe(intents.AUTH_REJ);
          done();
        }, 0);

        authentication.reject();
      });

      it("does not store the clients credentials", done => {
        setTimeout(() => {
          expect(client.storeCredentials).not.toHaveBeenCalled();
          done();
        }, 0);

        authentication.reject();
      });

      it("does not flag the client as authenticated", done => {
        setTimeout(() => {
          expect(client.authenticated).toBe(false);
          done();
        }, 0);

        authentication.reject();
      });
    });
  });
});
