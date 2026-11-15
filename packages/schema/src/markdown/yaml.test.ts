import { describe, expect, it } from 'vitest';
import { toYaml } from './yaml';

describe('toYaml', () => {
  it('writes nested maps and lists with quoted strings and block literals', () => {
    expect(
      toYaml({
        pitch: { value: 'Une enquête « aux serres »', status: 'validated' },
        characters: [{ id: 'c1', fields: { name: { value: 'Hélène' } } }],
        summary: 'Ligne 1\nLigne 2',
        empty: [],
      }),
    ).toBe(
      [
        'pitch:',
        '  value: "Une enquête « aux serres »"',
        '  status: "validated"',
        'characters:',
        '  - id: "c1"',
        '    fields:',
        '      name:',
        '        value: "Hélène"',
        'summary: |-',
        '  Ligne 1',
        '  Ligne 2',
        'empty: []',
        '',
      ].join('\n'),
    );
  });
});
