import { request } from 'http';
import { parse } from 'url';
import * as express from 'express';
import ProxyServer from './proxy';

export type RequestFilterDefinition = {
    methodFilter: RegExp;
    pathFilter:RegExp;
    headerFilters:{[header:string]:RegExp};
};

export type User = {
    username:string;
    emailAddress?:string;
};

export interface PackbinInterface {
    authenticate(username:string, password:string):Promise<User>;
    authenticateWithToken(registryType:string, token:string):Promise<User>;
    authorize(user:User, registryType:string, operation:string, owner?:string, group?:string, uuid?:string):Promise<boolean>;
    generateAuthToken(registryType:string, username:string, password:string):Promise<string>;
}

export class PackbinAdapter {
    public router:express.Router;

    public _packbin:PackbinInterface = {
        authenticate: null,
        authenticateWithToken: null,
        authorize: null,
        generateAuthToken: null
    };

    constructor(private registryType:string, public requestFilter:RequestFilterDefinition) {
        this.router = express.Router();

        // TODO: Allow configuration settings to be passed
    }

    authenticate(username:string, password:string):Promise<User> {
        return this._packbin.authenticate(username, password);
    }

    authenticateWithToken(token:string):Promise<User> {
        return this._packbin.authenticateWithToken(this.registryType, token);
    }

    authorize(user:User, operation:string, owner?:string, group?:string, uuid?:string):Promise<boolean> {
        return this._packbin.authorize(user, this.registryType, operation, owner, group, uuid);
    }

    getTokenForUser(username:string, password:string):Promise<string> {
        return this._packbin.generateAuthToken(this.registryType, username, password);
    }

    createProxyTo(target:string, rewriteHostHeader=true) {
        const targetURI = parse(target);
        return new ProxyServer(targetURI, rewriteHostHeader);
    }

    // TODO: Add browsing callback register functions (to support browsing the registry/repository with the web UI)
}
