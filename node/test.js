"use strict";

const utils = require('./utils');
const htcrawl = require("./htcrawl/main.js");

test();

async function test() {
	process.argv.push(...["-n", "1"])
	let options = utils.getOptionsFromCMD();
	options.eventCache = false;
	options.setCookies = [
		{
			name: 'PHPSESSID',
			value: 'epg91ub0mn77g55v5po88fs6ba',
			domain: '172.16.245.149',
			path: '/',
			secure: false,
			expires: null,
			httponly: false
		},
		{
			name: 'alc_enc',
			value: '1%3A8885ea870313d49e889801323341c176b041c5df',
			domain: '172.16.245.149',
			path: '/',
			secure: false,
			expires: null,
			httponly: false
		},
		{
			name: 'alc_device',
			value: 'd2bcf55df38dc4df0951db476590ac61a161ba4e',
			domain: '172.16.245.149',
			path: '/',
			secure: false,
			expires: null,
			httponly: false
		}
	]
	options.outputFunc = (msg) => {
		console.log(msg);
	}
	let crawler = await htcrawl.NewCrawler(options);
	await crawler.analyze("http://172.16.245.149/my-project/public/admin");
	//process.exit(1);
}
