// a element-unique queue
module.exports = class uniQueue {
    constructor() {
        this.q = [];
        this._already_inserted = [];
    }

    // Pop an item form queue
    dequeue = () => {
        return this.q.shift();
    }

    enqueue = (t) => {
        if (this._already_inserted.includes(t)) {
            return 0;
        };
        this._already_inserted.push(t);
        return this.q.push(t);
    }

    isEmpty = () => {
        return this.q.length == 0;
    }

    // return queue as a only readable array
    // only for debug
    _fullQueue = () => {
        let q = this.q;
        return q;
    }
}