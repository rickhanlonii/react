import JavaScriptCore

// ---------------------------------------------------------------------------
// JavaScriptCoreEngine
//
// JSEngine implementation backed by Apple's JavaScriptCore framework.
// This is the ONLY file in the project that imports JavaScriptCore.
//
// Threading: All operations must be called from the main thread.
// JSContext, JSValue, and JSManagedValue are not thread-safe.
// ---------------------------------------------------------------------------

public final class JavaScriptCoreEngine: JSEngine {

    // MARK: - Properties

    /// The underlying JSContext. Internal so JSRuntime can access it during
    /// the migration period (Phase 2). Will become private after Phase 3.
    internal let context: JSContext

    /// Refs held to prevent JS garbage collection.
    /// Strong references keep the underlying JSValues alive, which in turn
    /// prevents JSC from garbage-collecting the JS-side values.
    private var protectedRefs: [ObjectIdentifier: AnyObject] = [:]

    public var exceptionHandler: ((String, String?) -> Void)?

    // MARK: - Initialization

    public init() {
        guard let ctx = JSContext() else {
            fatalError("Failed to create JSContext")
        }
        self.context = ctx

        // Enable Safari Web Inspector for breakpoint debugging in debug builds.
        // Users connect via Safari → Develop → Simulator → "Falcon — react-dom-native".
        #if DEBUG
        if #available(iOS 16.4, *) {
            context.isInspectable = true
        }
        context.name = "Falcon — react-dom-native"
        #endif

