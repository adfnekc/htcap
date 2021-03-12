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
const process = require('process');
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
	let page = await browser.newPage();

	// set page properties
	try {
		// setRequestInterception
		await page.setRequestInterception(true);
		//page.on('console', consoleObj => console.log("==>browser.console:",consoleObj.text()));
		page.setDefaultNavigationTimeout(options.navigationTimeout);
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
	constructor(options, browser, page) {
		this._redirect = null;
		this._allowNavigation = false;
		this.options = options;
		this._browser = browser;
		this._page = page;
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

	_goto = async (url) => {
		if (this.options.verbose) console.log("LOADDING-> ", url)

		try {
			return await this._page.goto(url, {
				waitUntil: 'load'
			});
		} catch (e) {
			this._errors.push(["navigation", `goto err,${e.message}`]);
			throw e;
		};
	};

	_afterNavigation = async (resp) => {
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

			await _this._page.evaluate(async function () {
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
			return _this;
		} catch (e) {
			console.log(e);
			_this._errors.push(["navigation", "" + e]);
			//_this.dispatchProbeEvent("end", {});
			throw e;
		};
	};

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

	inject = async () => {
		let page = this._page;
		let injected = await page.evaluate(async () => {
			return "__htcrawl_probe_event__" in window;
		})

		if (!injected) {
			await page.exposeFunction("__htcrawl_probe_event__", (name, params) => {
				return this.dispatchProbeEvent(name, params)
			}); // <- automatically awaited.."If the puppeteerFunction returns a Promise, it will be awaited."
		}

		let inputValues = utils.generateRandomValues(this.options.randomSeed);
		await page.evaluateOnNewDocument(probe.initProbe, this.options, inputValues);
		await page.evaluateOnNewDocument(probeTextComparator.initTextComparator);
		await page.evaluateOnNewDocument(utils.hookNativeFunctions, this.options);
	};

	navigate = async (url) => {
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

	clickToNavigate = async (element, timeout) => {
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
				this._page.waitForRequest(req => req.isNavigationRequest() && req.frame() == _this._page.mainFrame(), {
					timeout: timeout
				}),
				this._page.waitForNavigation({
					waitUntil: 'load'
				}),
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

	analyze = async (targetUrl) => {
		let that = this;
		let page = that.page();
		that.browser().on("targetcreated", async (target) => {
			//TODO need close page quickily,and try avoid listen event twice
			//console.log("===>on targetcreated:", target.url());
			if (target.type() === 'page') {
				
				let targeturl = target.url();
				const p = await target.page();
				await Promise.all([
					p.close(),
					that.dispatchProbeEvent("newtab", { "request": RequestModel(targeturl, "newtab") })
				]);
			}
		});

		// removing all event listeners before listening to the request event is to prevent multiple-listen
		page.removeAllListeners("request");
		page.on('request', async req => {
			targetUrl = urlparse.parse(targetUrl);
			//console.log("navgation or redirect =>", req.url(), "host:", targetUrl.host, `navigation:${this._allowNavigation},redirect:${req.redirectChain().length > 0}`);
			// Active navigation or in a redirect round
			if (this._allowNavigation) {
				return await req.continue();
			} else if (req.redirectChain().length > 0) {
				await this.dispatchProbeEvent("redirect", { request: RequestModel(req.url(), "newtab", req._method) });
				return await req.continue();
			} else if (req.isNavigationRequest() && req.frame() == page.mainFrame()) { //Navigation actions that are not active navigation
				await this.dispatchProbeEvent("navigation", { request: RequestModel(req.url(), "navigation", req._method) });
				return await req.abort('aborted');
			} else {
				return await req.abort('failed');
			}
		});

		let domLoaded = false;
		let endRequested = false;
		let loginSeq = 'loginSequence' in this.options ? this.options.loginSequence : false;
		const pidfile = path.join(os.tmpdir(), "htcap-pids-" + process.pid);

		let outputFunc = this.options.outputFunc ? this.options.outputFunc : (msgs) => { console.log("@&=> msgs:", msgs) };
		let out = new output(outputFunc);
		this.monitorEvent(out);

		try {
			await this.navigate(targetUrl);
		} catch (e) {
			console.error("error in navigate ", targetUrl, e)
			// clear previrous errors
			this._errors = []
			return e
		}


		async function exit() {
			//await sleep(1000000)
			//clearTimeout(execTO);
			//await crawler.browser().close();
			// fs.unlink(pidfile, (err) => { });
			// process.exit();
			return;
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

			await out.printStatus(that);
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

		fs.writeFileSync(pidfile, this.browser().process().pid.toString());

		//set analyze single page timeout
		//TODO needed
		// execTO = setTimeout(function () {
		// 	crawler.errors().push(["probe_timeout", "maximum execution time reached"]);
		// 	end();
		// }, options.maxExecTime);

		if (this.options.localStorage) {
			page.evaluateOnNewDocument((storage) => {
				for (let s in storage) {
					let fn = storage[s].type == "S" ? window.sessionStorage : window.localStorage;
					fn.setItem(s, storage[s].value);
				}
			}, this.options.localStorage)
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
			if (!this.options.doNotCrawl) {
				this.options.exceptionOnRedirect = true;
				await this.start();
			}
			await end();
		} catch (err) {
			console.log(err);
			await end();
		}
		console.log("ending...");
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
			console.trace("navigation", e.params.request, (new Date).getTime());
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
};

let bootstrapPage = async function (browser) {
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
		const overrides = {
		};
		if (req.isNavigationRequest() && req.frame() == page.mainFrame()) {
			if (req.redirectChain().length > 0 && !crawler._allowNavigation) {
				crawler._redirect = req.url();
				var uRet = await crawler.dispatchProbeEvent("redirect", {
					url: crawler._redirect
				});
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
				await crawler.dispatchProbeEvent("navigation", {
					request: r
				});

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


	page.exposeFunction("__htcrawl_probe_event__", (name, params) => {
		return this.dispatchProbeEvent(name, params)
	}); // <- automatically awaited.."If the puppeteerFunction returns a Promise, it will be awaited."

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
			await page.authenticate({
				username: options.httpAuth[0], password: options.httpAuth[1]
			});
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