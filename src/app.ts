import Config from "./Config";
Config.init();

import Server from "./Server";
import ConnectionHandler from "./ConnectionHandler";

const argv = require("minimist")(process.argv.slice(2), {
    alias: {
        h: "help",
        v: "version"
    }
});

if (argv.help) {
    console.log(
        "Usage: node ./src/index.js [option...]",
        "\nOptions: \n",
        "  -h, --help             give this help list and exit \n",
        "  -v, --version          print program version and exit \n",
        "  -c, --config=FILE      use FILE as configuration file, \n",
        "                         default configuration file is ./config/config.json \n"
        // "  -w, --warning=LEVEL    set warning level to LEVEL \n"
    );
    process.exit(0);
}

if (argv.version) {
    console.log(`acds - Animated Chatroom Dedicated Server, version ${Config.get("version")}`);
    process.exit(0);
}

new Server().start();
new ConnectionHandler().start();
