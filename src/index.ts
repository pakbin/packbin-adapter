import * as express from 'express';

export type RequestFilterDefinition = {
    methodFilter: RegExp;
    pathFilter:RegExp;
    headerFilters:{[header:string]:RegExp};
};

export type User = {
    username:string;
    emailAddress?:string;
};

export default class ProxifactAdapter {
    public router:Express.Application;

    public _authenticationCallback:(username:string, password:string) => Promise<User> = null;
    public _authorizationCallback:(registryType:string, operation:string, owner?:string, group?:string, uuid?:string) => Promise<boolean> = null;

    constructor(private registryType:string, public requestFilter:RequestFilterDefinition) {
        this.router = express.Router();
    }

    authenticate(username:string, password:string):Promise<User> {
        return this._authenticationCallback(username, password);
    }

    authorize(operation:string, owner?:string, group?:string, uuid?:string):Promise<boolean> {
        return this._authorizationCallback(this.registryType, operation, owner, group, uuid);
    }

    // TODO: Add browsing callback register functions (to support browsing the registry/repository with the web UI)
}
