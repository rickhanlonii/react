import UIKit

// ---------------------------------------------------------------------------
// Root+HotReload
//
// Hot reload / rerender support. Called by ReactRuntime during a full
// reset reload.
// ---------------------------------------------------------------------------

extension Root {

    /// Re-renders the surface using its original render mode (CSR or SSR+hydration).
    /// Called by ReactRuntime during a full reset reload.
    internal func rerender() {
        guard !isUnmounted else { return }

        // Reset surface ID so render/renderWithSSR re-registers
        surfaceId = nil
        layoutObserver?.invalidate()
        layoutObserver = nil

        // Clean up any SSR state from previous render
        ssrDataTask?.cancel()
        ssrDataTask = nil
        ssrParser = nil
        ssrTreeBuilder = nil
        ssrBoundaryManager = nil
        ssrCoordinator = nil
        ssrFlightDataBuffer.removeAll()
        ssrJavaScriptBuffer.removeAll()
        ssrViewRegistry = nil
        ssrMutationApplier = nil
        ssrRevealHasOccurred = false
        ssrStreamComplete = false
        ssrShellComplete = false
        hydrationStarted = false
        hydrationCommitted = false
        flightResponseId = nil
        postHydrationFlightBuffer.removeAll()
        pendingHydration = nil

        // Cancel any pending throttled reveals
        revealTimer?.cancel()
        revealTimer = nil
        pendingReveals.removeAll()

        // Clear container
        container.subviews.forEach { $0.removeFromSuperview() }

        switch renderMode {
        case .csr(let serverURL):
            print("[Root] Re-rendering (CSR) — \(serverURL)")
            render(serverURL: serverURL)

        case .ssr(let ssrURL, let flightURL):
            print("[Root] Re-rendering (SSR + hydration) — \(ssrURL)")
            renderWithSSR(serverURL: ssrURL) { error in
                if let error = error {
                    print("[Root] SSR re-render failed: \(error)")
                }
            }
            hydrateRoot(serverURL: flightURL) { error in
                if let error = error {
                    print("[Root] Hydration after re-render failed: \(error)")
                }
            }

        case .none:
            print("[Root] No render mode recorded, skipping re-render")
        }
    }
}
