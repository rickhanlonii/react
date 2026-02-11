# Research: String-Based Element Dispatch

## Overview

This document designs how C++ dispatches on element type strings ("div", "span", "p", etc.) to create the right shadow nodes, Yoga configurations, and UIKit views. The design eliminates React Native's component registry and ViewConfig patterns, replacing them with a static dispatch table keyed by HTML element type strings.

> **Note**: This document is designed for **persistent mode** (clone-on-write), matching React Native Fabric's architecture. Shadow nodes are immutable after creation; updates create new nodes via cloning rather than mutating in place.

### Key Design Goals

1. **String-based dispatch**: Element type string ("div") directly determines all behavior
2. **No component registry**: All element types known at compile time
3. **Unified ShadowNode class**: One parameterized shadow node class for all HTML elements
4. **Text context awareness**: Shadow node creation considers parent context for virtual nodes
5. **Scroll promotion**: Decided at mounting time based on `overflow: scroll` style prop
6. **Yoga defaults in C++**: Element-specific defaults applied during shadow node creation
7. **Immutable nodes**: Shadow nodes are immutable; updates happen via cloning

---

## 1. C++ Element Dispatch Table Design

### 1.1 ElementDescriptor Structure

The core data structure that defines each HTML element's behavior:

```cpp
// HTMLElementDescriptor.h
#pragma once

#include <yoga/yoga.h>
#include <string>
#include <functional>
#include <unordered_set>

namespace reactdomnative {

enum class ElementCategory {
    Container,        // div, main, section, article, nav, header, footer, aside
    TextContainer,    // p, h1-h6 (renders text via Core Text, can have virtual children)
    VirtualText,      // span, strong, em, a (virtual inside text, real view outside)
    Input,            // input, textarea
    Select,           // select
    Image,            // img
    Button,           // button
    List,             // ul, ol
    ListItem,         // li
    HorizontalRule,   // hr
    Table,            // table, tr, td, th
    Video,            // video
    Form,             // form, label
};

struct YogaDefaults {
    YGFlexDirection flexDirection = YGFlexDirectionColumn;
    float flexShrink = 0.0f;
    float flexGrow = 0.0f;
    YGAlign alignItems = YGAlignStretch;
    YGAlign alignContent = YGAlignFlexStart;
    YGJustify justifyContent = YGJustifyFlexStart;
    YGOverflow overflow = YGOverflowVisible;
    YGPositionType positionType = YGPositionTypeRelative;

    // Margin/padding defaults (in points, -1 means undefined)
    float marginTop = -1;
    float marginBottom = -1;
    float marginLeft = -1;
    float marginRight = -1;
    float paddingTop = -1;
    float paddingBottom = -1;
    float paddingLeft = -1;
    float paddingRight = -1;

    // Dimension defaults (-1 means auto)
    float width = -1;
    float height = -1;
    float minWidth = -1;
    float minHeight = -1;
};

struct TextDefaults {
    float fontSize = 16.0f;           // Base font size
    bool isBold = false;              // fontWeight >= 600
    bool isItalic = false;
    std::string fontFamily = "";      // Empty = system font
};

enum class ViewType {
    UIView,           // Standard container view
    UIScrollView,     // Scroll container (promoted from div)
    UIImageView,      // Image display
    UITextField,      // Single-line input
    UITextView,       // Multi-line input
    TextRenderView,   // Custom text rendering view (p, h1-h6)
    Virtual,          // No UIView (virtual text nodes)
};

struct AccessibilityInfo {
    std::string role;                  // ARIA role equivalent
    bool isAccessibilityElement = false;
    uint64_t traits = 0;               // UIAccessibilityTraits bitmask
};

struct ElementDescriptor {
    std::string elementType;           // "div", "span", "p", etc.
    ElementCategory category;
    ViewType defaultViewType;          // Default; may be overridden (e.g., scroll promotion)
    YogaDefaults yogaDefaults;
    TextDefaults textDefaults;         // Only for text containers and virtual text
    AccessibilityInfo accessibility;

    // Event support flags
    bool supportsClick = true;
    bool supportsTouch = true;
    bool supportsScroll = false;       // Only for scroll-promoted containers
    bool supportsChange = false;       // Only for inputs
    bool supportsFocus = false;        // Only for inputs
    bool supportsLoad = false;         // Only for images

    // Special behaviors
    bool canBeVirtual = false;         // True for span, strong, em, a
    bool isTextContainer = false;      // True for p, h1-h6
    bool breaksTextContext = true;     // True for block elements (div breaks text)

    // Whether this element can have children
    bool canHaveChildren = true;

    // Whether this is a leaf node (img, input, br, hr)
    bool isLeafNode = false;
};

} // namespace reactdomnative
```

### 1.2 Static Element Registry

