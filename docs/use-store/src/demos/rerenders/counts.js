// Body counters for the "who re-renders" demo. Every component calls
// countRender with its name at the top of its body, so the counts are the
// renders that actually ran, which G4 compares with the frame's flashes.

export const counts = {renders: {}, selectorCalls: 0};

export function countRender(name) {
  counts.renders[name] = (counts.renders[name] || 0) + 1;
}

export function countSelector() {
  counts.selectorCalls++;
}

export function takeCounts() {
  const taken = {renders: counts.renders, selectorCalls: counts.selectorCalls};
  counts.renders = {};
  counts.selectorCalls = 0;
  return taken;
}
