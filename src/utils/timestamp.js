"use strict";

module.exports = function timestamp(){
  return `[ ${new Date().toISOString()} ]`;
};