```cpp
// HTMLElementRegistry.cpp
#include "HTMLElementRegistry.h"
#include <unordered_map>
#include <stdexcept>

namespace reactdomnative {

namespace {

// Helper to create container element defaults
ElementDescriptor containerElement(const std::string& type, const std::string& role = "") {
    return ElementDescriptor{
        .elementType = type,
        .category = ElementCategory::Container,
        .defaultViewType = ViewType::UIView,
        .yogaDefaults = {
            .flexDirection = YGFlexDirectionColumn,
            .flexShrink = 0.0f,
            .alignItems = YGAlignStretch,
        },
        .accessibility = {.role = role},
        .breaksTextContext = true,
        .canHaveChildren = true,
    };
}

// Pre-computed static registry
const std::unordered_map<std::string, ElementDescriptor>& getRegistry() {
    static const std::unordered_map<std::string, ElementDescriptor> registry = {

        // ========== Container Elements ==========
        {"div", containerElement("div")},
        {"main", containerElement("main", "main")},
        {"section", containerElement("section", "region")},
        {"article", containerElement("article", "article")},
        {"nav", containerElement("nav", "navigation")},
        {"header", containerElement("header", "banner")},
        {"footer", containerElement("footer", "contentinfo")},
        {"aside", containerElement("aside", "complementary")},
        {"form", containerElement("form", "form")},

        // ========== Text Container Elements ==========
        {"p", {
            .elementType = "p",
            .category = ElementCategory::TextContainer,
            .defaultViewType = ViewType::TextRenderView,
            .yogaDefaults = {
                .flexDirection = YGFlexDirectionColumn,
                .flexShrink = 0.0f,
                .marginTop = 16.0f,      // 1em at 16px base
                .marginBottom = 16.0f,
            },
            .textDefaults = {.fontSize = 16.0f},
            .accessibility = {.role = "text", .isAccessibilityElement = true},
            .isTextContainer = true,
            .breaksTextContext = false,  // p establishes text context
        }},

        {"h1", {
            .elementType = "h1",
            .category = ElementCategory::TextContainer,
            .defaultViewType = ViewType::TextRenderView,
            .yogaDefaults = {
                .flexDirection = YGFlexDirectionColumn,
                .flexShrink = 0.0f,
                .marginTop = 21.4f,      // 0.67em at 32px
                .marginBottom = 21.4f,
            },
            .textDefaults = {.fontSize = 32.0f, .isBold = true},
            .accessibility = {.role = "heading", .isAccessibilityElement = true, .traits = 0x1},
            .isTextContainer = true,
        }},

        {"h2", {
            .elementType = "h2",
            .category = ElementCategory::TextContainer,
            .defaultViewType = ViewType::TextRenderView,
            .yogaDefaults = {
                .flexShrink = 0.0f,
                .marginTop = 19.9f,
                .marginBottom = 19.9f,
            },
            .textDefaults = {.fontSize = 24.0f, .isBold = true},
            .accessibility = {.role = "heading", .isAccessibilityElement = true},
            .isTextContainer = true,
        }},

        {"h3", {
            .elementType = "h3",
            .category = ElementCategory::TextContainer,
            .defaultViewType = ViewType::TextRenderView,
            .yogaDefaults = {
                .flexShrink = 0.0f,
                .marginTop = 18.7f,
                .marginBottom = 18.7f,
            },
            .textDefaults = {.fontSize = 18.7f, .isBold = true},
            .accessibility = {.role = "heading", .isAccessibilityElement = true},
            .isTextContainer = true,
        }},

        {"h4", {
            .elementType = "h4",
            .category = ElementCategory::TextContainer,
            .defaultViewType = ViewType::TextRenderView,
            .yogaDefaults = {
                .flexShrink = 0.0f,
                .marginTop = 21.3f,
                .marginBottom = 21.3f,
            },
            .textDefaults = {.fontSize = 16.0f, .isBold = true},
            .accessibility = {.role = "heading", .isAccessibilityElement = true},
            .isTextContainer = true,
        }},

        {"h5", {
            .elementType = "h5",
            .category = ElementCategory::TextContainer,
            .defaultViewType = ViewType::TextRenderView,
            .yogaDefaults = {
                .flexShrink = 0.0f,
                .marginTop = 22.2f,
                .marginBottom = 22.2f,
            },
            .textDefaults = {.fontSize = 13.3f, .isBold = true},
            .accessibility = {.role = "heading", .isAccessibilityElement = true},
            .isTextContainer = true,
        }},

        {"h6", {
            .elementType = "h6",
            .category = ElementCategory::TextContainer,
            .defaultViewType = ViewType::TextRenderView,
            .yogaDefaults = {
                .flexShrink = 0.0f,
                .marginTop = 24.9f,
                .marginBottom = 24.9f,
            },
            .textDefaults = {.fontSize = 10.7f, .isBold = true},
            .accessibility = {.role = "heading", .isAccessibilityElement = true},
            .isTextContainer = true,
        }},

        // ========== Virtual Text Elements ==========
        {"span", {
            .elementType = "span",
            .category = ElementCategory::VirtualText,
            .defaultViewType = ViewType::Virtual,  // Virtual when inside text
            .yogaDefaults = {
                .flexDirection = YGFlexDirectionRow,  // Used when promoted to real view
                .flexShrink = 1.0f,
            },
            .canBeVirtual = true,
            .breaksTextContext = false,
        }},

        {"strong", {
            .elementType = "strong",
            .category = ElementCategory::VirtualText,
            .defaultViewType = ViewType::Virtual,
            .textDefaults = {.isBold = true},
            .canBeVirtual = true,
            .breaksTextContext = false,
        }},

        {"em", {
            .elementType = "em",
            .category = ElementCategory::VirtualText,
            .defaultViewType = ViewType::Virtual,
            .textDefaults = {.isItalic = true},
            .canBeVirtual = true,
            .breaksTextContext = false,
        }},

        {"a", {
            .elementType = "a",
            .category = ElementCategory::VirtualText,
            .defaultViewType = ViewType::Virtual,  // Virtual when inline in text
            .yogaDefaults = {
                .flexDirection = YGFlexDirectionRow,
            },
            .accessibility = {.role = "link", .isAccessibilityElement = true},
            .canBeVirtual = true,
            .breaksTextContext = false,
        }},

        // ========== Interactive Elements ==========
        {"button", {
            .elementType = "button",
            .category = ElementCategory::Button,
            .defaultViewType = ViewType::UIView,
            .yogaDefaults = {
                .flexDirection = YGFlexDirectionRow,
                .flexShrink = 0.0f,
                .alignItems = YGAlignCenter,
                .justifyContent = YGJustifyCenter,
                .paddingTop = 4.0f,
                .paddingBottom = 4.0f,
                .paddingLeft = 12.0f,
                .paddingRight = 12.0f,
            },
            .accessibility = {.role = "button", .isAccessibilityElement = true},
            .supportsClick = true,
        }},

        {"input", {
            .elementType = "input",
            .category = ElementCategory::Input,
            .defaultViewType = ViewType::UITextField,
            .yogaDefaults = {
                .flexShrink = 0.0f,
                .height = 32.0f,
                .paddingLeft = 4.0f,
                .paddingRight = 4.0f,
            },
            .accessibility = {.isAccessibilityElement = true},
            .supportsChange = true,
            .supportsFocus = true,
            .canHaveChildren = false,
            .isLeafNode = true,
        }},

        {"textarea", {
            .elementType = "textarea",
            .category = ElementCategory::Input,
            .defaultViewType = ViewType::UITextView,
            .yogaDefaults = {
                .flexShrink = 0.0f,
                .minHeight = 48.0f,
                .paddingTop = 4.0f,
                .paddingBottom = 4.0f,
                .paddingLeft = 4.0f,
                .paddingRight = 4.0f,
            },
            .accessibility = {.isAccessibilityElement = true},
            .supportsChange = true,
            .supportsFocus = true,
            .canHaveChildren = false,
            .isLeafNode = true,
        }},

        {"select", {
            .elementType = "select",
            .category = ElementCategory::Select,
            .defaultViewType = ViewType::UIView,
            .yogaDefaults = {
                .flexDirection = YGFlexDirectionRow,
                .flexShrink = 0.0f,
                .alignItems = YGAlignCenter,
                .height = 32.0f,
                .paddingLeft = 4.0f,
                .paddingRight = 4.0f,
            },
            .accessibility = {.isAccessibilityElement = true},
            .supportsChange = true,
            .supportsFocus = true,
        }},

        // ========== Media Elements ==========
        {"img", {
            .elementType = "img",
            .category = ElementCategory::Image,
            .defaultViewType = ViewType::UIImageView,
            .yogaDefaults = {
                .flexShrink = 0.0f,
            },
            .accessibility = {.role = "image", .isAccessibilityElement = true},
            .supportsLoad = true,
            .canHaveChildren = false,
            .isLeafNode = true,
        }},

        {"video", {
            .elementType = "video",
            .category = ElementCategory::Video,
            .defaultViewType = ViewType::UIView,  // AVPlayerLayer hosted in UIView
            .yogaDefaults = {
                .flexShrink = 0.0f,
            },
            .isLeafNode = true,
        }},

        // ========== List Elements ==========
        {"ul", {
            .elementType = "ul",
            .category = ElementCategory::List,
            .defaultViewType = ViewType::UIView,
            .yogaDefaults = {
                .flexDirection = YGFlexDirectionColumn,
                .flexShrink = 0.0f,
                .paddingLeft = 40.0f,
                .marginTop = 16.0f,
                .marginBottom = 16.0f,
            },
            .accessibility = {.role = "list"},
            .breaksTextContext = true,
        }},

        {"ol", {
            .elementType = "ol",
            .category = ElementCategory::List,
            .defaultViewType = ViewType::UIView,
            .yogaDefaults = {
                .flexDirection = YGFlexDirectionColumn,
                .flexShrink = 0.0f,
                .paddingLeft = 40.0f,
                .marginTop = 16.0f,
                .marginBottom = 16.0f,
            },
            .accessibility = {.role = "list"},
            .breaksTextContext = true,
        }},

        {"li", {
            .elementType = "li",
            .category = ElementCategory::ListItem,
            .defaultViewType = ViewType::UIView,
            .yogaDefaults = {
                .flexDirection = YGFlexDirectionRow,
                .flexShrink = 0.0f,
            },
            .accessibility = {.role = "listitem", .isAccessibilityElement = true},
        }},

        // ========== Formatting Elements ==========
        {"hr", {
            .elementType = "hr",
            .category = ElementCategory::HorizontalRule,
            .defaultViewType = ViewType::UIView,
            .yogaDefaults = {
                .flexShrink = 0.0f,
                .height = 0.0f,
                .marginTop = 8.0f,
                .marginBottom = 8.0f,
            },
            .canHaveChildren = false,
            .isLeafNode = true,
        }},

        {"br", {
            .elementType = "br",
            .category = ElementCategory::VirtualText,
            .defaultViewType = ViewType::Virtual,
            .canBeVirtual = true,
            .canHaveChildren = false,
            .isLeafNode = true,
            .breaksTextContext = false,
        }},
    };

    return registry;
}

} // anonymous namespace

const ElementDescriptor& HTMLElementRegistry::get(const std::string& elementType) {
    static const auto& registry = getRegistry();

    auto it = registry.find(elementType);
    if (it == registry.end()) {
        throw std::invalid_argument("Unknown HTML element type: " + elementType);
    }
    return it->second;
}

bool HTMLElementRegistry::isKnownElement(const std::string& elementType) {
    static const auto& registry = getRegistry();
    return registry.find(elementType) != registry.end();
}

std::vector<std::string> HTMLElementRegistry::getAllElementTypes() {
    static const auto& registry = getRegistry();
    std::vector<std::string> types;
    types.reserve(registry.size());
    for (const auto& [key, _] : registry) {
        types.push_back(key);
    }
    return types;
}

} // namespace reactdomnative
```

