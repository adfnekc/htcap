"use strict";

const utils = require('./utils');
const htcrawl = require("./htcrawl/main.js");

test();

async function test() {
    let options = utils.getOptionsFromCMD();
    options.eventCache = false;
    options.setCookies=[
        {
          name: 'SN60a86d5dc5b91',
          value: '5aar7pnp9c5sgu7nmbhbo9cvl7',
          domain: '172.16.245.137',
          path: '/',
          secure: false,
          expires: null,
          httponly: false
        },
        {
          name: 'modx_remember_manager',
          value: 'admin',
          domain: '172.16.245.137',
          path: '/',
          secure: false,
          expires: null,
          httponly: false
        },
      ]
    options.outputFunc = (msg) => {
        console.log(msg);
    }
    let crawler = await htcrawl.NewCrawler(options);
    await crawler.analyze("http://172.16.245.137/manager/");
    //process.exit(1);
}
