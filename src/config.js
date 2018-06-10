// Copyright gameboyprinter 2018
// This file manages configuration loading, saving, etc

// imports
const fs = require("fs");

// TODO: Default config and config import
if (fs.existsSync("../config/config.json")) {
    Object.assign(this, JSON.parse(fs.readFileSync("../config/config.json")));
} else {
    console.error("ERROR: No config found.");
    process.exit(1);
}
