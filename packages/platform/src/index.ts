// Abstract platform services. Each host provides one implementation
// (platform-web, platform-desktop); core only ever sees these interfaces.
export type * from './agents';
export type * from './documents';
export type * from './file-mirror';
export type * from './keybindings';
export type * from './llm';
export type * from './menu';
export type * from './platform';
export type * from './secrets';
export type * from './spellcheck';
export type * from './storage';
export type * from './sync';
export * from './system';
export * from './monitor';
export { simulatedMonitor } from './monitor-simulated';
export { createSimulatedSystem, type SimulatedSystem } from './system-simulated';
