import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@charpentier/platform-web', () => {
  it('loads', () => {
    expect(packageName).toBe('@charpentier/platform-web');
  });
});
