var EventEmitter = require('events').EventEmitter;
var socketioServer = require('socket.io');
var socketioClient = require('socket.io-client');
var http = require('http');

var Logger = require('./logger');
var Config = require('./config');

var Connector = function() {
    EventEmitter.call(this);

    this.binded = false;
};

Connector.prototype = Object.create(EventEmitter.prototype);

Connector.prototype.listenAsWorker = function() {
    // Bind socket port
    // broadcasts to web(s)

    var self = this;

    if(this.binded) return;

    var sillyMiddleware = function(req,res) {
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end("Worker empty http server");
    };
    var server = http.createServer(sillyMiddleware);
    server.listen(Config.workerPort, () => {
        Logger.info(`Server listen on ${Config.workerPort}`);
    });

    var io = socketioServer(server);

    io.on('connect', function(socket) {
        Logger.info('New webserver connected');

        self.emit('newsocket');

        socket.on('disconnect', function() {
            Logger.info('Webserver disconnected');
        });
    });


    this.on('event', function(data) {
        io.emit('event', data);
    });

    this.binded = true;
};

Connector.prototype.listenAsWeb = function(callback) {
    // Connect to worker socket
    // On server socket, emit

    if(this.binded) return;

    var self = this;

    var connectionConfig = {
        reconnection: true,
        reconnectionAttempts: 5,
        timeout: 10000
    };

    var serverSocket = socketioClient('http://' + Config.workerUrl + ':' + Config.workerPort, connectionConfig);

    serverSocket.on('connect', function() {
        Logger.info("Successfuly connected to worker");

        serverSocket.on('event', function(data) {
            self.emit('event', data);
        });

        self.binded = true;

        serverSocket.on('disconnect', function() {
            Logger.warning("Worker disconnected, shutting down ...");

            process.exit(0);
        });

        callback(null);
    });

    serverSocket.on('reconnect_attempt', function() {
        Logger.warning("Connection lost, trying to reconnect...");
    });
    serverSocket.on('reconnect', function() {
        Logger.info("Reconnected to worker");
    });

    serverSocket.on('connect_error', function(error) {
        callback(error);
    });
};

module.exports = function() {
    return new Connector();
};