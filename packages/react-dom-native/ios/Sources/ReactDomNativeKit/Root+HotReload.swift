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

        onReload?()

        // Reset surface ID so render/startHydration re-registers
        surfaceId = nil
        layoutObserver?.invalidate()
        layoutObserver = nil

        // Clean up any SSR state from previous render
        ssrDataTask?.cancel()
        ssrDataTask = nil
        resumeDataTask?.cancel()
        resumeDataTask = nil
        ssrParser = nil
        ssrTreeBuilder = nil
        ssrBoundaryManager = nil
        ssrCoordinator = nil
        ssrFlightDataBuffer.removeAll()
        ssrJavaScriptBuffer.removeAll()
        ssrMutationApplierRef = nil
        ssrRevealHasOccurred = false
        ssrStreamComplete = false
        ssrShellComplete = false
        hydrationStarted = false
        hydrationCommitted = false
        pendingHydration = nil
        prerenderResumeURL = nil
        prerenderBootstrapURL = nil

        // Reset renderer state (new scroll view will be created by render/startHydration)
        renderer.teardown()
        // Re-create fresh ViewRegistry/MutationApplier (will be switched to Bindings' at hydration/CSR)
        renderer.viewRegistry = ViewRegistry()
        renderer.differentiator = Differentiator()
        renderer.mutationApplier = UIKitMutationApplier(viewRegistry: renderer.viewRegistry, logPrefix: "MutationApplier SSR")

        // Cancel any pending throttled reveals
        revealTimer?.cancel()
        revealTimer = nil
        pendingReveals.removeAll()

        // Clear container
        container.subviews.forEach { $0.removeFromSuperview() }

        switch renderMode {
        case .csr(let serverURL):
            print("[Root] Re-rendering (CSR) — \(serverURL)")
            render(url: serverURL)

        case .ssr(let ssrURL):
            print("[Root] Re-rendering (SSR + hydration) — \(ssrURL)")
            startHydration(url: ssrURL)

        case .prerender(let resumeURL):
            if let data = prerenderData {
                print("[Root] Re-rendering (prerender + resume) — \(resumeURL)")
                startResume(data: data, resumeURL: resumeURL)
            } else {
                // No cached data — fall back to normal SSR
                let ssrURL = resumeURL.replacingOccurrences(of: "/resume/", with: "/ssr/")
                print("[Root] Re-rendering (prerender fallback to SSR) — \(ssrURL)")
                startHydration(url: ssrURL)
            }

        case .serverOnly(let ssrURL):
            print("[Root] Re-rendering (server-only) — \(ssrURL)")
            startServerOnly(url: ssrURL)

        case .none:
            print("[Root] No render mode recorded, skipping re-render")
        }
    }
}
