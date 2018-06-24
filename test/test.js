const assert = require('assert');

const Server = require('../src/acds');
const MockClient = require('./MockClient');

const PORT = 5010;

describe('server start/stop', () => {
	it('should start and stop correctly', async () => {
        const server = new Server();
        await server.start(PORT);
        await server.stop();
    });

    it('should error if server is already started', async () => {
        const server = new Server();
        await server.start(PORT);
        await assert.rejects(async () => await server.start(PORT));
        await server.stop();
    });
    
    it('should error if server is stopped twice', async () => {
        const server = new Server();
        await server.start(PORT);
        await server.stop();
        await assert.rejects(async () => await server.stop());
    });

    it('should have a default port', async () => {
        const server = new Server();
        try {
            await assert.doesNotReject(async () => await server.start());
        } finally {
            await server.stop();
        }
    });
});

describe('client handshake', () => {
    it('should establish a websocket connection', async () => {
        const server = new Server();
        await server.start(PORT);
        try {
            const client = new MockClient();
            await client.connect(PORT);
            await client.disconnect();
        } finally {
            await server.stop();
        }
    });
});