const {Client, config: ggConfig} = require('gnat-grpc');
const express = require('express');
const bodyParser = require('body-parser');
const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const camelCase = require('lodash.camelcase');

const {Router} = express;
const doResponse = (res, statusCode, json) => {
  res.writeHead(statusCode, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(json));
};

let debugOn;
let reqCount = 0;

const debugActivated = debug => debug || debugOn;

const debug = ({debug} = {}, ...args) => debugActivated(debug) && console.log(...args);

const time = ({debug} = {}, ...args) => debugActivated(debug) && console.time(...args);
const timeEnd = ({debug} = {}, ...args) => debugActivated(debug) && console.timeEnd(...args);

const getRouteHandler = grpcClient => {
  const fn = async (req, res, {reqId}) => {
    let {serviceName, methodName} = req.params;
    const {body} = req;
    const {args, metadata, callOpts} = body;
    const service = grpcClient.getService(serviceName);
    const unimplemented = () =>
      doResponse(res, 500, {error: {code: grpc.status.UNIMPLEMENTED, details: 'Unimplemented'}});
    if (!service) {
      return unimplemented();
    }
    if (!service[methodName]) {
      methodName = camelCase(methodName);
    }
    if (!service[methodName]) {
      return unimplemented();
    }

    const argArr = callOpts ? [args, metadata || {}, callOpts] : [args, metadata, callOpts].filter(arg => arg);

    try {
      time(body, `grpc request ${reqId}`);
      debug(`${serviceName}/${methodName}:\n  `, ...argArr);
      const result = await service[methodName](...argArr);
      debug(body, result);
      doResponse(res, 200, {result});
      timeEnd(body, `grpc request ${reqId}`);
    } catch (error) {
      doResponse(res, 500, {error});
      console.error(`${serviceName}/${methodName}`, error.stack);
      timeEnd(body, `grpc request ${reqId}`);
    }
  };
  return async (req, res) => {
    const reqId = reqCount++;
    try {
      time(req.body, `request ${reqId}`);
      await fn(req, res, {reqId});
      timeEnd(req.body, `request ${reqId}`);
    } catch (e) {
      console.error(e.stack);
      doResponse(req, 500, {error: e.toObject()});
      timeEnd(req.body, `request ${reqId}`);
    }
  };
};

const useRoutes = (httpProxy, grpcClient) => {
  const proxy = Router();
  proxy.post('/:serviceName/:methodName', getRouteHandler(grpcClient));
  httpProxy.use('/proxy', proxy);
};

const initHttpProxy = ({httpProxy}) => {
  if (!httpProxy) {
    httpProxy = Router();

    httpProxy.use(bodyParser.json());
    httpProxy.use(bodyParser.urlencoded({extended: false}));
  }
  return httpProxy;
};

const initGrpcClient = ({grpcClient = {}}) => {
  if (grpcClient instanceof Client) {
    return grpcClient;
  }

  const conf = grpcClient;
  try {
    ggConfig(Object.assign({grpc, protoLoader}, conf.ggConf));
  } catch (e) {
    // do nothing
  }

  const {clientConf} = conf;
  grpcClient = Client.checkoutServicesSync(clientConf);
  return grpcClient;
};

module.exports = function (conf = {}) {
  debugOn = conf.debug;
  const httpProxy = initHttpProxy(conf);
  const grpcClient = initGrpcClient(conf);
  useRoutes(httpProxy, grpcClient);
  httpProxy.grpcClient = grpcClient;
  return httpProxy;
};
