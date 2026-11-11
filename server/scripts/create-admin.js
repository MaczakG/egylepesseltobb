// Admin felhasználó létrehozása vagy jelszavának visszaállítása.
//   npm run create-admin -- --email info@pelda.hu                (jelszót kér, vagy ADMIN_PASSWORD)
//   npm run create-admin -- --email info@pelda.hu --password-hash 'scrypt$...'
import fs from 'node:fs';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { MIN_PASSWORD_LENGTH, hashPassword, isPasswordHash } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { openDb, upsertUser } from '../src/db.js';

function promptHidden(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    // A beírt karakterek ne látszódjanak.
    rl._writeToOutput = (s) => { if (s.startsWith(question)) process.stdout.write(question); };
  });
}

const { values } = parseArgs({ options: { email: { type: 'string' }, 'password-hash': { type: 'string' } } });
const email = (values.email || '').trim();
if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
  console.error('Adj meg egy e-mail címet: --email info@pelda.hu');
  process.exit(1);
}

let passwordHash = values['password-hash'];
if (passwordHash) {
  if (!isPasswordHash(passwordHash)) {
    console.error('A --password-hash formátuma: scrypt$N$r$p$salt$hash');
    process.exit(1);
  }
} else {
  const password = process.env.ADMIN_PASSWORD || await promptHidden('Jelszó: ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`A jelszó legalább ${MIN_PASSWORD_LENGTH} karakter legyen.`);
    process.exit(1);
  }
  passwordHash = hashPassword(password);
}

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });
const { created } = upsertUser(openDb(config.dbPath), email, passwordHash);
console.log(created ? `Admin létrehozva: ${email}` : `Jelszó frissítve: ${email}`);
