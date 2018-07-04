const assert = require("assert");

const Server = require("../src/acds");
const ConnectionHandler = require("../src/ConnectionHandler");
const MockClient = require("./MockClient");

const PORT = 5010;

describe("server start/stop", () => {
    it("should start and stop correctly", async function() {
        const server = new Server();
        await server.start(PORT);
        await server.stop();
    });

    it("should error if server is already started", async function() {
        const server = new Server();
        await server.start(PORT);
        await assert.rejects(async() => server.start(PORT));
        await server.stop();
    });

    it("should error if server is stopped twice", async function() {
        const server = new Server();
        await server.start(PORT);
        await server.stop();
        await assert.rejects(async() => server.stop());
    });

    it("should have a default port", async function() {
        const server = new Server();
        try {
            await assert.doesNotReject(async() => server.start());
        } finally {
            await server.stop();
        }
    });
});

describe("client handshake", function() {
    let server;

    beforeEach("start server", async function() {
        server = new Server();
        await server.start(PORT);
    });

    afterEach("stop server", async function() {
        await server.stop();
    });

    it("should establish a websocket connection", async function() {
        const client = new MockClient();
        await client.connect(PORT);
        await client.disconnect();
    });
});

describe("connection handler", function() {
    it("should start and stop correctly", async function() {
        const handler = new ConnectionHandler();
        handler.start();
        await handler.stop();
    });
});
