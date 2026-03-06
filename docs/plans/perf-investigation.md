# Performance Investigation Plan

## Trace Summary (initial page load with Suspense + SSR)

Excluding intentional server delays (SlowSection), the client-side rendering pipeline breaks down as:

| Phase | Total (ms) | Max (ms) | Count | Description |
|-------|-----------|---------|-------|-------------|
| Native Paint | 39.0 | 17.2 | 6 | UIKit view creation/update after layout |
| SSR Reveal | 35.0 | 14.2 | 4 | Suspense boundary reveals (commit + paint) |
| Waiting for Paint | 29.0 | 10.0 | 7 | Scheduling idle time between work |
| SSR First Paint | 21.6 | 21.6 | 1 | Initial SSR paint (22 nodes) |
| Prepare Paint | 14.7 | 4.4 | 6 | Pre-paint preparation |
| Apply Mutations | 13.8 | 4.3 | 6 | JS-to-Swift bridge mutation calls |
| Commit (Scheduler) | 8.1 | 3.9 | 14 | React commit phase |
| Yoga Layout | 6.6 | 2.6 | 6 | Yoga layout calculation |
| CREATE ops | 6.9 | 2.0 | 62 | Shadow node creation |
| INSERT ops | 5.7 | 1.3 | 61 | Shadow node insertion |
| Render | 5.7 | 5.7 | 1 | React render phase |
| Hydrated | 5.5 | 5.5 | 1 | Hydration |

## Investigation Areas

### 1. Native Paint Optimization (39ms total)
- Why does UIKit view creation/update take 17ms max?
- Are views being created lazily or eagerly?
- Can we batch UIKit operations more efficiently?
- Is there redundant view hierarchy traversal?

### 2. SSR Reveal / First Paint (56.6ms combined)
- SSR First Paint: 21.6ms for 22 nodes seems high
- SSR Reveal: 14.2ms for 48 nodes — what dominates?
- Is there redundant layout computation during reveals?
- Can we batch multiple reveals into a single paint?

### 3. Apply Mutations / Bridge Overhead (13.8ms total)
- 4.3ms for 44 mutations = ~0.1ms per mutation
- How expensive is each JSC bridge call?
- Can mutations be batched into a single bridge call?
- Are there unnecessary round-trips?

### 4. Prepare Paint Phase (14.7ms total)
- What does Prepare Paint do exactly?
- Can any of its work be deferred or parallelized?

### 5. Yoga Layout Performance (6.6ms total)
- 2.6ms for 37 nodes = ~0.07ms per node
- Is Yoga being called incrementally or full-tree?
- Can dirty tracking reduce recalculation?

### 6. Scheduling Overhead (29ms Waiting for Paint)
- 29ms of idle "Waiting for Paint" time
- Is the scheduler yielding too aggressively?
- Can we reduce the gap between commit and paint?

### 7. Node Creation Cost (12.6ms CREATE+INSERT)
- CREATE #text taking 1.96ms is surprisingly slow
- CREATE span at 1.44ms
- Are these allocating UIViews unnecessarily?
- Can node pooling/recycling help?
