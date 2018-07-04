// Copyright gameboyprinter 2018
// This class represents the state of each client

const EventEmitter = require("events").EventEmitter;
const msgpack = require("msgpack-lite");
const crypto = require("crypto");

const Config = require("./Config");

/**
 * Represents a connection with a single client.
 */
class Client extends EventEmitter {
    constructor(socket) {
        super();
        this.socket = socket;
        this.name = `${socket._socket.remoteAddress}:${socket._socket.remotePort}`;
        this.challenge = crypto.randomBytes(16);
    }

    /**
     * Sends structured data to a client as MessagePack data.
     * @param {Object} data JSON/object data to send
     */
    send(data) {
        this.socket.send(msgpack.encode(data));
    }

    /**
     * Disconnects the client, sending an optional message.
     * @param {string} msg Optional message
     */
    disconnect(msg) {
        this.send({ id: "disconnect", message: msg });
        this.socket.close();
    }

    update(newState) {
        Object.assign(this, newState);
    }

    /**
     * Handles incoming data.
     * @param {Buffer} data raw data received
     */
    onData(data) {
        const msg = msgpack.decode(data);

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
            player_count: null,
            max_players: null,
            protection: Config.get("protection"),
            desc: Config.get("desc"),
            auth_challenge: this.challenge,
            rooms: []
        });
    }

    _handleJoinServer({name, auth_response}) {
        this.name = name.substring(0, 32);
        const hmac = crypto.createHmac("sha256", this.challenge);
        hmac.update(Config.get("password") || "");
        if (auth_response !== hmac.digest()) {
            this.send({ id: "join-server", result: "password" });
        } else {
            // TODO: try joining player to room and checking a ban list
            this.send({ id: "join-server", result: "success" });
        }
    }

    _handleAssetList(data) {

    }

    _handleChars(data) {

    }

    _handleJoinRoom(data) {

    }

    _handleOOC(data) {

    }

    _handleEvent(data) {

    }

    _handleOpts(data) {

    }
}

module.exports = Client;
