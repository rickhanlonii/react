# Research: Native Event System

> Design the event system: discrete events (click, press) dispatch synchronously on the main thread; continuous events (scroll, touch move) batch asynchronously; the event set is fixed and matches DOM conventions (onClick, onChange, onScroll, etc.); no ViewConfig-based event registration.

---

## Overview

This document defines the event system architecture for react-dom-native. The design is informed by React Native Fabric's event dispatch infrastructure while adapting it to our simpler, fixed HTML element set.

### Key Design Goals

1. **Fixed DOM event set**: No dynamic event registration. All supported events are known at compile time.
2. **Synchronous discrete dispatch**: Click, press, and other discrete events dispatch synchronously on the main thread.
3. **Batched continuous events**: Scroll, touch move, and other high-frequency events use coalescing/batching.
4. **DOM-like event naming**: Use `onClick`, `onChange`, `onScroll` naming convention.
5. **No ViewConfig**: Event types are hardcoded per element, not looked up at runtime.
6. **React-handled bubbling**: Event bubbling is managed by React's synthetic event system, not native code.

---

## 1. Complete Fixed Event Set

### Event Table

| DOM Event Name | Native Trigger | Category | Elements | Bubbles | RawEvent::Category |
|----------------|----------------|----------|----------|---------|-------------------|
| `onClick` | `UITapGestureRecognizer` | Discrete | All interactive | Yes | `Discrete` |
| `onDoubleClick` | `UITapGestureRecognizer` (taps: 2) | Discrete | All interactive | Yes | `Discrete` |
| `onLongPress` | `UILongPressGestureRecognizer` | Discrete | All interactive | Yes | `Discrete` |
| `onTouchStart` | `touchesBegan` | ContinuousStart | All interactive | Yes | `ContinuousStart` |
| `onTouchMove` | `touchesMoved` | Continuous | All interactive | Yes | `Unspecified` |
| `onTouchEnd` | `touchesEnded` | ContinuousEnd | All interactive | Yes | `ContinuousEnd` |
| `onTouchCancel` | `touchesCancelled` | ContinuousEnd | All interactive | Yes | `ContinuousEnd` |
| `onPressIn` | Touch began with delay | Discrete | button, a | Yes | `Discrete` |
| `onPressOut` | Touch ended/moved out | Discrete | button, a | Yes | `Discrete` |
| `onChange` | Text field delegate | Discrete | input, textarea, select | No | `Discrete` |
| `onInput` | Text field real-time | Discrete | input, textarea | No | `Discrete` |
| `onFocus` | `becomeFirstResponder` | Discrete | input, textarea, select | No | `Discrete` |
| `onBlur` | `resignFirstResponder` | Discrete | input, textarea, select | No | `Discrete` |
| `onSubmit` | Return key press | Discrete | input, form | No | `Discrete` |
| `onScroll` | `scrollViewDidScroll` | Continuous | div (overflow: scroll) | No | `Unspecified` |
| `onScrollBeginDrag` | `scrollViewWillBeginDragging` | Discrete | div (overflow: scroll) | No | `Discrete` |
| `onScrollEndDrag` | `scrollViewWillEndDragging` | Discrete | div (overflow: scroll) | No | `Discrete` |
| `onMomentumScrollBegin` | `scrollViewWillBeginDecelerating` | Discrete | div (overflow: scroll) | No | `Discrete` |
| `onMomentumScrollEnd` | `scrollViewDidEndDecelerating` | Discrete | div (overflow: scroll) | No | `Discrete` |
| `onLayout` | Yoga layout complete | Discrete | All | No | `Discrete` |
| `onLoad` | Image loaded | Discrete | img | No | `Discrete` |
| `onError` | Image load failed | Discrete | img | No | `Discrete` |
| `onLoadStart` | Image load started | Discrete | img | No | `Discrete` |
| `onKeyDown` | Hardware keyboard | Discrete | input, textarea | No | `Discrete` |
| `onKeyUp` | Hardware keyboard | Discrete | input, textarea | No | `Discrete` |

### Event Categories Explained

Based on React Native's `RawEvent::Category` enum:

