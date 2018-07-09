const assert = require("assert");

const Config = require("../src/Config");
Config.init();

const Server = require("../src/Server");
const ConnectionHandler = require("../src/ConnectionHandler");
const MockClient = require("./MockClient");

const PORT = 5010;

describe("logic server start/stop", () => {
    it("should start and stop correctly", async function() {
        const server = new Server();
        await server.start();
        await server.stop();
    });

    it("should error if server is already started", async function() {
        const server = new Server();
        await server.start();
        await assert.rejects(async() => server.start());
        await server.stop();
    });

    it("should error if server is stopped twice", async function() {
        const server = new Server();
        await server.start();
        await server.stop();
        await assert.rejects(async() => server.stop());
    });
});

describe("connection handler", function() {
    let server;

    beforeEach("start main server", async function() {
        server = new Server();
        await server.start();
    });

    afterEach("stop main server", async function() {
        await server.stop();
    });

    it("should start and stop correctly", async function() {
        const handler = new ConnectionHandler();
        await handler.start();
        await handler.stop();
    });
});

describe("client handshake", function() {
    let server;
    let listener;

    beforeEach("start server", async function() {
        console.log("Starting main server");
        server = new Server();
        await server.start();
    });

    beforeEach("start listener", async function() {
        console.log("Starting listener");
        listener = new ConnectionHandler();
        await listener.start(PORT);
    });

    afterEach("stop listener", async function() {
        console.log("Stopping listener");
        await listener.stop();
    });

    afterEach("stop server", async function() {
        console.log("Stopping main server");
        await server.stop();
    });

    it("should establish a websocket connection", async function() {
        const client = new MockClient();
        await client.connect(PORT);
        await client.disconnect();
    });

    it("should get basic info", async function() {
        const client = new MockClient();
        await client.connect(PORT);
        await assert.doesNotReject(async() => client.getBasicInfo());
        await client.disconnect();
    });

    it("should join a server", async function() {
        const client = new MockClient();
        await client.connect(PORT);
        //await assert.doesNotReject(async() => client.joinServer(Config.get("password")));
        await client.joinServer(Config.get("password"));
        await client.disconnect();
    });
});
