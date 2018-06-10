// Copyright gameboyprinter 2018
// This class represents the state of each client

class Client {
    constructor(socket) {
        this.socket = socket;
        this.name = `${socket._socket.remoteAddress}:${socket._socket.remotePort}`;
    }

    send(data) {
        this.socket.send(data);
    }
}

module.exports = Client;