| Category | Description | React Priority | Behavior |
|----------|-------------|----------------|----------|
| `Discrete` | User events at discrete times (click, keydown) | `DiscreteEventPriority` (SyncLane) | Dispatch synchronously, highest priority |
| `ContinuousStart` | Start of continuous gesture (touchStart) | `ContinuousEventPriority` | Marks beginning of gesture sequence |
| `ContinuousEnd` | End of continuous gesture (touchEnd) | `ContinuousEventPriority` | Marks end of gesture sequence |
| `Unspecified` | Priority determined from context | `DefaultEventPriority` | Coalesced with other events in queue |

### Elements and Their Events

| Element | Supported Events |
|---------|------------------|
| `div` | onClick, onDoubleClick, onLongPress, onTouchStart/Move/End/Cancel, onLayout, onScroll* |
| `span` | (virtual: no direct events, handled by text container) |
| `p` | onClick, onLayout (tappable text regions handle via attributed string) |
| `h1`-`h6` | onClick, onLayout |
| `button` | onClick, onPressIn, onPressOut, onLongPress, onLayout |
| `a` | onClick, onPressIn, onPressOut, onLayout |
| `input` | onChange, onInput, onFocus, onBlur, onSubmit, onKeyDown, onKeyUp, onLayout |
| `textarea` | onChange, onInput, onFocus, onBlur, onKeyDown, onKeyUp, onLayout |
| `select` | onChange, onFocus, onBlur, onLayout |
| `img` | onClick, onLoad, onError, onLoadStart, onLayout |
| `ul`, `ol`, `li` | onClick, onLayout |

\* `onScroll` and scroll events only when `style.overflow === 'scroll'` (promoted to UIScrollView).

---

## 2. Synchronous Discrete Dispatch Architecture

### What "Synchronous on Main Thread" Means

In react-dom-native, JavaScript runs on the main thread via JavaScriptCore (native Swift API). When a discrete event occurs:

1. UIKit gesture recognizer fires on main thread
2. Native handler immediately calls into JS via JSI (synchronous call)
3. React dispatches the event through its synthetic event system
4. State updates are processed with highest priority (DiscreteEventPriority = SyncLane)
5. Re-render and commit happen before returning to UIKit

This ensures zero frame delay between user tap and visual response.

### Event Dispatch Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MAIN THREAD                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. UITapGestureRecognizer fires                                            │
│           │                                                                 │
│           ▼                                                                 │
│  2. Swift handler: handleTap(_ gesture)                                     │
│           │                                                                 │
│           ▼                                                                 │
│  3. Hit test: find ShadowNode from touched UIView                           │
│           │                                                                 │
│           ▼                                                                 │
│  4. Create event payload:                                                   │
│     {                                                                       │
│       type: 'click',                                                        │
│       target: instanceHandle,                                               │
│       nativeEvent: { locationX, locationY, timestamp }                      │
│     }                                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  5. Call JSI: dispatchEvent(eventPayload) [SYNCHRONOUS]                     │
│           │                                                                 │
│           ├─────────────────────────────────────────────┐                   │
│           │                                             │                   │
│           ▼                                             │                   │
│  6. JS: ReactFabricEventEmitter.dispatchEvent()        │                   │
│           │                                             │                   │
│           ▼                                             │                   │
│  7. React: setCurrentUpdatePriority(DiscreteEventPriority)                  │
│           │                                             │                   │
│           ▼                                             │                   │
│  8. React: Walk fiber tree, invoke onClick handlers     │                   │
│           │                                             │                   │
│           ▼                                             │                   │
│  9. React: Process state updates (flushSync for discrete)                   │
│           │                                             │                   │
│           ▼                                             │
│  10. React: Commit mutations to native                  │                   │
│           │                                             │                   │
│           └─────────────────────────────────────────────┘                   │
│           │                                                                 │
│           ▼                                                                 │
│  11. Return to UIKit (same frame)                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### RuntimeScheduler Pattern (from Fabric)

React Native Fabric uses `RuntimeScheduler::executeNowOnTheSameThread()` for synchronous dispatch. For react-dom-native with JS on main thread, this is simpler:

```cpp
// In EventDispatcher (C++)
void dispatchDiscreteEvent(RawEvent event) {
    // Already on main thread, JS also on main thread
    // Just call directly into JS via JSI
    auto& runtime = getJSRuntime();

    // Set current event priority
    runtime.global()
        .getPropertyAsFunction(runtime, "setCurrentEventPriority")
        .call(runtime, static_cast<int>(EventPriority::Discrete));

    // Dispatch the event
    runtime.global()
        .getPropertyAsFunction(runtime, "dispatchEvent")
        .call(runtime, eventToJSValue(event));
}
```

