import UIKit

/// Installs global keyboard shortcuts for development.
/// Cmd+Shift+R triggers a full reload of the JS runtime.
///
/// Uses method swizzling on UIWindow to inject key commands into the
/// responder chain, so it works regardless of which view controller
/// is currently active.
enum DevKeyCommands {
    private static var installed = false

    static func install() {
        guard !installed else { return }
        installed = true

        let originalSelector = #selector(getter: UIResponder.keyCommands)
        let swizzledSelector = #selector(UIWindow.rdnKeyCommands)

        guard let originalMethod = class_getInstanceMethod(UIWindow.self, originalSelector),
              let swizzledMethod = class_getInstanceMethod(UIWindow.self, swizzledSelector) else { return }

        // class_addMethod only adds if UIWindow doesn't already override keyCommands.
        // This prevents swizzling on UIResponder (the superclass) which would crash
        // every UIView that receives the swizzled selector.
        if class_addMethod(UIWindow.self, originalSelector,
                           method_getImplementation(swizzledMethod),
                           method_getTypeEncoding(swizzledMethod)) {
            // Added successfully — point rdnKeyCommands to the original (UIResponder) IMP
            class_replaceMethod(UIWindow.self, swizzledSelector,
                                method_getImplementation(originalMethod),
                                method_getTypeEncoding(originalMethod))
        } else {
            // UIWindow already overrides keyCommands — safe to swap directly
            method_exchangeImplementations(originalMethod, swizzledMethod)
        }
    }
}

extension UIWindow {
    @objc func rdnKeyCommands() -> [UIKeyCommand]? {
        // Call original implementation (swizzled, so this calls the real getter)
        let existing = self.rdnKeyCommands() ?? []

        let reloadCommand = UIKeyCommand(
            title: "Reload",
            action: #selector(rdnHandleReload),
            input: "r",
            modifierFlags: [.command, .shift]
        )

        let debugMenuCommand = UIKeyCommand(
            title: "Debug Menu",
            action: #selector(rdnHandleDebugMenu),
            input: "d",
            modifierFlags: [.command, .shift]
        )

        return existing + [reloadCommand, debugMenuCommand]
    }

    @objc private func rdnHandleReload() {
        print("[DevKeyCommands] Cmd+Shift+R — reloading")
        ReactRuntime.shared.reload(fullReset: true)
    }

    @objc private func rdnHandleDebugMenu() {
        print("[DevKeyCommands] Cmd+Shift+D — opening debug menu")
        DebugMenu.shared.show()
    }
}