        // Wire JSC exceptions to our handler
        context.exceptionHandler = { [weak self] ctx, exception in
            guard let error = exception else { return }
            let message = error.toString() ?? "Unknown JS error"
            let stack = error.objectForKeyedSubscript("stack")?.toString()
            self?.exceptionHandler?(message, stack)
        }
    }

    // MARK: - Script evaluation

    public func evaluate(_ script: String, sourceURL: URL?) {
        if let url = sourceURL {
            context.evaluateScript(script, withSourceURL: url)
        } else {
            context.evaluateScript(script)
        }
    }

    // MARK: - Global access

    public func setGlobalFunction(_ name: String, _ body: @escaping ([JSValueRef]) -> JSValueRef?) {
        let fn = makeFunction(body)
        setGlobalProperty(name, fn)
    }

    public func setGlobalProperty(_ name: String, _ value: JSValueRef) {
        if let jsValue = value as? JSValue {
            context.setObject(jsValue, forKeyedSubscript: name as NSString)
        } else {
            // Non-JSValue AnyObject — wrap for JS
            let jsValue = JSValue(object: value, in: context)
            context.setObject(jsValue, forKeyedSubscript: name as NSString)
        }
    }

    public func getGlobalProperty(_ name: String) -> JSValueRef? {
        guard let value = context.objectForKeyedSubscript(name),
              !value.isUndefined else {
            return nil
        }
        return value
    }

    // MARK: - Value inspection

    public func isUndefined(_ ref: JSValueRef) -> Bool {
        guard let jsValue = ref as? JSValue else { return false }
        return jsValue.isUndefined
    }

    public func isNull(_ ref: JSValueRef) -> Bool {
        guard let jsValue = ref as? JSValue else { return false }
        return jsValue.isNull
    }

    // MARK: - Value conversion (JS -> Swift)

    public func toString(_ ref: JSValueRef) -> String? {
        guard let jsValue = ref as? JSValue, !jsValue.isUndefined, !jsValue.isNull else {
            return nil
        }
        return jsValue.toString()
    }

    public func toInt(_ ref: JSValueRef) -> Int? {
        guard let jsValue = ref as? JSValue, !jsValue.isUndefined, !jsValue.isNull else {
            return nil
        }
        return Int(jsValue.toInt32())
    }

    public func toDouble(_ ref: JSValueRef) -> Double? {
        guard let jsValue = ref as? JSValue, !jsValue.isUndefined, !jsValue.isNull else {
            return nil
        }
        return jsValue.toDouble()
    }

    public func toBool(_ ref: JSValueRef) -> Bool? {
        guard let jsValue = ref as? JSValue, !jsValue.isUndefined, !jsValue.isNull else {
            return nil
        }
        return jsValue.toBool()
    }

    public func toDictionary(_ ref: JSValueRef) -> [String: Any]? {
        guard let jsValue = ref as? JSValue, !jsValue.isUndefined, !jsValue.isNull else {
            return nil
        }
        return jsValue.toDictionary() as? [String: Any]
    }

    public func toArray(_ ref: JSValueRef) -> [JSValueRef]? {
        guard let jsValue = ref as? JSValue, !jsValue.isUndefined, !jsValue.isNull else {
            return nil
        }
        guard let arr = jsValue.toArray() else { return nil }
        return arr.compactMap { item -> JSValueRef? in
            if let val = item as? JSValue { return val }
            return JSValue(object: item, in: context)
        }
    }

    // MARK: - Value creation (Swift -> JS)

    public func makeString(_ value: String) -> JSValueRef {
        return JSValue(object: value, in: context)!
    }

    public func makeNumber(_ value: Double) -> JSValueRef {
        return JSValue(double: value, in: context)!
    }

    public func makeBool(_ value: Bool) -> JSValueRef {
        return JSValue(bool: value, in: context)!
    }

    public func makeNull() -> JSValueRef {
        return JSValue(nullIn: context)!
    }

    public func makeUndefined() -> JSValueRef {
        return JSValue(undefinedIn: context)!
    }

    public func makeObject() -> JSValueRef {
        return JSValue(newObjectIn: context)!
    }

    public func makeArray(_ elements: [JSValueRef]) -> JSValueRef {
        let jsElements: [Any] = elements.map { elem in
            if let jsVal = elem as? JSValue { return jsVal }
            return elem
        }
        return JSValue(object: jsElements, in: context)!
    }

    // MARK: - Object property access

    public func getProperty(_ ref: JSValueRef, _ name: String) -> JSValueRef? {
        guard let jsValue = ref as? JSValue else { return nil }
        guard let prop = jsValue.objectForKeyedSubscript(name),
              !prop.isUndefined else {
            return nil
        }
        return prop
    }

    public func setProperty(_ ref: JSValueRef, _ name: String, _ value: JSValueRef) {
        guard let jsObj = ref as? JSValue else { return }
        if let jsVal = value as? JSValue {
            jsObj.setObject(jsVal, forKeyedSubscript: name as NSString)
        } else {
            jsObj.setObject(value, forKeyedSubscript: name as NSString)
        }
    }

    // MARK: - Function calls

    public func callFunction(_ ref: JSValueRef, args: [JSValueRef]) -> JSValueRef? {
        guard let jsFunc = ref as? JSValue else { return nil }
        // Convert args: JSValues pass through, other AnyObjects get wrapped
        let jsArgs: [Any] = args.map { arg in
            if let jsVal = arg as? JSValue { return jsVal }
            return arg
        }
        let result = jsFunc.call(withArguments: jsArgs)
        if let r = result, !r.isUndefined {
            return r
        }
        return nil
    }

    public func makeFunction(_ body: @escaping ([JSValueRef]) -> JSValueRef?) -> JSValueRef {
        let ctx = self.context
        let wrapper: @convention(block) () -> JSValue? = {
            let jsArgs = JSContext.currentArguments() as? [JSValue] ?? []
            let args: [JSValueRef] = jsArgs
            guard let result = body(args) else {
                return nil
            }
            if let jsValue = result as? JSValue {
                return jsValue
            }
            // Non-JSValue AnyObject (e.g. NSObject subclass) — wrap for JS
            return JSValue(object: result, in: ctx)
        }
        return JSValue(object: wrapper, in: ctx)!
    }

    // MARK: - Reference management

    public func protect(_ ref: JSValueRef) {
        protectedRefs[ObjectIdentifier(ref)] = ref
    }

    public func unprotect(_ ref: JSValueRef) {
        protectedRefs.removeValue(forKey: ObjectIdentifier(ref))
    }

    // MARK: - Opaque native object bridging

    public func wrapNativeObject(_ object: AnyObject) -> JSValueRef {
        return JSValue(object: object, in: context)!
    }

    public func unwrapNativeObject<T: AnyObject>(_ ref: JSValueRef, as type: T.Type) -> T? {
        guard let jsValue = ref as? JSValue else {
            return ref as? T
        }
        return jsValue.toObjectOf(type) as? T
    }
}
