const GG = require('gnat-grpc');
const PATH = require('path');
const grpc = require('@grpc/grpc-js');
const {expect} = require('chai');
const watcher = require('../');
const request = require('supertest');
const {random, lorem} = require('faker');
const express = require('express');

GG.config({
  grpc: require('grpc'),
  protoLoader: require('@grpc/proto-loader'),
  root: PATH.join(__dirname, '.proto'),
});
const {Client, Server} = GG;
const app = express();

const postRequest = () => {
  const agent = request.agent(app);
  return ({url, body, expectation}) =>
    agent.post(url)
      .send(body)
      .expect('Content-Type', /json/)
      .expect(expectation.statusCode);
};

let PORT = 50057;
const throwAnErr = ({name}) => {
  const err = new Error(`使用了错误的名字 "${name}"，写错了写错了写错了写错了写错了写错了写错了写错了`);
  err.code = 20000;
  throw err;
};

let asserts = [];
const sayHello = function ({name}) {
  asserts.forEach(cb => cb.call(this, ...Array.prototype.slice.call(arguments, 0)));
  return {message: `Hello ${name}`, testExField: '1111'};
};

describe('watcher', () => {
  let server;
  let client;
  let proxy;
  let req;
  let baseUrl;

  const clientConf = {
    bindPath: `localhost:${PORT}`,
    services: [
      {filename: 'helloworld.proto'},
    ]
  };

  beforeEach(async () => {
    server = await Server.addServer({
      bindPath: `0.0.0.0:${PORT}`,
      services: [
        {filename: 'helloworld.proto'},
      ],
      methods: {
        'gnat.helloworld.Greeter': {sayHello, throwAnErr},
      }
    });

    server.start();
  });

  beforeEach(() => {
    baseUrl = `/${lorem.word()}`;
    proxy = watcher({grpcClient: {clientConf}});
    client = proxy.grpcClient;
    app.use(baseUrl, proxy);
    req = postRequest();
  });

  afterEach(() => server.tryShutdown());
  afterEach(() => client.close());

  context('proxy', () => {
    let root;
    beforeEach(() => {
      root = `${baseUrl}/proxy`;
    });
    it('proxy', async () => {
      const name = random.word();
      const ret = await req({
        url: `${root}/gnat.helloworld.Greeter/SayHello`,
        body: {args: {name}, debug: true},
        expectation: {statusCode: 200}
      });
      expect(ret).to.have.property('body').to.deep.equal({result: {message: `Hello ${name}`}});
    });

    it('when deadline exceeded', async () => {
      const name = random.word();
      const ret = await req({
        url: `${root}/gnat.helloworld.Greeter/SayHello`,
        body: {args: {name}, callOpts: {deadline: 0}},
        expectation: {statusCode: 500}
      });
      expect(ret).to.have.deep.nested.property('body.error.code').to.equal(grpc.status.DEADLINE_EXCEEDED);
      expect(ret).to.have.deep.nested.property('body.error.details').to.equal('Deadline Exceeded');
    });

    it('on respond custom error', async () => {
      const name = random.word();
      const ret = await req({
        url: `${root}/gnat.helloworld.Greeter/ThrowAnErr`,
        body: {args: {name}},
        expectation: {statusCode: 500}
      });
      expect(ret).to.have.deep.nested.property('body.error.code').to.equal(20000);
      expect(ret).to.have.deep.nested.property('body.error.details').to.equal(`使用了错误的名字 "${name}"，写错了写错了写错了写错了写错了写错了写错了写错了`);
    });
  });
});
