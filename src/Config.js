// Copyright gameboyprinter 2018
// This file manages configuration loading, saving, etc

const nconf = require("nconf");
const argv = require("minimist")(process.argv.slice(2), {
    alias: { c: "config" },
    default: { config: "./config/config.json" }
});

class Config {
    static init() {
        nconf.argv().env().file(argv.config).defaults({
            name: "Test server",
            desc: "Test description",
            maxPlayers: 32,
            port: 27017,
            ipcPort: 57017,
            private: false,
            developer: true,
            master: {
                host: "master.aceattorneyonline.com",
                port: 27016
            },
            password: "",
            protection: "open",
            rooms: {
                "The First Room": {
                    order: 0,
                    name: "The First Room",
                    desc: "It's the first room.",
                    protection: "open",
                    customAllowed: false
                },
                "The Second Room": {
                    order: 1,
                    name: "The Second Room",
                    protection: "open"
                }
            },
            assets: {
                characters: [],
                backgrounds: [],
                music: [],
                other: []
            },
            repositories: [],
            persistenceFile: "persistence.json"
        }).overrides({
            version: require("../package.json").version
        });

        nconf.save();
    }

    static get(key) {
        return nconf.get(key);
    }

    static set(key, value) {
        nconf.set(key, value);
    }

    // To be used for testing only.
    static overrides(obj) {
        nconf.overrides(obj);
    }

    // Loads config from disk, and applies it to this object
    static reload() {
        nconf.reload();
    }
}

module.exports = Config;
