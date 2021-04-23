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
const htcrawl = require("./htcrawl/main.js");
const io = require("./exchangeMsg").httpIO;

main();

async function main() {
	// let a = process.argv.pop()
	// if (a){
	// 	console.log(a)
	// }
	//console.error("node recrvice <===", process.argv.pop());

	let options = utils.getOptionsFromCMD();

	let socket = new io(21218);
	options.outputFunc = (msg) => {
		socket.send(msg);
	}
	let threads = [];
	for (let i = 0; i < options.threadnum; i++) {
		let statu = startCrawlerTask(socket, options);
		threads.push(statu);
	};
	let status = await Promise.all(threads);
	console.log("Task results for threads:", status);
}

/**
 * @param {io} socket 
 * @param {Object.<string,string>} options
 */
async function startCrawlerTask(socket, options) {
	let crawler = await htcrawl.NewCrawler(options);
	while (socket.is_alive()) {
		let target = utils.formatURL(await socket.dequeue());
		if (target) {
			try {
				let start = new Date()
				await crawler.analyze(target);
				console.log(`analyze page ${target} took ${new Date() - start}ms`)
			} catch (e) {
				console.log(`crawler.analyze err,url:${target} err:${e}`);
			}
		}
		await utils.sleep(1000);
	}
}
