"use strict";

const timestamp = require("./timestamp");

module.exports = function logError(msg){
  if(process.env.NODE_ENV !== 'test')
    process.stderr.write(`${timestamp()} -- ${msg}\n`);
}
