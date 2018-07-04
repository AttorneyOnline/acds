// Copyright gameboyprinter 2018
// This file contains client state and handles incoming connections.
// Data is passed via a local TCP socket to the actual logic, in a different
// process.
// This allows "hot-swappable" code, where the logic can be changed and the
// client never lose connection.
// Additionally, an auto-updater will be possible, and the server won't even go down!
// The other purpose of this file is to advertise the server on the master server.

const WebSocket = require("ws");

const Client = require("./Client");
const Config = require("./Config");

Config.init();

// Filter for JSON stringify, to keep socket objects out
// They can't be called correctly from the other process anyways
// And they have a circular reference in them, which cannot be stringified
function removeSocket(key, value) {
    if (key === "socket") return undefined;
    else return value;
}

class ConnectionHandler {
    constructor() {
        // A message queue ensures reliable data transmission even when the
        // other process crashes
        this.messageQueue = [];

        // This is a map of socket names to client objects
        this.clients = {};

        // Socket object representing the IPC TCP connection
        this.ipcSocket = null;

        // Is the IPC socket connected?
        this.ipcConnected = false;
    }

    start() {
        // Start WebSocket listener
        this.WSserver = new WebSocket.Server({ port: Config.get("port") });
        this.WSserver.on("connection", (socket) => {
            this.clientHandlerWebsocket(socket);
        });

        // This is the call to the tryConnect method.
        // The callback flushes the current message queue
        this.tryConnect((socket) => {
            console.log("IPC connection successful");
            this.ipcConnected = true;
            // Send the newly connected logic process the clients states
            this.messageQueue.push(JSON.stringify({
                client: "all",
                clients: this.clients,
                event: "clients"
            }, removeSocket));

            // Flush the message queue on a successful connect
            this.flushToIPC();
        });
    }

    async stop() {
        return new Promise((resolve, reject) => {
            this.WSserver.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // When a websocket client connects, it is handled here
    clientHandlerWebsocket(socket) {
        let client = new Client(socket, true);
        this.client[client.name] = client;
        this.messageQueue.push(JSON.stringify({
            client: client.name,
            event: "connected"
        }, removeSocket));
        this.flushToIPC();

        // When a client sends data, it is handled here
        socket.on("data", (data) => {
            this.messageQueue.push(JSON.stringify({
                client: client.name,
                data: data,
                event: "data"
            }, removeSocket));
            this.flushToIPC();
        });

        // When a client disconnects, it is handled here
        socket.on("close", () => {
            delete this.client[client.name];
            this.messageQueue.push(JSON.stringify({
                client: client.name,
                event: "disconnected"
            }, removeSocket));
            this.flushToIPC();
        });

        // Connection errors are handled here
        socket.on("error", (e) => {
            if (Config.get("developer")) {
                console.error(e);
            }
        });
    }

    // When a non-websocket client connects, it is handled here
    clientHandler(socket) {
        let client = new Client(socket, false);
        this.client[client.name] = client;
        this.messageQueue.push(JSON.stringify({
            client: client.name,
            event: "connected"
        }, removeSocket));
        this.flushToIPC();

        // When a client sends data, it is handled here
        socket.on("data", (data) => {
            this.messageQueue.push(JSON.stringify({
                client: client.name,
                data: data,
                event: "data"
            }, removeSocket));
            this.flushToIPC();
        });

        // When a client disconnects, it is handled here
        socket.on("close", () => {
            delete this.client[client.name];
            this.messageQueue.push(JSON.stringify({
                client: client.name,
                event: "disconnected"
            }, removeSocket));
            this.flushToIPC();
        });

        // Connection errors are handled here
        socket.on("error", (e) => {
            if (Config.get("developer")) {
                console.error(e);
            }
        });
    }

    // Handle incoming IPC messages
    ipcHandler(data) {
        let message = JSON.parse(data.toString());
        console.log(message);
        // Invokes method with the same name as the IPC event in the respective
        // client, and the argument is the IPC data.
        // When writing IPC messages, keep in mind that event directly
        // corresponds to the method name in the Client object,
        // and that the data directly corresponds to the arguments for said
        // method.
        // If the client doesn't exist, just do nothing.
        if (typeof this.client[message.client] === "undefined") {
            return;
        }
        // The broadcast event is special, it isnt invoked on the client object
        if (message.action === "broadcast") {
            this.client.forEach((client) => {
                client.send(message.data);
            });
        }
        // Otherwise, if the event doesn't exist, ignore it
        if (typeof this.client[message.client][message.action] === "undefined") {
            return;
        }
        this.client[message.client][message.event](message.data);
    }

    // Try to connect to logic handler process
    tryConnect(callback) {
        // Try to connect...
        this.ipcSocket = new WebSocket(`ws://localhost:${Config.get("ipcPort")}`);

        // If connection is closed, wait 1s and retry
        this.ipcSocket.on("close", () => {
            // If the connection used to be open, notify the user that it has been lost.
            if (this.ipcConnected) {
                console.error("Connection error, retrying...");
            }
            this.ipcConnected = false;
            setTimeout(this.tryConnect.bind(this, callback), 1000);
        });

        // Handle errors
        this.ipcSocket.on("error", (e) => {
        });

        // Callback on succesful connection
        this.ipcSocket.on("open", () => {
            callback(this.ipcSocket);
        });

        // Handle any data received from the other process
        this.ipcSocket.on("message", this.ipcHandler);
    }

    // This iterates through the message queue, removing each entry, and
    // writing it to the IPC socket
    flushToIPC() {
        // If the ipc socket can receive data, write everything in the message
        // queue to it
        if (this.ipcConnected) {
            while (this.messageQueue.length > 0) {
                this.ipcSocket.send(this.messageQueue.shift());
            }
        }
    }
}

module.exports = ConnectionHandler;
