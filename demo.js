"use strict";

const Pushr = require("./index");
const applicationKey = "123mykey456";
const verifyPublisher = (headers, body, appKey) => {
  console.log('in verify')
  return (headers['x-application-key'] === appKey);
}

const pushrServer = new Pushr({
  applicationKey,
  verifyPublisher
});
