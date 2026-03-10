import UIKit
import ShadowTree
import QuartzCore

// ---------------------------------------------------------------------------
// Root+BoundaryReveals
//
// Throttled boundary reveal methods. Batches SSR boundary reveals to
// prevent fallback flashes and optimize largest contentful paint.
// ---------------------------------------------------------------------------

extension Root {

    /// Queues a boundary reveal and schedules a flush.
    func queueBoundaryReveal(id: Int, contentNodes: [ShadowNodeWrapper]) {
        pendingReveals.append((id: id, contentNodes: contentNodes))
        scheduleRevealFlush()
    }

    /// Schedules a flush of pending reveals using throttling.
    /// If a timer is already pending, this is a no-op (the existing timer will flush all).
    func scheduleRevealFlush() {
        // Don't flush reveals during active hydration — mutating the SSR tree
        // (pending=false) while React is walking it causes hydration mismatches.
        // After hydration commits, reveals are safe (React has dehydrated fibers
        // and will re-render via $$notifyBoundaryRevealed retry callbacks).
        if hydrationStarted && !hydrationCommitted { return }

        // After hydration commits, flush immediately — no visual batching needed
        // since we skip SSR visual reveals and just notify React.
        if hydrationCommitted {
            flushPendingReveals()
            return
        }

        guard revealTimer == nil else { return }

        let now = performanceNow()
        let elapsed = now - (shellPaintTime ?? now)

        // Within the LCP window: use throttle delay to batch reveals.
        // After the LCP window: flush immediately (no visual benefit to batching).
        let delay: Double
        if elapsed < Self.TARGET_LCP_MS {
            delay = Self.FALLBACK_THROTTLE_MS
        } else {
            delay = 0
        }

        let work = DispatchWorkItem { [weak self] in
            self?.revealTimer = nil
            self?.flushPendingReveals()
        }
        revealTimer = work
        DispatchQueue.main.asyncAfter(
            deadline: .now() + .milliseconds(Int(delay)),
            execute: work
        )
    }

    /// Flushes all pending reveals in a single batch.
    func flushPendingReveals() {
        guard !pendingReveals.isEmpty else { return }
        let reveals = pendingReveals
        pendingReveals.removeAll()

        let rt = ReactRuntime.shared

        for reveal in reveals {
            if hydrationCommitted {
                // After hydration commits, apply reveals to the actual current tree
                // (which reflects React's commits) instead of the SSR coordinator's
                // stale internal tree. This prevents overwriting React state changes
                // (e.g., useEffect updates) with stale SSR data.

                // Assemble content nodes BEFORE cleanup removes them
                let contentNodes = ssrCoordinator?.segmentContentNodes(for: reveal.id) ?? reveal.contentNodes

                // 1. Clean up SSR state without visual update
                ssrCoordinator?.cleanupRevealState(id: reveal.id)

                // 2. Apply reveal to the actual current tree in Bindings
                if let surfaceId = surfaceId {
                    rt.bindings?.revealBoundaryInCurrentTree(
                        surfaceId: surfaceId, boundaryId: reveal.id, contentNodes: contentNodes
                    )
                }

                // 3. Update SSR reference tree for hydration traversal
                if let surfaceId = surfaceId {
                    rt.bindings?.revealBoundaryInSSRTree(
                        surfaceId: surfaceId, boundaryId: reveal.id, contentNodes: contentNodes
                    )
                }

                // 4. Notify React so it can fire retry callbacks
                if let engine = rt.engine {
                    engine.evaluate("globalThis.$$notifyBoundaryRevealed(\(reveal.id))")
                }
            } else {
                // Before hydration: process the visual update (diff + mutations)
                ssrCoordinator?.processReveal(id: reveal.id)

                // Mutate the SSR reference tree in place for hydration traversal
                if let surfaceId = surfaceId {
                    let contentNodes = ssrCoordinator?.segmentContentNodes(for: reveal.id) ?? reveal.contentNodes
                    rt.bindings?.revealBoundaryInSSRTree(
                        surfaceId: surfaceId, boundaryId: reveal.id, contentNodes: contentNodes
                    )
                }

                // Notify JS side so React can fire retry callbacks.
                // Skip for server-only mode — there's no hydration, and calling
                // this would pollute preRevealedBoundaries in the shared JS engine,
                // causing hydration mismatches if the user switches to hydrated mode.
                if case .serverOnly = renderMode {
                    // No-op: server-only doesn't use React runtime
                } else if let engine = rt.engine {
                    engine.evaluate("globalThis.$$notifyBoundaryRevealed(\(reveal.id))")
                }
            }
        }
    }
}
