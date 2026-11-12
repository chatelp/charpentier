import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@charpentier/web', () => {
  it('loads', () => {
    expect(packageName).toBe('@charpentier/web');
  });
});
