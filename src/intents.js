module.exports = {
  AUTH_REQ: 1,        // authentication request (inbound)
  AUTH_ACK: 2,        // authentication acknowledgement, credentials saved (outbound)
  AUTH_REJ: 3,        // authentication rejected, credentials were invalid (outbound)
  AUTH_ERR: 4,        // authentication error, client has already saved credentials (outbound)

  SUB_REQ: 5,         // subscription request (inbound)
  SUB_ACK: 6,         // subscription acknowledgement, authorized and subscribed (outbound)
  SUB_REJ: 7,         // subscription rejection, unauthorized (outbound)
  SUB_ERR: 8,         // subscription error (outbound)

  UNS_REQ: 9,         // unsubscribe request (inbound)
  UNS_ACK: 10,        // unsubscribe acknowledgement (outbound)
  UNS_REJ: 11,        // unsubscribe rejection (outbound)
  UNS_ERR: 12,        // unsubscribe error (outbound)

  CLOSE_REQ: 13,      // connection close request (inbound)
  CLOSE_ACK: 14,      // connection close acknowledgement (outbound)
  CLOSE_ERR: 15,      // connection close error (outbound)

  INVLD_INTENT: 16,   // invalid message intent (outbound)
  INVLD_MSG: 17,      // invalid message shape (outbound)
  PUSH: 18            // message pushed to client (outbound)
};
