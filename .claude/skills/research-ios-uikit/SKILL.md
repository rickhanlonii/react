---
name: research-ios-uikit
description: Research UIKit fundamentals for building a custom view hierarchy. Run this to document view lifecycle, events, text rendering, and images.
---

# Research: iOS UIKit Patterns

## Objective

Document the UIKit patterns needed to implement a React-driven native view hierarchy — view creation, layout, event handling, text rendering, image loading, and scrolling.

## Instructions

1. **View hierarchy management**:
   - UIView creation, addSubview, removeFromSuperview, insertSubview(at:)
   - View recycling / reuse patterns (for list performance)
   - Frame vs. bounds vs. center (we'll use Yoga-computed frames)

2. **Layout**:
   - How to bypass Auto Layout entirely and set frames directly (from Yoga)
   - `layoutSubviews()` override pattern
   - `setNeedsLayout()` / `layoutIfNeeded()` for batching

3. **Event handling**:
   - UIGestureRecognizer (tap, long press, pan, swipe)
   - Touch event propagation (hitTest, point(inside:))
   - UIControl.addTarget for buttons/inputs

4. **Text rendering**:
   - UILabel for simple text, NSAttributedString for rich text
   - Text measurement (sizeThatFits, NSLayoutManager, TextKit)
   - Font handling, dynamic type, accessibility

5. **Images**:
   - UIImageView, async image loading patterns
   - Image caching strategies (NSCache, URLCache)

6. **Scrolling**:
   - UIScrollView fundamentals, contentSize, contentOffset
   - Nested scroll views, scroll delegates

7. **Performance**:
   - Off-main-thread concerns (all UIKit must be on main thread)
   - Layer backing, rasterization, shouldRasterize
   - Instrument-based profiling approach

## Output

Write to: `docs/research/ios-uikit.md`

Format:
- Section per topic with Swift code examples
- API reference for methods we'll call from the renderer
- Threading requirements and constraints
- Performance best practices for high-frequency updates (React re-renders)

## After Completion

Update `docs/MASTER_PLAN.md` — check off "iOS UIKit patterns"
