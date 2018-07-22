const crypto = require("crypto");

const Config = require("./Config");

/**
 * Represents a contained space in which game events occur.
 *
 * While it is possible to pass events and state information across rooms,
 * a room is a single broadcast group which clients may send and receive messages
 * in.
 */
class Room {
    constructor(server, {name, desc, protection, customAllowed}) {
        this._server = server;

        /** @type {string} */
        this.name = name;

        /** @type {string} */
        this.desc = desc;

        /** @type {Symbol} */
        this.protection = protection;

        /** @type {boolean} */
        this.customAllowed = customAllowed;

        /**
         * A unique list of players currently in this room.
         * @type {Map<string, object>}
         */
        this.players = new Map();
    }

    toJSON() {
        const keys = ["name", "desc", "protection", "customAllowed"];
        const wanted = {};
        keys.forEach((val, _key) => {
            wanted[val] = this[val];
        }, this);
        wanted.players = this.players.values();
        return wanted;
    }

    /**
     * Gets a list of characters available for use in the room.
     */
    get characters() {
        const charsUsed = this.players.values().map(player => player.character);
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
    join(client, character = null) {
        for (let player of this.players) {
            if (client === player.client && character === player.character) {
                throw new Error("This client has already joined with this character.");
            }
            // TODO: new config for disallowing two clients with same character
            // TODO: disallow custom characters per existing config
        }

        // Generate a short random ID - cryptographically strong, so chances are
        // pretty low of a collision as long as there are <1000 players in a room.
        const playerId = crypto.randomBytes(3).toString("hex");

        // This is not everything that gets put into the player state - this
        // is just the initial state.
        this.players.set(playerId, { client: client, character: character });

        return playerId;
    }

    /**
     * Causes a player to leave the current room.
     * @param {string} playerId ID of the player
     */
    leave(playerId) {
        this.players.delete(playerId);
        // TODO: notify all players that a player left
    }

    /**
     * Broadcasts a message to all players of the room.
     * @param {object} data JSON/object data to be broadcasted
     */
    broadcast(data) {
        this.players.forEach(player => {
            player.send(data);
        });
    }

    /**
     * Called when an in-character event is received.
     * @param {object} data packet data of the event received
     * @param {Client} client client that the event was received from (optional)
     */
    receiveEvent(data, client = null) {
        // TODO: sanitize event, flood control, etc.
        this.broadcast(data);
    }

    /**
     * Called when an out-of-character chat event is received.
     * @param {object} data packet data of the message received
     * @param {Client} client client that the message was received from (optional)
     */
    receiveOOC(data, client = null) {
        // TODO: like receiveEvent
        this.broadcast(data);
    }
}

module.exports = Room;
