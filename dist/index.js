"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
class ProxifactAdapter {
    constructor() {
        this.listener = http_1.createServer((req, res) => {
        });
    }
    listen(port) {
        return this.listener.listen(port);
    }
}
exports.default = ProxifactAdapter;
