import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@charpentier/schema', () => {
  it('loads', () => {
    expect(packageName).toBe('@charpentier/schema');
  });
});
