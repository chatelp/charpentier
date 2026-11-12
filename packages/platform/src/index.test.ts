import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@charpentier/platform', () => {
  it('loads', () => {
    expect(packageName).toBe('@charpentier/platform');
  });
});
