const fs = require("fs");

const json2ts = require("json-schema-to-typescript");
const glob = require("glob");
const wrap = require("word-wrap");

glob("schemas/*.json", (err, files) => {
    if (err) throw err;

    const out = "src/Messages.ts";
    if (fs.existsSync(out)) {
        fs.unlinkSync(out);
    }

    fs.appendFileSync(out, json2ts.DEFAULT_OPTIONS.bannerComment + "\n\n");

    const types = [];
    for (const file of files) {
        console.log(file);
        const schema = JSON.parse(fs.readFileSync(file).toString());
        json2ts.compile(schema, schema.title, { bannerComment: null })
            .then((ts) => fs.appendFileSync(out, ts + "\n"));
        types.push(schema.title);
    }

    fs.appendFileSync(out, wrap("export type Msg = " +
        types.reduce((s, t) => s + " | " + t) + ";\n\n\n",
    { indent: "", width: 72, newline: "\n  " }));
});