---

## 2. ShadowNode Class Hierarchy Decision

### 2.1 Analysis of Options

**Option A: One Universal HTMLShadowNode**
- Single class parameterized by element type string
- ElementDescriptor lookup provides all type-specific behavior
- Simplest to implement and maintain
- May have some runtime overhead from type string lookups

**Option B: Per-Category Subclasses**
- Base HTMLShadowNode + TextContainerShadowNode, InputShadowNode, ImageShadowNode, etc.
- Category-specific behavior in subclasses
- More type safety, less string matching
- ~6 classes to maintain

**Option C: Per-Element Classes**
- DivShadowNode, SpanShadowNode, ParagraphShadowNode, etc.
- Maximum type safety
- ~30+ classes to maintain
- Matches Fabric pattern but excessive for our fixed set

### 2.2 Decision: Universal HTMLShadowNode with Category Methods

We use **Option A (Universal HTMLShadowNode)** with virtual dispatch only where category-specific behavior differs significantly. The element type string and ElementDescriptor provide all parameterization.

**Important**: In persistent mode, shadow nodes are **immutable** after creation. Props and children are stored as `shared_ptr<const T>` and updates happen via cloning, not mutation. The `ElementDescriptor` reference is naturally shared across clones since it points to a static registry entry.

```cpp
// HTMLShadowNode.h
#pragma once

#include "HTMLElementRegistry.h"
#include "ShadowNodeFamily.h"
#include <yoga/yoga.h>
#include <memory>
#include <vector>
#include <string>
#include <unordered_map>

namespace reactdomnative {

// Forward declarations
class ShadowNodeFamily;

// Immutable props container
using Props = folly::dynamic;
using SharedProps = std::shared_ptr<const Props>;

// Immutable children list
using ChildList = std::vector<std::shared_ptr<const HTMLShadowNode>>;
using SharedChildList = std::shared_ptr<const ChildList>;

class HTMLShadowNode : public std::enable_shared_from_this<HTMLShadowNode> {
public:
    using Shared = std::shared_ptr<const HTMLShadowNode>;  // Note: const for immutability
    using Weak = std::weak_ptr<const HTMLShadowNode>;

    // Factory method - creates a NEW shadow node
    static Shared create(
        const std::string& elementType,
        SharedProps props,
        InstanceHandle::Shared instanceHandle,
        bool isInsideTextContext
    );

    ~HTMLShadowNode();

    // Prevent copying (shadow nodes are reference-counted)
    HTMLShadowNode(const HTMLShadowNode&) = delete;
    HTMLShadowNode& operator=(const HTMLShadowNode&) = delete;

    // ========== Cloning (Persistent Mode) ==========
    // Clone with new props (keeps same children)
    Shared cloneWithNewProps(SharedProps newProps) const;

    // Clone with new children (keeps same props)
    Shared cloneWithNewChildren(SharedChildList newChildren) const;

    // Clone with both new props and new children
    Shared cloneWithNewPropsAndChildren(
        SharedProps newProps,
        SharedChildList newChildren
    ) const;

    // Clone as hidden (for Suspense/visibility)
    Shared cloneAsHidden() const;

    // ========== Accessors ==========
    const std::string& getElementType() const { return elementType_; }
    const ElementDescriptor& getDescriptor() const { return descriptor_; }
    YGNodeRef getYogaNode() const { return yogaNode_; }
    InstanceHandle::Shared getInstanceHandle() const { return instanceHandle_.lock(); }

    // ========== Identity (Persistent Mode) ==========
    // Returns the family - stable identity across clones
    const ShadowNodeFamily& getFamily() const { return *family_; }
    ShadowNodeFamily::Shared getFamilyShared() const { return family_; }

    // Check if two nodes represent the same logical element
    bool isSameLogicalNode(const HTMLShadowNode& other) const {
        return family_.get() == other.family_.get();
    }

    // ========== Tree Structure (Immutable) ==========
    Weak getParent() const { return parent_; }
    SharedChildList getChildren() const { return children_; }

    // ========== Props (Immutable) ==========
    SharedProps getProps() const { return props_; }

    // ========== Virtual Node Status ==========
    bool isVirtual() const { return isVirtual_; }
    bool isHidden() const { return isHidden_; }
    bool isTextContainer() const { return descriptor_.isTextContainer; }
    bool isInsideTextContext() const { return isInsideTextContext_; }

    // ========== Layout ==========
    float getLayoutLeft() const { return YGNodeLayoutGetLeft(yogaNode_); }
    float getLayoutTop() const { return YGNodeLayoutGetTop(yogaNode_); }
    float getLayoutWidth() const { return YGNodeLayoutGetWidth(yogaNode_); }
    float getLayoutHeight() const { return YGNodeLayoutGetHeight(yogaNode_); }

    // Layout metrics (computed after Yoga layout pass)
    LayoutMetrics getLayoutMetrics() const { return layoutMetrics_; }

    // ========== Text Rendering (for TextContainer nodes) ==========
    NSAttributedString* buildAttributedString() const;

    // ========== View Factory ==========
    ViewType getResolvedViewType() const;  // May differ from descriptor due to scroll promotion

    // ========== Event Support ==========
    const HTMLEventEmitter& getEventEmitter() const { return *eventEmitter_; }
    bool hasEventHandler(const std::string& eventName) const;

private:
    // Private constructor - use create() or clone methods
    HTMLShadowNode(
        const std::string& elementType,
        const ElementDescriptor& descriptor,
        SharedProps props,
        ShadowNodeFamily::Shared family,
        SharedChildList children,
        bool isInsideTextContext,
        bool isVirtual,
        bool isHidden
    );

    // Clone constructor - copies layout state from source
    HTMLShadowNode(
        const HTMLShadowNode& source,
        SharedProps newProps,
        SharedChildList newChildren,
        bool isHidden
    );

    // Apply element-specific Yoga defaults
    void applyYogaDefaults();

    // Apply style props to Yoga node
    void applyStyleProps(const Props& style);

    // Set up text measure function if needed
    void setTextMeasureFunc();

    // Core identity (immutable)
    const std::string elementType_;
    const ElementDescriptor& descriptor_;  // Reference to static registry entry (shared across clones)

    // Family - stable identity across clones
    ShadowNodeFamily::Shared family_;

    // Instance handle (weak reference to JS fiber)
    InstanceHandle::Weak instanceHandle_;

    // Parent (set during tree construction, not exposed for mutation)
    mutable Weak parent_;

    // Children (immutable, shared across clones when unchanged)
    SharedChildList children_;

    // Yoga layout node (cloned for each shadow node)
    YGNodeRef yogaNode_;

    // Computed layout metrics
    mutable LayoutMetrics layoutMetrics_;

    // Props (immutable, shared across clones when unchanged)
    SharedProps props_;

    // State flags (immutable after construction)
    const bool isVirtual_;
    const bool isInsideTextContext_;
    const bool isHidden_;
    bool hasScrollOverflow_;

    // Event handling
    std::unique_ptr<HTMLEventEmitter> eventEmitter_;

    // Registered event handlers (from props)
    std::unordered_set<std::string> eventHandlers_;
};

} // namespace reactdomnative
```

