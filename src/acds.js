// Copyright gameboyprinter 2018
// Incoming data from the connection handling process is sent here via local TCP
// This process takes care of all the logic and processing, and ideally is the only part that should be changed
// Changes to the other process should be rare, as it requires dropping every client and a loss of service

// imports
const net = require("net");
const WebSocket = require("ws");
const events = require("events");
const ConfigManager = require("./config.js");

// globals
let clients = [];
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
            console.error("Received: ")
            console.error(input);
            return;
        } else if (input.event == "connected") {
            // Client connected
            clients[input.client.name] = input.client;
        } else if (input.event == "disconnected") {
            // Client disconnected
            // If client doesn't exist, do nothing
            if (typeof clients[input.client.name] === "undefined") {
                return;
            }
            delete clients[input.client.name];
        } else if (input.event == "clients") {
            // List of clients, sent on reconnect, as logic process probably lost its state
            // Make sure client list is actually included, otherwise do nohing
            if (typeof input.clients === undefined) {
                return;
            }
            clients = input.clients;
        } else if (input.event == "data") {
            // Client message received
            // If data is undefined, do nothing
            if (typeof input.data === undefined) {
                return;
            }
            // If data is empty, do nothing
            if (input.data.length == 0) {
                return;
            }
        }
    });
}

class Server {
    constructor() {
        this.server = null;
    }

    async start(port = config.port) {
        if (this.server) {
            throw new Error("Server is already running");
        }

        return new Promise(resolve => {
            // Create IPC listen server
            this.server = new WebSocket.Server({ port: port }, () => resolve());
            this.server.on("connection", ipcListener);
        });
    }

    async stop() {
        if (!this.server) {
            throw new Error("Server is not running");
        }

        return new Promise(resolve => {
            this.server.close(() => resolve());
            this.server = null;
        });
    }
}

module.exports = Server;