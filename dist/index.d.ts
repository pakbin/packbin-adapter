/// <reference types="node" />
import { Server as NetServer } from 'net';
export default class ProxifactAdapter {
    private listener;
    constructor();
    listen(port: number): NetServer;
}
