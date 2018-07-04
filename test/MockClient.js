const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const EventEmitter = require("events").EventEmitter;
const WebSocket = require("ws");
const msgpack = require("msgpack-lite");
const Ajv = require("ajv");

const SCHEMAS_PATH = path.join(__dirname, "schemas");

/**
 * Retrieves a schema of a specified name from a constant directory.
 * @param {string} name the name of the schema
 */
function getSchema(name) {
    JSON.parse(fs.readFileSync(path.join(SCHEMAS_PATH, `${name}.json`)));
}

/**
 * Parses data under a specified schema.
 * @param {object} data the data to be parsed
 * @param {string} name the name of the schema
 */
async function parseSchema(data, name) {
    const schema = getSchema(name);
    const validate = new Ajv().compile(schema);
    return validate(data);
}

/**
 * A mock client asserts that a connection can be established to the server and
 * that all data is sent correctly in the right order.
 */
class MockClient extends EventEmitter {
    constructor() {
        super();
        this._connected = false;
        this._joined = false;
        this._currentRoom = null;
    }

    async connect(port) {
        this.ws = new WebSocket(`ws://127.0.0.1:${port}/`);
        return new Promise(resolve => {
            this.ws.addEventListener("open", () => {
                this._connected = true;
                this._registerHandlers();
                resolve();
            });
            this.ws.addEventListener("message", (e) => this._onData(e.data));
            this.ws.addEventListener("close", (e) => {
                this._connected = false;
                this._joined = false;
                this._currentRoom = null;
            });
        });
    }

    /**
     * Sends structured data to a client as MessagePack data.
     * @param {Object} data JSON/object data to send
     */
    send(data) {
        this.socket.send(msgpack.encode(data));
    }

    disconnect() {
        this.ws.close();
    }

    _checkConnected() {
        if (!this._connected) {
            throw new Error("Not connected");
        }
    }

    async getBasicInfo() {
        this._checkConnected();

        return new Promise((resolve, reject) => {
            this.send({ id: "info-basic" });
            this.once("info-basic", (data) => {
                parseSchema(data, "info-basic").then(newData => {
                    this._server = newData;
                    resolve(newData);
                }).catch(err => reject(err));
            });
        });
    }

    async joinServer(password = "") {
        this._checkConnected();

        if (!this._server) {
            await this.getBasicInfo();
        }

        return new Promise((resolve, reject) => {
            const hmac = crypto.createHmac("sha256", this._challenge);
            hmac.update(password);
            this.send({ id: "join-server", auth_response: hmac.digest() });
            this.once("join-server", (data) => {
                parseSchema(data, "join-server").then(newData => {
                    if (newData.result !== "success") {
                        reject(new Error(`Could not join server: ${newData.result}`));
                    } else {
                        this._joined = true;
                        resolve(newData);
                    }
                }).catch(err => reject(err));
            });
        });
    }

    async getAssets() {
        this._checkConnected();

        return new Promise((resolve, reject) => {
            this.send({ id: "asset-list" });
            this.once("asset-list", (data) => {
                parseSchema(data, "asset-list").then(newData => {
                    this._repositories = newData.repositories;
                    this._assets = newData.assets;
                    resolve(newData);
                }).catch(err => reject(err));
            });
        });
    }

    async getCharacters(roomId) {
        this._checkConnected();

        if (!this._joined) {
            throw new Error("Must be joined in server");
        }

        if (!(roomId in this._server.rooms)) {
            throw new Error(`Room ID ${roomId} does not exist`);
        }

        return new Promise((resolve, reject) => {
            this.send({ id: "chars", room_id: roomId });
            this.once("chars", (data) => {
                parseSchema(data, "chars").then(newData => {
                    if (newData.room_id === roomId) {
                        Object.assign({
                            characters: newData.characters,
                            custom_allowed: newData.custom_allowed
                        }, this._server.rooms[roomId]);
                        resolve(newData);
                    }
                }).catch(err => reject(err));
            });
        });
    }

    async joinRoom(roomId, character = undefined) {
        this._checkConnected();

        if (!this._joined) {
            throw new Error("Must be joined in server");
        }

        if (!(roomId in this._server.rooms)) {
            throw new Error(`Room ID ${roomId} does not exist`);
        }

        return new Promise((resolve, reject) => {
            this.send({ id: "join-room", room_id: roomId, character: character });
            this.once("join-room", (data) => {
                parseSchema(data, "join-room").then(newData => {
                    if (newData.result !== "success") {
                        reject(new Error(`Could not join room ID ${roomId}: ${newData.result}`));
                    } else {
                        this._currentRoom = roomId;
                        resolve(newData);
                    }
                }).catch(err => reject(err));
            });
        });
    }

    sendOOC(message) {
        this._checkConnected();

        if (!this._currentRoom) {
            throw new Error("Must be in a room");
        }

        this.send({ id: "ooc", message: message });
    }

    async getOptions() {
        this._checkConnected();

        return new Promise((resolve, reject) => {
            this.send({ id: "opts" });
            this.once("opts", (data) => {
                parseSchema(data, "opts").then(newData => {
                    if ("error" in newData.options) {
                        reject(new Error(`Could not get options: ${newData.options.error}`));
                    } else {
                        resolve(newData.options);
                    }
                }).catch(err => reject(err));
            });
        });
    }

    async setOption(key, value) {
        this._checkConnected();

        return new Promise((resolve, reject) => {
            this.send({ id: "set-opt", key: key, value: value });
            this.once("set-opt", (data) => {
                parseSchema(data, "set-opt").then(newData => {
                    if (newData.result !== "success") {
                        reject(new Error(`Could not set option ${key}: ${newData.result}`));
                    } else {
                        resolve(newData);
                    }
                }).catch(err => reject(err));
            });
        });
    }

    /**
     * Registers event handlers.
     *
     * This code should be refactored once decorators are added as a language
     * feature.
     */
    _registerHandlers() {
        this.on("disconnect", this._handleDisconnect);
        this.on("new-assets", this._handleNewAssets);
        this.on("ooc", this._handleOOC);
        this.on("event", this._handleEvent);
    }

    /**
     * Handles incoming data.
     * @param {Buffer} data raw data received
     */
    _onData(data) {
        const msg = msgpack.decode(data);

        // Check for malformed packet
        if (!msg.id) {
            return;
        }

        this.emit(msg.id, msg);
    }

    _handleDisconnect(data) {
        console.log(`Disconnected from server: ${data.msg || "(no message)"}`);
    }

    _handleNewAssets(data) {
        console.log("Received new assets");
    }

    _handleOOC(data) {
        console.log(`${data.player}: ${data.message}`);
    }

    _handleEvent(data) {
        console.log("Received event from server");
    }
}

module.exports = MockClient;
