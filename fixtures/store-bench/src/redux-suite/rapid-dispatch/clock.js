// The original calls Date.now() for `lastUpdated` (which is rendered) and for
// log entries. This clock advances by 1ms per call and restarts on every
// mount, so every variant renders the same timestamps.

export const START_TIME = 1700000000000;

let ticks = 0;

export function now() {
  ticks++;
  return START_TIME + ticks;
}

export function resetClock() {
  ticks = 0;
}
