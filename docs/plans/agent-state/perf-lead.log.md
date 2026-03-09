# Perf Optimization Log

## Baseline
- **Total: 37.23ms** (target: 3.5ms, 10x improvement needed)
- Slowest: Commit 17.60ms, Render 14.82ms
- Shadow Tree: Commit 15.28ms, Apply Mutations 5.19ms, Prepare Paint 7.30ms
- Layout: 7.55ms total (Yoga 0.37ms, Scroll Content 2.49ms)
- Speculative Layout Wait: 6.35ms
- App logs: 808 lines of Yoga cache miss debug output

## Iterations

### Iteration 1: Remove YGLayoutSetLogging
- **Change**: Remove `YGLayoutSetLogging(true/false)` calls from Renderer.swift and Bindings+Registration.swift
- **Rationale**: 808 printf lines per commit from Yoga cache miss logging
- **Result**: pending
