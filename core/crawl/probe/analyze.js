/*
HTCAP - 1.2
http://htcap.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/


"use strict";

const utils = require('./utils');
const htcrawl = require("./htcrawl");
const taskQueue = require("./taskQueue");
const socketIO = require("./exchangeMsg");

main();

async function main() {
	let options = utils.getOptionsFromCMD();

	let q = new taskQueue();
	let socket = new socketIO(21818, q);
	options.outputFunc = (msg) => {
		try {
			msg = JSON.stringify(msg);
		} catch (e) {
			console.error("JSON.stringify msg err,", msg);
		}
		socket.send(msg);
	}
	let threads = [];
	for (let i = 0; i < options.threadnum; i++) {
		let statu = startCrawlerTask(q, options);
		threads.push(statu);
	};
	let status = await Promise.all(threads);
	console.log("Task results for threads:", status);
}


async function startCrawlerTask(q, options) {
	let crawler = await htcrawl.NewCrawler(options);

	let target = "";
	try {
		while (true) {
			while (!q.isEmpty()) {
				target = utils.formatURL(q.takeOne());
				if (target) {
					await crawler.analyze(target);
				}
			}
			await utils.sleep(5000);
		}
	} catch (e) {
		console.log(`crawler.analyze err,url:${target} err:${e}`);
	}
	return 0;
}