### 2.3 Factory Implementation with Text Context Detection

```cpp
// HTMLShadowNode.cpp

HTMLShadowNode::Shared HTMLShadowNode::create(
    const std::string& elementType,
    SharedProps props,
    InstanceHandle::Shared instanceHandle,
    bool isInsideTextContext
) {
    const auto& descriptor = HTMLElementRegistry::get(elementType);

    // Determine if this node should be virtual
    bool isVirtual = false;
    if (descriptor.canBeVirtual && isInsideTextContext) {
        // Elements like <span>, <strong>, <em>, <a> are virtual when inside text
        isVirtual = true;
    }

    // Create ShadowNodeFamily for stable identity across clones
    auto family = ShadowNodeFamily::create(instanceHandle, elementType);

    // Create empty children list
    auto children = std::make_shared<ChildList>();

    auto node = std::shared_ptr<const HTMLShadowNode>(new HTMLShadowNode(
        elementType,
        descriptor,
        props,
        family,
        children,
        isInsideTextContext,
        isVirtual,
        false  // isHidden
    ));

    return node;
}

// Primary constructor for new nodes
HTMLShadowNode::HTMLShadowNode(
    const std::string& elementType,
    const ElementDescriptor& descriptor,
    SharedProps props,
    ShadowNodeFamily::Shared family,
    SharedChildList children,
    bool isInsideTextContext,
    bool isVirtual,
    bool isHidden
)
    : elementType_(elementType)
    , descriptor_(descriptor)
    , family_(family)
    , instanceHandle_(family->getInstanceHandle())
    , children_(children)
    , props_(props)
    , isVirtual_(isVirtual)
    , isInsideTextContext_(isInsideTextContext)
    , isHidden_(isHidden)
    , hasScrollOverflow_(false)
{
    // Create Yoga node (even for virtual nodes - used for text measurement)
    yogaNode_ = YGNodeNew();

    // Store this shadow node as the Yoga node's context
    YGNodeSetContext(yogaNode_, this);

    // Apply element-specific Yoga defaults
    applyYogaDefaults();

    // Apply style props from the provided props
    if (props && props->count("style")) {
        applyStyleProps((*props)["style"]);
    }

    // Check for scroll promotion
    if (props && props->count("style") && (*props)["style"].count("overflow")) {
        const auto& overflow = (*props)["style"]["overflow"].asString();
        if (overflow == "scroll" || overflow == "auto") {
            hasScrollOverflow_ = true;
        }
    }

    // Extract event handlers
    if (props) {
        for (const auto& [key, value] : props->items()) {
            if (key.asString().substr(0, 2) == "on" && value.isBool() && value.asBool()) {
                eventHandlers_.insert(key.asString());
            }
        }
    }

    // Set up text measure function if this is a text container
    if (descriptor_.isTextContainer && !isVirtual_) {
        setTextMeasureFunc();
    }

    // Create event emitter
    eventEmitter_ = std::make_unique<HTMLEventEmitter>(family->getInstanceHandle().lock());
}

// Clone constructor - efficiently copies from source
HTMLShadowNode::HTMLShadowNode(
    const HTMLShadowNode& source,
    SharedProps newProps,
    SharedChildList newChildren,
    bool isHidden
)
    : elementType_(source.elementType_)
    , descriptor_(source.descriptor_)  // Same reference - ElementDescriptor is type-based
    , family_(source.family_)          // SAME family - this is how identity works
    , instanceHandle_(source.instanceHandle_)
    , children_(newChildren ? newChildren : source.children_)  // Share if unchanged
    , props_(newProps ? newProps : source.props_)              // Share if unchanged
    , isVirtual_(source.isVirtual_)
    , isInsideTextContext_(source.isInsideTextContext_)
    , isHidden_(isHidden)
    , hasScrollOverflow_(source.hasScrollOverflow_)
    , eventHandlers_(source.eventHandlers_)
{
    // Clone Yoga node (each clone needs its own for layout)
    yogaNode_ = YGNodeClone(source.yogaNode_);
    YGNodeSetContext(yogaNode_, this);

    // Re-apply style props if props changed
    if (newProps && newProps->count("style")) {
        applyStyleProps((*newProps)["style"]);

        // Re-check scroll promotion
        if ((*newProps)["style"].count("overflow")) {
            const auto& overflow = (*newProps)["style"]["overflow"].asString();
            hasScrollOverflow_ = (overflow == "scroll" || overflow == "auto");
        }

        // Re-extract event handlers
        eventHandlers_.clear();
        for (const auto& [key, value] : newProps->items()) {
            if (key.asString().substr(0, 2) == "on" && value.isBool() && value.asBool()) {
                eventHandlers_.insert(key.asString());
            }
        }
    }

    // Clone event emitter
    eventEmitter_ = std::make_unique<HTMLEventEmitter>(family_->getInstanceHandle().lock());
}
```

