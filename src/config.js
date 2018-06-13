// Copyright gameboyprinter 2018
// This file manages configuration loading, saving, etc

// imports
const fs = require("fs");

class ConfigManager {
    constructor() {
        // TODO: Default config and config import
        if (fs.existsSync("../config/config.json")) {
            this.reloadConfig();
        } else {
            console.error("ERROR: No config found.");
        }

        // TODO: Make these automatically go into a file, etc
        this.port = 27017;
        this.ipcPort = 57017;
        this.private = false;
        this.developer = true;
        this.msIP = "master.aceattorneyonline.com";
        this.name = "test serber";
        this.description = "lul";
    }

    // Loads config from disk, and applies it to this object
    reloadConfig() {
        Object.assign(this, JSON.parse(fs.readFileSync("../config/config.json")));
    }
}

module.exports = ConfigManager;