/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var user = require('./routes/user');
var http = require('http');
var path = require('path');
var urlUtil = require('url');

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/users', user.list);

//    mine
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
// use env configure for production. https://github.com/LearnBoost/Socket.IO/wiki/Configuring-Socket.IO
    io.enable('browser client minification');  // send minified client
    io.enable('browser client etag');          // apply etag caching logic based on version number
    io.enable('browser client gzip');          // gzip the file
    io.set('log level', 1);                    // reduce logging
    // no flashsocket
    io.set('transports', [
        'websocket'
        , 'flashsocket'
        , 'htmlfile'
        , 'xhr-polling'
        , 'jsonp-polling'
    ]);

var redis = require('redis');

// TODO level4 check is there any Pool implementation
//redis.debug_mode = true;
var client = redis.createClient();
client.on("error", function (err) {
    console.log("error event - " + client.host + ":" + client.port + " - " + err);
});


/*var users = {
    'userA@example.com': [socket object],
    'userB@example.com': [socket object]
}*/
// user; deviceList -> deviceId, socket
// need to test how large JS object can support, this map can be replaced by other client
// http://stackoverflow.com/questions/4647348/send-message-to-specific-client-with-socket-io-and-node-js
var userMap ={};

server.listen(app.get('port'),function(){
    console.log('app listening on port ' + app.get('port'));
});

//测试时候通过url中的uid获取用户id,https://github.com/LearnBoost/socket.io/wiki/Authorizing
// TODO: on disconnect, remove connect in user map or wait for re-connect?
io.sockets.on('connection', function (socket) {
    // here can send back something like server info , master slave
    socket.emit('first', { hello: 'world' });

    socket.on('updateDevice', function(data){
        console.log('data from client-->:' + data);
        if (!data) return; // TODO add exception handling

        var url = urlUtil.parse(data.url, true);
        var uid = url.query.uid;

        if (uid) {
            console.log('get uid from url ->' + uid)
        } else {
            console.log("user name not found, need to processing later,set to 1 as default");
            uid = 1;
        }
        // is there  no need to use socket set while sys has cached socket in memory
        // note: number can't be key in map
        uid = uid.toString();

        socket.set('uid', uid);

        var deviceId = data.deviceId.toString();
        console.log("deviceId =>" +deviceId);
        // TODO deviceID can not be null, add a validate method?
        // update always, not hsetnx; th: if the server is down, client re-connect, this will always update DB, is db necessary?
        client.hset('socket:'+uid, deviceId, socket.id, redis.print);

    })

    // broker the message to all socket which have the same uid?
    socket.on('message', function (data) {
        // !! get all sockets
        // all clients on a namespace io.of('/chat').clients();
        var allSocket = io.sockets.clients();
        console.log("clients numbers: " + allSocket.length);
        console.log('received  page message------> ' +  JSON.stringify(data));

        socket.get('uid', function(err, uid){
            // hgetall can return KV pair
            client.hvals('socket:'+uid, function(err, socketIds){
                // handle err
                console.log(" socket lenght:" + socketIds.length);
                socketIds.forEach(function (socketId, i) {
                    console.log("    ------------------" + i + ": " + socketId);
                    if(socket.id != socketId){
                        io.sockets.socket(socketId).emit('msg', data);
                        //io.sockets[socketId].emit('msg', data);
                    }

                });
            });
        })

    });
});

// socket 添加一个user属性？
// 然后创建一个mapping，user中包含了哪些socket connection


// 添加一个扫描器，定期稍慢死链接，释放资源，清数据库。