import { createUser, MIN_PASSWORD_LENGTH, resetPassword } from './accounts';
import { createCiToken, isCiTokenName, revokeCiToken } from './ci-tokens';
import type { Database } from './database';

/**
 * Server commands (D-21: sign-up is closed, accounts are made on the server):
 *
 *   node main.js create-user <email>
 *   node main.js reset-password <email>
 *   node main.js create-ci-token <name>    the CI's token for the X250's versions (D-31), shown once
 *   node main.js revoke-ci-token <name>
 *
 * The password is typed without echo (or read from standard input when piped).
 */
export const COMMANDS = [
  'create-user',
  'reset-password',
  'create-ci-token',
  'revoke-ci-token',
] as const;

function readPassword(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) {
    // Piped: the first line.
    return new Promise((resolve) => {
      let data = '';
      input.setEncoding('utf8');
      input.on('data', (chunk: string) => (data += chunk));
      input.on('end', () => resolve(data.split(/\r?\n/)[0] ?? ''));
    });
  }
  process.stdout.write(prompt);
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  return new Promise((resolve) => {
    let password = '';
    const onData = (key: string) => {
      for (const char of key) {
        if (char === '\r' || char === '\n') {
          input.setRawMode(false);
          input.pause();
          input.off('data', onData);
          process.stdout.write('\n');
          resolve(password);
          return;
        }
        if (char === '\u0003') process.exit(130); // Ctrl-C
        if (char === '\u007f') password = password.slice(0, -1);
        else password += char;
      }
    };
    input.on('data', onData);
  });
}

export async function runCommand(
  db: Database,
  command: (typeof COMMANDS)[number],
  email: string | undefined,
): Promise<number> {
  if (command === 'create-ci-token' || command === 'revoke-ci-token') {
    const name = email ?? '';
    if (!isCiTokenName(name)) {
      console.error(`Usage: node main.js ${command} <name>   (letters, digits, - and _)`);
      return 2;
    }
    if (command === 'create-ci-token') {
      const token = await createCiToken(db, name);
      console.log(`CI token « ${name} » (shown once, any earlier one revoked):\n${token}`);
      return 0;
    }
    const revoked = await revokeCiToken(db, name);
    console.log(revoked ? `CI token « ${name} » revoked.` : `No live CI token « ${name} ».`);
    return revoked ? 0 : 1;
  }
  if (!email || !email.includes('@')) {
    console.error(`Usage: node main.js ${command} <email>`);
    return 2;
  }
  const password = await readPassword(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `);
  try {
    if (command === 'create-user') {
      await createUser(db, email, password);
      console.log(`Account created for ${email}.`);
    } else {
      await resetPassword(db, email, password);
      console.log(`Password changed for ${email}; every device was signed out.`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}
