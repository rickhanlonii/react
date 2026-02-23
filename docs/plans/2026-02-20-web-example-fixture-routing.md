# Web-Example Nested Fixture Routing

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the web-example Next.js app to browse fixtures organized by category, matching the iOS app's nested Category → Fixture → Detail navigation.

**Architecture:** The web-example uses Next.js App Router with a sidebar layout. A fixture registry imports all fixture modules from `@example/fixtures/`, extracts their `fixture` metadata (title, description, category), and groups them by category. A client-side `Sidebar` component handles expand/collapse. Dynamic routes (`/fixture/[name]`) render individual fixtures as Next.js server components. The server's `/fixtures` endpoint is also updated to return the grouped format the iOS app expects.

**Tech Stack:** Next.js 15 (App Router), React 19, existing fixture CJS modules

---

### Task 1: Update server `/fixtures` endpoint to return nested format

The iOS app (FalconApp.swift) expects `[{category, fixtures: [{name, title, description}]}]` but the server currently returns a flat array. Update the endpoint to group by category.

**Files:**
- Modify: `example/server/server.js:184-202`

**Step 1: Update the `/fixtures` handler to include category and group**

Replace the existing handler (lines 184–202) with:

```javascript
app.get('/fixtures', function (req, res) {
  clearServerSourceCache();
  var files = fs.readdirSync(FIXTURES_DIR)
    .filter(function(f) { return f.endsWith('.js'); })
    .sort();

  var fixtures = files.map(function(f) {
    var mod = require(path.join(FIXTURES_DIR, f));
    var meta = mod.fixture || {};
    var name = f.replace('.js', '');
    return {
      name: name,
      title: meta.title || name,
      description: meta.description || '',
      category: meta.category || 'Other',
    };
  });

  // Group by category, preserving order of first fixture in each category
  var categoryOrder = [];
  var categoryMap = {};
  for (var i = 0; i < fixtures.length; i++) {
    var cat = fixtures[i].category;
    if (!categoryMap[cat]) {
      categoryMap[cat] = [];
      categoryOrder.push(cat);
    }
    categoryMap[cat].push({
      name: fixtures[i].name,
      title: fixtures[i].title,
      description: fixtures[i].description,
    });
  }

  var grouped = categoryOrder.map(function(cat) {
    return { category: cat, fixtures: categoryMap[cat] };
  });

  res.json(grouped);
});
```

**Step 2: Verify the endpoint returns the grouped format**

Run: `curl -s http://localhost:6000/fixtures | python3 -m json.tool | head -20`
Expected: JSON array of `{category, fixtures: [...]}` objects.

**Step 3: Commit**

```bash
git add example/server/server.js
git commit -m "feat(server): group /fixtures endpoint by category for nested navigation"
```

---

### Task 2: Create fixture registry for web-example

Create a module that imports all fixture modules, extracts metadata, and groups by category. Uses the `@example` webpack alias already configured in `next.config.js`.

**Files:**
- Create: `web-example/lib/fixtures.js`

**Step 1: Create the fixture registry**

```javascript
import f01 from '@example/fixtures/01-rsc-only';
import f02 from '@example/fixtures/02-text-formatting';
import f03 from '@example/fixtures/03-single-suspense';
import f04 from '@example/fixtures/04-client-components';
import f05 from '@example/fixtures/05-nested-suspense';
import f06 from '@example/fixtures/06-kitchen-sink';
import f07 from '@example/fixtures/07-caught-errors';
import f08 from '@example/fixtures/08-uncaught-server-error';
import f09 from '@example/fixtures/09-uncaught-hydration-error';
import f10 from '@example/fixtures/10-uncaught-interaction-error';
import f11 from '@example/fixtures/11-recoverable-errors';

const allFixtures = [
  {name: '01-rsc-only', component: f01, ...(f01.fixture || {})},
  {name: '02-text-formatting', component: f02, ...(f02.fixture || {})},
  {name: '03-single-suspense', component: f03, ...(f03.fixture || {})},
  {name: '04-client-components', component: f04, ...(f04.fixture || {})},
  {name: '05-nested-suspense', component: f05, ...(f05.fixture || {})},
  {name: '06-kitchen-sink', component: f06, ...(f06.fixture || {})},
  {name: '07-caught-errors', component: f07, ...(f07.fixture || {})},
  {name: '08-uncaught-server-error', component: f08, ...(f08.fixture || {})},
  {name: '09-uncaught-hydration-error', component: f09, ...(f09.fixture || {})},
  {name: '10-uncaught-interaction-error', component: f10, ...(f10.fixture || {})},
  {name: '11-recoverable-errors', component: f11, ...(f11.fixture || {})},
];

export function getCategories() {
  var categoryOrder = [];
  var categoryMap = {};
  for (var i = 0; i < allFixtures.length; i++) {
    var f = allFixtures[i];
    var cat = f.category || 'Other';
    if (!categoryMap[cat]) {
      categoryMap[cat] = [];
      categoryOrder.push(cat);
    }
    categoryMap[cat].push({
      name: f.name,
      title: f.title || f.name,
      description: f.description || '',
    });
  }
  return categoryOrder.map(function (cat) {
    return {category: cat, fixtures: categoryMap[cat]};
  });
}

export function getFixtureComponent(name) {
  var fixture = allFixtures.find(function (f) {
    return f.name === name;
  });
  return fixture ? fixture.component : null;
}
```

