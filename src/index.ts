import { createServer, request as httpRequest, Server, RequestOptions, IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';
import { Server as NetServer } from 'net';
import { parse as parseUrl } from 'url';
import { release, type } from 'os';

const API_VERSION = 'v1';

export type RequestFilterDefinition = {
    methodFilter: RegExp;
    pathFilter:RegExp;
    headerFilters:{[header:string]:RegExp};
};

export default class ProxifactAdapter {
    private listener:Server;

    constructor(private proxifactUrl:string, private registryType:string, private proxifactSecret:string, private adapterUrl:string) {
        this.listener = createServer((req, res) => {

        });
    }

    register(filter:RequestFilterDefinition):Promise<{}> {
        const parsedUrl = parseUrl(this.proxifactUrl);

        const payload = JSON.stringify({
            url: this.adapterUrl,
            filter
        });

        const requestConfig:RequestOptions = {
            protocol: parsedUrl.protocol,
            host: parsedUrl.host,
            port: parseInt(parsedUrl.port),
            method: 'POST',
            path: '/api/adapters',
            headers: {
                'User-Agent': `Node.js/${process.version} (${type()}; ${process.platform}_${release()} ${process.arch}) ProxifactAdapter/${require('../package.json').version}`,
                'Accept': `application/vnd.proxifact.${API_VERSION}+json`,
                'Authorization': `Bearer ${Buffer.from(this.proxifactSecret).toString('base64')}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.from(payload).length
            }
        };

        return new Promise((resolve, reject) => {
            function handleResponse(res:IncomingMessage) {
                res.setEncoding('utf8');
                let data = '';

                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const response = {
                        statusCode: res.statusCode,
                        data: res.headers['Content-Type'].indexOf('application/json') > -1 ? JSON.parse(data) : data
                    };
                    if(res.statusCode >= 300) {
                        reject(response);
                    } else {
                        resolve(response);
                    }
                });
                res.on('error', err => reject(err));
            }

            const request = parsedUrl.protocol === 'https:' ?
                httpsRequest(requestConfig, handleResponse) :
                httpRequest(requestConfig, handleResponse);

            request.on('error', err => reject(err));

            request.write(payload);
            request.end();
        });
    }

    listen(port:number):NetServer {
        return this.listener.listen(port);
    }
}
