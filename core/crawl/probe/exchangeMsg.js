const net = require('net');
const path_util = require("path");
const http = require('http');

class io {
    constructor(input, output) {
        this.input = input;
        this.output = output;
    }

    async onMsg(msg) {
        await this.input(msg);
    }

    async send(msg) {
        msg = msg.toString();
        await this.output(msg);
    }
}

/**
 * @param {int} port listen port
 * @param {taskqueue} q taskqueue
 */
class socketIO extends io {

    constructor(port, q) {
        super(null, null);
        this.connected = false;

        this.port = port
        this.q = q;
        this.input = (msg) => {
            return this.q.in(msg);
        };
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
 * @param {string} path Path the server should listen to
 * @param {taskqueue} q taskqueue
 */
class IPCIO extends io {
    constructor(path, q) {
        super(null, null);
        this.connected = false;

        this.q = q;
        this.input = (msg) => {
            return this.q.in(msg);
        };
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

class httpServer extends io {
    constructor(input, output) {
        super(null, null);
        this.connected = false;

        this.port = port
        this.q = q;
        this.input = (msg) => {
            return this.q.in(msg);
        };
        this.socket = this.listen(port);
    }

    listen() {
    }
}

function runHttpServer(port = 3000) {
    const server = http.createServer((req,res)=>{
        console.log("url",req.url);
        
        res.writeHead(200);
        res.write()
    })
    server.listen(port, "", () => {
        console.log(`Server running at ${server.address()}`);
    })
    return server
}

module.exports = { socketIO, IPCIO, httpServer }