// a fifo element-unique queue
module.exports = class taskQueue {
    constructor() {
        this.q = [];
        this._already_inserted = [];
    }

    takeOne = () => {
        return this.q.shift();
    }

    isEmpty = () => {
        return this.q.length == 0;
    }

    // return a only readable array
    fullQueue = () => {
        let q = this.q;
        return q;
    }

    in = (t) => {
        if (this._already_inserted.includes(t)) {
            return 0;
        };
        this._already_inserted.push(t);
        return this.q.push(t);
    }
}