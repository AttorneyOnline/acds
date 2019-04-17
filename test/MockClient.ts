import crypto from 'crypto';
import { EventEmitter } from 'events';

import WebSocket from 'ws';
import msgpack from 'msgpack-lite';
import { ServerMessages, ClientMessages } from '../src/Messages';
import { parseSchema } from '../src/Validation';
import { registerEvents, on } from '../src/EventDecorators';

const SCHEMAS_PATH = 'schemas/server';

/**
 * A mock client asserts that a connection can be established to the server
 * and that all data is sent correctly in the right order.
 */
@registerEvents
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
    if (this._socket && this._socket.readyState == WebSocket.OPEN) {
      this._socket.close();
    }

    this._socket = new WebSocket(`ws://127.0.0.1:${port}/`);
    return await new Promise((resolve, reject) => {
      this._socket.on('open', () => {
        this._connected = true;
        resolve();
      });
      this._socket.on('message', (data: Buffer) => this._onData(data));
      this._socket.on('close', () => {
        this._connected = false;
        this._joined = false;
        this._currentRoom = null;
      });
      this._socket.on('error', reject);
    });
  }

  /** Sends structured data to a client as MessagePack data. */
  protected send(data: ClientMessages.Msg) {
    this._socket.send(msgpack.encode(data));
  }

  disconnect() {
    if (this._socket.readyState == WebSocket.OPEN)
      this._socket.close();
  }

  private checkConnected() {
    if (!this._connected) {
      throw new Error('Not connected');
    }
  }

  async getBasicInfo(): Promise<ServerMessages.InfoBasic> {
    this.checkConnected();

    const resp = (await this.request(
      { id: 'info-basic' },
      'info-basic'
    )) as ServerMessages.InfoBasic;

    console.log(resp);
    console.log(resp.auth_challenge);

    this._server = resp;

    return resp;
  }

  async joinServer(password = '') {
    if (!this._server) {
      await this.getBasicInfo();
    }

    const hmac = crypto.createHmac('sha256', this._server.auth_challenge);
    hmac.update(password);

    const resp = (await this.request(
      { id: 'join-server', name: 'test player', auth_response: hmac.digest() },
      'join-server'
    )) as ServerMessages.JoinServer;

    if (resp.result !== 'success') {
      throw new Error(`Could not join server: ${resp.result}`);
    } else {
      this._joined = true;
    }
  }

  async getAssets() {
    const resp = (await this.request(
      { id: 'asset-list' },
      'asset-list'
    )) as ServerMessages.AssetList;

    this._repositories = resp.repositories;
    this._assets = resp.assets;

    return resp;
  }

  /**
   * Sends a message to the server and waits for a response of the
   * specified type.
   * @param req the message to send to the server
   * @param resId the ID of the response expected from the server
   */
  protected async request(
    req: ClientMessages.Msg,
    resId: string
  ): Promise<ServerMessages.Msg> {
    this.checkConnected();

    const resp = await new Promise((resolve, reject) => {
      this.send(req);
      const timeout = setTimeout(
        () => reject(new Error('Timeout exceeded')),
        1500
      );
      this.once(resId, resolve);
      clearTimeout(timeout);
    });

    await parseSchema(resp, resId, SCHEMAS_PATH);

    return resp as ServerMessages.Msg;
  }

  async getCharacters(roomId: string): Promise<ServerMessages.Chars> {
    if (!this._joined) {
      throw new Error('Must be joined in server');
    }

    if (!this._server.rooms[roomId]) {
      throw new Error(`Room ID ${roomId} does not exist`);
    }

    const resp = (await this.request(
      { id: 'chars', room_id: roomId },
      'chars'
    )) as ServerMessages.Chars;

    Object.assign(
      { characters: resp.characters, custom_allowed: resp.custom_allowed },
      this._server.rooms[roomId]
    );

    return resp;
  }

  async joinRoom(roomId, character = undefined) {
    if (!this._joined) {
      throw new Error('Must be joined in server');
    }

    if (!this._server.rooms.filter(room => room.id === roomId)) {
      throw new Error(`Room ID ${roomId} does not exist`);
    }

    const resp = (await this.request(
      { id: 'join-room', room_id: roomId, character },
      'join-room'
    )) as ServerMessages.JoinRoom;

    if (resp.result !== 'success') {
      throw new Error(`Could not join room ID ${roomId}: ${resp.result}`);
    }

    this._currentRoom = roomId;
  }

  sendOOC(message: string) {
    this.checkConnected();

    if (!this._currentRoom) {
      throw new Error('Must be in a room');
    }

    this.send({ id: 'ooc', message: message });
  }

  async getOptions() {
    const resp = (await this.request(
      { id: 'opts' },
      'opts'
    )) as ServerMessages.Opts;

    if ('error' in resp.options) {
      throw new Error(`Could not get options: ${resp.options.error}`);
    }

    return resp.options;
  }

  async setOption(key: string, value: object) {
    this.checkConnected();

    const resp = (await this.request(
      { id: 'set-opt', key, value },
      'set-opt'
    )) as ServerMessages.SetOpt;

    if (resp.result !== 'success') {
      throw new Error(`Could not set option ${key}: ${resp.result}`);
    }

    return resp;
  }

  /**
   * Handles incoming data.
   * @param data raw data received
   */
  _onData(data: Buffer) {
    const msg = msgpack.decode(data);
    if (!msg.id) return;

    const handled = this.emit(msg.id, msg);
    if (!handled) {
      console.warn(`No handler for ${msg.id} found`);
    }
  }

  @on('disconnect')
  private onDisconnect(data: ServerMessages.Disconnect) {
    console.log(`Disconnected from server: ${data.message || '(no message)'}`);
  }

  @on('new-assets')
  private onNewAssets(data) {
    console.log('Received new assets');
  }

  @on('ooc')
  private onOOC(data: ServerMessages.OOC) {
    console.log(`${data.player}: ${data.message}`);
  }

  @on('event')
  private onEvent(data) {
    console.log('Received event from server');
  }
}
