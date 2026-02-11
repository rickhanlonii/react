# iOS UIKit Patterns for React-Driven Native View Hierarchy

Research into the UIKit APIs and patterns needed to implement a React-driven native view hierarchy on iOS. All code examples are in Swift (our implementation language), with notes on the Objective-C patterns used in React Native's reference implementation where relevant.

---

## 1. View Hierarchy Management

### 1.1 UIView Creation

Every native view in our renderer will be a `UIView` subclass. Views are created with `init(frame:)` and added to the hierarchy.

```swift
// Basic view creation
let view = UIView(frame: .zero)

// Custom view subclass for our renderer
class RDNView: UIView {
        var reactTag: Int = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        // Disable Auto Layout — we use Yoga-computed frames
        self.translatesAutoresizingMaskIntoConstraints = true
        // Enable multi-touch
        self.isMultipleTouchEnabled = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) not supported")
    }
}
```

### 1.2 Subview Operations

Core methods for building the view tree:

```swift
// Insert child at specific index (used by React reconciler)
parentView.insertSubview(childView, at: index)

// Remove from parent
childView.removeFromSuperview()

// Add to end (less common — reconciler uses index-based insertion)
parentView.addSubview(childView)
```

**Key pattern from React Native Fabric (`RCTViewComponentView`):**

```swift
// Mount: insert at reconciler-specified index
func mountChildComponentView(_ child: UIView, at index: Int) {
    insertSubview(child, at: index)
}

// Unmount: remove from superview
func unmountChildComponentView(_ child: UIView, at index: Int) {
    child.removeFromSuperview()
}
```

### 1.3 Frame vs. Bounds vs. Center

When Yoga computes layout, it gives us `(x, y, width, height)` — a frame in the parent's coordinate system.

| Property | Definition | When to Use |
|----------|-----------|-------------|
| `frame` | Position and size in **superview's** coordinate system | Setting position from Yoga output |
| `bounds` | Size in **own** coordinate system (origin usually 0,0) | Reading the view's own dimensions |
| `center` | Center point in **superview's** coordinate system | Setting position when transforms are active |

**Critical pattern from React Native:** When `layer.transform` is not identity, setting `frame` is undefined behavior. React Native always uses `center` + `bounds` instead:

```swift
func applyLayout(frame: CGRect) {
    // Convert frame to center + bounds (safe with transforms)
    self.center = CGPoint(x: frame.midX, y: frame.midY)
    self.bounds = CGRect(origin: .zero, size: frame.size)
}
```

React Native's `reactSetFrame:` validates against NaN/Inf before applying:

```swift
func applyLayoutSafely(frame: CGRect) {
    guard frame.origin.x.isFinite,
          frame.origin.y.isFinite,
          frame.size.width.isFinite,
          frame.size.height.isFinite else {
        print("Invalid layout: \(frame)")
        return
    }
    self.center = CGPoint(x: frame.midX, y: frame.midY)
    self.bounds = CGRect(origin: .zero, size: frame.size)
}
```

### 1.4 View Recycling (Component Pool)

React Native Fabric uses a **component view registry** with a recycle pool — views are not destroyed on unmount but returned to a pool keyed by component type:

```swift
class ViewPool {
    private var pool: [String: [UIView]] = [:]
    private let maxPoolSize = 1024

    func dequeue(type: String) -> UIView? {
        return pool[type]?.popLast()
    }

    func enqueue(view: UIView, type: String) {
        if (pool[type]?.count ?? 0) >= maxPoolSize {
            return // Don't recycle, let it be deallocated
        }
        view.prepareForRecycle() // Reset state before pooling
        pool[type, default: []].append(view)
    }

    func handleMemoryWarning() {
        pool.removeAll()
    }
}
```

The view must implement `prepareForRecycle()` to reset any local state:

```swift
func prepareForRecycle() {
    // Reset all properties to defaults
    reactTag = 0
    layer.transform = CATransform3DIdentity
    layer.opacity = 1.0
    // etc.
}
```

