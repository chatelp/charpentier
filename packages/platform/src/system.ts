/** Device controls, only offered in appliance mode (docs/SPEC.md §13). */
export interface SystemService {
  network(): Promise<{ readonly connected: boolean; readonly ssid?: string }>;
  battery(): Promise<{ readonly level: number; readonly charging: boolean } | undefined>;
  setBrightness(level: number): Promise<void>;
  suspend(): Promise<void>;
  powerOff(): Promise<void>;
}
