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
	'--headless',
	'--disable-gpu',
	'--window-size=1920x1080'
];


(async () => {
	let crawler = await htcrawl.NewCrawler(options);
	let page = await crawler.page();

	try {
		if (options.referer) {
			await page.setExtraHTTPHeaders({
				'Referer': options.referer
			});
		}
		if (options.extraHeaders) {
			await page.setExtraHTTPHeaders(options.extraHeaders);
		}
		for (let i = 0; i < options.setCookies.length; i++) {
			if (!options.setCookies[i].expires)
				options.setCookies[i].expires = parseInt((new Date()).getTime() / 1000) + (60 * 60 * 24 * 365);
			//console.log(options.setCookies[i]);
			await page.setCookie(options.setCookies[i]);
		}

		if (options.httpAuth) {
			await page.authenticate({ username: options.httpAuth[0], password: options.httpAuth[1] });
		}

		if (options.userAgent) {
			await page.setUserAgent(options.userAgent);
		}

		await page.setDefaultNavigationTimeout(crawler.options.navigationTimeout);
	} catch (e) {
		console.log("modify page err,", e);
	}

	await page.setViewport({
		width: 1366,
		height: 768,
	});

	await crawler.inject();


	try {
		await crawler.analyze(page, "https://baidu.com/");
		//await analyze(crawler, page, "https://bing.com/");
		// await analyze(crawler, page, "https://sina.cn/");
	} catch (err) {
		console.log(err);
	}
})();


