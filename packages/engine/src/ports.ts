/**
 * External effects the engine may need. Add a port only when its first consumer
 * exists, so the engine cannot quietly depend on ambient runtime state.
 */
export type Clock = {
  readonly now: () => number;
};

export type EnginePorts = {
  readonly clock: Clock;
};
