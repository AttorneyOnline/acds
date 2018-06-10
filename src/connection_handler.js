// Copyright gameboyprinter 2018
// This file contains state and handles incoming connections.
// Data is passed via a local TCP socket to the actual logic, in a different process
// This allows "hot-swappable" code, where the logic can be changed and the clients never lose connection
// Additionally, an auto-updater will be possible, and the server won't even go down!

// imports
const net = require("net");
const WebSocket = require('ws');
const fs = require("fs");
const Client = require("./Client.js");

// globals
let messageQueue = []; // A message queue ensures reliable data transmission even when the other process crashes
let clients = {}; // This is a map of socket names to client objects
let config; // JSON-Parsed config object
let ipcSocket; // Socket object representing the IPC TCP connection
let ipcConnected = false; // Is the IPC socket connected?

// TODO: Default config and config import
if (fs.existsSync("../config/config.json")) {
    config = JSON.parse(fs.readFileSync("../config/config.json"));
} else {
    console.error("ERROR: No config found.");
    process.exit(1);
}

// Filter for JSON stringify, to keep socket objects out
// They can't be called correctly from the other process anyways
// And they have a circular reference in them, which cannot be stringified
function removeSocket(key, value) {
    if(key == "socket") return undefined;
    else return value;
}

// When a client connects, it is handled here
function clientHandler(socket) {
    let client = new Client(socket);
    clients[client.name] = client;

    // When a client sends data, it is handled here
    socket.on("message", (data) => {
        messageQueue.push(JSON.stringify({
            client: client.name,
            clients: clients,
            data: data
        }, removeSocket));
        flushToIPC();
    });

    // When a client disconnects, it is handled here
    socket.on("close", () => {
        delete clients[client.name];
    });

    // Connection errors are handled here
    socket.on("error", (e) => {
    });
}

// Handle incoming IPC messages
function ipcHandler(data){
    let message = JSON.parse(data.toString());
    if(message.action == "send"){
        clients[message.client].send(message.data);
    }
}

// Try to connect to logic handler process
function tryConnect(callback) {
    // Try to connect...
    ipcSocket = connect();

    // If there is an error connection, wait 1s and retry
    ipcSocket.on("error", (e) => {
        ipcConnected = false;
        ipcSocket.destroy();
        console.error("Connection error, retrying...");
        setTimeout(tryConnect.bind(this, callback), 1000);
    });

    // Callback on succesful connection
    ipcSocket.on("connect", () => {
        callback(ipcSocket);
    });

    // Handle any data received from the other process
    ipcSocket.on("data", ipcHandler);
}

// Used to create a socket connection object.
function connect() {
    return new net.Socket().connect(config.ipcPort, "localhost", () => {
    });
}

// This iterates through the message queue, removing each entry, and writing it to the IPC socket
function flushToIPC() {
    // If the ipc socket can receive data, write everything in the message queue to it
    if(ipcConnected){
        while(messageQueue.length > 0){
            ipcSocket.write(messageQueue.shift());
        }
    }
}

// Start listening...
let server = new WebSocket.Server({port: config.port});
server.on("connection", clientHandler);

// This is the call to the tryConnect method.
// The callback flushes the current message queue
tryConnect((socket) => {
    console.log("IPC connection succesful");
    ipcConnected = true;
    // Flush the message queue on a succesful connect
    flushToIPC();
});