async function analyze(crawler, page, targetUrl) {
	await crawler.navigate(targetUrl);
	var execTO = null;
	var domLoaded = false;
	var endRequested = false;
	var loginSeq = 'loginSequence' in options ? options.loginSequence : false;
	const pidfile = path.join(os.tmpdir(), "htcap-pids-" + process.pid);

	async function exit() {
		//await sleep(1000000)
		//clearTimeout(execTO);
		//await crawler.browser().close();
		// fs.unlink(pidfile, (err) => { });
		// process.exit();
		return;
	}

	async function getPageText(page) {
		const el = await crawler.page().$("html");
		const v = await el.getProperty('innerText');
		return await v.jsonValue();
	}

	async function end() {
		if (endRequested) return;
		endRequested = true;
		if (domLoaded && !crawler.redirect()) {
			const hash = await getPageText(crawler.page());
			var json = '["page_hash",' + JSON.stringify(hash) + '],';
			utils.print_out(json);

			if (options.returnHtml) {
				json = '["html",' + JSON.stringify(hash) + '],';
				utils.print_out(json);
			}
		}

		await utils.printStatus(crawler);
		await exit();
	}

	async function loginErr(message, seqline) {
		if (seqline) {
			message = "action " + seqline + ": " + message;
		}
		crawler.errors().push(["login_sequence", message]);
		await end();
	}

	async function isLogged(page, condition) {
		const text = await page.content();
		const regexp = new RegExp(condition, "gi");
		return text.match(regexp) != null;
	}

	async function getElement(selector, page) {
		selector = selector.trim();
		if (selector.startsWith("$")) {
			let e = await page.$x(selector.substring(1));
			return e.length > 0 ? e[0] : null;
		}

		return await page.$(selector);
	}

	fs.writeFileSync(pidfile, crawler.browser().process().pid.toString());
	utils.print_out("[");

	crawler.on("redirect", async function (e, crawler) {

	});


	crawler.on("domcontentloaded", async function (e, crawler) {
		//utils.printCookies(crawler);
		domLoaded = true;
		await utils.printLinks("html", crawler.page());
	});

	crawler.on("start", async function (e, crawler) {
		//console.log("--->Start");
		await utils.printForms("html", crawler.page());
	})


	crawler.on("newdom", async function (e, crawler) {
		debugger;
		await utils.printLinks(e.params.rootNode, crawler.page())
		await utils.printForms(e.params.rootNode, crawler.page())
		//console.log(e.params)
	})

	crawler.on("xhr", async function (e, crawler) {
		utils.printRequest(e.params.request)

		//return false
	});

	crawler.on("xhrCompleted", function (e, crawler) {
		//console.log("XHR completed")
	});


	crawler.on("fetch", async function (e, crawler) {
		debugger;
		utils.printRequest(e.params.request)
		//await sleep(6000);
		//return false
	});

	crawler.on("fetchCompleted", function (e, crawler) {
		//console.log("XHR completed")
	});

	crawler.on("jsonp", function (e, crawler) {
		debugger;
		utils.printRequest(e.params.request)
	});

	crawler.on("jsonpCompleted", function (e, crawler) {

	});

	crawler.on("websocket", function (e, crawler) {
		utils.printRequest(e.params.request)
	});

	crawler.on("websocketMessage", function (e, crawler) {

	});

	crawler.on("websocketSend", function (e, crawler) {

	});

	crawler.on("formSubmit", function (e, crawler) {
		utils.printRequest(e.params.request)
	});

	crawler.on("navigation", function (e, crawler) {
		e.params.request.type = "link";
		utils.printRequest(e.params.request)
	});

	crawler.on("eventtriggered", function (e, crawler) {
		//console.log(e.params)
	});

	crawler.on("triggerevent", function (e, crawler) {
		//console.log(e.params)
	});

	crawler.on("earlydetach", function (e, crawler) {
		//console.log('["warning","earlydetach of element ' + e.params.node + '],')
		//crawler.browser().close();
	});

	//set analyze single page timeout
	//TODO needed
	// execTO = setTimeout(function () {
	// 	crawler.errors().push(["probe_timeout", "maximum execution time reached"]);
	// 	end();
	// }, options.maxExecTime);

	if (options.localStorage) {
		page.evaluateOnNewDocument((storage) => {
			for (let s in storage) {
				let fn = storage[s].type == "S" ? window.sessionStorage : window.localStorage;
				fn.setItem(s, storage[s].value);
			}
		}, options.localStorage)
	}

	if (loginSeq) {
		if (await isLogged(crawler.page(), loginSeq.loggedinCondition) == false) {
			if (loginSeq.url && loginSeq.url != targetUrl && !options.loadWithPost) {
				try {
					await crawler.navigate(loginSeq.url);
				} catch (err) {
					await loginErr("navigating to login page");
				}
			}
			let seqline = 1;
			for (let seq of loginSeq.sequence) {
				switch (seq[0]) {
					case "sleep":
						await sleep(seq[1]);
						break;
					case "write":
						try {
							let e = await getElement(seq[1], crawler.page());
							await e.type(seq[2]);
						} catch (e) {
							await loginErr("element not found ", seqline);
						}
						break;
					case "set":
						try {
							let e = await getElement(seq[1], crawler.page());
							await crawler.page().evaluate((el, u) => { el.value = u }, e, seq[2])
						} catch (e) {
							await loginErr("element not found", seqline);
						}
						break;
					case "click":
						try {
							let e = await getElement(seq[1], crawler.page());
							await e.click();
						} catch (e) {
							await loginErr("element not found", seqline);
						}
						await crawler.waitForRequestsCompletion();
						break;
					case "clickToNavigate":
						let e = await getElement(seq[1], crawler.page());
						if (e == null) {
							await loginErr("element not found", seqline);
						}
						try {
							await crawler.clickToNavigate(e, seq[2]);
						} catch (err) {
							await loginErr(err, seqline);
						}
						break;
					case "assertLoggedin":
						if (await isLogged(crawler.page(), loginSeq.loggedinCondition) == false) {
							await loginErr("login sequence faild", seqline);
						}
						break;
					default:
						await loginErr("action not found", seqline);
				}
				seqline++;
			}
		}
	}

	// scroll page
	await (async (page) => {
		await page.evaluate(async function () {
			let pageHeight = () => { return document.body.scrollHeight; };
			let scrollTop = () => { return window.pageYOffset || document.documentElement.scrollTop };
			let windowHeight = () => { return window.innerHeight };
			while (pageHeight() - 60 > scrollTop() + windowHeight()) {
				window.scrollTo(0, window.pageYOffset + 60);
				console.log(pageHeight(), scrollTop(), windowHeight())
				await window.__PROBE__.sleep(60);
			}
		})
	})(page);

	try {
		if (!options.doNotCrawl) {
			options.exceptionOnRedirect = true;
			await crawler.start();
		}
		await end();
	} catch (err) {
		await end();
	}
	console.log("ending...");
}