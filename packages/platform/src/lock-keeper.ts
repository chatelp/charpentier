/**
 * The device's code (docs/PLAN.md phase 5.6, docs/DESIGN.md §4.12): 4 to 8
 * letters or digits, kept as a PBKDF2 fingerprint outside every project. After
 * 5 wrong codes the device waits 30 s, doubled at each further series.
 * WebCrypto only, so the same keeper serves the X250 and its simulation.
 */
export interface LockRecord {
  readonly salt: string;
  readonly hash: string;
  readonly iterations: number;
}

export type UnlockResult = 'ok' | 'wrong' | 'wait';

export interface LockKeeper {
  hasCode(): boolean;
  /** A new code, or null for none. */
  setCode(code: string | null): Promise<void>;
  check(code: string): Promise<UnlockResult>;
  /** When a code may be tried again (ms since the epoch), or null. */
  retryAt(): number | null;
}

export const isValidCode = (code: string): boolean => /^[\p{L}\p{N}]{4,8}$/u.test(code);

const ITERATIONS = 200_000;
const SERIES = 5;
const FIRST_WAIT = 30_000;

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (text: string) =>
  new Uint8Array((text.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)));

async function fingerprint(
  code: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return hex(bits);
}

export function createLockKeeper(options: {
  load(): LockRecord | null;
  save(record: LockRecord | null): void;
  now?: () => number;
  /** Fewer rounds in the tests. */
  iterations?: number;
}): LockKeeper {
  const now = options.now ?? (() => Date.now());
  let record = options.load();
  let failures = 0;
  let waitUntil: number | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const checkOne = async (code: string): Promise<UnlockResult> => {
    if (!record) return 'ok';
    if (waitUntil !== null && now() < waitUntil) return 'wait';
    const hash = await fingerprint(code, unhex(record.salt), record.iterations);
    if (hash === record.hash) {
      failures = 0;
      waitUntil = null;
      return 'ok';
    }
    failures++;
    if (failures % SERIES === 0) {
      waitUntil = now() + FIRST_WAIT * 2 ** (failures / SERIES - 1);
      return 'wait';
    }
    return 'wrong';
  };
  return {
    hasCode: () => record !== null,
    setCode: async (code) => {
      if (code === null) record = null;
      else {
        if (!isValidCode(code)) throw new Error('A code has 4 to 8 letters or digits');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iterations = options.iterations ?? ITERATIONS;
        record = { salt: hex(salt), hash: await fingerprint(code, salt, iterations), iterations };
      }
      failures = 0;
      waitUntil = null;
      options.save(record);
    },
    // One check at a time: the fingerprint is awaited between the test of the
    // wait and the count of the failure, so parallel checks would all pass the
    // wait. Each one starts only when the previous one has counted.
    check: (code) => {
      const result = queue.then(() => checkOne(code));
      queue = result.catch(() => {});
      return result;
    },
    retryAt: () => (waitUntil !== null && now() < waitUntil ? waitUntil : null),
  };
}