### Priority Mapping

| RawEvent::Category | React EventPriority | React Lane |
|--------------------|--------------------| -----------|
| `Discrete` | `DiscreteEventPriority` | `SyncLane` |
| `ContinuousStart` | `ContinuousEventPriority` | `InputContinuousLane` |
| `ContinuousEnd` | `ContinuousEventPriority` | `InputContinuousLane` |
| `Unspecified` | `DefaultEventPriority` | `DefaultLane` |

---

## 3. Continuous Event Batching/Coalescing

### Coalescing Strategy

Continuous events (scroll, touchMove) fire at up to 120Hz on modern iOS devices. Sending each event to JS would overwhelm the system. Instead:

1. **Event queue**: Continuous events are queued in C++ EventDispatcher
2. **Coalescing**: Multiple events of the same type for the same target are merged
3. **Batch dispatch**: Queue is flushed at frame boundaries (60Hz) or when discrete events occur

### Coalescing Rules

| Event Type | Coalescing Strategy |
|-----------|---------------------|
| `onScroll` | Keep latest offset values only |
| `onTouchMove` | Keep all touches, but merge rapid sequences |
| Discrete events | Never coalesced, dispatch immediately |

### Scroll Event Throttling

Following React Native's `scrollEventThrottle` pattern:

```swift
class ScrollEventThrottler {
    private var lastDispatchTime: CFTimeInterval = 0
    private var throttleInterval: CFTimeInterval = 0.016 // ~60fps default

    func shouldDispatch() -> Bool {
        let now = CACurrentMediaTime()
        if now - lastDispatchTime >= throttleInterval {
            lastDispatchTime = now
            return true
        }
        return false
    }
}
```

### Event Queue Implementation

```cpp
class EventQueue {
public:
    void enqueue(RawEvent event) {
        std::lock_guard<std::mutex> lock(mutex_);

        if (event.category == RawEvent::Category::Discrete) {
            // Discrete events flush the queue first, then dispatch immediately
            flushInternal();
            dispatchEvent(event);
        } else if (canCoalesce(event)) {
            // Replace existing event with new values
            coalesceEvent(event);
        } else {
            queue_.push_back(event);
        }
    }

    void flush() {
        std::lock_guard<std::mutex> lock(mutex_);
        flushInternal();
    }

private:
    void flushInternal() {
        for (const auto& event : queue_) {
            dispatchEvent(event);
        }
        queue_.clear();
    }

    bool canCoalesce(const RawEvent& event) {
        // Same target + same event type = can coalesce
        for (auto& existing : queue_) {
            if (existing.target == event.target &&
                existing.type == event.type) {
                return true;
            }
        }
        return false;
    }

    std::vector<RawEvent> queue_;
    std::mutex mutex_;
};
```

### Frame-Synchronized Flush

```swift
class EventFlusher {
    private var displayLink: CADisplayLink?

    func start() {
        displayLink = CADisplayLink(target: self, selector: #selector(tick))
        displayLink?.add(to: .main, forMode: .common)
    }

    @objc private func tick(_ link: CADisplayLink) {
        // Flush queued continuous events at frame boundary
        EventQueue.shared.flush()
    }
}
```

---

## 4. C++ EventEmitter Design

### Single Universal EventEmitter

Since we have a fixed element set, we use a single `HTMLEventEmitter` class rather than per-element subclasses:

