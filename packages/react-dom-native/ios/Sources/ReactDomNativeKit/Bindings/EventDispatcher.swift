import Foundation
import UIKit
import JSEngine
import ShadowTree

// ---------------------------------------------------------------------------
// EventDispatcher
//
// Handles event dispatch between native UIKit views and the JS runtime.
// Owns the registered JS event handler and provides methods for dispatching
// native events (taps, etc.) to the React event system.
// ---------------------------------------------------------------------------

class EventDispatcher {
    private var eventHandler: JSValueRef?
    private let engine: JSEngine
    private let viewRegistry: ViewRegistry

    init(engine: JSEngine, viewRegistry: ViewRegistry) {
        self.engine = engine
        self.viewRegistry = viewRegistry
    }

    /// Registers a JS function as the event handler. Called via $$registerEventHandler.
    func registerEventHandler(_ handler: JSValueRef) {
        if let old = eventHandler {
            engine.unprotect(old)
        }
        engine.protect(handler)
        eventHandler = handler
    }

    /// Dispatches a native event to the JS event handler. Called from UIKit
    /// event handlers (tap gesture recognizers, scroll delegates, etc.).
    ///
    /// - Parameters:
    ///   - view: The UIView that received the event.
    ///   - eventType: The event type string (e.g. "click", "scroll", "change").
    ///   - payload: The event payload dictionary.
    func dispatchEvent(
        from view: UIView,
        eventType: String,
        payload: [String: Any]
    ) {
        // 1. Look up the ShadowNodeFamily for this view
        guard let family = viewRegistry.family(for: view) else {
            // View not in registry - possibly already unmounted. Silently drop.
            return
        }

        // 2. Get the InstanceHandle from the family
        guard let instanceHandle = family.instanceHandle else {
            // InstanceHandle was GC'd - node is unmounted. Silently drop.
            return
        }

        // 3. Get the registered event handler
        guard let handler = eventHandler else {
            print("[react-dom-native] Warning: No event handler registered")
            return
        }

        // 4. Call handler(instanceHandle, eventType, payload)
        _ = engine.callFunction(handler, args: [
            instanceHandle,
            engine.makeString(eventType),
            engine.wrapNativeObject(payload as NSDictionary)
        ])
    }

    /// Dispatches a synthetic tap at a point in window coordinates.
    /// Called from the DevTools screencast when the user clicks on the preview.
    func dispatchTouchAtWindowPoint(x: Double, y: Double) {
        let windowPoint = CGPoint(x: x, y: y)

        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first?.windows.first else {
            return
        }

        // Hit test from the window — UIKit finds the right view regardless
        // of whether it's in a nav bar, tab bar, scroll view, etc.
        guard let hitView = window.hitTest(windowPoint, with: nil) else {
            return
        }

        // Find the nearest UIControl (UIButton, _UIButtonBarButton, etc.)
        // and fire its primary action. This handles nav bar buttons, tab bar
        // items, and any other UIControl subclass.
        var controlSearch: UIView? = hitView
        while let view = controlSearch {
            if let control = view as? UIControl {
                control.sendActions(for: .touchUpInside)
                return
            }
            controlSearch = view.superview
        }

        // UITextField: focus it
        if hitView is UITextField {
            hitView.becomeFirstResponder()
            return
        }

        // React-managed views: walk up dispatching click events (event bubbling)
        var current: UIView? = hitView
        while let view = current {
            if let family = viewRegistry.family(for: view),
               family.hasClickHandler {
                dispatchEvent(from: view, eventType: "click", payload: ["_nativeTimestamp": performanceNow()])
            }
            current = view.superview
        }
    }

    deinit {
        if let handler = eventHandler {
            engine.unprotect(handler)
        }
    }
}
