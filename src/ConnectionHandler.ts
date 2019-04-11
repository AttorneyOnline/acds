// Copyright gameboyprinter 2018
// This file contains client state and handles incoming connections.
// Data is passed via a local TCP socket to the actual logic, in a different
// process.
// This allows "hot-swappable" code, where the logic can be changed and the
// client never lose connection.
// Additionally, an auto-updater will be possible, and the server won't even go down!
// The other purpose of this file is to advertise the server on the master server.

import { EventEmitter } from "events";

import WebSocket from "ws";
import async from "async";
import { AsyncQueue } from "async";
import msgpack from "msgpack-lite";

import Config from "./Config";
import { IncomingMessage } from "http";

Config.init();

export default class ConnectionHandler extends EventEmitter {
    private sendQueue: AsyncQueue<object>;
    private sockets: Map<string, WebSocket>;
    private ipcSocket: WebSocket;
    private ipcConnected: boolean;
    private WSserver: WebSocket.Server;

    constructor() {
        super();

        // A message queue ensures reliable data transmission even when the
        // other process crashes
        this.sendQueue = async.queue((data, cb) => {
            console.log(`Sending ${JSON.stringify(data)}`);
            // There is no way of checking if we are connected so just
            // catch and put it back in the queue if a bad happens.
            try {
                this.ipcSocket.send(msgpack.encode(data));
            } catch (err) {
                console.error(err);
                this.sendQueue.unshift(data);
            }
            cb();
        });
        this.sendQueue.pause();

        // This is a map of socket names to socket objects
        this.sockets = new Map();

        // Socket object representing the IPC TCP connection
        this.ipcSocket = null;

        // Is the IPC socket connected?
        this.ipcConnected = false;
    }

    async start(port = Config.get("port")) {
        // Start WebSocket listener
        await new Promise(resolve => {
            this.WSserver = new WebSocket.Server({ port: port }, () => {
                resolve();
            });
        });

        this.WSserver.on("connection", (socket, req) => {
            this.clientHandlerWebsocket(socket, req);
        });

        await this.connect();
    }

    async stop() {
        // Stop server to drop all of the connections
        await new Promise((resolve, reject) => {
            console.log("Dropping all connections...");

            const numClients = this.WSserver.clients.size;
            const emptyServer = numClients === 0;

            // Only resolve this promise when all clients have successfully
            // closed
            let dropped = 0;
            for (let client of this.WSserver.clients) {
                client.on("close", () => {
                    dropped++;
                    console.log(`Dropped client ${dropped}/${numClients}`);
                    if (dropped === numClients) {
                        resolve();
                    }
                });
            }

            // Start closing clients. This callback will only fire when all
            // clients reach the CLOSING state, but not the CLOSED state, which
            // means that the "close" event has not fired for each client yet.
            this.WSserver.close((err) => {
                if (err) reject(err);
                else if (emptyServer) resolve();
            });
        });

        // The disconnect packets are all going to get sent to the main server,
        // unless the main server is going down as well. In this case, it might
        // be possible that the main server will go down before this one does,
        // or it goes down while we are trying to notify it.
        // We will prevent a race condition by setting a timeout.
        if (!this.sendQueue.idle()) {
            console.log("Purging send queue...");
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error("Timeout waiting for queue to clear"));
                    this.sendQueue.kill();
                }, 2000);
                this.sendQueue.drain = function() {
                    clearTimeout(timer);
                    resolve();
                };
            });
        }

        // Now it's safe to disconnect the IPC socket regardless of state.
        this.ipcSocket.close();
        this.removeAllListeners();
    }

    // When a websocket client connects, it is handled here
    clientHandlerWebsocket(socket: WebSocket, req: IncomingMessage) {
        const name: string = `${req.connection.remoteAddress}:${req.connection.remotePort}`;
        this.sockets.set(name, socket);
        this.sendQueue.push({
            type: "client-connect",
            client: name
        });

        // When a client sends data, it is handled here
        socket.on("message", (data: Buffer) => {
            this.sendQueue.push({
                type: "client-data",
                client: name,
                data: msgpack.decode(data)
            });
        });

        // When a client disconnects, it is handled here
        socket.on("close", () => {
            delete this.sockets[name];
            this.sendQueue.push({
                type: "client-disconnect",
                client: name
            });
        });

        // Connection errors are handled here
        socket.on("error", (e) => {
            if (Config.get("developer")) {
                console.error(e);
            }
        });
    }

    async _startConnection() {
        return new Promise(resolve => {
            this.ipcSocket = new WebSocket(`ws://localhost:${Config.get("ipcPort")}`);
            this.ipcSocket.on("open", () => {
                resolve();
            });
        });
    }

    // Try to connect to logic handler process
    async connect() {
        // Try to connect
        await this._startConnection();
        console.log("Connected to IPC server");

        // node-ipc will try to reconnect automatically
        this.ipcSocket.on("error", () => {
            console.error("Connection error, retrying...");
            this.ipcConnected = false;
            this.sendQueue.pause();
        });

        this.ipcSocket.on("message", (data: Buffer) => {
            const msg = msgpack.decode(data);
            this.emit(msg.type, msg);
        });

        // Handle any data received from the other process
        this.on("client-data", (msg: { client: string, data: any }) => {
            this.sockets.get(msg.client).send(msgpack.encode(msg.data));
        });

        this.on("client-disconnect", (msg: { client: string }) => {
            this.sockets.get(msg.client).close();
        });

        this.on("client-broadcast", (msg: { data: any }) => {
            this.sockets.forEach((socket: WebSocket) => {
                socket.send(msg.data);
            });
        });

        this.ipcConnected = true;
        this.sendQueue.resume();
    }
}

module.exports = ConnectionHandler;
