/** OS keychain-backed secret storage (BYOK API keys). Desktop only. */
export interface SecretsService {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
