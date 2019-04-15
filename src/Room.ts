import { randomBytes } from "crypto";

import Config from "./Config";
import Server from "./Server";
import Client from "./Client";
import { ServerMessages, ClientMessages } from "./Messages";

type Player = { client: Client, character: string };

/**
 * Represents a contained space in which game events occur.
 *
 * While it is possible to pass events and state information across rooms,
 * a room is a single broadcast group which clients may send and receive messages
 * in.
 */
export default class Room {
    /**
     * A unique list of players currently in this room.
     */
    private players: { [playerId: string]: Player } = {};
    private _server: Server;
    name: string;
    desc: string;
    protection: "open" | "closed" | "spectate";
    customAllowed: boolean;

    constructor(server: Server, {name, desc, protection, customAllowed}) {
        this._server = server;
        this.name = name;
        this.desc = desc;
        this.protection = protection;
        this.customAllowed = customAllowed;
    }

    get playerCount() {
        return Object.keys(this.players).length;
    }

    /**
     * Gets a list of characters available for use in the room.
     */
    get characters() {
        const charsUsed = new Set(Object.values(this.players)
            .map(player => player.character));
        return Config.get("assets.characters").map(char => {
            return {
                asset: char,
                protection: charsUsed.has(char) ? "used" : "open"
            };
        });
    }

    /**
     * Joins a client to the current room.
     * @param {Client} client Client object
     * @param {string} character Character asset ID
     */
    join(client: Client, character?: string) {
        if (Object.values(this.players).filter(player =>
            player === { client, character }).length > 0) {
            // TODO: new config for disallowing two clients with same character
            // TODO: disallow custom characters per existing config
            throw new Error("This client has already joined with this character.");
        }

        // Generate a short random ID - cryptographically strong, so chances are
        // pretty low of a collision as long as there are <1000 players in a room.
        const playerId = randomBytes(3).toString("hex");

        // This is not everything that gets put into the player state - this
        // is just the initial state.
        this.players[playerId] = { client, character };

        return playerId;
    }

    /**
     * Causes a player to leave the current room.
     * @param {string} playerId ID of the player
     */
    leave(playerId: string) {
        delete this.players[playerId];
        // TODO: notify all players that a player left
    }

    /**
     * Broadcasts a message to all players of the room.
     * @param {object} data JSON/object data to be broadcasted
     */
    broadcast(data: ServerMessages.Msg) {
        Object.values(this.players).forEach(player => {
            player.client.send(data);
        });
    }

    /**
     * Called when an in-character event is received.
     * @param {object} data packet data of the event received
     * @param {Client} client client that the event was received from (optional)
     */
    receiveEvent(data, client?: Client) {
        // TODO: sanitize event, flood control, etc.
        this.broadcast(data);
    }

    /**
     * Called when an out-of-character chat event is received.
     * @param {object} data packet data of the message received
     * @param {Client} client client that the message was received from (optional)
     */
    receiveOOC(data: ClientMessages.OOC, client?: Client) {
        // TODO: like receiveEvent
        this.broadcast(data);
    }
}
