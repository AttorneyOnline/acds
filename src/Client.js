// Copyright gameboyprinter 2018
// This class represents the state of each client

const EventEmitter = require("events").EventEmitter;
const msgpack = require("msgpack-lite");
const crypto = require("crypto");

const Config = require("./config");

/**
 * Represents a connection with a single client.
 */
class Client extends EventEmitter {
    constructor(socket) {
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
        msg = msgpack.decode(data);

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
        this.on("info-basic", this._handle_info_basic);
        this.on("join-server", this._handle_join_server);

        this.on("asset-list", this._handle_asset_list);

        this.on("chars", this._handle_chars);
        this.on("join-room", this._handle_join_room);
        this.on("ooc", this._handle_ooc);

        // TODO: This id should be added to the spec
        this.on("event", this._handle_event);

        this.on("opts", this._handle_opts);
    }

    _handle_info_basic(data) {
        // TODO
        this.send({
            id: "info-basic",
            name: Config.get("name"),
            version: Config.get("version"),
            player_count = null,
            max_players = null,
            protection: Config.get("protection"),
            desc: Config.get("desc"),
            auth_challenge = this.challenge,
            rooms: []
        });
    }

    _handle_join_server({name, auth_response}) {
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

    _handle_asset_list(data) {

    }

    _handle_chars(data) {

    }

    _handle_join_room(data) {

    }

    _handle_ooc(data) {

    }

    _handle_event(data) {

    }

    _handle_opts(data) {

    }
}

module.exports = Client;