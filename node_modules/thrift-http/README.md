# nodejs-thrift-http
nodejs thrift library, http supported

#Install#
```
npm install thrift-http
```

#Important#
In your generated code(e.g: gen-nodejs/*.js), replace
```
var Thrift = require('thrift').Thrift; 
```
with
```
var Thrift = require('thrift-http').Thrift;
```

#Usage#
```
var thrift = require('thrift-http');
var helloSvc = require('./gen-nodejs/helloSvc.js');

var options = {
   transport: thrift.TBufferedTransport,
   protocol: thrift.TJSONProtocol,
   path: "/hello",
   headers: {"Connection": "close"}
};

var connection = thrift.createHttpConnection("localhost", 9090, options);
var client = thrift.createHttpClient(helloSvc, connection);

client.getMessage("Thurston Howell", function(error, result) {
  console.log("Msg from server: " + result);
});
```
