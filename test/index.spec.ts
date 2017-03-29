import { noCallThru } from 'proxyquire';
import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';

const proxyquire = noCallThru();
const expect = chai.expect;
chai.use(sinonChai);

describe('Proxifact Adapter', () => {
  let express,
      expressMock,
      Adapter;

  beforeEach(() => {
    express = {
      Router: () => {}
    };
    expressMock = sinon.mock(express);

    proxyquire('../src/index', {
      'express': express
    });
    Adapter = require('../src/index').ProxifactAdapter;
  });

  afterEach(() => {
    expressMock.verify();
    delete require.cache[require.resolve('../src/index')];
  })

  it('should construct an adapter', () => {
    const filter = {};

    expressMock.expects('Router')
      .once()
      .withExactArgs()
      .returns('a router');

    const adapter = new Adapter('test', filter);

    expect(adapter.requestFilter).to.equal(filter);
    expect(adapter.router).to.equal('a router');
  });

  describe('authentication and authorization', () => {
    let adapter;

    beforeEach(() => {
      expressMock.expects('Router')
        .once()
        .withExactArgs()
        .returns('a router');

      adapter = new Adapter('test', {});
    });

    it('should call the authenticationCallback', () => {
      const authCb = sinon.spy(() => 'promise');

      adapter._authenticationCallback = authCb;

      const result = adapter.authenticate('foo', 'bar');
      expect(authCb).to.have.been.calledOnce;
      expect(authCb).to.have.been.calledWith('foo', 'bar');
      expect(result).to.equal('promise');
    });

    it('should call the authorizationCallback', () => {
      const authCb = sinon.spy(() => 'promise');

      adapter._authorizationCallback = authCb;

      const result = adapter.authorize('list', 'foo', 'bar', 'baz');
      expect(authCb).to.have.been.calledOnce;
      expect(authCb).to.have.been.calledWith('test', 'list', 'foo', 'bar', 'baz');
      expect(result).to.equal('promise');
    });
  })
});

