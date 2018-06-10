// Copyright gameboyprinter 2018
// This class represents the state of each client

class Client {
    constructor(socket) {
        this.socket = socket;
        this.name = `${socket.remoteAddress}:${socket.remotePort}`;
    }
}

module.exports = Client;