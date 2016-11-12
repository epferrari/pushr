module.exports = {
  AUTH_REQ: 1,        // authentication request (client => server)
  AUTH_ACK: 2,        // authentication acknowledgement, credentials saved (server => client)
  AUTH_REJ: 3,        // authentication rejected, credentials were invalid (server => client)
  AUTH_ERR: 4,        // authentication error, client has already saved credentials (server => client)

  SUB_REQ: 5,         // subscription request (client => server)
  SUB_ACK: 6,         // subscription acknowledgement, authorized and subscribed (server => client)
  SUB_REJ: 7,         // subscription rejection, unauthorized (server => client)
  SUB_ERR: 8,         // subscription error (server => client)

  UNS_REQ: 9,         // unsubscribe request (client => server)
  UNS_ACK: 10,        // unsubscribe acknowledgement (server => client)
  UNS_REJ: 11,        // unsubscribe rejection (server => client)
  UNS_ERR: 12,        // unsubscribe error (server => client)

  CLOSE_REQ: 13,      // connection close request (client => server)
  CLOSE_ACK: 14,      // connection close acknowledgement (server => client)
  CLOSE_ERR: 15,      // connection close error (server => client)

  INVLD_INT: 16,   // invalid message intent (server => client)
  INVLD_MSG: 17,      // invalid message shape (server => client)
  PUSH: 18,           // message pushed from server (server => client)

  PUB_REQ: 19,        // message pushed from client (client => server)
  PUB_ACK: 20,        // client-to-client push acknowledgement (server => client)
  PUB_REJ: 21,        // client-to-client push rejection (server => client)
  PUB_ERR: 22         // client-to-client push error (server => client)
};
