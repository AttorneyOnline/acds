// Copyright gameboyprinter 2018
// This class represents the state of each client

const EventEmitter = require("events").EventEmitter;
const crypto = require("crypto");

const Config = require("./Config");

/**
 * Represents a connection with a single client.
 */
class Client extends EventEmitter {
    constructor(socketId, server) {
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

    static fromPersistence(server, obj) {
        const client = new Client(obj.socketId, server);
        Object.apply(client, obj);
    }

    get room() {
        return this._server.rooms[this._roomId] || null;
    }

    toJSON() {
        const keys = [
            "name",
            "privileged",
            "_roomId",
            "socketId",
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
     * @param {Object} data JSON/object data to send
     */
    send(data) {
        this._server.send(this.socketId, data);
    }

    /**
     * Disconnects the client, sending an optional message.
     * @param {string} msg Optional message
     */
    disconnect(msg) {
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
     * @param {object} msg pre-parsed JSON object
     */
    onData(msg) {
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

    _handleInfoBasic(data) {
        // TODO
        this.send({
            id: "info-basic",
            name: Config.get("name"),
            version: Config.get("version"),
            player_count: this._server.playerCount,
            max_players: Config.get("maxPlayers"),
            protection: Config.get("protection"),
            desc: Config.get("desc"),
            auth_challenge: this._challenge,
            rooms: this._server.rooms
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

    _handleAssetList(data) {

    }

    _handleChars(data) {

    }

    _handleJoinRoom(data) {
        if (!this.room) {
            this.disconnect("Client error - cannot join room while already in a room.");
        }
    }

    _handleOOC(data) {
        // TODO: rate limiting

    }

    _handleEvent(data) {
        // There is some input handling to be done here, but for now, just
        // make sure it's something valid on the high-level mVNE op table.
    }

    _handleSetOpt(data) {

    }

    _handleOpts(data) {
        if (this.privileged) {
            this.send({ id: "opts", options: Config.get() });
        } else {
            this.send({ id: "opts", options: {"error": "Access denied"} });
        }
    }
}

module.exports = Client;
