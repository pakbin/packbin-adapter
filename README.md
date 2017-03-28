# proxifact-adapter
Download this module on [npm](https://npmjs.org/packages/proxifact-adapter)!

## Description
The `proxifact-adapter` module allows you to integrate a custom artifact registry/repository for [Proxifact]().

## Usage
Proxifact adapters work as separate services. This benefits code separation and scaling possibilities. A custom adapter registers itself with the main Proxifact service by letting it know how to identify requests designated for its registry/repository. It does so by providing a number of regular expressions that will test various attributes of a request. For example:

```javascript
// This will match requests for a Docker v2 registry
const filters = {
    methodFilter: /^(GET|PUT|POST|DELETE|PATCH)$/
    pathFilter: /^\/v2\//
    headerFilters:{
        'User-Agent': /^docker\//
    };
}
```

## Handling requests
Proxifact will proxy any requests coming from a client to the first registered adapter to match all specified filters. It is entirely up to the adapter to come up with an appropriate response. The adapter can handle the response entirely, or proxy the request once more to delegate it to another service. To allow for this behavior, the `proxifact-adapter` module exposes an [Express 4.x](expressjs.com) app.

```javascript
const Adapter = require('proxifact-adapter');

const dockerAdapter = new Adapter(/* insert valid args here */);

dockerAdapter.router.get('/v2', (req, res) => {
    res.set('Docker-Distribution-API-Version', 'registry/2.0');
    res.status(200).end();
});

dockerAdapter.register(filters)
    .then(() => {
        console.info('Registered!');
    });
```

### Authenticating and Authorizing requests
The Proxifact main service will take care of authentication transparently, but authorization requires help from the adapter. The adapter will need to specify a few properties of the request:

 - Requested operation (info, list, create, read, update, delete)
 - Requested resource owner (optional)
 - Requested resource group (optional)
 - Requested resource UUID (optional)

The `proxifact-adapter` module provides an easy way to achieve this:

```javascript
...
/**
 * Connect (Express compatible) middleware function:
 * Adapter.authorize(operation, owner?, group?, uuid?, unauthorizedResponse?)
 */

dockerAdapter.router.get('/v2', dockerAdapter.authorize('info'), (req, res) => {
    res.set('Docker-Distribution-API-Version', 'registry/2.0');
    res.status(200).end();
});

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
    )(req, res, next);
});
```

The `authorize()` middleware function will automatically respond with an HTTP 403 Forbidden response. Should you want to customize this, you can do so globally by setting:

```javascript
...

// Send a 404 instead of a 403
dockerAdapter.setUnauthorizedResponse({
    statusCode: 404,
    headers: {
        'Custom-Header': 'Custom-Value'
    },
    body: 'Not Found'
});
```

Or locally by passing the configuration object as the last parameter of the `authorize()` middleware function.
