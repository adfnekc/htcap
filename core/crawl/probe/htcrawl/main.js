/*
htcrawl - 1.1
http://htcrawl.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/

"use strict";

const puppeteer = require('puppeteer');
const defaults = require('./options').options;
const probe = require("./probe");
const probeTextComparator = require("./shingleprint");

const utils = require('./utils');
const process = require('process');

exports.NewCrawler = async function (options) {
	options = options || {};
	const chromeArgs = [
		'--no-sandbox',
		'--disable-setuid-sandbox',
		'--disable-gpu',
		'--hide-scrollbars',
		'--mute-audio',
		'--ignore-certificate-errors',
		'--ignore-certificate-errors-spki-list',
		'--ssl-version-max=tls1.3',
		'--ssl-version-min=tls1',
		'--disable-web-security',
		'--allow-running-insecure-content',
		'--proxy-bypass-list=<-loopback>',
		'--window-size=1300,1000'
	];
	for (let a in defaults) {
		if (!(a in options)) options[a] = defaults[a];
	}
	if (options.proxy) {
		chromeArgs.push("--proxy-server=" + options.proxy);
	}

	if (options.openChromeDevtoos) {
		chromeArgs.push('--auto-open-devtools-for-tabs');
	}

	let browser = await puppeteer.launch({ headless: options.headlessChrome, ignoreHTTPSErrors: true, executablePath: options.executablePath, args: chromeArgs });
	let page = await browser.newPage()

	//page.on('console', consoleObj => console.log(consoleObj.text()));

	let c = new Crawler(options, browser);

	c._page = page;
	return c;
}


class Crawler {
	constructor(options, browser) {
		this.options = options;
		this._browser = browser;
		this._page = null;

		this.publicProbeMethods = [''];
		this._cookies = [];
		this._redirect = null;
		this._errors = [];
		this._allowNavigation = false;
		this._firstRun = true;
		this.error_codes = ["contentType", "navigation", "response"];
		this.probeEvents = {
			start: function () { },
			xhr: function () { },
			xhrcompleted: function () { },
			fetch: function () { },
			fetchcompleted: function () { },
			jsonp: function () { },
			jsonpcompleted: function () { },
			websocket: function () { },
			websocketmessage: function () { },
			websocketsend: function () { },
			formsubmit: function () { },
			fillinput: function () { },
			//requestscompleted: function(){},
			//dommodified: function(){},
			newdom: function () { },
			navigation: function () { },
			domcontentloaded: function () { },
			//blockedrequest: function(){},
			redirect: function () { },
			earlydetach: function () { },
			triggerevent: function () { },
			eventtriggered: function () { },
			pageinitialized: function () { }
			//end: function(){}
		}
	};

	page = this._page;
	errors = this._errors;
	browser = this._browser;
	redirect = this._redirect;

	cookies = async () => {
		var pcookies = [];
		if (this._page) {
			let cookies = await this._page.cookies();
			for (let c of cookies) {
				pcookies.push({
					name: c.name,
					value: c.value,
					domain: c.domain,
					path: c.path,
					expires: c.expires,
					httponly: c.httpOnly,
					secure: c.secure
				});
				this._cookies = this._cookies.filter((el) => {
					if (el.name != c.name) {
						return el;
					}
				})
			}
		}
		return this._cookies.concat(pcookies);
	};

	load = async () => {

	}


};

	// returns after all ajax&c have been completed
	Crawler.prototype.load = async function () {
	if (this.targetUrl) {
	const resp = await this._goto(this.targetUrl);
	return await this._afterNavigation(resp);
}
};

	Crawler.prototype._goto = async function (url) {
	var _this = this;
	if (this.options.verbose) console.log("LOADDING-> ", url)

	try {
	await this._page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3419.0 Safari/537.36');
	return await this._page.goto(url, {
	waitUntil: 'load'
});
} catch (e) {
	_this._errors.push(["navigation", `goto err,${e.message
} `]);
		throw e;
	};

}
Crawler.prototype._afterNavigation = async function (resp) {
	var _this = this;
	var assertContentType = function (hdrs) {
		let ctype = 'content-type' in hdrs ? hdrs['content-type'] : "";

		if (ctype.toLowerCase().split(";")[0] != "text/html") {
			_this._errors.push(["content_type", `content type is $ {
	ctype
}`]);
			return false;
		}
		return true;
	}
	try {
		if (!resp.ok()) {
			_this._errors.push(["response", resp.request().url() + " status: " + resp.status()]);
			throw resp.status();
			//_this.dispatchProbeEvent("end", {});
			//return;
		}
		var hdrs = resp.headers();
		_this._cookies = utils.parseCookiesFromHeaders(hdrs, resp.url())


		if (!assertContentType(hdrs)) {
			throw "Content type is not text/html";
		}

		await _this._page.evaluate(async function () {
			window.__PROBE__.takeDOMSnapshot();
		});

		_this._loaded = true;

		await _this.dispatchProbeEvent("domcontentloaded", {});

		await _this.waitForRequestsCompletion();

		await _this.dispatchProbeEvent("pageinitialized", {});



		return _this;
	} catch (e) {
		//;
		throw e;
	};
};

Crawler.prototype.waitForRequestsCompletion = async function () {
	await this._page.evaluate(async function () { // use Promise.all ??
		await window.__PROBE__.waitAjax();
		await window.__PROBE__.waitJsonp();
		await window.__PROBE__.waitFetch();
	});
};

Crawler.prototype.start = async function () {
	var _this = this;

	if (!this._loaded) {
		await this.load();
	}

	try {
		await _this._page.evaluate(async function () {
			//await window.__PROBE__.dispatchProbeEvent("start");

			console.log("startAnalysis");
			await window.__PROBE__.startAnalysis();
		});

		return _this;
	} catch (e) {
		console.log(e);
		_this._errors.push(["navigation", "" + e]);
		//_this.dispatchProbeEvent("end", {});
		throw e;
	};

}




Crawler.prototype.stop = function () {
	var _this = this;
	this._page.evaluate(() => {
		window.__PROBE__._stop = true;
	})
}


Crawler.prototype.on = function (eventName, handler) {
	eventName = eventName.toLowerCase();
	if (!(eventName in this.probeEvents)) {
		throw ("unknown event name");
	}
	this.probeEvents[eventName] = handler;
};


Crawler.prototype.probe = function (method, args) {
	var _this = this;

	return new Promise((resolve, reject) => {
		_this._page.evaluate(async (method, args) => {
			var r = await window.__PROBE__[method](...args);
			return r;
		}, [method, args]).then(ret => resolve(ret));
	})
}


Crawler.prototype.dispatchProbeEvent = async function (name, params) {
	name = name.toLowerCase();
	var ret, evt = {
		name: name,
		params: params || {}
	};

	ret = await this.probeEvents[name](evt, this);
	if (ret === false) {
		return false;
	}

	if (typeof ret == "object") {
		return ret;
	}

	return true;
}


Crawler.prototype.bootstrapPage = async function (browser) {
	var options = this.options,
		targetUrl = this.targetUrl,
		pageCookies = this.pageCookies;

	var crawler = this;
	// generate a static map of random values using a "static" seed for input fields
	// the same seed generates the same values
	// generated values MUST be the same for all analyze.js call othewise the same form will look different
	// for example if a page sends a form to itself with input=random1,
	// the same form on the same page (after first post) will became input=random2
	// => form.data1 != form.data2 => form.data2 is considered a different request and it'll be crawled.
	// this process will lead to and infinite loop!
	var inputValues = utils.generateRandomValues(this.options.randomSeed);

	const page = await browser.newPage();
	crawler._page = page;
	//if(options.verbose)console.log("new page")
	await page.setRequestInterception(true);
	if (options.bypassCSP) {
		await page.setBypassCSP(true);
	}
	page.on('request', async req => {
		const overrides = {};
		if (req.isNavigationRequest() && req.frame() == page.mainFrame()) {
			if (req.redirectChain().length > 0 && !crawler._allowNavigation) {
				crawler._redirect = req.url();
				var uRet = await crawler.dispatchProbeEvent("redirect", { url: crawler._redirect });
				if (!uRet) {
					req.abort('aborted'); // die silently
					return;
				}
				if (options.exceptionOnRedirect) {
					req.abort('failed'); // throws exception
					return;
				}
				req.continue();
				return;
			}

			if (!crawler._firstRun) {
				let r = new utils.Request("navigation", req.method() || "GET", req.url().split("#")[0], req.postData());
				await crawler.dispatchProbeEvent("navigation", { request: r });

				if (crawler._allowNavigation) {
					req.continue();
				} else {
					req.abort('aborted');
				}
				return;
			} else {
				if (options.loadWithPost) {
					overrides.method = 'POST';
					if (options.postData) {
						overrides.postData = options.postData;
					}
				}
			}

			crawler._firstRun = false;
		}

		req.continue(overrides);
	});


	page.on("dialog", function (dialog) {
		dialog.accept();
	});

	browser.on("targetcreated", async (target) => {
		const p = await target.page();
		// if (p) p.close();
	});


	page.exposeFunction("__htcrawl_probe_event__", (name, params) => { return this.dispatchProbeEvent(name, params) }); // <- automatically awaited.."If the puppeteerFunction returns a Promise, it will be awaited."

	await page.setViewport({
		width: 1366,
		height: 768,
	});

	page.evaluateOnNewDocument(probe.initProbe, this.options, inputValues);
	page.evaluateOnNewDocument(probeTextComparator.initTextComparator);
	page.evaluateOnNewDocument(utils.hookNativeFunctions, this.options);

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

		await this._page.setDefaultNavigationTimeout(this.options.navigationTimeout);

		//if(options.verbose)console.log("goto returned")

	} catch (e) {
		// do something  . . .
		console.log(e)
	}

};


Crawler.prototype.inject = async function (page) {
	let injected = await page.evaluate(async () => {
		return "__htcrawl_probe_event__" in window;
	})

	if (!injected) {
		await page.exposeFunction("__htcrawl_probe_event__", (name, params) => { return this.dispatchProbeEvent(name, params) }); // <- automatically awaited.."If the puppeteerFunction returns a Promise, it will be awaited."
	}

	let inputValues = utils.generateRandomValues(this.options.randomSeed);
	await page.evaluateOnNewDocument(probe.initProbe, this.options, inputValues);
	await page.evaluateOnNewDocument(probeTextComparator.initTextComparator);
	await page.evaluateOnNewDocument(utils.hookNativeFunctions, this.options);
}


Crawler.prototype.navigate = async function (url) {
	await this.inject(this.page());
	var resp = null;
	this._allowNavigation = true;
	try {
		resp = await this._goto(url);
	} catch (e) {
		this._errors.push(["navigation", "navigation aborted3"]);
		throw ("Navigation error" + e);
	} finally {
		this._allowNavigation = false;
	}

	await this._afterNavigation(resp);
};


Crawler.prototype.reload = async function () {
	var resp = null;
	this._allowNavigation = true;
	try {
		resp = await this._page.reload({ waitUntil: 'load' });
	} catch (e) {
		this._errors.push(["navigation", "navigation aborted4"]);
		throw ("Navigation error");
	} finally {
		this._allowNavigation = false;
	}

	await this._afterNavigation(resp);

};


Crawler.prototype.clickToNavigate = async function (element, timeout) {
	const _this = this;
	var pa;
	if (typeof element == 'string') {
		try {
			element = await this._page.$(element);
		} catch (e) {
			throw ("Element not found")
		}
	}
	if (typeof timeout == 'undefined') timeout = 500;

	this._allowNavigation = true;
	try {
		pa = await Promise.all([
			element.click(),
			this._page.waitForRequest(req => req.isNavigationRequest() && req.frame() == _this._page.mainFrame(), { timeout: timeout }),
			this._page.waitForNavigation({ waitUntil: 'load' }),
		]);

	} catch (e) {
		pa = null;
	}
	this._allowNavigation = false;

	if (pa != null) {
		await this._afterNavigation(pa[2]);
		return true;
	}
	_this._errors.push(["navigation", "navigation aborted5"]);
	throw ("Navigation error");
};