import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@charpentier/core', () => {
  it('loads', () => {
    expect(packageName).toBe('@charpentier/core');
  });
});
