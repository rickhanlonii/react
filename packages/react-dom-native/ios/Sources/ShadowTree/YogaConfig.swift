import Foundation
import Yoga

/// Shared Yoga configuration with web-like defaults.
///
/// Web defaults give: flexDirection: row, flexShrink: 1, alignContent: stretch
/// — matching CSS. Developers set flexDirection: 'column' explicitly when
/// they want vertical stacking, same as on the web.
public enum YogaConfig {
    // nonisolated(unsafe) because OpaquePointer is not Sendable, but the
    // config is only accessed from the main thread.
    nonisolated(unsafe) public static let shared: YGConfigRef = {
        let config = YGConfigNew()!
        YGConfigSetUseWebDefaults(config, true)
        // Point scale factor of 0 disables layout rounding.
        // The host app can update this via setPointScaleFactor() if needed.
        YGConfigSetPointScaleFactor(config, 0)
        return config
    }()

    /// Update the point scale factor for pixel-grid rounding.
    /// Call from the host app with the device's screen scale (e.g. 2.0, 3.0).
    public static func setPointScaleFactor(_ scale: Float) {
        YGConfigSetPointScaleFactor(shared, scale)
    }
}