### 2.4 Clone Methods Implementation

In persistent mode, updates create new nodes via cloning rather than mutating in place. The `ElementDescriptor` reference is naturally shared since all clones of a given element type point to the same static registry entry.

```cpp
// Clone with new props (structural sharing of children)
HTMLShadowNode::Shared HTMLShadowNode::cloneWithNewProps(SharedProps newProps) const {
    return std::shared_ptr<const HTMLShadowNode>(
        new HTMLShadowNode(*this, newProps, nullptr, isHidden_)
    );
}

// Clone with new children (structural sharing of props)
HTMLShadowNode::Shared HTMLShadowNode::cloneWithNewChildren(SharedChildList newChildren) const {
    return std::shared_ptr<const HTMLShadowNode>(
        new HTMLShadowNode(*this, nullptr, newChildren, isHidden_)
    );
}

// Clone with both new props and new children
HTMLShadowNode::Shared HTMLShadowNode::cloneWithNewPropsAndChildren(
    SharedProps newProps,
    SharedChildList newChildren
) const {
    return std::shared_ptr<const HTMLShadowNode>(
        new HTMLShadowNode(*this, newProps, newChildren, isHidden_)
    );
}

// Clone as hidden (for Suspense boundaries, visibility changes)
HTMLShadowNode::Shared HTMLShadowNode::cloneAsHidden() const {
    return std::shared_ptr<const HTMLShadowNode>(
        new HTMLShadowNode(*this, nullptr, nullptr, true /* isHidden */)
    );
}
```

**Key points about cloning:**

| Aspect | Behavior |
|--------|----------|
| `ElementDescriptor` | Same reference - it's type-based, not instance-based |
| `ShadowNodeFamily` | Same reference - provides stable identity across clones |
| `props_` | New `shared_ptr` if changed, otherwise shared with source |
| `children_` | New `shared_ptr` if changed, otherwise shared with source |
| `yogaNode_` | Always cloned - each node needs its own for layout |
| `eventEmitter_` | Recreated - tied to this specific node instance |

---

## 3. ShadowNodeFamily for Stable Identity

In persistent mode, shadow nodes are cloned on every update. We need a stable identity that persists across clones to:

1. Match nodes between old and new trees during diffing
2. Map from native views back to the correct logical element
3. Support event dispatch to the right component

### 3.1 ShadowNodeFamily Implementation

```cpp
// ShadowNodeFamily.h
#pragma once

#include "InstanceHandle.h"
#include <memory>
#include <string>

namespace reactdomnative {

// Stable identity for a logical element, shared across all clones
class ShadowNodeFamily : public std::enable_shared_from_this<ShadowNodeFamily> {
public:
    using Shared = std::shared_ptr<ShadowNodeFamily>;
    using Weak = std::weak_ptr<ShadowNodeFamily>;

    static Shared create(
        InstanceHandle::Shared instanceHandle,
        const std::string& elementType
    ) {
        return std::make_shared<ShadowNodeFamily>(instanceHandle, elementType);
    }

    ShadowNodeFamily(
        InstanceHandle::Shared instanceHandle,
        const std::string& elementType
    )
        : instanceHandle_(instanceHandle)
        , elementType_(elementType)
    {}

    // Instance handle for JS fiber reference
    InstanceHandle::Weak getInstanceHandle() const { return instanceHandle_; }

    // Element type for debugging/logging
    const std::string& getElementType() const { return elementType_; }

    // Parent family (for tree traversal during event bubbling)
    Weak getParent() const { return parent_; }
    void setParent(Weak parent) { parent_ = parent; }

private:
    InstanceHandle::Weak instanceHandle_;
    std::string elementType_;
    Weak parent_;
};

} // namespace reactdomnative
```

### 3.2 Identity Comparison

The Differentiator uses family pointer equality to match nodes:

```cpp
// In Differentiator
void diffNode(
    HTMLShadowNode::Shared oldNode,
    HTMLShadowNode::Shared newNode,
    std::vector<Mutation>& mutations
) {
    // Pointer comparison on family - O(1) identity check
    if (&oldNode->getFamily() == &newNode->getFamily()) {
        // Same logical element - check for prop/layout changes
        if (oldNode->getProps() != newNode->getProps() ||
            oldNode->getLayoutMetrics() != newNode->getLayoutMetrics()) {
            mutations.push_back(Mutation::Update(newNode));
        }
        diffChildren(oldNode, newNode, mutations);
    } else {
        // Different elements - remove old, insert new
        mutations.push_back(Mutation::Remove(oldNode));
        mutations.push_back(Mutation::Insert(newNode));
    }
}
```

---

## 4. Text Context Propagation

### 4.1 The Text Context Problem

When creating `<span>` inside `<p>`, the span should be virtual (no UIView). But when `<span>` is a direct child of `<div>`, it should create a real UIView. The shadow node needs to know its parent context at creation time.

### 4.2 Solution: Context Flag in createInstance

The JS host config tracks text context and passes it to native:

```javascript
// packages/renderer/src/ReactDOMNativeHostConfig.js

function getChildHostContext(parentHostContext, type, rootContainer) {
    const parentContext = parentHostContext;
    const descriptor = getElementDescriptor(type);

    // Determine if children will be in text context
    let childTextContext = false;

    if (descriptor.isTextContainer) {
        // <p>, <h1>-<h6> establish text context for children
        childTextContext = true;
    } else if (descriptor.canBeVirtual && parentContext.isInsideTextContext) {
        // <span>, <strong>, <em>, <a> propagate text context
        childTextContext = true;
    } else if (descriptor.breaksTextContext) {
        // <div> and other block elements break text context
        childTextContext = false;
    } else {
        // Otherwise inherit from parent
        childTextContext = parentContext.isInsideTextContext;
    }

    return {
        isInsideTextContext: childTextContext,
    };
}

function createInstance(type, props, rootContainer, hostContext, internalHandle) {
    // Pass text context to native
    const node = bridge.createNode(
        type,
        props,
        hostContext.isInsideTextContext  // New parameter
    );

    return {
        type,
        node,
        props,
    };
}
```

