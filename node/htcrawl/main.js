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

const fs = require("fs");
const os = require('os');
const urlparse = require('url');
const path = require('path');
const { sleep } = require("../utils");
const process = require('process');
const request = require('request');
const puppeteer = require('puppeteer');
const probe = require("./probe");
const output = require("./output");
const defaults = require('./options').options;
const { utils, RequestModel } = require('./utils');
const probeTextComparator = require("./shingleprint");



exports.NewCrawler = async function (options) {
	options = options || {};
	const chromeArgs = [
		'--no-sandbox',
		'--disable-setuid-sandbox',
		'--disable-gpu',
		'--hide-scrollbars',
		'--mute-audio',
		'--disable-extensions',
		'--ignore-certificate-errors',
		'--ignore-certificate-errors-spki-list',
		'--ssl-version-max=tls1.3',
		'--ssl-version-min=tls1',
		'--disable-web-security',
		'--allow-running-insecure-content',
		'--proxy-bypass-list=<-loopback>',
		'--window-size=1300,1000',
		'-–disable-dev-shm-usage',
		'-–no-first-run',
		'-–no-zygote',
		'-–single-process'
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
	let page = (await browser.pages())[0];

	// set page properties
	try {
		// setRequestInterception
		await page.setRequestInterception(true);
		//page.on('console', consoleObj => console.log("==>browser.console:", consoleObj.text()));
		page.setDefaultNavigationTimeout(options.maxExecTime);
		await page.setViewport({ width: 1366, height: 768, });

		// always dismiss popup dialog including:alert,prompt,confirm or beforeunload
		page.on("dialog", function (dialog) {
			dialog.accept();
		});

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

		if (options.bypassCSP) {
			await page.setBypassCSP(true);
		}
	} catch (e) {
		console.log("modify page err,", e);
		throw "modify page err " + e;
	}

	let c = new Crawler(options, browser, page);
	await c.inject();
	return c;
}


class Crawler {
	/**
 * @constructs Crawler
 * @param options {defaults}
 * @param browser {puppeteer.Browser}
 * @param page {puppeteer.Page}
 */
	constructor(options, browser, page) {
		this._redirect = null;
		this._allowNavigation = false;
		this.options = options;
		this._browser = browser;
		this._page = page;// puppeteer.Page
		this.publicProbeMethods = [];
		this._cookies = [];
		this._errors = [];
		this.error_codes = ["contentType", "navigation", "response"];
		this.probeEvents = {
			newtab: function () { },
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
		};
	};

	page = () => { return this._page; };
	browser = () => { return this._browser; };
	errors = () => { return this._errors; }
	redirect = () => { return this._redirect; }

	/**
	 * close browser
	 */
	close = async () => {
		await this._browser.close();
	}

	_goto = async (url) => {
		if (this.options.verbose) console.log("LOADDING-> ", url)

		try {
			return await this._page.goto(url, {
				waitUntil: 'load'
			});
		} catch (e) {
			e = `goto err,${e.message}`;
			throw e;
		};
	};

	/***
	 * @param resp {puppeteer.Response}
	 */
	_afterNavigation = async (resp) => {
		// console.log(await resp.text());
		// return if resp is null
		if (!resp) {
			return
		}
		var _this = this;
		var assertContentType = function (hdrs) {
			let ctype = 'content-type' in hdrs ? hdrs['content-type'] : "";

			if (ctype.toLowerCase().split(";")[0] != "text/html") {
				_this._errors.push(["content_type", `content type is ${ctype}`]);
				return false;
			}
			return true;
		};

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

			await this.page().evaluate(async function () {
				window.__PROBE__.takeDOMSnapshot();
			});

			await _this.dispatchProbeEvent("domcontentloaded", {});

			await _this.waitForRequestsCompletion();

			await _this.dispatchProbeEvent("pageinitialized", {});
			return _this;
		} catch (e) {
			throw e;
		};
	};

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

	waitForRequestsCompletion = async () => {
		await this._page.evaluate(async function () {
			await window.__PROBE__.waitAjax();
			await window.__PROBE__.waitJsonp();
			await window.__PROBE__.waitFetch();
		});
	};

	start = async () => {
		var _this = this;

		try {
			await _this._page.evaluate(async function () {
				//await window.__PROBE__.dispatchProbeEvent("start");
				console.log("startAnalysis");
				await window.__PROBE__.startAnalysis();
			});

		} catch (e) {
			console.log(e);
			_this._errors.push(["startAnalysis", "" + e]);
			throw e;
		};

		try {
			await this.dumpFrameTree(this.page().mainFrame());
		} catch (e) {
			console.log(e);
			_this._errors.push(["analysis frame", "" + e]);
			throw e;
		};

		return _this;
	};

	/**
	 * @param frame {puppeteer.Frame}
	 */
	async dumpFrameTree(frame) {
		this.out.printRequest(RequestModel(frame.url(), "frame", "GET"));
		await frame.evaluate(async function (url) {
			//log("frame analysis", url);
			await window.__PROBE__.startAnalysis();
		}, frame.url());
		for (let child of frame.childFrames())
			await this.dumpFrameTree(child);
	}


	stop = async () => {
		await this._page.evaluate(() => {
			window.__PROBE__._stop = true;
		})
	};

	on = (eventName, handler) => {
		eventName = eventName.toLowerCase();
		if (!(eventName in this.probeEvents)) {
			throw ("unknown event name");
		}
		this.probeEvents[eventName] = handler;
	};

	probe = (method, args) => {
		var _this = this;

		return new Promise((resolve, reject) => {
			_this._page.evaluate(async (method, args) => {
				var r = await window.__PROBE__[method](...args);
				return r;
			}, [method, args]).then(ret => resolve(ret));
		})
	};

	/***
	 * @param page {puppeteer.Page}
	 */
	inject = async () => {
		let page = this._page;
		let injected = await page.evaluate(async () => {
			return "__htcrawl_probe_event__" in window;
		})

		if (!injected) {
			await page.exposeFunction("__htcrawl_probe_event__", (name, params) => {
				return this.dispatchProbeEvent(name, params)
			}); // <- automatically awaited.."If the puppeteerFunction returns a Promise, it will be awaited."
			await page.exposeFunction('req', async (url, options) => {
				return new Promise((reslove, reject) => {
					options.proxy = null;
					request(url, options, (err, res) => {
						if (err) {
							reject(err);
						}
						reslove(res);
					})
				})
			})
			await page.exposeFunction('log', (...args) => {
				console.error(...args);
			})
		}


		let inputValues = utils.generateRandomValues(this.options.randomSeed);
		await page.evaluateOnNewDocument(probe.initProbe, this.options, inputValues);
		await page.evaluateOnNewDocument(probeTextComparator.initTextComparator);
		await page.evaluateOnNewDocument(utils.hookNativeFunctions, this.options);
	};

	navigate = async (url) => {
		for (let exurl of this.options.excludedUrls) {
			if (url.match(exurl)) {
				throw (`[*filter] ${url} filter by options -x on navigate`)
			}
		}
		await this.inject(this.page());
		var resp = null;//@type puppeteer.Response
		this._allowNavigation = true;
		try {
			resp = await this._goto(url);
		} catch (e) {
			throw ("Navigation error3 " + e);
		} finally {
			this._allowNavigation = false;
		}

		await this._afterNavigation(resp);
	};

	analyze = async (targetUrl) => {
		async function exit() {
			//await sleep(1000000)
			clearTimeout(execTO);
			//await crawler.browser().close();
			// process.exit();
			return out.printStatus(that);
		}

		async function getPageText(page) {
			const el = await page.$("html");
			const v = await el.getProperty('innerText');
			return await v.jsonValue();
		}

		async function end() {
			if (endRequested) return;
			endRequested = true;

			if (domLoaded && !that.redirect()) {
				const hash = await getPageText(page);
				out.print_log("page_hash", JSON.stringify(hash));

				if (options.returnHtml) {
					out.print_log("html", JSON.stringify(hash));
				}
			}
			await exit();
		}

		this._errors = [];
		const that = this;
		const page = that.page();
		that.browser().once("targetcreated", async (target) => {
			//TODO need close page quickily,and try avoid listen event twice
			//console.log("===>on targetcreated:", target.url());
			if (target.type() === 'page') {
				let targeturl = target.url();
				that.dispatchProbeEvent("newtab", { "request": RequestModel(targeturl, "newtab") });
				const p = await target.page();
				const client = await p.target().createCDPSession();
				await client.send("Fetch.enable");
				client.once('Fetch.requestPaused', async ({ requestId, request, frameId, resourceType, responseStatusCode }) => {
					if (responseStatusCode == 0) {
						await client.send("Fetch.fulfillRequest", { requestId: requestId, responseCode: 500, body: "" });
					}
				});
				await p.close();
			}
		});


		// removing all event listeners before listening to the request event is to prevent multiple-listen
		page.removeAllListeners("request");
		page.on('request', async req => {
			// targetUrl = urlparse.parse(targetUrl);
			// console.log("navgation or redirect =>", req.url(), "host:", targetUrl.host, `navigation:${this._allowNavigation},redirect:${req.redirectChain().length > 0}`);
			// Active navigation or in a redirect round

			for (let url of this.options.excludedUrls) {
				if (req.url().search(url) > 0) {
					console.log(`[*filter] ${req.url()} filter by options -x on interception request `);
					return await req.abort('failed');
				}
			}

			if (this.options.blockTypes.has(req.resourceType().toString())) {
				return req.abort('failed');
			}

			if (this._allowNavigation) {
				return await req.continue();
			} else if (req.redirectChain().length > 0) {
				this.dispatchProbeEvent("redirect", { request: RequestModel(req.url(), "newtab", req._method) });
				return await req.continue();
			} else if (req.isNavigationRequest() && req.frame() == page.mainFrame()) { //Navigation actions that are not active navigation
				this.dispatchProbeEvent("navigation", { request: RequestModel(req.url(), "navigation", req._method) });
				return await req.abort('aborted');
			} else {
				return await req.abort('failed');
			}
		});

		page.on('frameattached', async (frame) => {
			// console.log(frame);
		})

		page.on('response', (resp) => {
			//console.log("resp:", resp.url(), resp._request._resourceType);
		})

		let domLoaded = false;
		let endRequested = false;

		if (!this.options.outputFunc)
			console.log("options.outputFunc not set")
		let outputFunc = this.options.outputFunc ? this.options.outputFunc : (msgs) => { console.log("!!!WARN outputFunc not set\r\n", msgs) };
		let out = new output(outputFunc);
		this.out = out;
		out.print_url(targetUrl);
		this.monitorEvent(out);

		try {
			await this.navigate(targetUrl);
		} catch (e) {
			if (e.toString().indexOf("Navigation timeout") > -1) {
				console.error(e)
				end()
			}
			if (e.toString().indexOf("filter by options -x") > -1) {
				console.log(e)
				this._errors = [];
				return out.printStatus(that)
			}

			console.error("error in navigate ", targetUrl, e)
			// clear previrous errors
			this._errors.push(e)
			return out.printStatus(that)
		}

		// set analyze single page timeout
		let execTO = setTimeout(function () {
			// this.errors().push(["probe_timeout", "maximum execution time reached"]);
			// end();
		}, this.options.maxExecTime);

		if (this.options.localStorage) {
			page.evaluateOnNewDocument((storage) => {
				for (let s in storage) {
					let fn = storage[s].type == "S" ? window.sessionStorage : window.localStorage;
					fn.setItem(s, storage[s].value);
				}
			}, this.options.localStorage)
		}

		// scroll page
		this.scroll();


		try {
			if (!this.options.doNotCrawl) {
				this.options.exceptionOnRedirect = true;
				await this.start();
			}
			await end();
		} catch (err) {
			console.log(err);
			await end();
		}
		//await this._goto("about:blank")
	}

	dispatchProbeEvent = async (name, params) => {
		name = name.toLowerCase();
		var ret, evt = {
			name: name,
			params: params || {
			}
		};

		ret = await this.probeEvents[name](evt, this);
		if (ret === false) {
			return false;
		}

		if (typeof ret == "object") {
			return ret;
		}

		return true;
	};

	monitorEvent = (out) => {

		// if (this.monitored) {
		// 	return
		// }
		// this.monitored = true;

		this.on("redirect", async function (e, crawler) {
			e.params.request.type = "redirect";
			await out.printRequest(e.params.request);
		});

		this.on("domcontentloaded", async function (e, crawler) {
			//utils.printCookies(crawler);
			let domLoaded = true;
			await out.printLinks("html", crawler.page());
		});

		this.on("start", async function (e, crawler) {
			//console.log("--->Start");
			await out.printForms("html", crawler.page());
		})

		this.on("newdom", async function (e, crawler) {
			await out.printLinks(e.params.rootNode, crawler.page())
			await out.printForms(e.params.rootNode, crawler.page())
			//console.log(e.params)
		})

		this.on("jsonp", function (e, crawler) {
			out.printRequest(e.params.request)
		});

		this.on("websocket", function (e, crawler) {
			out.printRequest(e.params.request)
		});

		this.on("formSubmit", function (e, crawler) {
			out.printRequest(e.params.request)
		});

		this.on("navigation", function (e, crawler) {
			// console.trace("navigation", e.params.request, (new Date).getTime());
			let type = e.params.request.type;
			e.params.request.type = type ? type : "link";
			out.printRequest(e.params.request);
		});

		this.on("newtab", function (e, crawler) {
			let type = e.params.request.type;
			e.params.request.type = type ? type : "newtab";
			out.printRequest(e.params.request)
		});

		this.on("fetch", async function (e, crawler) {
			out.printRequest(e.params.request)
			//await sleep(6000);
			//return false
		});

		this.on("xhr", async function (e, crawler) {
			out.printRequest(e.params.request)
			//return false
		});

		this.on("xhrCompleted", function (e, crawler) {
			//console.log("XHR completed")
		});

		this.on("fetchCompleted", function (e, crawler) {
			//console.log("XHR completed")
		});

		this.on("jsonpCompleted", function (e, crawler) {

		});

		this.on("websocketMessage", function (e, crawler) {

		});

		this.on("websocketSend", function (e, crawler) {

		});

		this.on("eventtriggered", function (e, crawler) {
			//console.log(e.params)
		});

		this.on("triggerevent", function (e, crawler) {
			//console.log(e.params)
		});

		this.on("earlydetach", function (e, crawler) {
			//console.log('["warning","earlydetach of element ' + e.params.node + '],')
			//crawler.browser().close();
		});
	}

	scroll = async () => {
		let page = this.page();
		await page.evaluate(async function () {
			const scrollHeight = 320;
			let pageHeight = () => { return document.body.scrollHeight; };
			let scrollTop = () => { return window.pageYOffset || document.documentElement.scrollTop };
			let windowHeight = () => { return window.innerHeight };
			while (pageHeight() - scrollHeight > scrollTop() + windowHeight()) {
				window.scrollTo(0, window.pageYOffset + scrollHeight);
				console.log(pageHeight(), scrollTop(), windowHeight())
				await window.__PROBE__.sleep(60);
			}
		})
	};

	// clickToNavigate = async (element, timeout) => {
	// 	const _this = this;
	// 	var pa;
	// 	if (typeof element == 'string') {
	// 		try {
	// 			element = await this._page.$(element);
	// 		} catch (e) {
	// 			throw ("Element not found")
	// 		}
	// 	}
	// 	if (typeof timeout == 'undefined') timeout = 500;

	// 	this._allowNavigation = true;
	// 	try {
	// 		pa = await Promise.all([
	// 			element.click(),
	// 			this._page.waitForRequest(req => req.isNavigationRequest() && req.frame() == _this._page.mainFrame(), {
	// 				timeout: timeout
	// 			}),
	// 			this._page.waitForNavigation({
	// 				waitUntil: 'load'
	// 			}),
	// 		]);

	// 	} catch (e) {
	// 		pa = null;
	// 	}
	// 	this._allowNavigation = false;

	// 	if (pa != null) {
	// 		await this._afterNavigation(pa[2]);
	// 		return true;
	// 	}
	// 	throw ("Navigation error");
	// };
};