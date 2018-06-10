// Copyright gameboyprinter 2018
// Incoming data from the connection handling process is sent here via local TCP
// This process takes care of all the logic and processing, and ideally is the only part that should be changed
// Changes to the other process should be rare, as it requires dropping every client and a loss of service

// imports
const net = require("net");
const WebSocket = require('ws');
const ConfigManager = require("./config.js");

// globals
let clients;
let config = new ConfigManager();
let ipcSocket;

function ipcListener(socket){
    ipcSocket = socket;

    socket.on("message", (data) => {
        try{
            let input = JSON.parse(data);
        } catch (e) {
            console.error("Invalid IPC!");
            return;
        }
        clients = input.clients;
        ipcHandler(input.clients[input.client], Buffer.from(input.data));
    });
}

// Handles incoming IPC data
function ipcHandler(client, data) {
    // Just some dummy test stuff for now
    let response = {
        action: "send",
        client: client.name,
        data: `echo: ${data.toString()}`
    }
    ipcSocket.send(JSON.stringify(response));

    client.randomProperty = "abc123";

    response = {
        action: "update",
        client: client.name,
        data: client
    }
    ipcSocket.send(JSON.stringify(response));
}

// Create IPC listen server
let server = new WebSocket.Server({
    port: config.ipcPort
});
server.on("connection", ipcListener);