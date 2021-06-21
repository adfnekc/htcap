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
const os = require("os");
const fs = require('fs');
const process = require('process');

let outfile = null;

let usage = () => {
	let usageinfo = "Usage: analyze.js [options] <url>\n" +
		"  -V              verbose\n" +
		"  -a              don't check ajax\n" +
		"  -f              don't fill values\n" +
		"  -t              don't trigger events (onload only)\n" +
		"  -s              don't check websockets\n" +
		"  -n <threadnum>  browser thread num" +
		"  -T              don't trigger mapped events\n" +
		"  -S              don't check for <script> insertion\n" +
		"  -P              load page with POST\n" +
		"  -D              POST data\n" +
		"  -R <string>     random string used to generate random values - the same random string will generate the same random values\n" +
		"  -X              comma separated list of excluded urls\n" +
		"  -C              don't get cookies\n" +
		"  -c <path>       set cookies from file (json)\n" +
		"  -p <user:pass>  http auth \n" +
		"  -x <seconds>    maximum execution time \n" +
		"  -A <user agent> set user agent \n" +
		"  -r <url>        set referer \n" +
		"  -H              return generated html \n" +
		"  -I              load images\n" +
		"  -O              dont't override timeout functions\n" +
		"  -u              path to user script to inject\n" +
		"  -K              keep elements in the DOM (prevent removal)\n" +
		"  -y <host:port>  use http proxY\n" +
		"  -l              do not run chrome in headless mode\n" +
		"  -v              exit after parsing options, used to verify user script\n" +
		"  -E              set extra http headers (json encoded {name:value}\n" +
		"  -L              set login sequence\n" +
		"  -z              do not crawl\n" +
		"  -M              don't simulate real mouse/keyboard events\n" +
		"  -J <path>       print json to file instead of stdout";
	console.log(usageinfo);
};

function parseArgsToOptions(args, defaults) {
	let options = {};
	for (var a in defaults) {
		options[a] = defaults[a];
	}
	for (var a = 0; a < args.opts.length; a++) {
		switch (args.opts[a][0]) {
			case "h":
				//showHelp = true;
				usage();
				break;
			case "V":
				options.verbose = true;
				break;
			case "a":
				options.checkAjax = false;
				break;
			case "f":
				options.fillValues = false;
				break;
			case "t":
				options.triggerEvents = false;
				break;
			case "d": // unused
				options.printAjaxPostData = false;
			case "S": // unused
				options.checkScriptInsertion = false;
				break;
			case "I": // unused
				options.loadImages = true;
				break;
			case "C": // unused
				options.getCookies = false;
				break;

			case "c":
				try {
					var cookie_file = fs.readFileSync(args.opts[a][1]);
					options.setCookies = JSON.parse(cookie_file);
				} catch (e) {
					console.log(e);
					phantom.exit(1); // @TODO ????
				}

				break;
			case "p":
				var arr = args.opts[a][1].split(":");
				options.httpAuth = [arr[0], arr.slice(1).join(":")];
				break;
			case "M":
				options.simulateRealEvents = false;
				break;
			case "T": // unused
				options.triggerAllMappedEvents = false;
				break;
			case "s": // unused
				options.checkWebsockets = false;
				break;
			case "x":
				options.maxExecTime = parseInt(args.opts[a][1]) * 1000;
				break;
			case "A":
				options.userAgent = args.opts[a][1];
				break;
			case "r":
				options.referer = args.opts[a][1];
				break;
			case "m":
				options.outputMappedEvents = true;
				break;
			case "n":
				options.threadnum = args.opts[a][1];
			case "H":
				options.returnHtml = true;
				break;
			case "X": // @TODO to be reviewed
				options.excludedUrls = args.opts[a][1].split(",");
				break;
			case "O":
				options.overrideTimeoutFunctions = false;
				break;
			case "i":
				options.id = args.opts[a][1];
				break;
			case "K":
				options.preventElementRemoval = true;
				break;
			case "R":
				options.randomSeed = args.opts[a][1];
				break;
			case "P":
				options.loadWithPost = true;
				break;
			case "D":
				options.postData = args.opts[a][1];
				break;
			case "y":
				var tmp = args.opts[a][1].split(":");
				if (tmp.length > 2) {
					options.proxy = tmp[0] + "://" + tmp[1] + ":" + tmp[2];
				} else {
					options.proxy = args.opts[a][1];
				}
				break;
			case "l":
				options.headlessChrome = false;
				break;
			case "E":
				options.extraHeaders = JSON.parse(args.opts[a][1]);
				break;
			case "g":
				options.localStorage = JSON.parse(args.opts[a][1]);
				break;
			case "J":
				outfile = args.opts[a][1];
				fs.writeFileSync(outfile, "", (err) => {
					console.log("Error writing to outfile");
				});
				break;
			case "L":
				try {
					options.loginSequence = JSON.parse(args.opts[a][1]);
				} catch (e) {
					try {
						options.loginSequence = JSON.parse(fs.readFileSync(args.opts[a][1]));
					} catch (e) {
						throw e;
					}
				}
				break;
			case "z":
				options.doNotCrawl = true;
				break;

		}
	}
	return options;
};

// @todo error on Unknown option ds
function getopt(args, optstring) {
	var args = args.slice();
	var ret = {
		opts: [],
		args: args
	};

	var m = optstring.match(/[a-zA-Z]\:*/g);
	for (var a = 0; a < m.length; a++) {
		var ai = args.indexOf("-" + m[a][0]);
		if (ai > -1) {
			if (m[a][1] == ":") {
				if (args[ai + 1]) {
					ret.opts.push([m[a][0], args[ai + 1]]);
					args.splice(ai, 2);
				} else {
					return "missing argumnet for option " + m[a][0];
				}
			} else {
				ret.opts.push([m[a][0]]);
				args.splice(ai, 1);
			}
		}
	}

	return ret;
};

exports.parseArgs = function (args, optstring, defaults) {
	var g = getopt(args, optstring);
	g.args.splice(0, 2);
	return { opts: parseArgsToOptions(g, defaults), args: g.args };
};

exports.getOptionsFromCMD = () => {
	let argv = this.parseArgs(process.argv, "hVaftUdICc:MSp:Tsn:x:A:r:mHX:PD:R:Oi:u:vy:E:lJ:L:zMg:", {});
	let options = argv.opts

	if (!options.threadnum || options.threadnum < 1) {
		console.error("options must specfied more than 1 thread,use '-n' ")
		process.exit(1);
	}

	// for debug
	options.openChromeDevtoos = true;
	options.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3419.0 Safari/537.36";

	if (os.platform() == "win32") {
		options.executablePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
	}

	console.log(options)

	return options;
};


/**
 * @param {string} targetUrl
 */
exports.formatURL = (targetUrl) => {
	if (targetUrl === undefined || !targetUrl) {
		return ""
	}
	targetUrl = targetUrl.trim();
	if (targetUrl.length < 4 || targetUrl.substring(0, 4).toLowerCase() != "http") {
		targetUrl = "http://" + targetUrl;
	}
	return targetUrl;
};

/**
 * @param {int} ms means milliseconds
 */
exports.sleep = async (ms) => {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve(true);
		}, ms);
	});
};
