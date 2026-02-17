import Foundation

// ---------------------------------------------------------------------------
// JSEngine
//
// Abstract interface over a JavaScript execution engine.
//
// Implementations:
//   - JavaScriptCoreEngine (today) — wraps Apple's JavaScriptCore Swift API
//   - JSIEngine (future) — wraps a C++ JSI layer over JSC's C API
//
// Only the implementation file imports the engine framework. All other code
// uses this protocol, enforcing clean boundaries at the type system level.
// ---------------------------------------------------------------------------

/// Opaque reference to a JavaScript value managed by a JSEngine.
///
/// For JavaScriptCoreEngine this is a JSValue instance.
/// For a future C++ JSI backend this would be a wrapper around jsi::Value.
public typealias JSValueRef = AnyObject

/// Abstract interface over a JavaScript execution engine.
public protocol JSEngine: AnyObject {

    // MARK: - Script evaluation

    /// Evaluates a JavaScript string in the engine's global scope.
    func evaluate(_ script: String, sourceURL: URL?)

    // MARK: - Error handling

    /// Called when an unhandled JS exception occurs.
    /// Parameters: (message, stack trace or nil).
    var exceptionHandler: ((String, String?) -> Void)? { get set }

    // MARK: - Global access

    /// Registers a function on the global object callable from JS.
    ///
    /// The body receives JS arguments as opaque refs. Use `toString()`,
    /// `toInt()`, etc. to extract Swift values from them. Return a ref
    /// created via `makeString()`, `makeNumber()`, etc., or nil for void.
    func setGlobalFunction(_ name: String, _ body: @escaping ([JSValueRef]) -> JSValueRef?)

    /// Sets a property on the global object.
    func setGlobalProperty(_ name: String, _ value: JSValueRef)

    /// Gets a property from the global object, or nil if undefined.
    func getGlobalProperty(_ name: String) -> JSValueRef?

    // MARK: - Value inspection

    /// Returns true if the value is JS `undefined`.
    func isUndefined(_ ref: JSValueRef) -> Bool

    /// Returns true if the value is JS `null`.
    func isNull(_ ref: JSValueRef) -> Bool

    // MARK: - Value conversion (JS -> Swift)

    func toString(_ ref: JSValueRef) -> String?
    func toInt(_ ref: JSValueRef) -> Int?
    func toDouble(_ ref: JSValueRef) -> Double?
    func toBool(_ ref: JSValueRef) -> Bool?
    func toDictionary(_ ref: JSValueRef) -> [String: Any]?
    func toArray(_ ref: JSValueRef) -> [JSValueRef]?

    // MARK: - Value creation (Swift -> JS)

    func makeString(_ value: String) -> JSValueRef
    func makeNumber(_ value: Double) -> JSValueRef
    func makeBool(_ value: Bool) -> JSValueRef
    func makeNull() -> JSValueRef
    func makeUndefined() -> JSValueRef

    /// Creates a new empty JS object.
    func makeObject() -> JSValueRef

    /// Creates a new JS array from the given elements.
    func makeArray(_ elements: [JSValueRef]) -> JSValueRef

    // MARK: - Object property access

    /// Gets a named property from a JS object.
    func getProperty(_ ref: JSValueRef, _ name: String) -> JSValueRef?

    /// Sets a named property on a JS object.
    func setProperty(_ ref: JSValueRef, _ name: String, _ value: JSValueRef)

    // MARK: - Function calls

    /// Calls a JS function with the given arguments.
    func callFunction(_ ref: JSValueRef, args: [JSValueRef]) -> JSValueRef?

    /// Creates a JS function backed by a native Swift callback.
    func makeFunction(_ body: @escaping ([JSValueRef]) -> JSValueRef?) -> JSValueRef

    // MARK: - Reference management

    /// Prevents the JS garbage collector from collecting this value.
    /// Must be balanced with a call to `unprotect()`.
    func protect(_ ref: JSValueRef)

    /// Allows the JS garbage collector to collect this value.
    func unprotect(_ ref: JSValueRef)

    // MARK: - Opaque native object bridging

    /// Wraps a Swift object so JS can hold it as an opaque handle.
    /// JS cannot inspect the object — it only holds a reference.
    func wrapNativeObject(_ object: AnyObject) -> JSValueRef

    /// Extracts a Swift object previously wrapped with `wrapNativeObject()`.
    func unwrapNativeObject<T: AnyObject>(_ ref: JSValueRef, as type: T.Type) -> T?
}

// MARK: - Convenience

public extension JSEngine {
    /// Evaluates a script with no source URL.
    func evaluate(_ script: String) {
        evaluate(script, sourceURL: nil)
    }
}
