"use strict";

const utils = require('./utils');
const htcrawl = require("./htcrawl/main.js");
const Koa = require('koa');
const http = require('http');
const koaBody = require('koa-body');
const Router = require('@koa/router');
const { formatURL, sleep } = require('./utils.js');
const { runInNewContext } = require('vm');


http_server();
async function http_server() {
	let time = async (ctx, next) => {
		const start = new Date();
		console.log(`${ctx.method} ${ctx.url} start at ${start.getTime()}`);
		await next();
		const ms = new Date();
		console.log(`${ctx.method} ${ctx.url} finish at ${ms.getTime()} and took - ${ms - start}ms`);
	}

	let router = () => {
		const r = new Router();

		r.get('/url/:urlencode_url', async (ctx, next) => {
			await next()

			let targeturl = formatURL(decodeURIComponent(ctx.params.urlencode_url))
			if (targeturl == "") {
				ctx.body = "url is not vaild";
				ctx.status = 422;
				return
			}
			this.input(targeturl);
			ctx.body = await (async () => {
				let res = "";
				ctx.status = 504;
				let flag = true;
				setTimeout(() => {
					flag = false;
				}, 180 * second)
				while (flag) {
					if (targeturl in this._result_dic) {
						res = this._result_dic[targeturl];
						if (res["errors"] != "") {
							console.error(`err in ${res.url} res:${JSON.stringify(res)}`)
						}
						ctx.status = 200
						break;
					}
					await sleep(20);
				}

				return res;
			})();
		});

		r.get("/_result_dic", async (ctx, next) => {
			await next()

			ctx.body = this._result_dic;
			ctx.status = 200;
		})

		r.get("/_clean_res_cache", async (ctx, next) => {
			await next()

			this._result_dic = {};
			ctx.status = 200;
		})

		r.get("/_eventCacheSet", async (ctx, next) => {
			await next()

			ctx.body = this._eventCacheSet.size;
			ctx.status = 200;
		})

		r.put("/_eventCacheSet", async (ctx, next) => {
			await next()

			let evtstr = ctx.request.body["evtstr"] || "";
			if (!evtstr) {
				ctx.status = 455;
				return
			}

			if (this._eventCacheSet.has(evtstr)) {
				ctx.status = 200;
			} else {
				this._eventCacheSet.add(evtstr);
				ctx.status = 455;
			}
		})

		r.get("/test", async (ctx, next) => {
			next();
			await sleep(1200);
			ctx.body = "wait";
		})

		return r
	}

	const app = new Koa();
	app.use(koaBody());
	const r = router();
	app.use(time)
		.use(r.routes())
		.use(r.allowedMethods());

	const server = http.createServer(app.callback())
		.listen(21218, "", () => {
			console.log(`Server running at :${server.address().port}`);
		})
}


//test();

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
