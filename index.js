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

const getRouteHandler = grpcClient => {
  const fn = async (req, res) => {
    let {serviceName, methodName} = req.params;
    const {args, metadata, callOpts} = req.body;
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
      const result = await service[methodName](...argArr);
      console.log(result);
      doResponse(res, 200, {result});
    } catch (error) {
      doResponse(res, 500, {error});
      console.error(`${serviceName}/${methodName}`, error.stack);
    }
  };
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error(e.stack);
      doResponse(req, 500, {error: e.toObject()});
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
  const httpProxy = initHttpProxy(conf);
  const grpcClient = initGrpcClient(conf);
  useRoutes(httpProxy, grpcClient);
  httpProxy.grpcClient = grpcClient;
  return httpProxy;
};