### 1.5 Z-Index (Stacking Order)

React Native uses `layer.zPosition` for z-index ordering:

```swift
view.layer.zPosition = CGFloat(zIndex)
```

When z-index sorting is needed for hit testing, views are sorted:

```swift
func zIndexSortedSubviews() -> [UIView] {
    // Only sort if any subview has non-zero zPosition
    let needsSort = subviews.contains { $0.layer.zPosition != 0 }
    guard needsSort else { return subviews }
    return subviews.sorted { $0.layer.zPosition < $1.layer.zPosition }
}
```

---

## 2. Layout

### 2.1 Bypassing Auto Layout

We bypass Auto Layout entirely. Yoga computes all frames and we apply them directly.

```swift
// CRITICAL: Set on every view we create
view.translatesAutoresizingMaskIntoConstraints = true

// Never add NSLayoutConstraints to our views
// Never use Auto Layout anchors
```

This is safe because:
- `translatesAutoresizingMaskIntoConstraints = true` is the default for views created in code
- We never activate any `NSLayoutConstraint` on our views
- We set frames directly from Yoga output

### 2.2 layoutSubviews Override

`layoutSubviews()` is called by UIKit when the view needs to re-layout its children. In our architecture, Yoga handles all layout, so we use `layoutSubviews()` primarily for:

1. Updating content views (e.g., text view frame matches parent bounds)
2. Triggering clipped subview updates for scroll views

```swift
class RDNView: UIView {
    override func layoutSubviews() {
        super.layoutSubviews()
        // Update content view frame if we have one
        contentView?.frame = bounds
        // Update clipping if removeClippedSubviews is enabled
        if removeClippedSubviews {
            updateClippedSubviews()
        }
    }
}
```

### 2.3 Layout Batching

UIKit provides two mechanisms for batching layout:

```swift
// Mark view as needing layout (coalesced, runs at end of run loop)
view.setNeedsLayout()

// Force immediate layout (synchronous)
view.layoutIfNeeded()
```

**For our renderer:**
- After React commits a batch of mutations, call `setNeedsLayout()` on affected views
- Only use `layoutIfNeeded()` when we need synchronous measurement (e.g., text measurement for Yoga)

### 2.4 Display Updates

```swift
// Mark view's CALayer as needing redraw (for custom drawing, borders, etc.)
view.layer.setNeedsDisplay()

// Mark view as needing display
view.setNeedsDisplay()
```

React Native's `RCTView` overrides `displayLayer:` to draw borders — this is called by Core Animation when the layer needs redrawing.

---

## 3. Event Handling

### 3.1 UIGestureRecognizer

Gesture recognizers are the primary way to handle touch input. React Native attaches a single gesture recognizer to the root view that captures all touches:

```swift
// Tap
let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
view.addGestureRecognizer(tap)

// Long Press
let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
view.addGestureRecognizer(longPress)

// Pan (drag/scroll)
let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
view.addGestureRecognizer(pan)

// Swipe
let swipe = UISwipeGestureRecognizer(target: self, action: #selector(handleSwipe(_:)))
swipe.direction = .right
view.addGestureRecognizer(swipe)
```

### 3.2 Touch Event Propagation

React Native's touch handling pattern (from `RCTTouchHandler`):

1. A custom `UIGestureRecognizer` subclass is attached to the root view
2. It captures all touches via `touchesBegan/Moved/Ended/Cancelled`
3. Touch targets are resolved by walking up from `touch.view` to find a React-managed view
4. Touch data is serialized and dispatched to JS

```swift
class TouchHandler: UIGestureRecognizer {
    // Critical: don't cancel touches in content views — let them pass through
    init() {
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        for touch in touches {
            // Find the React-managed view that was touched
            var targetView = touch.view
            while let view = targetView {
                if view is RDNView { break }
                targetView = view.superview
            }
            // Record touch and dispatch to JS
        }
    }
}
```

