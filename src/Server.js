// Copyright gameboyprinter 2018
// Incoming data from the connection handling process is sent here via local TCP
// This process takes care of all the logic and processing, and ideally is the
// only part that should be changed. Changes to the other process should be rare,
// as it requires dropping every client and a loss of service.

// imports
const fs = require("fs");
const WebSocket = require("ws");
const EventEmitter = require("events").EventEmitter;
const msgpack = require("msgpack-lite");

const Config = require("./Config");
const Client = require("./Client");
const Room = require("./Room");

class Server extends EventEmitter {
    constructor() {
        super();
        this.server = null;
        this.clients = {};
        this.rooms = {};
    }

    get playerCount() {
        return Object.values(this.clients)
            .reduce((prev, client) => prev + (client.room ? 1 : 0), 0);
    }

    toJSON() {
        const keys = ["clients", "rooms"];
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

        // Load rooms from config
        const rooms = Config.get("rooms");
        Object.keys(rooms).forEach(roomId => {
            this.rooms[roomId] = new Room(this, rooms[roomId]);
        });

        // TODO: restore from persistence

        // Start accepting connections
        return new Promise(resolve => {
            // Create IPC listen server
            this.server = new WebSocket.Server({ port: Config.get("ipcPort") }, () => {
                resolve();
            });

            this.server.on("connection", (socket) => {
                socket.on("message", (data) => {
                    const msg = msgpack.decode(data);
                    this.emit(msg.type, msg, socket);
                });

                socket.on("close", () => this._onIPCDisconnect(socket));
            });

            this.on("client-connect",
                (data, socket) => this._onClientConnect(data, socket));
            this.on("client-disconnect",
                (data) => this._onClientDisconnect(data));
            this.on("client-data",
                (data) => this._onClientData(data));
        });
    }

    async stop(persist = false) {
        if (!this.server) {
            throw new Error("Server is not running");
        }

        if (persist) {
            await persist();
        }

        this.server.close();
        this.server = null;
    }

    /**
     * Persists all server state information to a file in preparation for
     * a hotswap.
     */
    async persist() {
        return new Promise((resolve, reject) => {
            fs.writeFile(Config.get("persistenceFile"), msgpack.encode(this), (err) => {
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
                    Object.apply(this, msgpack.decode(data));
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
        this._sendToHandlers({ type: "client-data", client: clientAddr, data: data });
    }

    disconnect(clientAddr) {
        this._sendToHandlers({ type: "client-disconnect", client: clientAddr });
    }

    broadcast(data) {
        this._sendToHandlers({ type: "client-broadcast", data: data });
    }

    _sendToHandlers(msg) {
        this.server.clients.forEach(socket => {
            socket.send(msgpack.encode(msg));
        });
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
            const client = this.clients[clientId];
            if (client.ipcOrigin === ipcSocket) {
                client.cleanup();
                delete this.clients[clientId];
            }
        }
    }
}

module.exports = Server;