```cpp
// EventEmitter.h
#pragma once

#include <react/renderer/core/EventEmitter.h>
#include "EventPayloads.h"

namespace facebook::react {

class HTMLEventEmitter : public EventEmitter {
public:
    using EventEmitter::EventEmitter;

    // Discrete events (synchronous dispatch)
    void onClick(const ClickEvent& event) const;
    void onDoubleClick(const ClickEvent& event) const;
    void onLongPress(const ClickEvent& event) const;
    void onPressIn(const PressEvent& event) const;
    void onPressOut(const PressEvent& event) const;

    // Touch events
    void onTouchStart(const TouchEvent& event) const;
    void onTouchMove(const TouchEvent& event) const;
    void onTouchEnd(const TouchEvent& event) const;
    void onTouchCancel(const TouchEvent& event) const;

    // Input events
    void onChange(const ChangeEvent& event) const;
    void onInput(const InputEvent& event) const;
    void onFocus(const FocusEvent& event) const;
    void onBlur(const FocusEvent& event) const;
    void onSubmit(const SubmitEvent& event) const;
    void onKeyDown(const KeyboardEvent& event) const;
    void onKeyUp(const KeyboardEvent& event) const;

    // Scroll events
    void onScroll(const ScrollEvent& event) const;
    void onScrollBeginDrag(const ScrollEvent& event) const;
    void onScrollEndDrag(const ScrollEvent& event) const;
    void onMomentumScrollBegin(const ScrollEvent& event) const;
    void onMomentumScrollEnd(const ScrollEvent& event) const;

    // Layout event
    void onLayout(const LayoutEvent& event) const;

    // Image events
    void onLoad(const LoadEvent& event) const;
    void onError(const ErrorEvent& event) const;
    void onLoadStart(const LoadEvent& event) const;

private:
    void dispatchDiscreteEvent(
        const std::string& type,
        const folly::dynamic& payload
    ) const;

    void dispatchContinuousEvent(
        const std::string& type,
        const folly::dynamic& payload,
        RawEvent::Category category = RawEvent::Category::Unspecified
    ) const;
};

} // namespace facebook::react
```

### EventEmitter Implementation

```cpp
// EventEmitter.cpp
#include "HTMLEventEmitter.h"

namespace facebook::react {

void HTMLEventEmitter::onClick(const ClickEvent& event) const {
    dispatchDiscreteEvent("click", event.toDynamic());
}

void HTMLEventEmitter::onScroll(const ScrollEvent& event) const {
    dispatchContinuousEvent("scroll", event.toDynamic(),
                           RawEvent::Category::Unspecified);
}

void HTMLEventEmitter::onTouchStart(const TouchEvent& event) const {
    dispatchContinuousEvent("touchStart", event.toDynamic(),
                           RawEvent::Category::ContinuousStart);
}

void HTMLEventEmitter::dispatchDiscreteEvent(
    const std::string& type,
    const folly::dynamic& payload
) const {
    dispatchEvent(
        type,
        payload,
        EventPriority::Discrete,
        RawEvent::Category::Discrete
    );
}

void HTMLEventEmitter::dispatchContinuousEvent(
    const std::string& type,
    const folly::dynamic& payload,
    RawEvent::Category category
) const {
    dispatchEvent(
        type,
        payload,
        EventPriority::Default,
        category
    );
}

} // namespace facebook::react
```

### ShadowNode with EventEmitter

Each shadow node type includes the shared HTMLEventEmitter:

```cpp
// HTMLShadowNode.h
class HTMLShadowNode : public YogaLayoutableShadowNode {
public:
    using EventEmitter = HTMLEventEmitter;

    const std::shared_ptr<const HTMLEventEmitter>& getEventEmitter() const {
        return std::static_pointer_cast<const HTMLEventEmitter>(
            ShadowNode::getEventEmitter()
        );
    }
};
```

---

## 5. JS-Side Event Handler Registration

