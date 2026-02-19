# Demo Builder State

## Features Built
- `navigation-tabs`: Segmented tab control with 3 tabs (Overview/Stack/Status), exercises onClick state switching and conditional rendering (status: pending-qa)
- `accordion-faq`: Expandable FAQ sections with 4 items, exercises show/hide with dynamic height changes and multiple interactive elements (status: pending-qa)

## Features Planned
- Todo list: add/remove items with server-rendered initial list and client-side mutations (exercises list manipulation and multiple event handlers)
- Profile page: nested layout with text formatting and multiple sections (exercises deeply nested layouts)

## Components Created
- `example/server/src/components/Tabs.jsx` — Segmented tab bar with active state highlighting, renders tab content conditionally based on activeIndex
- `example/server/src/components/Accordion.jsx` — Expandable section list with show/hide toggle per item, supports defaultOpen prop

---
### 2026-02-18 (demo-builder-2)
- Built feature: `todo-list` — Interactive todo list with server-rendered initial items, add/toggle/delete functionality
- Components created: `example/server/src/components/TodoList.jsx`
- Exercises: useState with complex array state, multiple onClick handlers (toggle, delete, add), onChange on input, conditional rendering (empty state, checkmark, dividers), server-to-client data passing via props, flex row layouts, dynamic list manipulation
- Sent to demo-qa for testing (task #55)

---
### 2026-02-18 (demo-builder-2) — QA Update
- QA result for `todo-list`: FAIL — Suspense boundary never reveals (same root cause as Tabs and Accordion)
- Root cause: BoundaryManager boundary 2+ never receive reveal messages (task #59 for fixer)
- Component code is correct; blocked on framework-level Suspense fix
- All three features (Tabs, Accordion, Todo List) need re-testing after fix
- Blocked on building new features until Suspense issue resolved
