// Copyright gameboyprinter 2018
// This file handles state and incoming connections.

// node modules
const net = require("net");
const fs = require("fs");
const Client = require("./Client.js");

// globals
let messageQueue = [];
let clients = {}; // This is a map of socket names to client objects
let config;
let ipcSocket;
let ipcConnected = false;

// TODO: Default config and config import
if (fs.existsSync("../config/config.json")) {
    config = JSON.parse(fs.readFileSync("../config/config.json"));
} else {
    console.error("ERROR: No config found.");
    process.exit(1);
}

// Filter for JSON stringify, to keep socket objects out
function removeSocket(key, value) {
    if(key == "socket") return undefined;
    else return value;
}

// When a client connects, it is handled here
function clientHandler(socket) {
    let client = new Client(socket);
    clients[client.name] = client;

    // When a client sends data, it is handled here
    socket.on("data", (data) => {
        messageQueue.push(JSON.stringify({
            client: client.name,
            state: clients,
            data: data
        }, removeSocket));
        flushToIPC();
    });

    // When a client disconnects, it is handled here
    socket.on("close", () => {
        delete clients[client.name];
    });

    // Connection errors are handled here
    socket.on("error", () => {

    });
}

// Start listening...
let server = net.createServer(clientHandler);
server.listen(config.port);

tryConnect((socket) => {
    console.log("IPC connection succesful");
    ipcConnected = true;
    // Flush the message queue on a succesful connect
    flushToIPC();
});

// Try to connect to logic handler process
function tryConnect(callback) {
    // Try to connect...
    ipcSocket = connect();

    // If there is an error connection, wait 1s and retry
    ipcSocket.on("error", (e) => {
        console.log(e);
        ipcConnected = false;
        ipcSocket.destroy();
        console.log("Connection error, retrying...");
        setTimeout(tryConnect.bind(this, callback), 1000);
    });

    // Callback on succesful connection
    ipcSocket.on("connect", () => {
        callback(ipcSocket);
    });

    // Handle any data received from the other process
    ipcSocket.on("data", (data) => {
        
    });
}

function connect() {
    return new net.Socket().connect(config.ipcPort, "localhost", () => {

    });
}

function flushToIPC() {
    // If the ipc socket can receive data, write everything in the message queue to it
    if(ipcConnected){
        while(messageQueue.length > 0){
            ipcSocket.write(messageQueue.shift());
        }
    }
}