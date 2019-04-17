// Copyright gameboyprinter 2018
// This class represents the state of each client

import { EventEmitter } from 'events';
import crypto from 'crypto';
import WebSocket from 'ws';

import Config from './Config';
import Server from './Server';
import { Session } from './Room';
import { ServerMessages, ClientMessages } from './Messages';
import { registerEvents, on } from './EventDecorators';

/**
 * Represents a connection with a single client.
 *
 * Currently, it is assumed that clients are only connected to one room.
 * This is bound to change in the future when the protocol increases in
 * complexity.
 */
@registerEvents
export default class Client extends EventEmitter {
  name = 'unconnected';
  privileged = false;

  private _challenge = crypto.randomBytes(16);
  private _session: Session;

  ipcOrigin: WebSocket;

  constructor(public socketId: string, private _server: Server) {
    super();
  }

  get room() {
    return this._session ? this._session.room : null;
  }

  /** Sends structured data to a client as MessagePack data. */
  send(data: ServerMessages.Msg) {
    this._server.send(this.socketId, data);
  }

  /** Disconnects the client, sending an optional message. */
  disconnect(message?: string) {
    this.send({ id: 'disconnect', message });
    this._server.disconnect(this.socketId);
  }

  /**
   * Cleans up the client by removing references to it from rooms
   * and notifying other players of the client's departure.
   */
  cleanup() {
    if (this.room)
      this.room.emit('leave', this._session);
  }

  /** Handles incoming data. */
  onData(msg: ClientMessages.Msg) {
    if (!msg.id) return;

    this.emit(msg.id, msg);
  }

  @on('info-basic')
  private onInfoBasic(_data: ClientMessages.InfoBasic) {
    this.send({
      id: 'info-basic',
      name: Config.get('name'),
      version: Config.get('version'),
      player_count: this._server.playerCount,
      max_players: Config.get('maxPlayers'),
      protection: Config.get('protection'),
      desc: Config.get('desc'),
      auth_challenge: this._challenge,
      rooms: Object.keys(this._server.rooms).map(roomId => {
        const room = this._server.rooms[roomId];
        return {
          id: roomId,
          name: room.name,
          players: room.playerCount,
          desc: room.desc,
          protection: room.protection
        };
      })
    });
  }

  @on('join-server')
  private onJoinServer(data: ClientMessages.JoinServer) {
    if (!data.name) {
      this.send({
        id: 'join-server',
        result: 'other',
        message: 'Invalid name'
      });
      return;
    }

    this.name = data.name.substring(0, 32);
    const hmac = crypto.createHmac('sha256', this._challenge);
    hmac.update(Config.get('password') || '');
    if (hmac.digest().equals(data.auth_response as Buffer)) {
      // TODO: try joining player to room and checking a ban list
      this.send({ id: 'join-server', result: 'success' });
    } else {
      this.send({ id: 'join-server', result: 'password' });
    }
  }

  @on('asset-list')
  private onAssetList(_data: ClientMessages.AssetList) {
    this.send({
      id: 'asset-list',
      repositories: Config.get('repositories'),
      assets: Object.values(Config.get('assets') as {
        [category: string]: string[];
      }).reduce((p, v) => [...p, ...v])
    });
  }

  @on('chars')
  private onChars(data: ClientMessages.Chars) {
    const room = this._server.rooms[data.room_id];
    if (room) {
      this.send({
        id: 'chars',
        room_id: data.room_id,
        characters: room.characters,
        custom_allowed: room.customAllowed
      });
    } else {
      this.disconnect('Client error - could not find the given room.');
    }
  }

  @on('join-room')
  private onJoinRoom(data: ClientMessages.JoinRoom) {
    try {
      if (this.room) {
        throw new Error('Client error - cannot join room while already in a room')
      }

      const room = this._server.rooms[data.room_id];
      if (!room) {
        throw new Error('Client error - room does not exist');
      }

      this._session = room.join(this, data.character);
      this.send({ id: 'join-room', result: 'success' });
    } catch (err) {
      this.disconnect(err.message);
    }
  }

  @on('ooc')
  private onOOC(data: ClientMessages.OOC) {
    this.room.emit('ooc', data, this);
  }

  @on('event')
  private onEvent(data) {
    // There is some input handling to be done here, but for now, just
    // make sure it's something valid on the high-level mVNE op table.
    this.room.emit('event', data, this);
  }

  @on('set-opt')
  private onSetOpt(data: ClientMessages.SetOpt) {
    try {
      if (!this.privileged) {
        throw new Error('Access denied');
      }

      try {
        Config.set(data.key, data.value);
        this.send({ id: 'set-opt', result: 'success' });
      } catch (err) {
        throw new Error('Key not found');
      }
    } catch (err) {
      this.send({ id: 'set-opt', result: 'error', message: err.message });
    }
  }

  @on('opts')
  private onOpts(_data: ClientMessages.Opts) {
    try {
      if (!this.privileged) {
        throw new Error('Access denied');
      }

      try {
        this.send({ id: 'opts', options: Config.get() });
      } catch (err) {
        throw new Error('Key not found');
      }
    } catch (err) {
      this.send({ id: 'opts', options: { error: err.message } });
    }
  }
}