**Step 2: Verify the module loads without errors**

Run: `cd web-example && npx next build 2>&1 | head -20`
Expected: No import errors for fixture modules.

**Step 3: Commit**

```bash
git add web-example/lib/fixtures.js
git commit -m "feat(web-example): add fixture registry with category grouping"
```

---

### Task 3: Create sidebar navigation component

Client component for interactive category/fixture navigation with expand/collapse.

**Files:**
- Create: `web-example/app/components/Sidebar.js`

**Step 1: Create the sidebar component**

```javascript
'use client';

import {useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

export default function Sidebar({categories}) {
  var pathname = usePathname();
  // Extract current fixture name from pathname like "/fixture/01-rsc-only"
  var currentFixture = pathname.startsWith('/fixture/')
    ? pathname.slice('/fixture/'.length)
    : null;

  // Auto-expand the category containing the current fixture
  var initialCategory = null;
  if (currentFixture) {
    for (var i = 0; i < categories.length; i++) {
      for (var j = 0; j < categories[i].fixtures.length; j++) {
        if (categories[i].fixtures[j].name === currentFixture) {
          initialCategory = categories[i].category;
          break;
        }
      }
      if (initialCategory) break;
    }
  }

  var [expanded, setExpanded] = useState(initialCategory);

  function toggleCategory(category) {
    setExpanded(expanded === category ? null : category);
  }

  return (
    <nav
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: '1px solid #e0e0e0',
        backgroundColor: '#f8f8f8',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}>
      <div style={{padding: 16, borderBottom: '1px solid #e0e0e0'}}>
        <Link href="/" style={{textDecoration: 'none', color: 'inherit'}}>
          <h1 style={{margin: 0, fontSize: 18, fontWeight: 700, color: '#1c1c1e'}}>
            Falcon Fixtures
          </h1>
        </Link>
      </div>
      <div style={{flex: 1, overflowY: 'auto'}}>
        {categories.map(function (cat) {
          var isExpanded = expanded === cat.category;
          return (
            <div key={cat.category}>
              <button
                onClick={function () {
                  toggleCategory(cat.category);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 16px',
                  border: 'none',
                  borderBottom: '1px solid #e8e8e8',
                  backgroundColor: isExpanded ? '#eef2ff' : 'transparent',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  textAlign: 'left',
                  color: '#1c1c1e',
                  fontFamily: 'inherit',
                }}>
                <span>
                  {cat.category}{' '}
                  <span style={{fontWeight: 400, color: '#8e8e93'}}>
                    ({cat.fixtures.length})
                  </span>
                </span>
                <span style={{fontSize: 10, color: '#8e8e93'}}>
                  {isExpanded ? '\u25BC' : '\u25B6'}
                </span>
              </button>
              {isExpanded &&
                cat.fixtures.map(function (fixture) {
                  var isActive = currentFixture === fixture.name;
                  return (
                    <Link
                      key={fixture.name}
                      href={'/fixture/' + fixture.name}
                      style={{
                        display: 'block',
                        padding: '8px 16px 8px 28px',
                        borderBottom: '1px solid #f0f0f0',
                        backgroundColor: isActive ? '#007AFF' : 'transparent',
                        textDecoration: 'none',
                        color: isActive ? '#fff' : '#1c1c1e',
                      }}>
                      <div style={{fontSize: 13, fontWeight: 500}}>
                        {fixture.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          marginTop: 2,
                          color: isActive
                            ? 'rgba(255,255,255,0.7)'
                            : '#8e8e93',
                        }}>
                        {fixture.description}
                      </div>
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
```

