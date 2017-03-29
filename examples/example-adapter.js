const Adapter = require('proxifact-adapter');

const dockerAdapter = new Adapter('docker', {
    methodFilter: /^(GET|PUT|POST|DELETE|PATCH)$/,
    pathFilter: /^\/v2\//,
    headerFilters: {
        'User-Agent': /^docker\//
    }
});

// Add registry version header to all requests
dockerAdapter.router.use((req, res, next) => {
    res.set('Docker-Distribution-API-Version', 'registry/2.0');
    next();
});

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
            req.user = user;
            next();
        })
        .catch(err => {
            res.sendStatus(500);
        });
});


// Simple info endpoint
dockerAdapter.router.get('/v2', (req, res) => {
    res.status(200).end();
});

module.exports = dockerAdapter;
