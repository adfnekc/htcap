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
const io = require("./exchangeMsg").socketIO;

main();

async function main() {
	console.error("node recrvice <===", process.argv.pop());
	console.log("{\"status\":\"ok\",\"errors\":\"\",\"redirect\":\"\",\"cookies\":[{\"name\":\"Elgg\",\"value\":\"d69abf1a24a76431dffbd8992f433a5e\",\"domain\":\"localhost\",\"path\":\"/\",\"expires\":-1,\"httponly\":false,\"secure\":false}],\"requests\":[\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://localhost:8080/\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://localhost:8080/login\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://localhost:8080/forgotpassword\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://localhost:8080/activity\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://localhost:8080/blog/all\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://localhost:8080/bookmarks\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://localhost:8080/file\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://localhost:8080/groups/all\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://localhost:8080/members\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://localhost:8080/pages\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://localhost:8080/thewire/all\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"link\\\",\\\"url\\\":\\\"http://elgg.org/\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null}\",\"{\\\"type\\\":\\\"form\\\",\\\"method\\\":\\\"POST\\\",\\\"url\\\":\\\"http://localhost:8080/action/login\\\",\\\"data\\\":\\\"__elgg_token=Fi4JBaJeHDRdt--C8bVtHg&__elgg_ts=1615954528&username=XdXcgcbc&password=Xib%25Io416%25%2C&returntoreferer=true&persistent=true\\\"}\",\"{\\\"type\\\":\\\"form\\\",\\\"method\\\":\\\"GET\\\",\\\"url\\\":\\\"http://localhost:8080/search\\\",\\\"data\\\":\\\"q=XdXcgcbc&search_type=all\\\"}\",\"{\\\"type\\\":\\\"form\\\",\\\"method\\\":\\\"POST\\\",\\\"url\\\":\\\"http://localhost:8080/action/login\\\",\\\"data\\\":\\\"__elgg_token=Fi4JBaJeHDRdt--C8bVtHg&__elgg_ts=1615954528&username=XdXcgcbc&password=Xib%25Io416%25%2C&persistent=true\\\"}\",\"{\\\"url\\\":\\\"http://localhost:8080/\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\",\"{\\\"type\\\":\\\"xhr\\\",\\\"method\\\":\\\"POST\\\",\\\"url\\\":\\\"http://localhost:8080/action/login?\\\",\\\"data\\\":{},\\\"trigger\\\":{\\\"element\\\":\\\"#login-dropdown-box > div > form > fieldset > div:nth-of-type(3) > div > div > button > span\\\",\\\"event\\\":\\\"click\\\"},\\\"extra_headers\\\":{\\\"Accept\\\":\\\"application/json, text/javascript, */*; q=0.01\\\",\\\"X-Elgg-Ajax-API\\\":\\\"2\\\",\\\"X-Requested-With\\\":\\\"XMLHttpRequest\\\"}}\",\"{\\\"url\\\":\\\"http://localhost:8080/forgotpassword\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\",\"{\\\"url\\\":\\\"http://localhost:8080/search?q=XdXcgcbc&search_type=all\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\",\"{\\\"url\\\":\\\"http://localhost:8080/activity\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\",\"{\\\"url\\\":\\\"http://localhost:8080/blog/all\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\",\"{\\\"url\\\":\\\"http://localhost:8080/bookmarks\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\",\"{\\\"url\\\":\\\"http://localhost:8080/file\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\",\"{\\\"url\\\":\\\"http://localhost:8080/groups/all\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\",\"{\\\"url\\\":\\\"http://localhost:8080/members\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\",\"{\\\"url\\\":\\\"http://localhost:8080/pages\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\",\"{\\\"url\\\":\\\"http://localhost:8080/thewire/all\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\",\"{\\\"url\\\":\\\"http://elgg.org/\\\",\\\"type\\\":\\\"navigation\\\",\\\"method\\\":\\\"GET\\\",\\\"data\\\":null,\\\"trigger\\\":null,\\\"extra_headers\\\":{}}\"]}")
	return 0
	let options = utils.getOptionsFromCMD();

	let q = new taskQueue();
	let socket = new io(11218, q);
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
			console.log("waiting for queue...");
			await utils.sleep(5000);
		}
	} catch (e) {
		console.log(`crawler.analyze err,url:${target} err:${e}`);
	}
	return 0;
}
