// Copyright gameboyprinter 2018
// Incoming data from the connection handling process is sent here via local TCP
// This process takes care of all the logic and processing, and ideally is the
// only part that should be changed. Changes to the other process should be rare,
// as it requires dropping every client and a loss of service.

// imports
const fs = require("fs");
const ipc = require("node-ipc");

const Client = require("./Client");
const Config = require("./Config");

Config.init();

ipc.config.networkPort = Config.get("ipcPort");
ipc.config.silent = false;

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

class Server {
    constructor() {
        this.server = null;
        this.clients = {};
        this.rooms = {};
    }

    toJSON() {
        const keys = ["clients"];
        const wanted = {};
        keys.forEach((val, _key) => {
            wanted[val] = this[val];
        }, this);
        return wanted;
    }

    async start(persistent = false) {
        if (this.server) {
            throw new Error("Server is already running");
        }

        return new Promise(resolve => {
            // Create IPC listen server
            ipc.serveNet(() => {
                this.server = ipc.server;
                ipc.server.on("client-connect",
                    (data, socket) => this._onClientConnect(data, socket));
                ipc.server.on("client-disconnect",
                    (data) => this._onClientDisconnect(data));
                ipc.server.on("client-data",
                    (data) => this._onClientData(data));
                ipc.server.on("socket.disconnected",
                    (socket, _socketId) => this._onIPCDisconnect(socket));
                resolve();
            });
            ipc.server.start();
        });
    }

    async stop(persist = false) {
        if (!this.server) {
            throw new Error("Server is not running");
        }

        if (persist) {
            await persist();
        }

        this.server.stop();
        this.server = null;
    }

    /**
     * Persists all server state information to a file in preparation for
     * a hotswap.
     */
    async persist() {
        return new Promise((resolve, reject) => {
            fs.writeFile(Config.get("persistenceFile"), JSON.stringify(this), (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /** Restores all server state information from a persistence file. */
    async restore() {
        await new Promise((resolve, reject) => {
            fs.readFile(Config.get("persistenceFile"), (err, data) => {
                if (err) reject(err);
                else {
                    Object.apply(this, JSON.parse(data));
                    // I'll hardcode this for now, but the essence of this
                    // is to reinstantiate everything in the persistence file.
                    for (let clientId in this.clients) {
                        const client = this.clients[clientId];
                        this.clients[clientId] = Client.fromPersistence(this, client);
                    }
                    resolve();
                }
            });
        });
    }

    send(clientAddr, data) {
        this.server.emit("client-data", { client: clientAddr, data: data });
    }

    disconnect(clientAddr) {
        this.server.emit("client-disconnect", { client: clientAddr });
    }

    broadcast(data) {
        this.server.emit("client-broadcast", { data: data });
    }

    _onClientConnect(msg, ipcSocket) {
        const client = new Client(msg.client, this);
        this.clients[msg.client] = client;
        this.ipcOrigin = ipcSocket;
    }

    _onClientDisconnect(msg) {
        this.clients[msg.client].cleanup();
        delete this.clients[msg.client];
    }

    _onClientData(msg) {
        this.clients[msg.client].onData(msg.data);
    }

    _onIPCDisconnect(ipcSocket) {
        // If the IPC socket (connection handler) disconnected, we can assume
        // that it probably crashed, meaning all of the clients on that handler
        // were disconnected!
        for (let clientId in this.clients) {
            const client = this.client[clientId];
            if (client.ipcOrigin === ipcSocket) {
                client.cleanup();
                delete this.client[clientId];
            }
        }
    }
}

module.exports = Server;
