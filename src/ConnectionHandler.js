// Copyright gameboyprinter 2018
// This file contains client state and handles incoming connections.
// Data is passed via a local TCP socket to the actual logic, in a different
// process.
// This allows "hot-swappable" code, where the logic can be changed and the
// client never lose connection.
// Additionally, an auto-updater will be possible, and the server won't even go down!
// The other purpose of this file is to advertise the server on the master server.

const WebSocket = require("ws");
const ipc = require("node-ipc");
const async = require("async");

const Config = require("./Config");

Config.init();

ipc.config.networkPort = Config.get("ipcPort");
ipc.config.id = "acds";
ipc.config.silent = true;

class ConnectionHandler {
    constructor() {
        // A message queue ensures reliable data transmission even when the
        // other process crashes
        this.sendQueue = async.queue((data, cb) => {
            // There is no way of checking if we are connected so just
            // catch and put it back in the queue if a bad happens.
            try {
                this.ipcSocket.emit(data.type, data);
            } catch (err) {
                console.error(err);
                this.sendQueue.unshift(data);
            }
            cb();
        });
        this.sendQueue.pause();

        // This is a map of socket names to socket objects
        this.sockets = {};

        // Socket object representing the IPC TCP connection
        this.ipcSocket = null;

        // Is the IPC socket connected?
        this.ipcConnected = false;
    }

    async start(port = Config.get("port")) {
        // Start WebSocket listener
        await new Promise(resolve => {
            this.WSserver = new WebSocket.Server({ port: port }, () => {
                resolve();
            });
        });

        this.WSserver.on("connection", (socket) => {
            this.clientHandlerWebsocket(socket);
        });

        await this.connect();
    }

    async stop() {
        ipc.disconnect("acds");
        return new Promise((resolve, reject) => {
            this.WSserver.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // When a websocket client connects, it is handled here
    clientHandlerWebsocket(socket) {
        const name = `${socket._socket.remoteAddress}:${socket._socket.remotePort}`;
        this.sockets[name] = socket;
        this.sendQueue.push(JSON.stringify({
            type: "client-connected",
            client: name
        }));

        // When a client sends data, it is handled here
        socket.on("data", (data) => {
            this.sendQueue.push(JSON.stringify({
                type: "client-data",
                client: name,
                data: data
            }));
        });

        // When a client disconnects, it is handled here
        socket.on("close", () => {
            delete this.sockets[name];
            this.sendQueue.push(JSON.stringify({
                event: "client-disconnect",
                client: name
            }));
        });

        // Connection errors are handled here
        socket.on("error", (e) => {
            if (Config.get("developer")) {
                console.error(e);
            }
        });
    }

    async _startConnection() {
        return new Promise(resolve => {
            ipc.connectToNet("acds", Config.get("ipcPort"), () => {
                this.ipcSocket = ipc.of.acds;
                this.ipcSocket.on("connect", () => {
                    resolve();
                });
            });
        });
    }

    // Try to connect to logic handler process
    async connect() {
        // Try to connect
        await this._startConnection();

        // node-ipc will try to reconnect automatically
        this.ipcSocket.on("error", () => {
            if (this.ipcConnected) {
                console.error("Connection error, retrying...");
            }
            this.ipcConnected = false;
            this.sendQueue.pause();
        });

        // Handle any data received from the other process
        this.ipcSocket.on("client-data", (msg) => {
            this.sockets[msg.client].send(msg.data);
        });

        this.ipcSocket.on("client-disconnect", (msg) => {
            this.sockets[msg.client].close();
        });

        this.ipcSocket.on("client-broadcast", (msg) => {
            this.sockets.forEach((socket) => {
                socket.send(msg.data);
            });
        });

        this.ipcConnected = true;
        this.sendQueue.resume();
    }
}

module.exports = ConnectionHandler;