### How onClick Flows Through the System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          1. React Render Phase                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  <button onClick={handleClick}>                                            │
│           │                                                                 │
│           ▼                                                                 │
│  React creates fiber with props: { onClick: handleClick }                   │
│           │                                                                 │
│           ▼                                                                 │
│  Reconciler calls createInstance("button", { onClick: handleClick })        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       2. Host Config (createInstance)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  // packages/renderer/src/HostConfig.js                                     │
│  function createInstance(type, props, rootContainer, hostContext, fiber) {  │
│    // Create shadow node via JSI                                            │
│    const node = bridge.createNode(type, props);                             │
│                                                                             │
│    // EventEmitter is attached to the shadow node in C++                    │
│    // The fiber (internalHandle) retains the event handler references       │
│    return node;                                                             │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        3. C++ Shadow Node Creation                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  // C++ ShadowTree.cpp                                                      │
│  auto shadowNode = std::make_shared<ButtonShadowNode>(                      │
│      props,                                                                 │
│      std::make_shared<HTMLEventEmitter>(instanceHandle)  // JSI object ref  │
│  );                                                                         │
│                                                                             │
│  // EventEmitter holds weak reference to InstanceHandle                     │
│  // InstanceHandle is a JSI HostObject that points back to the fiber        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         4. Native View Created                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  // Swift: RDNButton created with tap gesture recognizer                    │
│  let button = RDNButton()                                                   │
│  button.shadowNode = shadowNode  // Link native view to shadow node         │
│  button.addGestureRecognizer(tapGesture)                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                            [User taps button]
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          5. Event Dispatch                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  // Swift gesture handler                                                   │
│  @objc func handleTap(_ gesture: UITapGestureRecognizer) {                  │
│      let location = gesture.location(in: self)                              │
│      shadowNode.eventEmitter.onClick(ClickEvent(                            │
│          locationX: location.x,                                             │
│          locationY: location.y                                              │
│      ))                                                                     │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         6. JS Event Received                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  // React's event dispatch (called via JSI from C++)                        │
│  function dispatchEvent(instanceHandle, eventType, nativeEvent) {           │
│    const fiber = getFiberFromInstanceHandle(instanceHandle);                │
│    const props = fiber.memoizedProps;                                       │
│    const handler = props.onClick;  // The original handleClick function     │
│                                                                             │
│    // Wrap in synthetic event and call handler                              │
│    const syntheticEvent = createSyntheticEvent(eventType, nativeEvent);     │
│    handler(syntheticEvent);                                                 │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Event Handler Storage

Event handlers are NOT stored in the shadow tree. They remain on the fiber:

```javascript
// The fiber stores the props (including handlers)
fiber.memoizedProps = {
  onClick: handleClick,
  children: 'Click me',
  style: { backgroundColor: 'blue' }
};

// Only serializable props go to native
// Event handlers are looked up via instanceHandle during dispatch
```

### InstanceHandle Pattern

The `instanceHandle` is a JSI HostObject that maintains bidirectional reference:

```cpp
class InstanceHandle : public jsi::HostObject {
public:
    // Called from JS during createInstance
    static std::shared_ptr<InstanceHandle> create(
        jsi::Runtime& runtime,
        const jsi::Value& fiber
    ) {
        auto handle = std::make_shared<InstanceHandle>();
        handle->fiberRef_ = std::make_unique<jsi::Value>(runtime, fiber);
        return handle;
    }

    // Called from C++ when dispatching events
    jsi::Value getFiber(jsi::Runtime& runtime) const {
        return jsi::Value(runtime, *fiberRef_);
    }

private:
    std::unique_ptr<jsi::Value> fiberRef_;
};
```

---

## 6. Event Bubbling

### React Handles Bubbling

Event bubbling is entirely managed by React's synthetic event system, not by native code:

1. Native code dispatches event to the **target** node only
2. React walks up the fiber tree to find all ancestors with the event handler
3. React invokes handlers in bubbling order (target first, then parents)

### Why Not Native Bubbling?

- Simpler native code: just dispatch to target
- React already has the fiber tree structure
- Consistent with React DOM's event delegation model
- No need to track parent pointers in native layer

### Capture Phase

Capture phase is also handled in React. If a component uses `onClickCapture`:

```jsx
<div onClickCapture={handleCapture}>
  <button onClick={handleClick}>Click</button>
</div>
```

React walks the fiber tree top-down for capture handlers before bubbling.

### Implementation

```javascript
// In React's event dispatch
function dispatchEventWithBubbling(fiber, eventType, event) {
  // Collect handlers from target to root
  const captureHandlers = [];
  const bubbleHandlers = [];

  let current = fiber;
  while (current) {
    const props = current.memoizedProps;
    if (props) {
      const captureHandler = props[eventType + 'Capture'];
      const bubbleHandler = props[eventType];

      if (captureHandler) {
        captureHandlers.unshift({ fiber: current, handler: captureHandler });
      }
      if (bubbleHandler) {
        bubbleHandlers.push({ fiber: current, handler: bubbleHandler });
      }
    }
    current = current.return; // Walk up the tree
  }

  // Execute capture phase (top-down)
  for (const { handler } of captureHandlers) {
    if (event.isPropagationStopped()) break;
    handler(event);
  }

  // Execute bubble phase (bottom-up)
  for (const { handler } of bubbleHandlers) {
    if (event.isPropagationStopped()) break;
    handler(event);
  }
}
```

---

## 7. resolveUpdatePriority Without ViewConfig

### How React Knows Current Event Priority

React's `resolveUpdatePriority` in the host config returns the priority for state updates during event dispatch. Without ViewConfig event type maps, we use a simpler approach:

```javascript
// packages/renderer/src/HostConfig.js

let currentEventPriority = DefaultEventPriority;

// Called by C++ before dispatching an event
export function setCurrentEventPriority(priority) {
  currentEventPriority = priority;
}

// Called by React when scheduling updates
export function resolveUpdatePriority() {
  // If we're inside an event, use the event's priority
  if (currentEventPriority !== DefaultEventPriority) {
    return currentEventPriority;
  }

  // Otherwise, default priority
  return DefaultEventPriority;
}

// Reset after event dispatch completes
export function clearCurrentEventPriority() {
  currentEventPriority = DefaultEventPriority;
}
```

### Event Priority Wrapper

```cpp
// C++ event dispatch wrapper
void dispatchEvent(const RawEvent& event) {
    auto& runtime = getJSRuntime();

    // Set priority before dispatch
    int priority = mapCategoryToPriority(event.category);
    runtime.global()
        .getPropertyAsFunction(runtime, "setCurrentEventPriority")
        .call(runtime, priority);

    try {
        // Dispatch the actual event
        // ... (dispatch logic)
    } catch (...) {
        // Always clear priority, even on error
        runtime.global()
            .getPropertyAsFunction(runtime, "clearCurrentEventPriority")
            .call(runtime);
        throw;
    }

    // Clear priority after dispatch
    runtime.global()
        .getPropertyAsFunction(runtime, "clearCurrentEventPriority")
        .call(runtime);
}
```

### Fixed Event Type to Priority Mapping

Since our event set is fixed, the mapping is hardcoded:

```cpp
EventPriority getEventPriority(const std::string& eventType) {
    // Discrete events (synchronous, highest priority)
    static const std::unordered_set<std::string> discreteEvents = {
        "click", "doubleClick", "longPress",
        "pressIn", "pressOut",
        "change", "input", "focus", "blur", "submit",
        "keyDown", "keyUp",
        "scrollBeginDrag", "scrollEndDrag",
        "momentumScrollBegin", "momentumScrollEnd",
        "layout", "load", "error", "loadStart"
    };

    if (discreteEvents.count(eventType)) {
        return EventPriority::Discrete;
    }

    // Continuous events (batched, lower priority)
    return EventPriority::Continuous;
}
```

---

## 8. Event Payload Shapes

### ClickEvent / PressEvent

```cpp
struct ClickEvent {
    double locationX;      // X position relative to target view
    double locationY;      // Y position relative to target view
    double pageX;          // X position relative to root view
    double pageY;          // Y position relative to root view
    double timestamp;      // Event timestamp (CACurrentMediaTime)

    folly::dynamic toDynamic() const {
        return folly::dynamic::object
            ("locationX", locationX)
            ("locationY", locationY)
            ("pageX", pageX)
            ("pageY", pageY)
            ("timestamp", timestamp);
    }
};
```

### TouchEvent

```cpp
struct Touch {
    int identifier;        // Unique touch identifier
    double locationX;
    double locationY;
    double pageX;
    double pageY;
    double timestamp;
};

struct TouchEvent {
    std::vector<Touch> changedTouches;  // Touches that changed in this event
    std::vector<Touch> touches;          // All current touches
    int targetTag;                        // Tag of the target view

    folly::dynamic toDynamic() const {
        auto changed = folly::dynamic::array();
        for (const auto& touch : changedTouches) {
            changed.push_back(touch.toDynamic());
        }

        auto all = folly::dynamic::array();
        for (const auto& touch : touches) {
            all.push_back(touch.toDynamic());
        }

        return folly::dynamic::object
            ("changedTouches", changed)
            ("touches", all)
            ("target", targetTag);
    }
};
```

### ScrollEvent

```cpp
struct ScrollEvent {
    double contentOffsetX;     // Current scroll X offset
    double contentOffsetY;     // Current scroll Y offset
    double contentSizeWidth;   // Content width
    double contentSizeHeight;  // Content height
    double layoutWidth;        // Visible width
    double layoutHeight;       // Visible height
    double zoomScale;          // Zoom level (usually 1.0)
    double timestamp;

    folly::dynamic toDynamic() const {
        return folly::dynamic::object
            ("contentOffset", folly::dynamic::object
                ("x", contentOffsetX)
                ("y", contentOffsetY))
            ("contentSize", folly::dynamic::object
                ("width", contentSizeWidth)
                ("height", contentSizeHeight))
            ("layoutMeasurement", folly::dynamic::object
                ("width", layoutWidth)
                ("height", layoutHeight))
            ("zoomScale", zoomScale)
            ("timestamp", timestamp);
    }
};
```

### ChangeEvent / InputEvent

```cpp
struct ChangeEvent {
    std::string text;          // Current text value

    folly::dynamic toDynamic() const {
        return folly::dynamic::object
            ("text", text)
            ("target", folly::dynamic::object
                ("value", text));
    }
};

struct InputEvent {
    std::string text;          // Current text value
    int selectionStart;        // Cursor start position
    int selectionEnd;          // Cursor end position

    folly::dynamic toDynamic() const {
        return folly::dynamic::object
            ("text", text)
            ("selectionStart", selectionStart)
            ("selectionEnd", selectionEnd);
    }
};
```

### FocusEvent

```cpp
struct FocusEvent {
    // Empty for now, but can include related target in future

    folly::dynamic toDynamic() const {
        return folly::dynamic::object();
    }
};
```

### KeyboardEvent

```cpp
struct KeyboardEvent {
    std::string key;           // Key value ("Enter", "a", "Backspace", etc.)
    int keyCode;               // Numeric key code
    bool shiftKey;
    bool ctrlKey;
    bool altKey;
    bool metaKey;

    folly::dynamic toDynamic() const {
        return folly::dynamic::object
            ("key", key)
            ("keyCode", keyCode)
            ("shiftKey", shiftKey)
            ("ctrlKey", ctrlKey)
            ("altKey", altKey)
            ("metaKey", metaKey);
    }
};
```

### LayoutEvent

```cpp
struct LayoutEvent {
    double x;                  // X position in parent
    double y;                  // Y position in parent
    double width;              // Computed width
    double height;             // Computed height

    folly::dynamic toDynamic() const {
        return folly::dynamic::object
            ("layout", folly::dynamic::object
                ("x", x)
                ("y", y)
                ("width", width)
                ("height", height));
    }
};
```

### LoadEvent / ErrorEvent

```cpp
struct LoadEvent {
    // For images
    double width;              // Loaded image width
    double height;             // Loaded image height
    std::string source;        // Image source URL

    folly::dynamic toDynamic() const {
        return folly::dynamic::object
            ("source", folly::dynamic::object
                ("width", width)
                ("height", height)
                ("uri", source));
    }
};

struct ErrorEvent {
    std::string message;       // Error message

    folly::dynamic toDynamic() const {
        return folly::dynamic::object
            ("error", message);
    }
};
```

---

## 9. Summary

### Key Architectural Decisions

1. **Single EventEmitter class**: `HTMLEventEmitter` handles all elements (no per-element subclasses)
2. **Synchronous discrete dispatch**: Discrete events call directly into JS via JSI on main thread
3. **Frame-synchronized batching**: Continuous events queue and flush at 60Hz
4. **React-side bubbling**: Native dispatches to target only; React handles bubbling/capture
5. **InstanceHandle pattern**: Bidirectional fiber<->native reference for event routing
6. **Fixed priority mapping**: Event type to priority hardcoded (no ViewConfig lookup)

### Implementation Order

1. Core EventEmitter class with `dispatchEvent` method
2. Click/tap event (simplest discrete event)
3. Touch events (start/move/end)
4. Input events (change, focus, blur)
5. Scroll events with throttling
6. Layout events
7. Image load events

### References

- [React Native Threading Model](https://reactnative.dev/architecture/threading-model)
- [React Event Priorities](https://github.com/facebook/react/pull/20748)
- [Fabric EventEmitter Commit](https://github.com/facebook/react-native/commit/93dd790cad67107d0aa5181f7d70e95c6223362d)
- [React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/docs/)
- [React DOM Event Handling](https://gist.github.com/romain-trotard/76313af8170809970daa7ff9d87b0dd5)
