// Copyright gameboyprinter 2018
// Incoming data from the connection handling process is sent here via local TCP
// This process takes care of all the logic and processing, and ideally is the
// only part that should be changed. Changes to the other process should be rare,
// as it requires dropping every client and a loss of service.

// imports
import fs from "fs-extra";
import { EventEmitter } from "events";

import WebSocket from "ws";
import msgpack from "msgpack-lite";

import Config from "./Config";
import Client from "./Client";
import Room from "./Room";

type IPCConnect = { type: "client-connect", client: string };
type IPCDisconnect = { type: "client-disconnect", client: string };
type IPCData = { type: "client-data", client: string, data: any };
type IPCBroadcast = { type: "client-broadcast", data: any };
type IPCMessage = IPCConnect | IPCDisconnect | IPCData | IPCBroadcast;

export default class Server extends EventEmitter {
    private server: WebSocket.Server;
    clients: object;
    rooms: object;

    constructor() {
        super();
        this.server = null;
        this.clients = {};
        this.rooms = {};
    }

    get playerCount(): number {
        return Object.values(this.clients)
            .reduce((prev, client) => prev + (client.room ? 1 : 0), 0);
    }

    async start(): Promise<void> {
        if (this.server) {
            throw new Error("Server is already running");
        }

        // Load rooms from config
        const rooms = Config.get("rooms");
        Object.keys(rooms).forEach(roomId => {
            this.rooms[roomId] = new Room(this, rooms[roomId]);
        });

        // Start accepting connections
        return new Promise(resolve => {
            // Create IPC listen server
            this.server = new WebSocket.Server({ port: Config.get("ipcPort") }, () => {
                resolve();
            });

            this.server.on("connection", (socket) => {
                socket.on("message", (data: Buffer) => {
                    const msg = msgpack.decode(data);
                    this.emit(msg.type, msg, socket);
                });

                socket.on("close", () => this._onIPCDisconnect(socket));
            });

            this.on("client-connect",
                (data: IPCConnect, socket) => this._onClientConnect(data, socket));
            this.on("client-disconnect",
                (data: IPCDisconnect) => this._onClientDisconnect(data));
            this.on("client-data",
                (data: IPCData) => this._onClientData(data));
        });
    }

    async stop(): Promise<void> {
        if (!this.server) {
            throw new Error("Server is not running");
        }

        this.server.close();
        this.server = null;
    }

    send(clientAddr: string, data: object) {
        this._sendToHandlers({ type: "client-data", client: clientAddr, data: data });
    }

    disconnect(clientAddr: string) {
        this._sendToHandlers({ type: "client-disconnect", client: clientAddr });
    }

    broadcast(data: object) {
        this._sendToHandlers({ type: "client-broadcast", data: data });
    }

    private _sendToHandlers(msg: IPCMessage) {
        this.server.clients.forEach(socket => {
            socket.send(msgpack.encode(msg));
        });
    }

    private _onClientConnect(msg: IPCConnect, ipcSocket: WebSocket) {
        const client = new Client(msg.client, this);
        this.clients[msg.client] = client;
        client.ipcOrigin = ipcSocket;
    }

    private _onClientDisconnect(msg: IPCDisconnect) {
        this.clients[msg.client].cleanup();
        delete this.clients[msg.client];
    }

    private _onClientData(msg: IPCData) {
        this.clients[msg.client].onData(msg.data);
    }

    private _onIPCDisconnect(ipcSocket: WebSocket) {
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
