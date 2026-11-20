import { createUser, MIN_PASSWORD_LENGTH, normalizeEmail, resetPassword } from './accounts';
import { createCiToken, isCiTokenName, revokeCiToken } from './ci-tokens';
import type { Database } from './database';
import { monthOf, provideCompagnon, providedSecret, spendOf, withdrawCompagnon } from './provided';

/**
 * Server commands (D-21: sign-up is closed, accounts are made on the server):
 *
 *   node main.js create-user [--admin] <email>   (the first account is an administrator anyway)
 *   node main.js reset-password <email>
 *   node main.js create-ci-token <name>    the CI's token for the X250's versions (D-31), shown once
 *   node main.js revoke-ci-token <name>
 *   node main.js provide-compagnon [--ceiling-usd=<n>] <email>   attaches an API key (typed, never
 *                                          shown) to an account, with its ceiling per month (phase 4.8)
 *   node main.js withdraw-compagnon <email>
 *   node main.js compagnon-spend           what each account spent this month
 *
 * The password is typed without echo (or read from standard input when piped).
 */
export const COMMANDS = [
  'create-user',
  'reset-password',
  'create-ci-token',
  'revoke-ci-token',
  'provide-compagnon',
  'withdraw-compagnon',
  'compagnon-spend',
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
  args: readonly string[],
): Promise<number> {
  const admin = args.includes('--admin');
  const email = args.find((a) => !a.startsWith('--'));
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
  if (command === 'compagnon-spend') {
    const month = monthOf(new Date());
    const { rows } = await db.query<{ id: string; email: string }>(
      'select id, email from users order by email',
    );
    for (const user of rows) {
      const { micros, calls } = await spendOf(db, user.id, month);
      console.log(`${user.email} · ${month} · $${(micros / 1e6).toFixed(2)} · ${calls} calls`);
    }
    return 0;
  }
  if (command === 'provide-compagnon' || command === 'withdraw-compagnon') {
    const { rows } = await db.query<{ id: string }>('select id from users where email = $1', [
      normalizeEmail(email ?? ''),
    ]);
    const userId = rows[0]?.id;
    if (!userId) {
      console.error(`Usage: node main.js ${command} <email of an account>`);
      return 2;
    }
    if (command === 'withdraw-compagnon') {
      const done = await withdrawCompagnon(db, userId);
      console.log(done ? `Provided Compagnon withdrawn from ${email}.` : `${email} had none.`);
      return done ? 0 : 1;
    }
    const secret = providedSecret(process.env['COMPAGNON_SECRET']);
    if (!secret) {
      console.error('COMPAGNON_SECRET is missing or malformed (64 hexadecimal digits).');
      return 1;
    }
    const ceilingArg = args.find((a) => a.startsWith('--ceiling-usd='))?.split('=')[1];
    const ceiling = ceilingArg === undefined ? null : Number(ceilingArg);
    if (ceiling !== null && !(ceiling >= 0)) {
      console.error('--ceiling-usd: a number of dollars, e.g. --ceiling-usd=5');
      return 2;
    }
    const apiKey = (await readPassword('Anthropic API key (not shown): ')).trim();
    if (!/^sk-ant-\S+$/.test(apiKey)) {
      console.error('This is not an Anthropic API key (sk-ant-…).');
      return 1;
    }
    await provideCompagnon(
      db,
      secret,
      userId,
      apiKey,
      ceiling === null ? null : Math.round(ceiling * 100),
    );
    console.log(
      `Compagnon provided to ${email}${ceiling === null ? ', no ceiling' : `, ceiling $${ceiling} a month`}.`,
    );
    return 0;
  }
  if (!email || !email.includes('@')) {
    console.error(`Usage: node main.js ${command} <email>`);
    return 2;
  }
  const password = await readPassword(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `);
  try {
    if (command === 'create-user') {
      await createUser(db, email, password, { admin });
      console.log(`Account created for ${email}${admin ? ', administrator' : ''}.`);
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
