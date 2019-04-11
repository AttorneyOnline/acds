import Config from "../src/Config";
import Server from "../src/Server";
import ConnectionHandler from "../src/ConnectionHandler";
import MockClient from "./MockClient";

const PORT = 5010;

beforeAll(() => {
    Config.init();
});

describe("client handshake", () => {
    let server: Server;
    let listener: ConnectionHandler;

    beforeEach(async () => {
        server = new Server();
        await server.start();

        listener = new ConnectionHandler();
        await listener.start(PORT);
    });

    afterEach(async () => {
        await listener.stop();
        await server.stop();
    });

    it("should establish a websocket connection", async () => {
        const client = new MockClient();
        await client.connect(PORT);
        await client.disconnect();
    });

    it("should get basic info", async () => {
        const client = new MockClient();
        await client.connect(PORT);
        await expect(client.getBasicInfo()).resolves.toBeTruthy();
        await client.disconnect();
    });

    it("should join a server", async () => {
        const client = new MockClient();
        await client.connect(PORT);
        await expect(client.joinServer(Config.get("password"))).toBeTruthy();
        await client.disconnect();
    });

    it("should join a room", async () => {
        const client = new MockClient();
        await client.connect(PORT);
        await client.joinServer(Config.get("password"));
        await client.joinRoom("The First Room");
        await client.disconnect();
    });
});
