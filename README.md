# packbin-adapter

## Description
The `packbin-adapter` module allows you to integrate a custom artifact registry/repository for [Packbin](https://github.com/packbinjs/packbin/).

## Installation
Simply:
```javascript
npm install --save packbin-adapter
```

## Usage
Packbin adapters work as plugins for the main service. This benefits code separation and easy of integration. A custom adapter is loaded by the main Packbin service through a user-defined configuration file. It then lets the main service know how to identify requests designated for its registry/repository. It does so by providing a number of regular expressions that will test various attributes of a request. For example:

```javascript
// This will match requests for a Docker v2 registry
const filters = {
    methodFilter: /^(GET|PUT|POST|DELETE|PATCH)$/,
    pathFilter: /^\/v2\//,
    headerFilters:{
        'User-Agent': /^docker\//
    }
};
```

An incoming request will need to match all specified filters for it to be routed to the adapter. The first adapter with matching filters will be handling the request, so make sure to be very specific!

## Handling requests
Packbin will send any requests coming from a client to the first registered adapter to match all specified filters. It is entirely up to the adapter to come up with an appropriate response. The adapter can handle the response entirely, or proxy the request, delegating it to another (external) service. To allow for this behavior, the `packbin-adapter` module exposes an [Express 4.x](expressjs.com) Router on the `router` attribute.

```javascript
const Adapter = require('packbin-adapter');

const dockerAdapter = new Adapter('docker', filters);

dockerAdapter.router.get('/v2', (req, res) => {
    res.set('Docker-Distribution-API-Version', 'registry/2.0');
    res.status(200).end();
});

module.exports = dockerAdapter;
```

### Authenticating and Authorizing requests
The Packbin main service contains all the user and acl data, but authentication and authorization of requests requires help from the adapter.

#### Authentication
For authentication, the `packbin-adapter` module offers the `Adapter.authenticate()` function:

```javascript
Adapter.authenticate(username, password)
```

This function will contact the main Packbin service to try and authenticate the request using the given `username` and `password`. For example:

```javascript
...

// Authenticate all requests
dockerAdapter.router.use((req, res, next) => {
    const [ type, value ] = req.get('Authorization').split(' ');
    if(type.toLowerCase() !== 'basic') {
        return res.sendStatus(401);
    }
    const [ username, password ] = Buffer.from(value, 'base64').toString().split(':');
    dockerAdapter.authenticate(username, password)
        .then(user => {
            if(!user) return res.sendStatus(401);

            // Store the retrieved user in the Request object
            req.user = user;
            next();
        })
        .catch(err => {
            res.sendStatus(500);
        });
});
```

Should you want to authenticate with a token, you should first generate a token for the user:

```javascript
Adapter.getTokenForUser(username, password);
```

Internally, this will generate a new token for the specified user provided the given credentials are correct. The function will return a token in the form `Promise<string>`. To authenticate requests with a token, use:

```javascript
Adapter.authenticateWithToken(token);
```

This function will return `Promise<User>`.

#### Authorization
To authorize a request, the adapter will need to specify a few properties of the request:

 - The user requesting the operation (from the `authenticate()` function, probably `Request.user`)
 - Requested operation (info, list, create, read, update, delete)
 - Requested resource owner (optional)
 - Requested resource group (optional)
 - Requested resource UUID (optional)

The `Adapter.authorize()` function provides an easy way to achieve this:

```javascript
Adapter.authorize(operation, owner?, group?, uuid?)
```

Example:

```javascript
...

const httpMethodToOperation = {
    GET: 'read',
    PUT: 'update',
    POST: 'create',
    DELETE: 'delete',
    PATCH: 'update'
};

dockerAdapter.router.use('/v2/:owner/:image', (req, res, next) => {
    dockerAdapter.authorize(
        httpMethodToOperation[req.method]           // The requested operation
        req.params.owner,                           // The owner of the resource
        null,                                       // The group of the resource
        `${req.params.owner}/${req.params.image}`   // The UUID of the resource
    ).then(result => {
        if(result) return next();
        res.sendStatus(403);
    })
    .catch(error => {
        res.sendStatus(500);
    });
});
```

## Browsable repositories
TODO: Register functions to allow browsing the registry/repository from the Packbin web GUI

## Adapter settings and configuration
TODO: Allow configuration objects to define settings for the adapter

## Proxying requests
A very important feature of Packbin is its ability to proxy certain requests to an external service. This allows the service to function as a private artifact/package registry, but also as a mirror to the public registry. In order to make proxying easier for adapter developers, the `packbin-adapter` module provides an easy way to proxy HTTP requests:

```javascript
const Adapter = require('packbin-adapter');
const npmAdapter = new Adapter('npm', filters);

const npmProxy = npmAdapter.createProxyTo('https://registry.npmjs.org');

npmProxy.on('proxyReq', proxyReq => {
    // Remove token for public registry requests
    delete proxyReq.headers['authorization'];
    delete proxyReq.headers['Authorization'];
});

npmAdapter.router.get('/:package', (req, res) => {
    if(params.package.startsWith('@yourCompany/')) {
        // Handle private package
        return;
    }

    // Proxy to the central npm registry
    npmProxy.proxyRequest(req, res);
});

module.exports = dockerAdapter;
```