**Step 2: Commit**

```bash
git add web-example/app/components/Sidebar.js
git commit -m "feat(web-example): add sidebar navigation component with categories"
```

---

### Task 4: Update root layout with sidebar

Update the layout to include the sidebar with fixture navigation data.

**Files:**
- Modify: `web-example/app/layout.js`

**Step 1: Replace the layout with sidebar + content layout**

```javascript
import {getCategories} from '../lib/fixtures';
import Sidebar from './components/Sidebar';

export const metadata = {
  title: 'react-dom-native — Web Comparison',
};

export default function RootLayout({children}) {
  var categories = getCategories();
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
        <div style={{display: 'flex'}}>
          <Sidebar categories={categories} />
          <main
            style={{
              flex: 1,
              overflowY: 'auto',
              backgroundColor: '#f2f2f7',
              minHeight: '100vh',
            }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
```

**Step 2: Commit**

```bash
git add web-example/app/layout.js
git commit -m "feat(web-example): add sidebar layout with fixture categories"
```

---

### Task 5: Update root page

Replace the static `<App />` import with a welcome/landing page.

**Files:**
- Modify: `web-example/app/page.js`

**Step 1: Replace with a landing page**

```javascript
export default function Page() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: '#8e8e93',
        fontSize: 16,
      }}>
      Select a fixture from the sidebar
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add web-example/app/page.js
git commit -m "feat(web-example): update root page to show fixture selection prompt"
```

---

### Task 6: Create fixture page with dynamic route

Dynamic route that renders individual fixtures as Next.js server components.

**Files:**
- Create: `web-example/app/fixture/[name]/page.js`

**Step 1: Create the dynamic fixture page**

```javascript
import {notFound} from 'next/navigation';
import {getFixtureComponent} from '../../../lib/fixtures';

export default async function FixturePage({params}) {
  var {name} = await params;
  var Fixture = getFixtureComponent(name);
  if (!Fixture) {
    notFound();
  }
  return <Fixture />;
}
```

**Step 2: Verify the page renders a fixture**

Run: `cd web-example && npm run dev`
Navigate to: `http://localhost:3000/fixture/01-rsc-only`
Expected: The RSC Only fixture renders in the main content area with the sidebar visible.

**Step 3: Verify category navigation works**

Click "Basics" in the sidebar → see 3 fixtures listed.
Click "RSC Only" → navigates to `/fixture/01-rsc-only`, fixture renders.
Click "Suspense" → category expands, shows 2 fixtures.
Click "Kitchen Sink" → navigates to `/fixture/06-kitchen-sink`, renders the full demo.

**Step 4: Commit**

```bash
git add web-example/app/fixture/
git commit -m "feat(web-example): add dynamic fixture route with category navigation"
```

---

### Troubleshooting Notes

**If CJS imports fail:** The fixture files use `module.exports` (CJS) with JSX. The `experimental: {externalDir: true}` config in `next.config.js` enables importing from outside the project. If imports fail, check that the `@example` alias resolves correctly.

**If `fixture` metadata is undefined:** When webpack imports a CJS module that does `module.exports = Fn; module.exports.fixture = {...}`, the default import is the function with `.fixture` as a property. Access it as `f01.fixture`. If webpack strips it, fall back to hardcoding metadata in the registry.

**If client components don't hydrate:** The `'use client'` directive in component files (e.g., `Counter.jsx`) must be recognized by Next.js. With `externalDir: true`, files outside the project root are processed by Next.js loaders, which should handle `'use client'`.

**If error-throwing fixtures crash the page:** Fixtures like `08-uncaught-server-error` intentionally throw. Next.js will show its error overlay in dev mode. This is expected behavior. To add error boundaries, wrap `<Fixture />` in a React error boundary in the fixture page.
