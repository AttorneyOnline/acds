// Copyright gameboyprinter 2018
// Incoming data from the connection handling process is sent here via local TCP
// This process takes care of all the logic and processing, and ideally is the only part that should be changed
// Changes to the other process should be rare, as it requires dropping every client and a loss of service

// imports
const net = require("net");
const fs = require("fs");

// globals
let config;
let clients;
let ipcSocket;

// TODO: Default config and config import
if (fs.existsSync("../config/config.json")) {
    config = JSON.parse(fs.readFileSync("../config/config.json"));
} else {
    console.error("ERROR: No config found.");
    process.exit(1);
}

// Creates a local TCP server for the purpose of handling IPC messages
let ipcListener = net.createServer((socket) => {
    ipcSocket = socket;

    socket.on('data', (data) => {
        let input = JSON.parse(data);
        clients = input.clients;
        ipcHandler(input.client, Buffer.from(input.data));
    });
}).listen(config.ipcPort, "localhost");

// Handles incoming IPC data
function ipcHandler(client, data) {
    console.log(client);
    console.log(data.toString());

    let response = {
        action: "send",
        client: client,
        data: "youre mom gay"
    }
    ipcSocket.write(JSON.stringify(response));
}