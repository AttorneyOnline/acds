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

// TODO: Default config and config import
if(fs.existsSync("../config/config.json")) {
    config = JSON.parse(fs.readFileSync("../config/config.json"));
}
else{
    console.error("ERROR: No config found.");
    process.exit(1);
}

// When a client connects, it is handled here
function clientHandler(socket) {
    let client = new Client(socket);
    clients[client.name] = client;

    socket.on('data', dataHandler);
}

// When a client sends data, it is handled here
function dataHandler(data) {
    console.log(data.toString());
}

// Start listening...
let server = net.createServer(clientHandler);
server.listen(config.port);