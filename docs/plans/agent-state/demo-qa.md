# Demo QA State

## Status
BLOCKED - Cannot build Falcon app due to sandbox-exec permission error in SPM dependency resolution.

## Features Tested
- None yet (waiting for build to succeed)

## Outstanding Bug Tasks
- None yet

## Hydration Errors Found
- None yet

## Known App Features (from App.js)
- Counter: Interactive client component with Suspense (1s delay)
- Search: TextInput with client-side filtering and Suspense (2s delay)
- Tabs: Navigation tabs with onClick state switching (1.5s delay)
- Accordion: FAQ expand/collapse sections (2.5s delay)
- Rich Text: Inline formatting (bold, italic, underline, code, mark, sub, sup)

---
### 2026-02-18 — demo-qa-2
- Tested feature: `Navigation Tabs` — FAIL
- Tested feature: `Accordion FAQ` — FAIL
- Issues found: Suspense boundaries 2-4 never resolve from fallback state. Skeleton placeholders remain permanently visible. Log shows `[BoundaryManager] Boundary 2 will be client-rendered. Digest: none` — boundary 2 (Tabs) hits an error and subsequent boundaries (Accordion) never get revealed either.
- Counter button also appears non-interactive after hydration (taps on "+" do not increment count), suggesting event handler attachment may be broken.
- Counter boundary (0) and Search boundary (1) DO reveal successfully — their content replaces the skeletons. But the later boundaries do not.
- Created tasks: #59 (assigned to demo-fixer — diagnose Suspense boundary reveal failure)
- Hydration errors: `Boundary 2 will be client-rendered. Digest: none` — SSR/hydration pipeline error for Tabs Suspense boundary

---
### 2026-02-18 — demo-qa-2 (continued)
- Tested feature: `Todo List` — FAIL
- Same root cause as Tabs/Accordion — Todo's Suspense boundary (delay 3000ms) never resolves
- Tested feature: `Rich Text` — PASS (not in Suspense, renders correctly via SSR)
  - bold, italic, underline: correct
  - code, mark (yellow highlight): correct
  - sub/sup: rendered inline (no visible vertical offset but text present)
- Tested feature: `Counter` interactivity — FAIL (button taps do not increment, event handlers not attached)
- Tested feature: `Search` rendering — PASS (fruit list renders, input visible)
- Updated task #59 to include Todo boundary
- Footer "Built with React, Yoga, and UIKit" — PASS
