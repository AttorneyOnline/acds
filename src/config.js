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
            process.exit(1);
        }
    }

    // Loads config from disk, and applies it to this object
    reloadConfig() {
        Object.assign(this, JSON.parse(fs.readFileSync("../config/config.json")));
    }
}

module.exports = ConfigManager;