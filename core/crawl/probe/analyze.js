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


const os = require('os');
const fs = require('fs');
const path = require('path');
const utils = require('./utils');
const process = require('process');
const htcrawl = require("./htcrawl");


var sleep = function (n) {
	return new Promise(resolve => {
		setTimeout(resolve, n);
	});
};


var argv = utils.parseArgs(process.argv, "hVaftUdICc:MSp:Tsx:A:r:mHX:PD:R:Oi:u:vy:E:lJ:L:zMg:", {});
var options = argv.opts

var targetUrl = argv.args[0];


if (!targetUrl) {
	utils.usage();
	process.exit(0);
}

targetUrl = targetUrl.trim();
if (targetUrl.length < 4 || targetUrl.substring(0, 4).toLowerCase() != "http") {
	targetUrl = "http://" + targetUrl;
}

if (os.platform() == "win32") {
	options.executablePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
}

options.openChromeDevtoos = true;
options.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3419.0 Safari/537.36";
options.args = [
	'--no-sandbox',
	'--disable-gpu',
];

(async () => {
	let crawler = await htcrawl.NewCrawler(options);
	let page = await crawler.page();

	try {
		await crawler.analyze(page, "http://127.0.0.1:8080/1.html");
		
		//await analyze(crawler, page, "https://bing.com/");
		// await analyze(crawler, page, "https://sina.cn/");
	} catch (err) {
		console.log(err);
	}
})();