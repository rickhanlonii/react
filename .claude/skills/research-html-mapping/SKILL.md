---
name: research-html-mapping
description: Research HTML element to native UIKit view mappings. Run this to create the mapping matrix for the component registry.
---

# Research: HTML Element → Native View Mapping

## Objective

Create a comprehensive mapping of HTML elements to UIKit views, Yoga layout config, and default styles. This becomes the blueprint for the component registry.

## Input Files

1. `../react-native/packages/react-native/Libraries/NativeComponent/NativeComponentRegistry.js` — React Native's component registry pattern
2. `../react-native/packages/react-native/Libraries/NativeComponent/BaseViewConfig.ios.js` — iOS base view config

## Instructions

1. Define the initial HTML element set (start small, expand later):
   - **Layout**: `<div>`, `<span>`, `<main>`, `<section>`, `<article>`, `<nav>`, `<header>`, `<footer>`, `<aside>`
   - **Text**: `<p>`, `<h1>`-`<h6>`, `<strong>`, `<em>`, `<a>`
   - **Media**: `<img>`, `<video>`
   - **Input**: `<input>`, `<button>`, `<textarea>`, `<select>`
   - **List**: `<ul>`, `<ol>`, `<li>`
   - **Scroll**: maps to UIScrollView

2. For each element, define:
   - **UIKit view class**: UIView, UILabel, UIImageView, UIButton, UITextField, UITextView, UIScrollView, etc.
   - **Yoga defaults**: flexDirection, display, alignItems, justifyContent, etc.
   - **Props mapping**: HTML attributes → UIKit properties (e.g., `src` → `UIImageView.image`, `onClick` → gesture recognizer)
   - **Style defaults**: what CSS-like defaults this element should have to match web behavior

3. Study how React Native maps its components to native views for patterns

## Output

Write to: `docs/research/html-mapping.md`

Format:
- Mapping matrix table: HTML Element | UIKit Class | Yoga Defaults | Key Props | Notes
- Props mapping per element: HTML Prop | UIKit Property | Transform
- CSS defaults per element (matching web browser defaults)
- Priority ranking: which elements to implement first (P0, P1, P2)

## After Completion

Update `docs/MASTER_PLAN.md` — check off "HTML → native mapping"
