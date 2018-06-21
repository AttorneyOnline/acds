const assert = require('assert');
const WebSocket = require('ws');

const Server = require('../src/acds');

const PORT = 5010;

class MockClient {
    async connect() {
        this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
        return new Promise(resolve => {
            this.ws.addEventListener('open', () => resolve());
        });
    }

    async disconnect() {
        this.ws.close();
    }
}

describe('server start/stop', () => {
	it('should start and stop correctly', async () => {
        const server = new Server();
        await server.start(PORT);
        await server.stop();
    });
});

describe('client handshake', () => {
    it('should establish websocket connection', async () => {
        const server = new Server();
        await server.start(PORT);

        const client = new MockClient();
        await client.connect();
        await client.disconnect();

        await server.stop();
    });
});