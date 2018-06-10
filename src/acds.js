const net = require("net");
const fs = require("fs");
let config;

// TODO: Default config and config import
if (fs.existsSync("../config/config.json")) {
    config = JSON.parse(fs.readFileSync("../config/config.json"));
} else {
    console.error("ERROR: No config found.");
    process.exit(1);
}

let ipcListener = net.createServer((socket) => {
    socket.on('data', (data) => {
        let input = JSON.parse(data);
        console.log(input);
        //dataHandler(input.client, Buffer.from(input.data), socket);
    });
}).listen(config.ipcPort, "localhost");

//function dataHandler(client, data, socket) {
//    console.log(client);
//    console.log(data);
//}