// Copyright gameboyprinter 2018
// Incoming data from the connection handling process is sent here via local TCP
// This process takes care of all the logic and processing, and ideally is the
// only part that should be changed. Changes to the other process should be rare,
// as it requires dropping every client and a loss of service.

// imports
const WebSocket = require("ws");

const Config = require("./Config");
Config.init();

const argv = require("minimist")(process.argv.slice(2), {
    alias: {
        h: "help",
        v: "version"
    }
});

if (argv.help) {
    console.log(
        "Usage: node ./src/index.js [option...]",
        "\nOptions: \n",
        "  -h, --help             give this help list and exit \n",
        "  -v, --version          print program version and exit \n",
        "  -c, --config=FILE      use FILE as configuration file, \n",
        "                         default configuration file is ./config/config.json \n"
        // "  -w, --warning=LEVEL    set warning level to LEVEL \n"
    );
    process.exit(0);
}

if (argv.version) {
    const pjson = require("../package.json");
    console.log(`acds - Animated Chatroom Dedicated Server, version ${pjson.version}`);
    process.exit(0);
}

// globals
let clients = [];

class Server {
    constructor() {
        this.server = null;
    }

    async start(port = Config.get("port")) {
        if (this.server) {
            throw new Error("Server is already running");
        }

        return new Promise(resolve => {
            // Create IPC listen server
            this.server = new WebSocket.Server({ port: port }, () => resolve());
            this.server.on("connection", (socket) => this._ipcListener(socket));
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

    _ipcListener(socket) {
        this._ipcSocket = socket;

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
                console.error(`Received:\n${input}`);
                return;
            }

            switch (input.event) {
            case "connected":
                // Client connected
                clients[input.client.name] = input.client;
                break;
            case "disconnected":
                // Client disconnected
                // If client doesn't exist, do nothing
                if (typeof clients[input.client.name] === "undefined") {
                    return;
                }
                delete clients[input.client.name];
                break;
            case "clients":
                // List of clients, sent on reconnect, as logic process probably lost its state
                // Make sure client list is actually included, otherwise do nohing
                if (typeof input.clients === "undefined") {
                    return;
                }
                clients = input.clients;
                break;
            case "data":
                // Client message received
                // If data is undefined or empty, do nothing
                if (!input.data) {
                    return;
                }
                clients[input.client.name].onData(input.data);
                break;
            }
        });
    }
}

module.exports = Server;
