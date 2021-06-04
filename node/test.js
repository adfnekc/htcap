"use strict";

const utils = require('./utils');
const htcrawl = require("./htcrawl/main.js");

test();

async function test() {
	let url = "http://172.16.245.128/admin/pages.php?error=There was a problem trying to clone <b>index-1</b>";
	let cookie = [
		{
			name: 'GS_ADMIN_USERNAME',
			value: 'admin',
			domain: '172.16.245.128',
			path: '/',
			secure: false,
			expires: null,
			httponly: false
		},
		{
			name: '4d5ffed79f58c04679e11e51acb48e1b7b76d063',
			value: 'dc422f34d2af27a705e1f5a0949ddd0f715300a4',
			domain: '172.16.245.128',
			path: '/',
			secure: false,
			expires: null,
			httponly: false
		}
	];


	process.argv.push(...["-n", "1"]);
	let options = utils.getOptionsFromCMD();
	options.eventCache = false;
	options.setCookies = cookie
	options.outputFunc = (msg) => {
		console.log(msg);
	}
	let crawler = await htcrawl.NewCrawler(options);

	let start = new Date()
	await crawler.analyze(url);
	console.log(`analyze page ${url} took ${new Date() - start}ms`)
}
