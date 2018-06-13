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

function ipcListener(socket) {
    ipcSocket = socket;

    // Validate incoming IPC data from client, and then pass it to the handler
    socket.on("message", (data) => {
        let input;
        try {
            input = JSON.parse(data);
        } catch (e) {
            console.error("Invalid IPC: Not valid JSON");
            return;
        }
        if (typeof input === "undefined" || typeof input.client === "undefined" || typeof input.event === "undefined") {
            console.error("Invalid IPC: Required fields not defined");
            return;
        }
        else if(input.event == "connected") {
            // client connected, dispatch event
        }
        else if(input.event == "disconnected") {
            // client disconnected, dispatch event
        }
        else if(input.event == "data") {
            // client sent data, dispatch event
        }
    });
}

// Create IPC listen server
let server = new WebSocket.Server({
    port: config.ipcPort
});
server.on("connection", ipcListener);