import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@charpentier/agents', () => {
  it('loads', () => {
    expect(packageName).toBe('@charpentier/agents');
  });
});
