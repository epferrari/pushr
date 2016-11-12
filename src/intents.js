"use strict";

const keyMirror = arr =>
  arr.reduce((acc, key) => {
    acc[key] = key;
    return acc;
  }, {});

module.exports = keyMirror([
  "AUTH_REQ",       // authentication request (client => server)
  "AUTH_ACK",       // authentication acknowledgement, credentials saved (server => client)
  "AUTH_REJ",       // authentication rejected, credentials were invalid (server => client)
  "AUTH_ERR",       // authentication error, client has already saved credentials (server => client)

  "CONN_ACK",       // connection acknowledgement

  "CLOSE_REQ",      // connection close request (client => server)
  "CLOSE_ACK",      // connection close acknowledgement (server => client)
  "CLOSE_ERR",      // connection close error (server => client)

  "INTENT_ERR",     // invalid message intent (server => client)

  "MSG",            // message pushed from server (server => client)
  "MSG_ERR",        // invalid message shape (server => client)

  "PUB_REQ",        // message pushed from client (client => server ~> [clients])
  "PUB_ACK",        // client-to-client push acknowledgement (server => client)
  "PUB_REJ",        // client-to-client push rejection (server => client)
  "PUB_ERR",        // client-to-client push error (server => client)

  "SUB_REQ",        // subscription request (client => server)
  "SUB_ACK",        // subscription acknowledgement, authorized and subscribed (server => client)
  "SUB_REJ",        // subscription rejection, unauthorized (server => client)
  "SUB_ERR",        // subscription error (server => client)

  "UNS_REQ",        // unsubscribe request (client => server)
  "UNS_ACK",        // unsubscribe acknowledgement (server => client)
  "UNS_REJ",        // unsubscribe rejection (server => client)
  "UNS_ERR"         // unsubscribe error (server => client)
]);