### 4.3 C++ Side Context Handling

```cpp
// In UIManagerBinding or equivalent

jsi::Value createNode(
    jsi::Runtime& runtime,
    const jsi::Value& type,
    const jsi::Value& props,
    const jsi::Value& isInsideTextContext
) {
    auto elementType = type.asString(runtime).utf8(runtime);
    auto propsObj = props.asObject(runtime);
    auto isInText = isInsideTextContext.getBool();

    // Create instance handle from fiber
    auto instanceHandle = InstanceHandle::create(runtime, fiber);

    // Create shadow node with text context awareness
    auto shadowNode = HTMLShadowNode::create(
        elementType,
        dynamicFromValue(runtime, propsObj),
        instanceHandle,
        isInText
    );

    // Store in shadow tree
    shadowTree_->registerNode(shadowNode);

    // Return handle to JS
    return valueFromShadowNode(runtime, shadowNode);
}
```

---

## 5. Scroll Promotion Strategy

### 5.1 When Scroll Promotion Happens

A `<div>` with `overflow: scroll` or `overflow: auto` should render as `UIScrollView` instead of `UIView`. This decision is made at:

1. **Shadow node creation**: Parse style props, set `hasScrollOverflow_` flag
2. **View mounting**: Use `getResolvedViewType()` to determine actual view class

In persistent mode, if scroll promotion status changes (e.g., `overflow: visible` becomes `overflow: scroll`), a new clone is created with the updated `hasScrollOverflow_` flag. The Differentiator detects the view type change and generates appropriate mutations.

### 5.2 Implementation

```cpp
// In HTMLShadowNode

ViewType HTMLShadowNode::getResolvedViewType() const {
    // Virtual nodes have no view
    if (isVirtual_) {
        return ViewType::Virtual;
    }

    // Hidden nodes still have a view type (for when they become visible)
    // but the view is not created/mounted

    // Check for scroll promotion
    if (hasScrollOverflow_ && descriptor_.category == ElementCategory::Container) {
        return ViewType::UIScrollView;
    }

    // Use default view type from descriptor
    return descriptor_.defaultViewType;
}

// Note: In persistent mode, there is no updateProps() method.
// Props changes create a new clone via cloneWithNewProps().
// The clone constructor re-evaluates hasScrollOverflow_ from the new props.
```

### 5.3 View Factory with Scroll Promotion

```swift
// Swift ViewFactory

func createView(for shadowNode: HTMLShadowNode) -> UIView? {
    let viewType = shadowNode.getResolvedViewType()

    switch viewType {
    case .Virtual:
        return nil  // No UIView for virtual nodes

    case .UIView:
        return RDNView(shadowNode: shadowNode)

    case .UIScrollView:
        return RDNScrollView(shadowNode: shadowNode)

    case .UIImageView:
        return RDNImageView(shadowNode: shadowNode)

    case .UITextField:
        return RDNTextField(shadowNode: shadowNode)

    case .UITextView:
        return RDNTextView(shadowNode: shadowNode)

    case .TextRenderView:
        return RDNTextRenderView(shadowNode: shadowNode)
    }
}
```

---

## 6. Yoga Defaults Application

### 6.1 When Defaults Are Applied

Yoga defaults are applied in the shadow node constructor, BEFORE any style props from the user. This ensures element-specific behavior is set up correctly.

### 6.2 Implementation

```cpp
void HTMLShadowNode::applyYogaDefaults() {
    const auto& defaults = descriptor_.yogaDefaults;

    // Flex direction
    YGNodeStyleSetFlexDirection(yogaNode_, defaults.flexDirection);

    // Flex properties
    YGNodeStyleSetFlexShrink(yogaNode_, defaults.flexShrink);
    YGNodeStyleSetFlexGrow(yogaNode_, defaults.flexGrow);

    // Alignment
    YGNodeStyleSetAlignItems(yogaNode_, defaults.alignItems);
    YGNodeStyleSetAlignContent(yogaNode_, defaults.alignContent);
    YGNodeStyleSetJustifyContent(yogaNode_, defaults.justifyContent);

    // Overflow and position
    YGNodeStyleSetOverflow(yogaNode_, defaults.overflow);
    YGNodeStyleSetPositionType(yogaNode_, defaults.positionType);

    // Margins (only if defined in defaults)
    if (defaults.marginTop >= 0) {
        YGNodeStyleSetMargin(yogaNode_, YGEdgeTop, defaults.marginTop);
    }
    if (defaults.marginBottom >= 0) {
        YGNodeStyleSetMargin(yogaNode_, YGEdgeBottom, defaults.marginBottom);
    }
    if (defaults.marginLeft >= 0) {
        YGNodeStyleSetMargin(yogaNode_, YGEdgeLeft, defaults.marginLeft);
    }
    if (defaults.marginRight >= 0) {
        YGNodeStyleSetMargin(yogaNode_, YGEdgeRight, defaults.marginRight);
    }

    // Padding (only if defined in defaults)
    if (defaults.paddingTop >= 0) {
        YGNodeStyleSetPadding(yogaNode_, YGEdgeTop, defaults.paddingTop);
    }
    if (defaults.paddingBottom >= 0) {
        YGNodeStyleSetPadding(yogaNode_, YGEdgeBottom, defaults.paddingBottom);
    }
    if (defaults.paddingLeft >= 0) {
        YGNodeStyleSetPadding(yogaNode_, YGEdgeLeft, defaults.paddingLeft);
    }
    if (defaults.paddingRight >= 0) {
        YGNodeStyleSetPadding(yogaNode_, YGEdgeRight, defaults.paddingRight);
    }

    // Dimensions (only if defined in defaults)
    if (defaults.width >= 0) {
        YGNodeStyleSetWidth(yogaNode_, defaults.width);
    }
    if (defaults.height >= 0) {
        YGNodeStyleSetHeight(yogaNode_, defaults.height);
    }
    if (defaults.minWidth >= 0) {
        YGNodeStyleSetMinWidth(yogaNode_, defaults.minWidth);
    }
    if (defaults.minHeight >= 0) {
        YGNodeStyleSetMinHeight(yogaNode_, defaults.minHeight);
    }
}
```

---

## 7. Complete createInstance Flow