### 3.3 Hit Testing

UIKit's hit testing determines which view receives a touch event:

```swift
// Override hitTest to control touch delivery
override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard isUserInteractionEnabled, !isHidden else { return nil }

    // Check subviews in reverse order (front to back)
    // Respect z-index sorting
    for subview in zIndexSortedSubviews().reversed() {
        let convertedPoint = subview.convert(point, from: self)
        if let hitView = subview.hitTest(convertedPoint, with: event) {
            return hitView
        }
    }

    // Check self
    return self.point(inside: point, with: event) ? self : nil
}

// Override pointInside for custom hit areas (e.g., hitSlop)
override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    let hitFrame = bounds.inset(by: hitTestEdgeInsets)
    return hitFrame.contains(point)
}
```

React Native's `pointerEvents` prop controls hit testing behavior:

```swift
enum PointerEvents {
    case auto        // Default — self and children respond
    case none        // Neither self nor children respond
    case boxOnly     // Only self responds (children pass through)
    case boxNone     // Only children respond (self passes through)
}
```

### 3.4 UIControl for Interactive Elements

For `<button>` and `<input>` elements, we may use `UIControl.addTarget`:

```swift
let button = UIButton(type: .system)
button.addTarget(self, action: #selector(handlePress(_:)), for: .touchUpInside)
```

However, React Native avoids `UIControl` entirely, using gesture recognizers for everything. This gives more control over the touch lifecycle. We should follow this pattern.

---

## 4. Text Rendering

### 4.1 UILabel for Simple Text

For basic text (`<span>`, `<p>` with simple content):

```swift
let label = UILabel()
label.text = "Hello"
label.font = UIFont.systemFont(ofSize: 16)
label.textColor = .black
label.numberOfLines = 0 // Allow wrapping
```

### 4.2 NSAttributedString for Rich Text

