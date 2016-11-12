"use strict";

const timestamp = require("./timestamp");

module.exports = function log(msg){
  if(process.env.NODE_ENV !== 'test')
    process.stdout.write(`${timestamp()} -- ${msg}\n`);
}
