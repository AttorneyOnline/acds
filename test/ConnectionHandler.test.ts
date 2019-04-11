import Config from "../src/Config";
import Server from "../src/Server";

beforeAll(() => {
    Config.init();
});

describe("start/stop", () => {
    it("should start and stop correctly", async () => {
        const server = new Server();
        await server.start();
        await server.stop();
    });

    it("should error if server is already started", async () => {
        const server = new Server();
        await server.start();
        await expect(server.start()).rejects.toThrowError();
        await server.stop();
    });

    it("should error if server is stopped twice", async () => {
        const server = new Server();
        await server.start();
        await server.stop();
        await expect(server.stop()).rejects.toThrowError();
    });
});