### 7.1 End-to-End Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           JS: createInstance("div", props)                       │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  1. Host config receives type="div", props={style: {flexDirection: 'row'}}     │
│                                                                                │
│  2. Get host context: { isInsideTextContext: false }                           │
│                                                                                │
│  3. Call bridge: $$createNode("div", props, false)                             │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ JSI call (synchronous)
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                           C++: UIManagerBinding.createNode()                     │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  4. Extract type string: "div"                                                 │
│  5. Extract props: {style: {flexDirection: 'row'}}                             │
│  6. Extract isInsideTextContext: false                                         │
│  7. Create InstanceHandle from fiber reference                                 │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                           C++: HTMLShadowNode::create()                          │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  8. Lookup descriptor: HTMLElementRegistry::get("div")                         │
│     → Returns ElementDescriptor for div:                                       │
│       {                                                                        │
│         category: Container,                                                   │
│         defaultViewType: UIView,                                               │
│         yogaDefaults: { flexDirection: Column, flexShrink: 0 }                 │
│       }                                                                        │
│                                                                                │
│  9. Determine virtual status:                                                  │
│     - descriptor.canBeVirtual = false                                          │
│     - isInsideTextContext = false                                              │
│     → isVirtual = false                                                        │
│                                                                                │
│  10. Create ShadowNodeFamily for stable identity                               │
│      - Family is shared by all future clones of this node                      │
│                                                                                │
│  11. Create shadow node instance (immutable after construction)                │
│                                                                                │
│  12. Create Yoga node: YGNodeNew()                                             │
│      - Set context to shadow node pointer                                      │
│                                                                                │
│  13. Apply Yoga defaults from descriptor:                                      │
│      - YGNodeStyleSetFlexDirection(node, Column)  // from descriptor           │
│      - YGNodeStyleSetFlexShrink(node, 0.0)       // from descriptor            │
│                                                                                │
│  14. Apply style props from user:                                              │
│      - YGNodeStyleSetFlexDirection(node, Row)    // overrides default          │
│                                                                                │
│  15. Check for scroll promotion:                                               │
│      - No overflow: scroll in style                                            │
│      → hasScrollOverflow = false                                               │
│                                                                                │
│  16. Extract event handlers:                                                   │
│      - No onClick, etc. in props                                               │
│      → eventHandlers_ = {}                                                     │
│                                                                                │
│  17. Create HTMLEventEmitter with instanceHandle                               │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                           C++: ShadowTree.registerNode()                         │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  18. Store shadow node in family → node map                                    │
│  19. Shadow node is NOT yet in tree (parent set during tree construction)      │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ JSI return (synchronous)
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                           JS: Instance returned                                  │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  20. Wrap C++ pointer in jsi::NativeState                                      │
│  21. Return jsi::Object to JavaScript                                          │
│  22. Host config stores as Instance:                                           │
│      { type: "div", node: <native handle>, props: {...} }                      │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Flow for Virtual Node (span inside p)

```
JS: createInstance("span", props) with hostContext = { isInsideTextContext: true }
                    │
                    ▼
C++: HTMLShadowNode::create("span", props, true)
                    │
                    ├─► Lookup descriptor for "span":
                    │   { canBeVirtual: true, defaultViewType: Virtual }
                    │
                    ├─► Create ShadowNodeFamily (shared by all clones)
                    │
                    ├─► Determine virtual status:
                    │   descriptor.canBeVirtual = true
                    │   isInsideTextContext = true
                    │   → isVirtual = true
                    │
                    ├─► Create Yoga node (still needed for text measurement)
                    │
                    ├─► Skip text measure func (virtual, not text container)
                    │
                    └─► getResolvedViewType() → Virtual (no UIView created)
```

### 7.3 Cloning Flow (Persistent Mode Update)

