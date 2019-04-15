const fs = require('fs-extra');
const promisify = require('util').promisify;

const json2ts = require('json-schema-to-typescript');
const glob = promisify(require('glob'));
const wrap = require('word-wrap');

const out = 'src/Messages.ts';

async function compileSchemas(files, namespace) {
  await fs.appendFile(out, `\n\nexport namespace ${namespace} {\n\n`);

  const types = [];
  for (const file of files) {
    console.log(file);
    const schema = JSON.parse(fs.readFileSync(file).toString());
    const ts = await json2ts.compile(schema, schema.title, {
      bannerComment: null
    });
    await fs.appendFile(out, ts + '\n');
    types.push(schema.title);
  }

  await fs.appendFile(
    out,
    wrap(
      'export type Msg = ' + types.reduce((s, t) => s + ' | ' + t) + ';\n\n\n',
      { indent: '', width: 72, newline: '\n  ' }
    )
  );

  await fs.appendFile(out, '}\n');
}

async function compileAllSchemas() {
  if (await fs.exists(out)) {
    await fs.unlink(out);
  }

  await fs.appendFile(out, json2ts.DEFAULT_OPTIONS.bannerComment);

  await compileSchemas(await glob('schemas/server/*.json'), 'ServerMessages');
  await compileSchemas(await glob('schemas/client/*.json'), 'ClientMessages');
}

compileAllSchemas().catch(console.error);
