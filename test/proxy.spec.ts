/// <reference types="mocha" />
import { noCallThru } from 'proxyquire';
import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import { EventEmitter } from 'events';

const proxyquire = noCallThru();
const expect = chai.expect;
chai.use(sinonChai);

describe('ProxyServer', () => {
    let ProxyServer,
        mockRequest:sinon.SinonMock,
        mockResponse:sinon.SinonMock,
        req,
        res,
        mockHttp:sinon.SinonMock,
        mockHttps:sinon.SinonMock;

    class MockIncomingMessage extends EventEmitter {
        method?:string;
        path?:string;
        headers:{[header:string]:string};
        statusCode?:number;

        pipe(targetWritableStream:any) {}
        setEncoding(encoding:string) {}
    }

    class MockServerResponse {
        status(statusCode:number) { return this; }
        set(headers:{[header:string]:string}) { return this; }
        send(data:string) { return this; }
    }

    class MockClientRequest extends EventEmitter {
        write(data:string) {}
        end() {}
    }

    class MockHttp {
        request(options) { return new MockClientRequest(); }
    }

    beforeEach(() => {
        delete require.cache[require.resolve('../src/proxy')];

        req = new MockIncomingMessage();
        res = new MockServerResponse();
        let http = new MockHttp();
        let https = new MockHttp();

        mockRequest = sinon.mock(req);
        mockResponse = sinon.mock(res);
        mockHttp = sinon.mock(http);
        mockHttps = sinon.mock(https);

        proxyquire('../src/proxy', {
            'http': http,
            'https': https
        });

        ProxyServer = require('../src/proxy').default;
    });

    afterEach(() => {
        mockRequest.verify();
        mockResponse.verify();
        mockHttp.verify();
        mockHttps.verify();
    });

    it('should proxy a simple request', () => {
        const proxy = new ProxyServer(require('url').parse('http://foo.bar'));

        req.method = 'GET';
        req.path = '/test';
        req.headers = {
            host: 'proxy'
        }

        const reqSpy = sinon.spy();
        proxy.on('proxyReq', reqSpy);

        const clientReq = new MockClientRequest();
        const mockClientReq = sinon.mock(clientReq);

        const requestStub = mockHttp
            .expects('request');

        requestStub
            .once()
            .withArgs({
                protocol: 'http:',
                hostname: 'foo.bar',
                port: undefined,
                method: 'GET',
                path: '/test',
                headers: {
                    host: 'foo.bar'
                }
            })
            .returns(clientReq);

        mockRequest
            .expects('pipe')
            .once()
            .withExactArgs(clientReq);

        proxy.proxyRequest(req, res);

        // Check rewritten hostname
        expect(reqSpy).to.have.been.calledOnce;
        expect(reqSpy).to.have.been.calledWith({
            protocol: 'http:',
            hostname: 'foo.bar',
            port: undefined,
            method: 'GET',
            path: '/test',
            headers: {
                host: 'foo.bar'
            }
        }, req, res);

        // Response testing
        expect(requestStub.args[0][1]).to.be.an.instanceOf(Function);
        const handleResponse = requestStub.args[0][1].bind(proxy);

        const proxyRes = new MockIncomingMessage();
        const mockProxyRes = sinon.mock(proxyRes);

        proxyRes.statusCode = 200;
        proxyRes.headers = {'content-type': 'application/json'};

        const resSpy = sinon.spy();
        proxy.on('proxyRes', resSpy);

        mockResponse
            .expects('status')
            .once()
            .withExactArgs(200)
            .returns(res);

        mockResponse
            .expects('set')
            .once()
            .withExactArgs({'content-type': 'application/json'})
            .returns(res);

        mockProxyRes
            .expects('pipe')
            .once()
            .withExactArgs(res);

        handleResponse(proxyRes);

        expect(resSpy).to.have.been.calledOnce;
        expect(resSpy).to.have.been.calledWith(proxyRes, req, res);
    });

    it('should allow the user to change the proxyRequest and proxyResponse using event listeners', () => {
        const proxy = new ProxyServer(require('url').parse('http://foo.bar'));

        req.method = 'GET';
        req.path = '/test';
        req.headers = {
            host: 'proxy'
        }

        const reqSpy = sinon.spy(proxyReq => {
            proxyReq.headers['foo'] = 'bar';
        });
        proxy.on('proxyReq', reqSpy);

        const clientReq = new MockClientRequest();
        const mockClientReq = sinon.mock(clientReq);

        const requestStub = mockHttp
            .expects('request');

        requestStub
            .once()
            .withArgs({
                protocol: 'http:',
                hostname: 'foo.bar',
                port: undefined,
                method: 'GET',
                path: '/test',
                headers: {
                    host: 'foo.bar',
                    foo: 'bar'
                }
            })
            .returns(clientReq);

        mockRequest
            .expects('pipe')
            .once()
            .withExactArgs(clientReq);

        proxy.proxyRequest(req, res);

        // Check rewritten hostname
        expect(reqSpy).to.have.been.calledOnce;
        expect(reqSpy).to.have.been.calledWith({
            protocol: 'http:',
            hostname: 'foo.bar',
            port: undefined,
            method: 'GET',
            path: '/test',
            headers: {
                host: 'foo.bar',
                foo: 'bar'
            }
        }, req, res);

        // Response testing
        expect(requestStub.args[0][1]).to.be.an.instanceOf(Function);
        const handleResponse = requestStub.args[0][1].bind(proxy);

        const proxyRes = new MockIncomingMessage();
        const mockProxyRes = sinon.mock(proxyRes);

        proxyRes.statusCode = 200;
        proxyRes.headers = { 'content-type': 'application/json' };

        const resSpy = sinon.spy(proxyRes => {
            proxyRes.headers['custom-header'] = 'yes';
            proxyRes.statusCode = 201;
        });
        proxy.on('proxyRes', resSpy);

        mockResponse
            .expects('status')
            .once()
            .withExactArgs(201)
            .returns(res);

        mockResponse
            .expects('set')
            .once()
            .withExactArgs({
                'content-type': 'application/json',
                'custom-header': 'yes'
            })
            .returns(res);

        mockProxyRes
            .expects('pipe')
            .once()
            .withExactArgs(res);

        handleResponse(proxyRes);

        expect(resSpy).to.have.been.calledOnce;
        expect(resSpy).to.have.been.calledWith(proxyRes, req, res);
    });

    it('should use the https client for https targets', () => {
        const proxy = new ProxyServer(require('url').parse('https://foo.bar'));

        req.method = 'GET';
        req.path = '/test';
        req.headers = {
            host: 'proxy'
        }

        const reqSpy = sinon.spy();
        proxy.on('proxyReq', reqSpy);

        const clientReq = new MockClientRequest();
        const mockClientReq = sinon.mock(clientReq);

        const requestStub = mockHttps
            .expects('request');

        requestStub
            .once()
            .withArgs({
                protocol: 'https:',
                hostname: 'foo.bar',
                port: undefined,
                method: 'GET',
                path: '/test',
                headers: {
                    host: 'foo.bar'
                }
            })
            .returns(clientReq);

        mockRequest
            .expects('pipe')
            .once()
            .withExactArgs(clientReq);

        proxy.proxyRequest(req, res);

        expect(reqSpy).to.have.been.calledOnce;
        expect(reqSpy).to.have.been.calledWith({
            protocol: 'https:',
            hostname: 'foo.bar',
            port: undefined,
            method: 'GET',
            path: '/test',
            headers: {
                host: 'foo.bar'
            }
        }, req, res);
    });

    it('should work with a custom port in the target URL', () => {
        const proxy = new ProxyServer(require('url').parse('http://foo.bar:8081'));

        req.method = 'GET';
        req.path = '/test';
        req.headers = {
            host: 'proxy'
        }

        const reqSpy = sinon.spy();
        proxy.on('proxyReq', reqSpy);

        const clientReq = new MockClientRequest();
        const mockClientReq = sinon.mock(clientReq);

        const requestStub = mockHttp
            .expects('request');

        requestStub
            .once()
            .withArgs({
                protocol: 'http:',
                hostname: 'foo.bar',
                port: 8081,
                method: 'GET',
                path: '/test',
                headers: {
                    host: 'foo.bar'
                }
            })
            .returns(clientReq);

        mockRequest
            .expects('pipe')
            .once()
            .withExactArgs(clientReq);

        proxy.proxyRequest(req, res);

        expect(reqSpy).to.have.been.calledOnce;
        expect(reqSpy).to.have.been.calledWith({
            protocol: 'http:',
            hostname: 'foo.bar',
            port: 8081,
            method: 'GET',
            path: '/test',
            headers: {
                host: 'foo.bar'
            }
        }, req, res);
    });

    it('should allow not automatically overriding the Host header', () => {
        const proxy = new ProxyServer(require('url').parse('http://foo.bar'), false);

        req.method = 'GET';
        req.path = '/test';
        req.headers = {
            host: 'proxy'
        }

        const reqSpy = sinon.spy();
        proxy.on('proxyReq', reqSpy);

        const clientReq = new MockClientRequest();
        const mockClientReq = sinon.mock(clientReq);

        const requestStub = mockHttp
            .expects('request');

        requestStub
            .once()
            .withArgs({
                protocol: 'http:',
                hostname: 'foo.bar',
                port: undefined,
                method: 'GET',
                path: '/test',
                headers: {
                    host: 'proxy'
                }
            })
            .returns(clientReq);

        mockRequest
            .expects('pipe')
            .once()
            .withExactArgs(clientReq);

        proxy.proxyRequest(req, res);

        expect(reqSpy).to.have.been.calledOnce;
        expect(reqSpy).to.have.been.calledWith({
            protocol: 'http:',
            hostname: 'foo.bar',
            port: undefined,
            method: 'GET',
            path: '/test',
            headers: {
                host: 'proxy'
            }
        }, req, res);
    });

    it('should work in buffered mode', () => {
        const proxy = new ProxyServer(require('url').parse('http://foo.bar'));

        req.method = 'GET';
        req.path = '/test';
        req.headers = {
            host: 'proxy'
        }

        const reqSpy = sinon.spy();
        proxy.on('proxyReq', reqSpy);

        const clientReq = new MockClientRequest();
        const mockClientReq = sinon.mock(clientReq);

        const requestStub = mockHttp
            .expects('request');

        requestStub
            .once()
            .withArgs({
                data: 'Hello World!',
                protocol: 'http:',
                hostname: 'foo.bar',
                port: undefined,
                method: 'GET',
                path: '/test',
                headers: {
                    host: 'foo.bar',
                    'content-length': 12
                }
            })
            .returns(clientReq);

        mockRequest
            .expects('setEncoding')
            .once()
            .withExactArgs('utf8');


        proxy.proxyRequest(req, res, true);

        mockClientReq
            .expects('write')
            .once()
            .withExactArgs('Hello World!');
        mockClientReq
            .expects('end')
            .once()
            .withExactArgs();

        // Check concatenating of data
        req.emit('data', 'Hello ');
        req.emit('data', 'World!');
        req.emit('end');

        // Check rewritten hostname and data
        expect(reqSpy).to.have.been.calledOnce;
        expect(reqSpy).to.have.been.calledWith({
            data: 'Hello World!',
            protocol: 'http:',
            hostname: 'foo.bar',
            port: undefined,
            method: 'GET',
            path: '/test',
            headers: {
                host: 'foo.bar',
                'content-length': 12
            }
        }, req, res);

        // Response testing
        expect(requestStub.args[0][1]).to.be.an.instanceOf(Function);
        const handleResponse = requestStub.args[0][1].bind(proxy);

        const proxyRes = new MockIncomingMessage();
        const mockProxyRes = sinon.mock(proxyRes);

        proxyRes.statusCode = 200;
        proxyRes.headers = {'content-type': 'application/json'};

        const resSpy = sinon.spy();
        proxy.on('proxyRes', resSpy);

        mockResponse
            .expects('status')
            .once()
            .withExactArgs(200)
            .returns(res);

        mockResponse
            .expects('set')
            .once()
            .withExactArgs({
                'content-type': 'application/json',
                'content-length': 2
            })
            .returns(res);

        mockResponse
            .expects('send')
            .once()
            .withExactArgs('OK');

        handleResponse(proxyRes);

        // Handle response buffering
        proxyRes.emit('data', 'O');
        proxyRes.emit('data', 'K');
        proxyRes.emit('end');

        expect(resSpy).to.have.been.calledOnce;
        expect(resSpy).to.have.been.calledWith(proxyRes, req, res);
    });

    it('should deal with errors in the proxy request', () => {
        const proxy = new ProxyServer(require('url').parse('http://foo.bar'));

        req.method = 'GET';
        req.path = '/test';
        req.headers = {
            host: 'proxy'
        }

        const reqSpy = sinon.spy();
        proxy.on('proxyReq', reqSpy);

        const clientReq = new MockClientRequest();
        const mockClientReq = sinon.mock(clientReq);

        const requestStub = mockHttp
            .expects('request');

        requestStub
            .once()
            .withArgs({
                protocol: 'http:',
                hostname: 'foo.bar',
                port: undefined,
                method: 'GET',
                path: '/test',
                headers: {
                    host: 'foo.bar'
                }
            })
            .returns(clientReq);

        mockRequest
            .expects('pipe')
            .once()
            .withExactArgs(clientReq);

        proxy.proxyRequest(req, res);

        expect(reqSpy).to.have.been.calledOnce;
        expect(reqSpy).to.have.been.calledWith({
            protocol: 'http:',
            hostname: 'foo.bar',
            port: undefined,
            method: 'GET',
            path: '/test',
            headers: {
                host: 'foo.bar'
            }
        }, req, res);

        const errorSpy = sinon.spy();
        proxy.on('proxyReqError', errorSpy);

        clientReq.emit('error', 'WAT?!');

        expect(errorSpy).to.have.been.calledOnce;
        expect(errorSpy).to.have.been.calledWith('WAT?!', req, res);
    });

    it('should deal with errors in the proxy response', () => {
        const proxy = new ProxyServer(require('url').parse('http://foo.bar'));

        req.method = 'GET';
        req.path = '/test';
        req.headers = {
            host: 'proxy'
        }

        const reqSpy = sinon.spy();
        proxy.on('proxyReq', reqSpy);

        const clientReq = new MockClientRequest();
        const mockClientReq = sinon.mock(clientReq);

        const requestStub = mockHttp
            .expects('request');

        requestStub
            .once()
            .withArgs({
                protocol: 'http:',
                hostname: 'foo.bar',
                port: undefined,
                method: 'GET',
                path: '/test',
                headers: {
                    host: 'foo.bar'
                }
            })
            .returns(clientReq);

        mockRequest
            .expects('pipe')
            .once()
            .withExactArgs(clientReq);

        proxy.proxyRequest(req, res);

        // Check rewritten hostname
        expect(reqSpy).to.have.been.calledOnce;
        expect(reqSpy).to.have.been.calledWith({
            protocol: 'http:',
            hostname: 'foo.bar',
            port: undefined,
            method: 'GET',
            path: '/test',
            headers: {
                host: 'foo.bar'
            }
        }, req, res);

        // Response testing
        expect(requestStub.args[0][1]).to.be.an.instanceOf(Function);
        const handleResponse = requestStub.args[0][1].bind(proxy);

        const proxyRes = new MockIncomingMessage();
        const mockProxyRes = sinon.mock(proxyRes);

        proxyRes.statusCode = 200;
        proxyRes.headers = { 'content-type': 'application/json' };

        const resSpy = sinon.spy();
        proxy.on('proxyRes', resSpy);

        mockResponse
            .expects('status')
            .once()
            .withExactArgs(200)
            .returns(res);

        mockResponse
            .expects('set')
            .once()
            .withExactArgs({ 'content-type': 'application/json' })
            .returns(res);

        mockProxyRes
            .expects('pipe')
            .once()
            .withExactArgs(res);

        handleResponse(proxyRes);

        expect(resSpy).to.have.been.calledOnce;
        expect(resSpy).to.have.been.calledWith(proxyRes, req, res);


        const errorSpy = sinon.spy();
        proxy.on('proxyResError', errorSpy);

        proxyRes.emit('error', 'NOOOOO!!');

        expect(errorSpy).to.have.been.calledOnce;
        expect(errorSpy).to.have.been.calledWith('NOOOOO!!', req, res);
    });
});
