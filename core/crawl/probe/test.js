"use strict";

const utils = require('./utils');
const htcrawl = require("./htcrawl");
const taskQueue = require("./taskQueue");
const io = require("./exchangeMsg").socketIO;

test();

async function test() {
    let options = utils.getOptionsFromCMD();
    options.outputFunc = (msg) => {
        try {
            msg = JSON.stringify(msg);
        } catch (e) {
            console.error("JSON.stringify msg err,", msg);
        }
        console.log(msg);
    }
    let crawler = await htcrawl.NewCrawler(options);
    await crawler.analyze("http://localhost:8080/");
    process.exit(1);
}
