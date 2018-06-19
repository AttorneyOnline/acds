// Copyright gameboyprinter 2018
// This file contains client state and handles incoming connections.
// Data is passed via a local TCP socket to the actual logic, in a different process
// This allows "hot-swappable" code, where the logic can be changed and the clients never lose connection
// Additionally, an auto-updater will be possible, and the server won't even go down!
// The other purpose of this file is to advertise the server on the master server.

// imports
const net = require("net");
const WebSocket = require('ws');
const Client = require("./client.js");
const ConfigManager = require("./config.js");
const protocol = require("./protocol.js");

// globals
let messageQueue = []; // A message queue ensures reliable data transmission even when the other process crashes
let clients = {}; // This is a map of socket names to client objects
let config = new ConfigManager(); // Object of config settings
let ipcSocket; // Socket object representing the IPC TCP connection
let ipcConnected = false; // Is the IPC socket connected?

// Filter for JSON stringify, to keep socket objects out
// They can't be called correctly from the other process anyways
// And they have a circular reference in them, which cannot be stringified
function removeSocket(key, value) {
    if (key == "socket") return undefined;
    else return value;
}

// When a websocket client connects, it is handled here
function clientHandlerWebsocket(socket) {
    let client = new Client(socket, true);
    clients[client.name] = client;
    messageQueue.push(JSON.stringify({
        client: client.name,
        event: "connected"
    }, removeSocket));
    flushToIPC();

    // When a client sends data, it is handled here
    socket.on("data", (data) => {
        messageQueue.push(JSON.stringify({
            client: client.name,
            data: data,
            event: "data"
        }, removeSocket));
        flushToIPC();
    });

    // When a client disconnects, it is handled here
    socket.on("close", () => {
        delete clients[client.name];
        messageQueue.push(JSON.stringify({
            client: client.name,
            event: "disconnected"
        }, removeSocket));
        flushToIPC();
    });

    // Connection errors are handled here
    socket.on("error", (e) => {
        if(config.developer){
            console.error(e);
        }
    });
}

// When a non-websocket client connects, it is handled here
function clientHandler(socket) {
    let client = new Client(socket, false);
    clients[client.name] = client;
    messageQueue.push(JSON.stringify({
        client: client.name,
        event: "connected"
    }, removeSocket));
    flushToIPC();

    // When a client sends data, it is handled here
    socket.on("data", (data) => {
        messageQueue.push(JSON.stringify({
            client: client.name,
            data: data,
            event: "data"
        }, removeSocket));
        flushToIPC();
    });

    // When a client disconnects, it is handled here
    socket.on("close", () => {
        delete clients[client.name];
        messageQueue.push(JSON.stringify({
            client: client.name,
            event: "disconnected"
        }, removeSocket));
        flushToIPC();
    });

    // Connection errors are handled here
    socket.on("error", (e) => {
        if(config.developer){
            console.error(e);
        }
    });
}

// Handle incoming IPC messages
function ipcHandler(data) {
    let message = JSON.parse(data.toString());
    console.log(message);
    // Invokes method with the same name as the IPC event in the respective client, and the argument is the IPC data
    // When writing IPC messages, keep in mind that event directly corresponds to the method name in the Client object
    // And that the data directly corresponds to the arguments for said method.
    // If the client doesn't exist, just do nothing.
    if(typeof clients[message.client] === "undefined") {
        return;
    }
    // The broadcast event is special, it isnt invoked on the client object
    if(message.action == "broadcast"){
        clients.forEach((client) => {
            client.send(message.data);
        });
    }
    // Otherwise, if the event doesn't exist, ignore it
    if(typeof clients[message.client][message.action] === "undefined"){
        return;
    }
    clients[message.client][message.event](message.data);
}

// Try to connect to logic handler process
function tryConnect(callback) {
    // Try to connect...
    ipcSocket = new WebSocket(`ws://localhost:${config.ipcPort}`);

    // If connection is closed, wait 1s and retry
    ipcSocket.on("close", () => {
        // If the connection used to be open, notify the user that it has been lost.
        if(ipcConnected){
            console.error("Connection error, retrying...");
        }
        ipcConnected = false;
        setTimeout(tryConnect.bind(this, callback), 1000);
    })

    // Handle errors
    ipcSocket.on("error", (e) => {
    });

    // Callback on succesful connection
    ipcSocket.on("open", () => {
        callback(ipcSocket);
    });

    // Handle any data received from the other process
    ipcSocket.on("message", ipcHandler);
}

// This iterates through the message queue, removing each entry, and writing it to the IPC socket
function flushToIPC() {
    // If the ipc socket can receive data, write everything in the message queue to it
    if (ipcConnected) {
        while (messageQueue.length > 0) {
            ipcSocket.send(messageQueue.shift());
        }
    }
}

// Start WebSocket listener
let WSserver = new WebSocket.Server({
    port: config.webAOPort
});
WSserver.on("connection", clientHandlerWebsocket);

let server = net.createServer(clientHandler);
server.listen(config.port);

// This is the call to the tryConnect method.
// The callback flushes the current message queue
tryConnect((socket) => {
    console.log("IPC connection succesful");
    ipcConnected = true;
    // Send the newly connected logic process the clients states
    messageQueue.push(JSON.stringify({
        client: "all",
        clients: clients,
        event: "clients"
    }, removeSocket));
    // Flush the message queue on a succesful connect
    flushToIPC();
});