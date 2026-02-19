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
