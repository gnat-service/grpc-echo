# grpc-echo

A http proxied client which helps you debug your grpc backend without reflection.

Not Support stream yet.

## Usage

**.proto/gender.proto:**

```
syntax = "proto3";

package gnat.gender;

enum Gender {
    MALE = 0;
    FEMALE = 1;
}
```

**.proto/helloworld.proto:**

```
syntax = "proto3";

import "gender.proto";

package gnat.helloworld;

// The greeting service definition.
service Greeter {
    // Sends a greeting
    rpc SayHello (HelloRequest) returns (HelloReply) {}

    rpc ThrowAnErr (HelloRequest) returns (HelloReply) {}
}

// The request message containing the user's name.
message HelloRequest {
    Position position = 0;
    string name = 1;
    gnat.gender.Gender gender = 2;
}

// The response message containing the greetings
message HelloReply {
    string message = 1;
}

enum Position {
    ADMIN = 0;
    DEVELOPER = 1;
    REPORTER = 2;
}
```

proxy.js:

```js
const express = require('express');
const watcher = require('grpc-echo');

const app = express();

const clientConf = {
  bindPath: `localhost:50051`,
  services: [
    {filename: 'helloworld.proto'},
  ]
};

const root = '/'; // or '/<someOtherRoot>'

proxy = watcher({grpcClient: {ggConf: {root: '.proto'}, clientConf});
app.use(root, proxy);

app.listen(3000);
```

client.js:

```js
const {body} = await = request.post({
  url: `localhost:3000/proxy/gnat.helloworld.Greeter/SayHello`, // '<host>:<port>/<rootUrl>/proxy/<servicePath>/<methodName>'
  body: {args: {name: 'World'}, /* metadata: {}, callOpts: {} */},
});
// {message:"Hello World"}
```
