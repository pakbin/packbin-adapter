import { Url } from 'url';
import { IncomingMessage, ClientRequest, request as httpRequest, RequestOptions } from 'http';
import { request as httpsRequest } from 'https';
import { Request, Response } from 'express';
import { EventEmitter } from 'events';

interface RequestOptionsWithData extends RequestOptions {
    data?:string;
}

interface IncomingMessageWithData extends IncomingMessage {
    data?:string;
}

export default class ProxyServer extends EventEmitter {
    constructor(private target:Url, private autoRewriteHost=true) {
        super();

        // TODO: Support keep-alive agent for requests with connection: keep-alive
        // TODO: Support proxy caching
    }

    proxyRequest(req:Request, res:Response, buffered=false) {
        const requestOptions:RequestOptionsWithData = {
            protocol: this.target.protocol,
            hostname: this.target.hostname,
            port: this.target.port ? parseInt(this.target.port) : undefined,
            method: req.method,
            path: req.path,
            headers: req.headers
        };
        if(this.autoRewriteHost) {
            delete requestOptions.headers['host'];
            delete requestOptions.headers['Host'];
            requestOptions.headers['host'] = this.target.hostname;
        }

        if(buffered) {
            requestOptions.data = '';
            req.setEncoding('utf8');

            req.on('data', chunk => requestOptions.data += chunk);
            req.on('end', () => {
                this.emit('proxyReq', requestOptions, req, res);
                if(requestOptions.data !== '') {
                    delete requestOptions.headers['content-length'];
                    delete requestOptions.headers['Content-Length'];
                    requestOptions.headers['content-length'] = Buffer.from(requestOptions.data).length;
                }
                sendRequest.call(this);
            });
        } else {
            this.emit('proxyReq', requestOptions, req, res);
            sendRequest.call(this);
        }

        function sendRequest() {
            const proxyReq = (this.target.protocol === 'https:') ? httpsRequest(requestOptions, handleResponse) : httpRequest(requestOptions, handleResponse);

            proxyReq.on('error', err => {
                this.emit('proxyReqError', err, req, res);
                proxyReq.end();
            });

            if(buffered) {
                proxyReq.write(requestOptions.data);
                proxyReq.end();
            } else {
                req.pipe(proxyReq);
            }

            // Response
            function handleResponse(proxyRes:IncomingMessageWithData) {
                proxyRes.on('error', err => {
                    this.emit('proxyResError', err, req, res);
                });
                if(buffered) {
                    proxyRes.data = '';
                    proxyRes.setEncoding('utf8');

                    proxyRes.on('data', chunk => proxyRes.data += chunk);
                    proxyRes.on('end', () => {
                        this.emit('proxyRes', proxyRes, req, res);
                        if(proxyRes.data !== '') {
                            delete proxyRes.headers['content-length'];
                            delete proxyRes.headers['Content-Length'];
                            proxyRes.headers['content-length'] = Buffer.from(proxyRes.data).length;
                        }

                        res
                            .status(proxyRes.statusCode)
                            .set(proxyRes.headers)
                            .send(proxyRes.data);
                    });
                } else {
                    this.emit('proxyRes', proxyRes, req, res);
                    res
                        .status(proxyRes.statusCode)
                        .set(proxyRes.headers);
                    proxyRes.pipe(res);
                }
            }
        }
    }
}
