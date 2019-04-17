import { randomBytes } from 'crypto';

import Config from './Config';
import Server from './Server';
import Client from './Client';
import { ServerMessages, ClientMessages } from './Messages';
import { EventEmitter } from 'events';
import { registerEvents, on } from './EventDecorators';


export type Asset = string;
export type Session = { client: Client; room: Room, character: Asset, playerId: string };

/**
 * Represents a contained space in which game events occur.
 *
 * While it is possible to pass events and state information across rooms,
 * a room is a single broadcast group which clients may send and receive messages
 * in.
 */
@registerEvents
export default class Room extends EventEmitter {
  private playerMap: { [playerId: string]: Session } = {};
  private players = new Set<Session>();

  private _server: Server;
  name: string;
  desc: string;
  protection: 'open' | 'closed' | 'spectate';
  customAllowed: boolean;

  constructor(server: Server, { name, desc, protection, customAllowed }) {
    super();
    this._server = server;
    this.name = name;
    this.desc = desc;
    this.protection = protection;
    this.customAllowed = customAllowed;
  }

  get playerCount() {
    return Object.keys(this.playerMap).length;
  }

  /** Gets a list of characters available for use in the room. */
  get characters() {
    const charsUsed = new Set(
      Object.values(this.playerMap).map(player => player.character)
    );
    return Config.get('assets.characters').map(char => {
      return {
        asset: char,
        protection: charsUsed.has(char) ? 'used' : 'open'
      };
    });
  }

  /** Joins a client to the current room. */
  join(client: Client, character?: Asset): Session {
    if (
      Object.values(this.playerMap).filter(
        player => [player.client, player.character] === [client, character]
      ).length > 0
    ) {
      // TODO: new config for disallowing two clients with same character
      // TODO: disallow custom characters per existing config
      throw new Error('This client has already joined with this character.');
    }

    // Generate a short random ID - cryptographically strong, so chances are
    // pretty low of a collision as long as there are <1000 players in a room.
    const playerId = randomBytes(3).toString('hex');

    // This is not everything that gets put into the player state - this
    // is just the initial state.
    const player = { client, room: this, character, playerId };
    this.playerMap[playerId] = player;
    this.players.add(player);

    return player;
  }

  /** Broadcasts a message to all players of the room. */
  broadcast(data: ServerMessages.Msg) {
    this.players.forEach(player => {
      player.client.send(data);
    });
  }

  /** Causes a player to leave the current room. */
  @on('leave')
  private onLeave(player: Session) {
    this.players.delete(player);
    delete this.playerMap[player.playerId];
    // TODO: notify all players that a player left
  }

  /** Called when an in-character event is received. */
  @on('ic')
  private onEvent(data, origin?: Client) {
    // TODO: sanitize event, flood control, etc.
    this.broadcast(data);
  }

  /** Called when an out-of-character chat event is received. */
  @on('ooc')
  private onOOC(data: ClientMessages.OOC, origin?: Client) {
    // TODO: like onEvent
    this.broadcast(data);
  }
}
