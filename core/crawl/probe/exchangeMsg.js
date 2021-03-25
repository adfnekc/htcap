const net = require('net');
const path_util = require("path");
const http = require('http');
const Koa = require('koa');
const Router = require('@koa/router');
const uniQueue = require("./uniQueue.js");
const { formatURL, sleep } = require('./utils.js');

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
        this._result_dic = {}
        this.output = (msg) => {
            this._result_dic[msg["url"]] = msg
        }
        this.server = this.listen();
    }

    router() {
        const r = new Router();

        r.get('/url/:urlencode_url', async (ctx, next) => {
            let targeturl = formatURL(decodeURIComponent(ctx.params.urlencode_url))
            if (targeturl == "") {
                ctx.body = "url is not vaild"
                ctx.status = 418
                return
            }
            this.input(targeturl);
            ctx.status = 200;
            ctx.body = await (async () => {
                let res = "";
                let flag = true;
                setTimeout(() => {
                    flag = false;
                }, 6000)
                while (flag) {
                    if (targeturl in this._result_dic) {
                        res = this._result_dic[targeturl];
                        break;
                    }
                    await sleep(20);
                }
                return res;
            })();
        });

        r.get("/_result_dic", async (ctx, next) => {
            ctx.body = this._result_dic;
            ctx.status = 200;
        })

        return r
    }

    listen() {
        const app = new Koa();
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