When props or children change in persistent mode, the reconciler calls `cloneInstance` instead of `commitUpdate`:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                  JS: cloneInstance(instance, newProps, keepChildren)             │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  1. Reconciler detected props change (prepareUpdate returned non-null)         │
│                                                                                │
│  2. Call bridge: $$cloneNode(instanceHandle, newProps, keepChildren)           │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ JSI call (synchronous)
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                      C++: UIManagerBinding.cloneNode()                           │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  3. Lookup existing shadow node from instance handle                           │
│                                                                                │
│  4. Create SharedProps from newProps (or nullptr if unchanged)                 │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                    C++: HTMLShadowNode::cloneWithNewProps()                      │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  5. Create new HTMLShadowNode via clone constructor:                           │
│     - elementType_ = source.elementType_ (copied)                              │
│     - descriptor_ = source.descriptor_ (SAME reference - it's type-based)     │
│     - family_ = source.family_ (SAME reference - preserves identity)          │
│     - children_ = source.children_ (SHARED if keepChildren=true)              │
│     - props_ = newProps (NEW shared_ptr)                                       │
│                                                                                │
│  6. Clone Yoga node: YGNodeClone(source.yogaNode_)                             │
│     - Each clone needs its own Yoga node for independent layout                │
│                                                                                │
│  7. Re-apply style props from new props to cloned Yoga node                    │
│                                                                                │
│  8. Re-evaluate hasScrollOverflow_ from new props                              │
│                                                                                │
│  9. Re-extract event handlers from new props                                   │
│                                                                                │
│  10. Create new HTMLEventEmitter                                               │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                           New immutable node returned                            │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  11. Clone shares same ShadowNodeFamily as original                            │
│      → Differentiator will match them as same logical element                  │
│                                                                                │
│  12. Clone shares same ElementDescriptor reference                             │
│      → All "div" nodes point to same static registry entry                     │
│                                                                                │
│  13. Old node remains unchanged (immutability)                                 │
│      → Old tree still valid until commit completes                             │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Structural Sharing Example:**

```
Old Tree                              New Tree (after cloneWithNewProps on C)
   A                                     A'
  / \                                   / \
 B   C  ──cloneWithNewProps(C)──►      B   C'
    / \                                   / \
   D   E                                 D   E

- A' is cloned (children changed)
- B is SHARED (same reference, no clone needed)
- C' is NEW (props changed)
- D, E are SHARED (children unchanged, keepChildren=true)
```

---

## 8. View Factory Design

### 8.1 Swift View Factory Interface

```swift
// ViewFactory.swift

protocol NativeView: UIView {
    var shadowNode: HTMLShadowNode { get }
    func updateProps(_ props: [String: Any])
    func prepareForRecycle()
}

class ViewFactory {
    static let shared = ViewFactory()

    private var viewPool: [String: [NativeView]] = [:]
    private let maxPoolSize = 256

    func createView(for shadowNode: HTMLShadowNode) -> NativeView? {
        let viewType = shadowNode.getResolvedViewType()
        let elementType = shadowNode.getElementType()

        // Try to dequeue from pool
        if let pooledView = dequeue(elementType: elementType, viewType: viewType) {
            pooledView.configure(with: shadowNode)
            return pooledView
        }

        // Create new view based on resolved type
        let view: NativeView?
        switch viewType {
        case .Virtual:
            return nil

        case .UIView:
            view = RDNContainerView(shadowNode: shadowNode)

        case .UIScrollView:
            view = RDNScrollView(shadowNode: shadowNode)

        case .UIImageView:
            view = RDNImageView(shadowNode: shadowNode)

        case .UITextField:
            view = RDNTextField(shadowNode: shadowNode)

        case .UITextView:
            view = RDNTextView(shadowNode: shadowNode)

        case .TextRenderView:
            view = RDNTextRenderView(shadowNode: shadowNode)
        }

        return view
    }

    func recycleView(_ view: NativeView, elementType: String) {
        let key = cacheKey(elementType: elementType, viewType: view.viewType)

        if (viewPool[key]?.count ?? 0) < maxPoolSize {
            view.prepareForRecycle()
            viewPool[key, default: []].append(view)
        }
    }

    private func dequeue(elementType: String, viewType: ViewType) -> NativeView? {
        let key = cacheKey(elementType: elementType, viewType: viewType)
        return viewPool[key]?.popLast()
    }

    private func cacheKey(elementType: String, viewType: ViewType) -> String {
        return "\(elementType)_\(viewType)"
    }
}
```

### 8.2 Specialized View Classes

```swift
// RDNContainerView.swift - For div, section, header, etc.
class RDNContainerView: UIView, NativeView {
    private(set) var shadowNode: HTMLShadowNode

    init(shadowNode: HTMLShadowNode) {
        self.shadowNode = shadowNode
        super.init(frame: .zero)
        self.translatesAutoresizingMaskIntoConstraints = true
        setupGestureRecognizers()
    }

    func configure(with shadowNode: HTMLShadowNode) {
        self.shadowNode = shadowNode
        updateProps(shadowNode.getProps())
    }

    func updateProps(_ props: [String: Any]) {
        // Apply visual props
        if let style = props["style"] as? [String: Any] {
            applyVisualStyle(style)
        }
    }

    func prepareForRecycle() {
        // Reset to default state
        backgroundColor = nil
        layer.cornerRadius = 0
        layer.borderWidth = 0
        alpha = 1.0
        transform = .identity
        gestureRecognizers?.forEach { removeGestureRecognizer($0) }
    }

    private func applyVisualStyle(_ style: [String: Any]) {
        if let bgColor = style["backgroundColor"] as? String {
            backgroundColor = UIColor(cssString: bgColor)
        }
        if let opacity = style["opacity"] as? CGFloat {
            alpha = opacity
        }
        if let borderRadius = style["borderRadius"] as? CGFloat {
            layer.cornerRadius = borderRadius
        }
        // ... more visual properties
    }
}

// RDNTextRenderView.swift - For p, h1-h6
class RDNTextRenderView: UIView, NativeView {
    private(set) var shadowNode: HTMLShadowNode
    private var textStorage: NSTextStorage?
    private var layoutManager: NSLayoutManager?
    private var textContainer: NSTextContainer?

    init(shadowNode: HTMLShadowNode) {
        self.shadowNode = shadowNode
        super.init(frame: .zero)
        setupTextKit()
    }

    func configure(with shadowNode: HTMLShadowNode) {
        self.shadowNode = shadowNode
        rebuildAttributedString()
    }

    override func draw(_ rect: CGRect) {
        guard let layoutManager = layoutManager,
              let textContainer = textContainer else { return }

        let glyphRange = layoutManager.glyphRange(for: textContainer)
        layoutManager.drawBackground(forGlyphRange: glyphRange, at: .zero)
        layoutManager.drawGlyphs(forGlyphRange: glyphRange, at: .zero)
    }

    private func rebuildAttributedString() {
        let attrString = shadowNode.buildAttributedString()
        textStorage?.setAttributedString(attrString)
        setNeedsDisplay()
    }
}
```

---

## 9. Summary

### 9.1 Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Reconciler mode | Persistent (clone-on-write) | Thread safety, concurrent features, Fabric alignment |
| Dispatch mechanism | Static `unordered_map<string, ElementDescriptor>` | O(1) lookup, no virtual dispatch overhead |
| ShadowNode class | Single universal HTMLShadowNode | Simpler than per-element classes, descriptor provides all type info |
| Node mutability | Immutable (clone on update) | Thread safety, structural sharing |
| Identity | ShadowNodeFamily pointer | Stable across clones, enables tree diffing |
| ElementDescriptor sharing | Same reference for all clones of a type | Type-based, not instance-based |
| Virtual node detection | At creation time via isInsideTextContext flag | JS knows context, passes to native |
| Scroll promotion | At mounting time via getResolvedViewType() | Style props determine behavior |
| Yoga defaults | Applied in constructor before user style | Element-specific behavior is baseline |
| View factory | Pool keyed by (elementType, viewType) | Recycle matching views for performance |

### 9.2 Data Structures

```cpp
// Core dispatch: O(1) string lookup
std::unordered_map<std::string, ElementDescriptor> registry;

// Stable identity across clones
class ShadowNodeFamily {
    InstanceHandle::Weak instanceHandle_;  // Link to JS fiber
    std::string elementType_;              // For debugging
    Weak parent_;                          // For event bubbling
};

// Per-node data (immutable after construction)
class HTMLShadowNode {
    const std::string elementType_;        // "div", "span", etc.
    const ElementDescriptor& descriptor_;  // Reference to registry entry (SHARED)
    ShadowNodeFamily::Shared family_;      // Stable identity (SHARED across clones)
    SharedProps props_;                    // Immutable props (SHARED if unchanged)
    SharedChildList children_;             // Immutable children (SHARED if unchanged)
    YGNodeRef yogaNode_;                   // Cloned per-node for independent layout
    const bool isVirtual_;
    const bool isInsideTextContext_;
    bool hasScrollOverflow_;

    // Clone methods (persistent mode)
    Shared cloneWithNewProps(SharedProps) const;
    Shared cloneWithNewChildren(SharedChildList) const;
    Shared cloneWithNewPropsAndChildren(SharedProps, SharedChildList) const;
    Shared cloneAsHidden() const;
};
```

### 9.3 Implementation Order

1. **HTMLElementRegistry** - Static element descriptor table
2. **ElementDescriptor** - Data structure for element configuration
3. **ShadowNodeFamily** - Stable identity for tree diffing
4. **HTMLShadowNode** - Universal shadow node with factory and clone methods
5. **Host context propagation** - Text context tracking in JS
6. **cloneInstance host config** - Clone instead of mutate
7. **View factory** - Create views from resolved view type
8. **Text rendering** - TextRenderView for p, h1-h6

---

## References

- [docs/research/persistent-mode-analysis.md](./persistent-mode-analysis.md) - Persistent vs mutation mode analysis
- [React Native ComponentDescriptorRegistry](https://github.com/facebook/react-native/blob/main/packages/react-native/ReactCommon/react/renderer/componentregistry/ComponentDescriptorRegistry.cpp)
- [React Native ComponentDescriptor](https://github.com/facebook/react-native/blob/main/packages/react-native/ReactCommon/react/renderer/core/ComponentDescriptor.h)
- [docs/research/html-mapping.md](./html-mapping.md) - Element -> UIKit class -> Yoga defaults -> props mapping
- [docs/research/yoga-ios.md](./yoga-ios.md) - Per-element Yoga default configurations
- [docs/research/ios-uikit.md](./ios-uikit.md) - UIKit view creation patterns
- [docs/research/event-system.md](./event-system.md) - Event handling design
- [docs/research/no-viewconfig.md](./no-viewconfig.md) - Eliminating ViewConfig
