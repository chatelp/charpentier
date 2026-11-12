import type { Platform } from '@charpentier/platform';
import { createContext, useContext } from 'react';

export const PlatformContext = createContext<Platform | null>(null);

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) throw new Error('usePlatform() called outside <App>');
  return platform;
}
