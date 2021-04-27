const net = require('net');
const path_util = require("path");
const http = require('http');
const Koa = require('koa');
const koaBody = require('koa-body');
const Router = require('@koa/router');
const uniQueue = require("./uniQueue.js");
const { formatURL, sleep } = require('./utils.js');


const second = 1000
/**
 * Class is a abstrct io modle.
 */
class io {
    constructor(input, output) {
        this.alive = true
        this.input = input;
        this.output = output;
        this.q = new uniQueue();
        this.input = (msg) => {
            return this.q.enqueue(msg);
        };
    }

    async onMsg(msg) {
        await this.input(msg);
    }

    async send(msg) {
        await this.output(msg);
    }

    /**
     * @returns {string} dequeue a targeturl form q
     * @async
     */
    async dequeue() {
        return this.q.dequeue();
    }

    /**
     * @return {boolean} wheath io is alive
     */
    is_alive() {
        return this.alive
    }
}

/**
 * Class representing a socketIO.
 * @extends io
 */
class socketIO extends io {
    /**
     * @param {number} port listen port
     */
    constructor(port) {
        super(null, null);
        this.connected = false;

        this.port = port
        this.socket = this.listen();
    }

    listen() {
        const server = net.createServer();
        server.on('connection', (sock) => {
            sock.on('error', (e) => {
                console.log("socketIO on error,", e);
                sock.end();
            });

            if (this.connected) {
                return;
            }
            this.connected = true;

            sock.setEncoding('utf8');
            sock.on('data', (chunk) => {
                console.log("socketIO on data <== ", chunk);
                this.input(chunk);
            });
            sock.on('close', (had_err) => {
                console.log("socketIO on close,had_err:", had_err);
                this.connected = false;
            });

            this.output = (msg) => {
                console.log(`socketIO write ==> ${msg.length} `, msg);
                sock.write(msg);
            };
        })
        server.listen(this.port);
        console.log("socketIO listening on ", this.port);
        return server;
    }
}

/**
 * Class representing a IPCIO.
 * @extends io
 */
class IPCIO extends io {
    /**
    * @param {string} path Path the IPCserver should listen to
    */
    constructor(path, q) {
        super(null, null);
        this.connected = false;

        this.socket = this.listen(path);
    }

    listen(path) {
        const server = net.createServer();
        server.on('connection', (sock) => {
            sock.on('error', (e) => {
                console.log("socketIO on error,", e);
                sock.end();
            });

            if (this.connected) {
                return;
            }
            this.connected = true;

            sock.setEncoding('utf8');
            sock.on('data', (chunk) => {
                console.log("IPC_IO on data <== ", chunk);
                this.input(chunk);
            });
            sock.on('close', (had_err) => {
                console.log("IPC_IO on close,had_err:", had_err);
                this.connected = false;
            });

            this.output = (msg) => {
                console.log(`IPC_IO write ==> ${msg.length} `, msg);
                sock.write(msg);
            };
        })
        let IPCpath = path_util.join('\\\\?\\pipe', "htcap", path);
        server.listen(IPCpath);
        console.log(IPCpath);
        return server;
    }
}

/**
 * Class representing a httpIO.
 * @extends io
 */
class httpIO extends io {
    /**
    * @param {number} port - listen port
    */
    constructor(port) {
        super(null, null);
        this.port = port
        /**
         * @type {Object.<string, string>} result_dic {url:result}
         * @protected
         */
        this._result_dic = {};
        this._eventCacheSet = new Set();
        this.output = (msg) => {
            this._result_dic[msg["url"]] = msg;
        }
        this.server = this.listen();
    }

    router() {
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

        return r
    }

    listen() {
        const app = new Koa();
        app.use(koaBody());
        const r = this.router();
        app.use(r.routes())
            .use(r.allowedMethods());

        const server = http.createServer(app.callback())
            .listen(this.port, "", () => {
                console.log(`Server running at :${server.address().port}`);
            })
        return server
    }
}

module.exports = { socketIO, IPCIO, httpIO }