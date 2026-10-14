import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const directory = new URL('../.local/', import.meta.url);
await mkdir(directory, { recursive: true });
try {
  await writeFile(new URL('agency-review.json', directory), JSON.stringify({ schemaVersion: 1, passphrase: randomBytes(32).toString('hex') }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Local reviewer configuration created in .local/agency-review.json. Read the passphrase from that ignored file to sign in.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Existing local reviewer configuration retained in .local/agency-review.json.');
}
