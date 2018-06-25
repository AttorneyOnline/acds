// Copyright gameboyprinter 2018
// This file manages configuration loading, saving, etc

const nconf = require("nconf");

class Config {
    constructor(config_file) {
        nconf.argv().env().file(config_file).defaults({
            name: "Test server",
            desc: "Test description",
            port: 27017,
            ipcPort: 57017,
            private: false,
            developer: true,
            master: {
                host: "master.aceattorneyonline.com",
                port: 27016
            },
            password: null,
            protection: "open",
            rooms: [
                {
                    name: "The First Room",
                    desc: "It's the first room.",
                    protection: "open"
                },
                {
                    name: "The Second Room",
                    protection: "open"
                }
            ]
        });

        nconf.save();
    }

    static get(key) {
        return nconf.get(key);
    }

    static set(key, value) {
        nconf.set(key, value);
    }

    // Loads config from disk, and applies it to this object
    static reload() {
        nconf.reload();
    }
}

module.exports = Config;
