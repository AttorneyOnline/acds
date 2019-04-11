import fs from "fs";
import path from "path";
import crypto from "crypto";
import { EventEmitter } from "events";

import WebSocket from "ws";
import msgpack from "msgpack-lite";
import Ajv from "ajv";
import { InfoBasic, Msg, Chars, JoinRoom, Opts, SetOpt, AssetList, JoinServer, OOC } from "../src/Messages";

const SCHEMAS_PATH = "schemas";

/**
 * Retrieves a schema of a specified name from a constant directory.
 * @param {string} name the name of the schema
 */
function getSchema(name: string): object {
    return JSON.parse(fs.readFileSync(path.join(SCHEMAS_PATH, `${name}.json`))
        .toString());
}

/**
 * Parses data under a specified schema.
 * @param {object} data the data to be parsed
 * @param {string} name the name of the schema
 */
async function parseSchema(data: object, name: string): Promise<void> {
    const schema = getSchema(name);
    const validate = new Ajv().compile(schema);
    const result = await validate(data);
    if (result === false) {
        throw new Error(`Error validating data:\n`
            + `${JSON.stringify(validate.errors, null, 2)}\n`
            + `Original:\n${JSON.stringify(data, null, 2)}`);
    }
}

/**
 * A mock client asserts that a connection can be established to the server and
 * that all data is sent correctly in the right order.
 */
export default class MockClient extends EventEmitter {
    private _socket?: WebSocket;
    private _connected: boolean;
    private _joined: boolean;
    private _currentRoom?: any;
    private _server?: any;
    private _repositories: any;
    private _assets: any;

    constructor() {
        super();
        this._socket = null;
        this._connected = false;
        this._joined = false;
        this._currentRoom = null;
        this._server = null;
    }

    async connect(port: number) {
        this._socket = new WebSocket(`ws://127.0.0.1:${port}/`);
        return new Promise((resolve) => {
            this._socket.addEventListener("open", () => {
                this._connected = true;
                this._registerHandlers();
                resolve();
            });
            this._socket.addEventListener("message", (e) => this._onData(e.data));
            this._socket.addEventListener("close", (e) => {
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
    send(data: object) {
        this._socket.send(msgpack.encode(data));
    }

    disconnect() {
        this._socket.close();
    }

    _checkConnected() {
        if (!this._connected) {
            throw new Error("Not connected");
        }
    }

    async getBasicInfo(): Promise<InfoBasic> {
        this._checkConnected();

        const resp = await this.request({
            id: "info-basic"
        }, "info-basic") as InfoBasic;

        console.log(resp);
        console.log(resp.auth_challenge);

        this._server = resp;

        return resp;
    }

    async joinServer(password = "") {
        if (!this._server) {
            await this.getBasicInfo();
        }

        const hmac = crypto.createHmac("sha256", this._server.auth_challenge);
        hmac.update(password);

        const resp = await this.request({
            id: "join-server",
            name: "test player",
            auth_response: hmac.digest()
        }, "join-server") as JoinServer;

        if (resp.result !== "success") {
            throw new Error(`Could not join server: ${resp.result}`);
        } else {
            this._joined = true;
        }
    }

    async getAssets() {
        const resp = await this.request({
            "id": "asset-list"
        }, "asset-list") as AssetList;

        this._repositories = resp.repositories;
        this._assets = resp.assets;

        return resp;
    }

    /**
     * Sends a message to the server and waits for a response of the
     * specified type.
     * @param {Object} req the message to send to the server
     * @param {string} resId the ID of the response expected from
     * the server
     */
    async request(req: object, resId: string): Promise<Msg> {
        this._checkConnected();

        const resp = await new Promise((resolve, reject) => {
            this.send(req);
            const timeout = setTimeout(() =>
                reject(new Error("Timeout exceeded")), 1500);
            this.once(resId, resolve);
            clearTimeout(timeout);
        });

        await parseSchema(resp, resId);

        return resp as Msg;
    }

    async getCharacters(roomId: string): Promise<Chars> {
        if (!this._joined) {
            throw new Error("Must be joined in server");
        }

        if (!this._server.rooms[roomId]) {
            throw new Error(`Room ID ${roomId} does not exist`);
        }

        const resp = await this.request({
            id: "chars",
            room_id: roomId
        }, "chars") as Chars;

        Object.assign({
            characters: resp.characters,
            custom_allowed: resp.custom_allowed
        }, this._server.rooms[roomId]);

        return resp;
    }

    async joinRoom(roomId, character = undefined) {
        if (!this._joined) {
            throw new Error("Must be joined in server");
        }

        if (!this._server.rooms.filter(room => room.id === roomId)) {
            throw new Error(`Room ID ${roomId} does not exist`);
        }

        const resp = await this.request({
            id: "join-room",
            room_id: roomId,
            character: character
        }, "join-room") as JoinRoom;

        if (resp.result !== "success") {
            throw new Error(`Could not join room ID ${roomId}: ${resp.result}`);
        }

        this._currentRoom = roomId;
    }

    sendOOC(message: string) {
        this._checkConnected();

        if (!this._currentRoom) {
            throw new Error("Must be in a room");
        }

        this.send({ id: "ooc", message: message });
    }

    async getOptions() {
        const resp = await this.request({ id: "opts" }, "opts") as Opts;

        if ("error" in resp.options) {
            throw new Error(`Could not get options: ${resp.options.error}`);
        }

        return resp.options;
    }

    async setOption(key: string, value: object) {
        this._checkConnected();

        const resp = await this.request({
            id: "set-opt",
            key: key,
            value: value
        }, "set-opt") as SetOpt;

        if (resp.result !== "success") {
            throw new Error(`Could not set option ${key}: ${resp.result}`);
        }

        return resp;
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
    _onData(data: Buffer) {
        const msg = msgpack.decode(data);

        // Check for malformed packet
        if (!msg.id) {
            return;
        }

        this.emit(msg.id, msg);
    }

    _handleDisconnect(data) {
        console.log(`Disconnected from server: ${data.message || "(no message)"}`);
    }

    _handleNewAssets(data) {
        console.log("Received new assets");
    }

    _handleOOC(data: OOC) {
        console.log(`${data.player}: ${data.message}`);
    }

    _handleEvent(data) {
        console.log("Received event from server");
    }
}

module.exports = MockClient;
