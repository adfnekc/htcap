const net = require('net');

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

module.exports = class socketIO extends io {
    constructor(port, q) {
        super(null, null);
        this.connected = false;

        this.q = q;
        this.input = (msg) => {
            return this.q.in(msg);
        };
        this.socket = this.listen(port);
    }

    listen(port) {
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
                console.log("socketIO on data:", chunk);
                this.input(chunk);
            });
            sock.on('close', (had_err) => {
                console.log("socketIO on close,had_err:", had_err);
                this.connected = false;
            });

            this.output = (msg) => {
                console.log(`socketIO write ${msg.length} `, msg);
                sock.write(msg);
            };
        })
        server.listen(port);
        console.log("socketIO listening on ", port);
        return server;
    }
}