// Copyright gameboyprinter 2018
// This class represents the state of each client

import { EventEmitter } from "events";
import crypto from "crypto";
import WebSocket from "ws";

import Config from "./Config";
import Server from "./Server";
import { Msg } from "./Messages";

/**
 * Represents a connection with a single client.
 *
 * Currently, it is assumed that clients are only connected to one room.
 * This is bound to change in the future when the protocol increases in
 * complexity.
 */
export default class Client extends EventEmitter {
    name: string;
    socketId: string;
    privileged: boolean;
    private _roomId: string;
    private _challenge: Buffer;
    private _server: Server;
    ipcOrigin: WebSocket;

    constructor(socketId: string, server: Server) {
        super();
        this.name = "unconnected";
        this.socketId = socketId;
        this.privileged = false;
        this._roomId = null;
        this._challenge = crypto.randomBytes(16);
        this._server = server;
        this.ipcOrigin = null;

        this._registerHandlers();
    }

    get room() {
        return this._server.rooms[this._roomId] || null;
    }
    
    static fromPersistence(server: Server, obj: Client) {
        const client = new Client(obj.socketId, server);
        Object.apply(client, obj);
    }

    toJSON() {
        const keys = [
            "name",
            "id",
            "socketId",
            "privileged",
            "_roomId",
            "_challenge"
        ];
        const wanted = {};
        keys.forEach((val, _key) => {
            wanted[val] = this[val];
        }, this);
        return wanted;
    }

    /**
     * Sends structured data to a client as MessagePack data.
     * @param {object} data JSON/object data to send
     */
    send(data: object) {
        this._server.send(this.socketId, data);
    }

    /**
     * Disconnects the client, sending an optional message.
     * @param {string} msg Optional message
     */
    disconnect(msg: string) {
        this.send({ id: "disconnect", message: msg });
        this._server.disconnect(this.socketId);
    }

    /**
     * Cleans up the client by removing references to it from rooms
     * and notifying other players of the client's departure.
     */
    cleanup() {
        // TODO: this.room.leave(this);
    }

    /**
     * Handles incoming data.
     * @param {Msg} msg pre-parsed JSON object
     */
    onData(msg: Msg) {
        // Check for malformed packet
        if (!msg.id) {
            return;
        }

        this.emit(msg.id, msg);
    }

    /**
     * Registers event handlers.
     *
     * This code should be refactored once decorators are added as a language
     * feature.
     */
    _registerHandlers() {
        this.on("info-basic", this._handleInfoBasic);
        this.on("join-server", this._handleJoinServer);

        this.on("asset-list", this._handleAssetList);

        this.on("chars", this._handleChars);
        this.on("join-room", this._handleJoinRoom);
        this.on("ooc", this._handleOOC);

        // TODO: This id should be added to the spec
        this.on("event", this._handleEvent);

        this.on("set-opt", this._handleSetOpt);
        this.on("opts", this._handleOpts);
    }

    _handleInfoBasic(_data) {
        this.send({
            id: "info-basic",
            name: Config.get("name"),
            version: Config.get("version"),
            player_count: this._server.playerCount,
            max_players: Config.get("maxPlayers"),
            protection: Config.get("protection"),
            desc: Config.get("desc"),
            auth_challenge: this._challenge,
            rooms: Object.keys(this._server.rooms).map(roomId => {
                const room = this._server.rooms[roomId];
                return {
                    id: roomId,
                    name: room.name,
                    players: room.players.size,
                    desc: room.desc,
                    protection: room.protection
                };
            })
        });
    }

    _handleJoinServer({name, auth_response}) {
        if (!name) {
            this.send({ id: "join-server", result: "other", message: "Invalid name" });
            return;
        }

        this.name = name.substring(0, 32);
        const hmac = crypto.createHmac("sha256", this._challenge);
        hmac.update(Config.get("password") || "");
        if (hmac.digest().equals(auth_response)) {
            // TODO: try joining player to room and checking a ban list
            this.send({ id: "join-server", result: "success" });
        } else {
            this.send({ id: "join-server", result: "password" });
        }
    }

    _handleAssetList(_data) {
        this.send({
            id: "asset-list",
            repositories: Config.get("repositories"),
            assets: Object.values(Config.get("assets") as
                { [category: string]: string[] })
                .reduce((p, v) => [...p, ...v])
        });
    }

    _handleChars(data) {
        const room = this._server.rooms[data.room_id];
        if (room) {
            this.send({ id: "chars", characters: room.characters });
        } else {
            this.disconnect("Client error - could not find the given room.");
        }
    }

    _handleJoinRoom(data) {
        if (!this.room) {
            this._roomId = data.room_id;
            if (this.room) {
                this.room.join(this, data.character);
                this.send({ id: "join-room", result: "success" });
            } else {
                this.disconnect("Client error - room does not exist.");
            }
        } else {
            this.disconnect("Client error - cannot join room while already in a room.");
        }
    }

    _handleOOC(data) {
        this.room.receiveOOC(data, this);
    }

    _handleEvent(data) {
        // There is some input handling to be done here, but for now, just
        // make sure it's something valid on the high-level mVNE op table.
        this.room.receiveEvent(data, this);
    }

    _handleSetOpt(data) {
        try {
            if (!this.privileged) {
                throw new Error("Access denied");
            }

            try {
                Config.set(data.key, data.value);
                this.send({ id: "set-opt", result: "success" });
            } catch (err) {
                throw new Error("Key not found");
            }
        } catch (err) {
            this.send({ id: "set-opt", result: "error", msg: err.message });
        }
    }

    _handleOpts(data) {
        try {
            if (!this.privileged) {
                throw new Error("Access denied");
            }

            try {
                this.send({ id: "opts", options: Config.get(data.key) });
            } catch (err) {
                throw new Error("Key not found");
            }
        } catch (err) {
            this.send({ id: "opts", options: { error: err.message } });
        }
    }
}