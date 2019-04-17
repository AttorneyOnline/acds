import fs from 'fs-extra';
import path from 'path';

import Ajv from 'ajv';

/** Retrieves a schema of a specified name from a constant directory. */
async function getSchema(name: string, prefix?: string): Promise<object> {
  return JSON.parse(
    (await fs.readFile(path.join(prefix, `${name}.json`))).toString()
  );
}

/** Parses data under a specified schema. */
export async function parseSchema(
  data: object,
  name: string,
  prefix?: string
): Promise<void> {
  const schema = await getSchema(name, prefix);
  const validate = new Ajv().compile(schema);
  const result = await validate(data);
  if (result === false) {
    throw new Error(
      'Error validating data:\n' +
        `${JSON.stringify(validate.errors, null, 2)}\n` +
        `Original:\n${JSON.stringify(data, null, 2)}`
    );
  }
}