For styled text with mixed formatting (React's `<span>` nesting):

```swift
let attributed = NSMutableAttributedString()

// Bold portion
attributed.append(NSAttributedString(
    string: "Bold ",
    attributes: [
        .font: UIFont.boldSystemFont(ofSize: 16),
        .foregroundColor: UIColor.black
    ]
))

// Italic portion
attributed.append(NSAttributedString(
    string: "italic",
    attributes: [
        .font: UIFont.italicSystemFont(ofSize: 16),
        .foregroundColor: UIColor.gray
    ]
))

label.attributedText = attributed
```

### 4.3 Text Measurement

Text measurement is essential for Yoga's layout — Yoga needs to know how big text content will be. React Native uses the TextKit stack (NSTextStorage + NSLayoutManager + NSTextContainer):

```swift
func measureText(
    attributedString: NSAttributedString,
    maxWidth: CGFloat,
    maxLines: Int
) -> CGSize {
    let textStorage = NSTextStorage(attributedString: attributedString)
    let layoutManager = NSLayoutManager()
    let textContainer = NSTextContainer(size: CGSize(width: maxWidth, height: .greatestFiniteMagnitude))

    textContainer.lineFragmentPadding = 0
    textContainer.maximumNumberOfLines = maxLines
    textContainer.lineBreakMode = .byTruncatingTail

    layoutManager.addTextContainer(textContainer)
    textStorage.addLayoutManager(layoutManager)

    // Force layout
    layoutManager.ensureLayout(for: textContainer)

    // Get used rect
    let usedRect = layoutManager.usedRect(for: textContainer)
    return CGSize(
        width: ceil(usedRect.width),
        height: ceil(usedRect.height)
    )
}
```

**Alternative: `sizeThatFits`** for simpler cases:

```swift
let label = UILabel()
label.attributedText = attributedString
label.numberOfLines = maxLines
let size = label.sizeThatFits(CGSize(width: maxWidth, height: .greatestFiniteMagnitude))
```

**Alternative: `NSAttributedString.boundingRect`** (thread-safe):

```swift
let rect = attributedString.boundingRect(
    with: CGSize(width: maxWidth, height: .greatestFiniteMagnitude),
    options: [.usesLineFragmentOrigin, .usesFontLeading],
    context: nil
)
```

Note: `boundingRect` can be called off the main thread, which is useful for background layout calculations.

### 4.4 Custom Text Drawing

React Native's Fabric text component uses `drawRect:` for maximum control:

```swift
class TextContentView: UIView {
    var textStorage: NSTextStorage?
    var layoutManager: NSLayoutManager?
    var textContainer: NSTextContainer?

    override func draw(_ rect: CGRect) {
        guard let layoutManager = layoutManager,
              let textContainer = textContainer else { return }

        let glyphRange = layoutManager.glyphRange(for: textContainer)
        let origin = bounds.origin

        layoutManager.drawBackground(forGlyphRange: glyphRange, at: origin)
        layoutManager.drawGlyphs(forGlyphRange: glyphRange, at: origin)
    }
}
```

This approach provides:
- Pixel-perfect rendering control
- Highlight/selection rendering via `enumerateEnclosingRects`
- Touch-to-character mapping for link taps

### 4.5 Font Handling

```swift
// System fonts
UIFont.systemFont(ofSize: 16)
UIFont.systemFont(ofSize: 16, weight: .bold)
UIFont.boldSystemFont(ofSize: 16)
UIFont.italicSystemFont(ofSize: 16)
UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)

// Custom fonts (must be registered in Info.plist)
UIFont(name: "CustomFont-Regular", size: 16)

// Font descriptor for fine-grained control
let descriptor = UIFontDescriptor.preferredFontDescriptor(withTextStyle: .body)
let font = UIFont(descriptor: descriptor, size: 0) // 0 = use descriptor's size
```

### 4.6 Dynamic Type (Accessibility)

```swift
// Preferred fonts that scale with user's text size setting
let bodyFont = UIFont.preferredFont(forTextStyle: .body)

// Scale custom fonts
let customFont = UIFont(name: "CustomFont", size: 16)!
let metrics = UIFontMetrics(forTextStyle: .body)
let scaledFont = metrics.scaledFont(for: customFont)

// Observe font size changes
NotificationCenter.default.addObserver(
    self,
    selector: #selector(handleContentSizeChange),
    name: UIContentSizeCategory.didChangeNotification,
    object: nil
)
```

---

## 5. Images

### 5.1 UIImageView

```swift
let imageView = UIImageView()
imageView.clipsToBounds = true
imageView.contentMode = .scaleAspectFill // or .scaleAspectFit, .center, etc.

// Content modes mapping to CSS object-fit:
// .scaleToFill     -> object-fit: fill
// .scaleAspectFit  -> object-fit: contain
// .scaleAspectFill -> object-fit: cover
// .center          -> object-fit: none

// Trilinear filtering for better downscaling quality
imageView.layer.minificationFilter = .trilinear
imageView.layer.magnificationFilter = .trilinear
```

### 5.2 Async Image Loading

```swift
// URLSession-based async loading
func loadImage(from url: URL, into imageView: UIImageView) {
    let task = URLSession.shared.dataTask(with: url) { data, response, error in
        guard let data = data, let image = UIImage(data: data) else { return }

        // MUST dispatch to main thread for UIKit updates
        DispatchQueue.main.async {
            imageView.image = image
        }
    }
    task.resume()
}
```

### 5.3 Image Caching

```swift
// NSCache-based in-memory cache
class ImageCache {
    static let shared = ImageCache()
    private let cache = NSCache<NSURL, UIImage>()

    init() {
        cache.countLimit = 100
        cache.totalCostLimit = 50 * 1024 * 1024 // 50 MB
    }

    func image(for url: URL) -> UIImage? {
        return cache.object(forKey: url as NSURL)
    }

    func store(_ image: UIImage, for url: URL) {
        let cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4)
        cache.setObject(image, forKey: url as NSURL, cost: cost)
    }
}
```

`NSCache` automatically evicts entries on memory pressure — no need to observe `didReceiveMemoryWarning` for the cache itself.

For disk caching, use `URLCache` (built into `URLSession`):

```swift
let config = URLSessionConfiguration.default
config.urlCache = URLCache(
    memoryCapacity: 20 * 1024 * 1024,  // 20 MB memory
    diskCapacity: 100 * 1024 * 1024,    // 100 MB disk
    diskPath: "image_cache"
)
let session = URLSession(configuration: config)
```

### 5.4 Image Tinting and Processing

```swift
// Tint color (for monochrome icons)
let tintedImage = originalImage.withRenderingMode(.alwaysTemplate)
imageView.image = tintedImage
imageView.tintColor = .blue

// Resizable images (9-patch style)
let resizable = image.resizableImage(
    withCapInsets: UIEdgeInsets(top: 10, left: 10, bottom: 10, right: 10),
    resizingMode: .stretch
)

// Background blur processing (from React Native)
// Do on background thread, return to main
DispatchQueue.global(qos: .default).async {
    let blurred = applyBlur(to: image, radius: blurRadius)
    DispatchQueue.main.async {
        imageView.image = blurred
    }
}
```

---

## 6. Scrolling

### 6.1 UIScrollView Fundamentals

```swift
let scrollView = UIScrollView(frame: .zero)

// Content size determines scrollable area
scrollView.contentSize = CGSize(width: 320, height: 2000)

// Current scroll position
let offset = scrollView.contentOffset

// Programmatic scrolling
scrollView.setContentOffset(CGPoint(x: 0, y: 100), animated: true)
scrollView.scrollRectToVisible(targetRect, animated: true)

// Configuration
scrollView.bounces = true
scrollView.alwaysBounceVertical = true
scrollView.showsVerticalScrollIndicator = true
scrollView.showsHorizontalScrollIndicator = false
scrollView.isPagingEnabled = false
scrollView.isScrollEnabled = true

// Disable automatic content inset adjustment
scrollView.contentInsetAdjustmentBehavior = .never
```

### 6.2 Scroll View Delegate

```swift
class ScrollViewHandler: NSObject, UIScrollViewDelegate {
    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        // Called continuously during scroll — throttle events to JS
        let offset = scrollView.contentOffset
        // Dispatch onScroll event (with throttling)
    }

    func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        // User started dragging — dispatch onScrollBeginDrag
    }

    func scrollViewWillEndDragging(
        _ scrollView: UIScrollView,
        withVelocity velocity: CGPoint,
        targetContentOffset: UnsafeMutablePointer<CGPoint>
    ) {
        // User lifted finger — can modify targetContentOffset for snap behavior
        // dispatch onScrollEndDrag
    }

    func scrollViewWillBeginDecelerating(_ scrollView: UIScrollView) {
        // Momentum scroll started — dispatch onMomentumScrollBegin
    }

    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
        // Momentum scroll ended — dispatch onMomentumScrollEnd
    }

    func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
        // Programmatic scroll animation completed
    }
}
```

### 6.3 Scroll Event Throttling

React Native throttles scroll events with `scrollEventThrottle`:

```swift
class ThrottledScrollHandler {
    var lastDispatchTime: TimeInterval = 0
    var scrollEventThrottle: TimeInterval = 0 // seconds

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        let now = CACurrentMediaTime()
        // 17ms minimum delta ensures 60fps updates aren't filtered
        if scrollEventThrottle < max(0.017, now - lastDispatchTime) {
            dispatchScrollEvent(scrollView)
            lastDispatchTime = now
        }
    }
}
```

### 6.4 Content Size from Yoga

In our architecture, the scroll view's `contentSize` comes from the Yoga-computed size of the content child:

```swift
func updateContentSize() {
    guard let contentView = contentView else { return }
    let newContentSize = contentView.frame.size
    if scrollView.contentSize != newContentSize {
        scrollView.contentSize = newContentSize
    }
}
```

### 6.5 Nested Scroll Views

Handle nested scrolling with gesture recognizer delegation:

```swift
// Allow simultaneous recognition with outer scroll views
func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
) -> Bool {
    return true
}
```

### 6.6 View Clipping for Performance

React Native's `removeClippedSubviews` optimization — unmount views outside the visible area:

```swift
func updateClippedSubviews(clipRect: CGRect) {
    for subview in reactSubviews {
        let intersection = clipRect.intersection(subview.frame)
        if !intersection.size.equalTo(.zero) {
            // View is at least partially visible — mount
            if subview.superview == nil {
                addSubview(subview)
            }
        } else if subview.superview != nil {
            // View is completely outside — unmount
            subview.removeFromSuperview()
        }
    }
}
```

---

## 7. Performance

### 7.1 Main Thread Requirement

**All UIKit operations MUST run on the main thread.** This is the single most important constraint.

```swift
// Ensure main thread execution
func performOnMainThread(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
        work()
    } else {
        DispatchQueue.main.async(execute: work)
    }
}

// Assert main thread in debug builds
func assertMainThread() {
    assert(Thread.isMainThread, "UIKit operations must be on the main thread")
}
```

React Native's Fabric architecture asserts main queue at every mounting entry point (`RCTAssertMainQueue()`).

**What CAN happen off the main thread:**
- Text measurement with `NSAttributedString.boundingRect` (thread-safe)
- Image decoding and processing
- Yoga layout computation
- JSON/data parsing

### 7.2 Mounting Transaction Pattern

React Native batches all view mutations into a single transaction executed on the main thread:

```swift
func performMountingTransaction(_ mutations: [Mutation]) {
    // Ensure we're on main thread
    assertMainThread()

    for mutation in mutations {
        switch mutation.type {
        case .create:
            let view = viewPool.dequeue(type: mutation.componentType)
                ?? createView(type: mutation.componentType)
            registry[mutation.tag] = view

        case .insert:
            let child = registry[mutation.childTag]!
            let parent = registry[mutation.parentTag]!
            child.updateProps(mutation.props)
            child.applyLayout(mutation.frame)
            parent.insertSubview(child, at: mutation.index)

        case .update:
            let view = registry[mutation.tag]!
            if mutation.propsChanged {
                view.updateProps(mutation.props)
            }
            if mutation.layoutChanged {
                view.applyLayout(mutation.frame)
            }

        case .remove:
            let child = registry[mutation.childTag]!
            child.removeFromSuperview()

        case .delete:
            let view = registry[mutation.tag]!
            viewPool.enqueue(view, type: mutation.componentType)
            registry[mutation.tag] = nil
        }
    }
}
```

### 7.3 CALayer Optimizations

```swift
// Rasterize complex view hierarchies into a bitmap
// Useful for views that don't change often (reduces compositing)
view.layer.shouldRasterize = true
view.layer.rasterizationScale = UIScreen.main.scale

// Mark opaque views for better compositing performance
view.isOpaque = true
view.backgroundColor = .white // Must have solid background if opaque

// Disable implicit animations for React-driven updates
CATransaction.begin()
CATransaction.setDisableActions(true)
// ... apply layout changes ...
CATransaction.commit()
```

### 7.4 Avoiding Unnecessary Redraws

```swift
// Only trigger layer redraw when visual properties actually change
func setBackgroundColor(_ color: UIColor?) {
    guard backgroundColor != color else { return }
    backgroundColor = color
    layer.setNeedsDisplay()
}

// Only update frame when it actually changed
func applyLayout(frame: CGRect) {
    let oldSize = bounds.size
    self.center = CGPoint(x: frame.midX, y: frame.midY)
    self.bounds = CGRect(origin: .zero, size: frame.size)
    if bounds.size != oldSize {
        layer.setNeedsDisplay() // Only redraw if size changed
    }
}
```

### 7.5 Off-Screen Rendering Avoidance

Off-screen rendering is expensive. These trigger it:

```swift
// AVOID these on frequently updated views:
view.layer.cornerRadius = 10       // OK if clipsToBounds is false
view.clipsToBounds = true           // Triggers off-screen render with cornerRadius
view.layer.mask = someMask          // Always triggers off-screen render
view.layer.shadowPath = nil         // Shadow without path triggers off-screen render

// PREFER:
// Set shadow path explicitly (avoids off-screen render)
view.layer.shadowPath = UIBezierPath(roundedRect: view.bounds, cornerRadius: 10).cgPath

// Use pre-rendered border images instead of real-time border drawing
// (React Native's approach for complex borders)
```

### 7.6 Instruments-Based Profiling

Key Instruments templates for diagnosing UIKit performance:

| Instrument | What It Shows |
|-----------|---------------|
| **Core Animation** | FPS, off-screen rendering (yellow overlay), blending (green overlay) |
| **Time Profiler** | CPU time per function — find expensive layout/drawing |
| **Allocations** | Memory usage, leaked objects, view retention |
| **Leaks** | Retain cycles (common with gesture recognizer targets, delegates) |
| **System Trace** | Thread scheduling, main thread blocks |

```swift
// Programmatic timing for performance logging
let start = CACurrentMediaTime()
// ... perform operation ...
let elapsed = CACurrentMediaTime() - start
print("Operation took \(elapsed * 1000)ms")
```

### 7.7 Display Link for Smooth Updates

For coordinating with the display refresh:

```swift
let displayLink = CADisplayLink(target: self, selector: #selector(tick(_:)))
displayLink.add(to: .main, forMode: .common)

@objc func tick(_ link: CADisplayLink) {
    // Called once per frame (~16.6ms for 60Hz, ~8.3ms for 120Hz)
    // Process any pending JS-driven updates here
}
```

---

## 8. Additional Patterns

### 8.1 Visibility and Display

```swift
// Hide view (equivalent to display: none in CSS)
view.isHidden = true

// Opacity (equivalent to CSS opacity)
view.alpha = 0.5
// Or at the layer level:
view.layer.opacity = 0.5
```

### 8.2 Transforms

```swift
// 2D transforms (CGAffineTransform)
view.transform = CGAffineTransform(rotationAngle: .pi / 4)
view.transform = CGAffineTransform(scaleX: 2.0, y: 2.0)
view.transform = CGAffineTransform(translationX: 100, y: 0)

// 3D transforms (CATransform3D) — needed for perspective
var transform = CATransform3DIdentity
transform.m34 = -1.0 / 500.0 // Perspective
transform = CATransform3DRotate(transform, .pi / 4, 0, 1, 0)
view.layer.transform = transform

// Edge antialiasing for rotated/skewed views
view.layer.allowsEdgeAntialiasing = true
```

### 8.3 Border and Background Rendering

React Native renders borders via `displayLayer:` with a custom image-based approach:

```swift
// Simple borders — use CALayer directly
view.layer.borderWidth = 1.0
view.layer.borderColor = UIColor.black.cgColor
view.layer.cornerRadius = 8.0

// Complex borders (different widths/colors per side) — draw to image
// React Native generates a stretchable UIImage for complex border configurations
// and sets it as layer.contents
```

### 8.4 Safe Area

```swift
// Access safe area insets
let insets = view.safeAreaInsets // Available after layout

// Observe changes
override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    // Update layout to account for notch, home indicator, etc.
}
```

### 8.5 Dark Mode / Trait Changes

```swift
override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
        // Re-render colors for dark/light mode
        layer.setNeedsDisplay()
    }
}

// Dynamic colors (automatically adapt)
let color = UIColor { traitCollection in
    traitCollection.userInterfaceStyle == .dark ? .white : .black
}
```

### 8.6 Keyboard Handling

```swift
// Observe keyboard
NotificationCenter.default.addObserver(
    self,
    selector: #selector(keyboardWillChange(_:)),
    name: UIResponder.keyboardWillChangeFrameNotification,
    object: nil
)

@objc func keyboardWillChange(_ notification: Notification) {
    guard let userInfo = notification.userInfo,
          let endFrame = userInfo[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
          let duration = userInfo[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double,
          let curveValue = userInfo[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt else { return }

    let options = UIView.AnimationOptions(rawValue: curveValue << 16)

    UIView.animate(withDuration: duration, delay: 0, options: options) {
        // Adjust scroll view insets
        self.scrollView.contentInset.bottom = max(0, self.bounds.maxY - endFrame.minY)
    }
}
```

---

## API Reference: Methods Called from the Renderer

### View Lifecycle

| Method | When Called | Thread |
|--------|-----------|--------|
| `UIView(frame:)` | Create mutation | Main |
| `insertSubview(_:at:)` | Insert mutation | Main |
| `removeFromSuperview()` | Remove mutation | Main |
| `prepareForRecycle()` | Delete mutation (before pool) | Main |

### Layout

| Method | When Called | Thread |
|--------|-----------|--------|
| `view.center = ...` | Layout update | Main |
| `view.bounds = ...` | Layout update | Main |
| `view.isHidden = ...` | Display type change | Main |
| `setNeedsLayout()` | After state/prop changes | Main |
| `setNeedsDisplay()` | After visual prop changes | Main |

### Properties

| Method | When Called | Thread |
|--------|-----------|--------|
| `backgroundColor` | Props update | Main |
| `layer.opacity` | Props update | Main |
| `layer.transform` | Props update | Main |
| `layer.borderWidth` | Props update | Main |
| `layer.cornerRadius` | Props update | Main |
| `layer.zPosition` | Props update | Main |
| `clipsToBounds` | Props update | Main |
| `isUserInteractionEnabled` | Props update | Main |

### Text

| Method | When Called | Thread |
|--------|-----------|--------|
| `NSAttributedString.boundingRect(with:options:context:)` | Yoga measure | Any |
| `NSLayoutManager.drawGlyphs(forGlyphRange:at:)` | Draw | Main |
| `NSTextStorage/NSLayoutManager/NSTextContainer` creation | Text setup | Main |

### Events

| Method | When Called | Thread |
|--------|-----------|--------|
| `addGestureRecognizer(_:)` | View setup | Main |
| `hitTest(_:with:)` | Touch delivery | Main |
| `point(inside:with:)` | Touch delivery | Main |

---

## Threading Requirements Summary

| Operation | Thread Requirement |
|-----------|-------------------|
| All UIView property access | Main thread only |
| View hierarchy manipulation | Main thread only |
| CALayer property access | Main thread only |
| Gesture recognizer operations | Main thread only |
| `UIImage(data:)` | Any thread |
| `NSAttributedString.boundingRect` | Any thread |
| Yoga layout computation | Any thread |
| Network requests (URLSession) | Any thread (callbacks on any thread) |
| Image decoding/processing | Any thread (set result on main) |

---

## Key Takeaways for Our Renderer

1. **Always use `center` + `bounds` instead of `frame`** when setting layout from Yoga output (safe with transforms).
2. **Validate all layout values** for NaN/Inf before applying.
3. **Batch all mutations** into a single main-thread transaction.
4. **Disable implicit CALayer animations** (`CATransaction.setDisableActions(true)`) during React-driven updates to avoid unwanted animation.
5. **Use view recycling** with a component pool keyed by element type.
6. **Single root gesture recognizer** for touch handling, resolving targets via `hitTest`.
7. **Text measurement via TextKit** (NSTextStorage + NSLayoutManager + NSTextContainer) for Yoga's measure function.
8. **Throttle scroll events** to avoid flooding the JS thread.
9. **Shadow paths must be set explicitly** to avoid expensive off-screen rendering.
10. **`translatesAutoresizingMaskIntoConstraints = true`** is already the default for code-created views; never add `NSLayoutConstraint`s.
