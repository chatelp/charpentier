import { describe, expect, it } from 'vitest';
import { guardedCommand } from './tools';

describe('a long-running program dies with the app (X250, 16 November 2026)', () => {
  it('starts under setpriv --pdeathsig KILL where there is one', () => {
    expect(guardedCommand('nmcli', ['monitor'], '/run/current-system/sw/bin/setpriv')).toEqual([
      '/run/current-system/sw/bin/setpriv',
      ['--pdeathsig', 'KILL', '--', 'nmcli', 'monitor'],
    ]);
  });

  it('starts as it is elsewhere', () => {
    expect(guardedCommand('swayidle', ['-w'], null)).toEqual(['swayidle', ['-w']]);
  });
});
