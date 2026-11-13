import { describe, expect, it } from 'vitest';
import { createLockKeeper, isValidCode, type LockRecord } from './lock-keeper';

describe('the device code (phase 5.6)', () => {
  it('keeps a fingerprint, never the code, and checks it', async () => {
    let saved: LockRecord | null = null;
    const keeper = createLockKeeper({
      load: () => null,
      save: (r) => void (saved = r),
      iterations: 1_000,
    });
    expect(keeper.hasCode()).toBe(false);
    expect(await keeper.check('nimporte')).toBe('ok');
    await keeper.setCode('Loire44');
    expect(JSON.stringify(saved)).not.toContain('Loire44');
    expect(await keeper.check('loire44')).toBe('wrong');
    expect(await keeper.check('Loire44')).toBe('ok');
    // The fingerprint alone opens it again (after a restart).
    const again = createLockKeeper({ load: () => saved, save: () => {}, iterations: 1_000 });
    expect(await again.check('Loire44')).toBe('ok');
    await expect(keeper.setCode('abc')).rejects.toThrow();
  });

  it('waits 30 s after 5 wrong codes, doubled at each series', async () => {
    let now = 0;
    const keeper = createLockKeeper({
      load: () => null,
      save: () => {},
      now: () => now,
      iterations: 1_000,
    });
    await keeper.setCode('1234');
    for (let i = 0; i < 4; i++) expect(await keeper.check('0000')).toBe('wrong');
    expect(await keeper.check('0000')).toBe('wait');
    expect(keeper.retryAt()).toBe(30_000);
    expect(await keeper.check('1234')).toBe('wait');
    now = 30_000;
    for (let i = 0; i < 4; i++) expect(await keeper.check('0000')).toBe('wrong');
    expect(await keeper.check('0000')).toBe('wait');
    expect(keeper.retryAt()).toBe(90_000);
    now = 90_000;
    expect(await keeper.check('1234')).toBe('ok');
    expect(keeper.retryAt()).toBeNull();
  });

  it('accepts 4 to 8 letters or digits', () => {
    expect(isValidCode('1234')).toBe(true);
    expect(isValidCode('élan2026')).toBe(true);
    expect(isValidCode('123')).toBe(false);
    expect(isValidCode('123456789')).toBe(false);
    expect(isValidCode('12 34')).toBe(false);
  });
});
