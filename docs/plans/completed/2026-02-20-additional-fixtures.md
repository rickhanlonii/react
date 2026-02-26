# Additional Demo Fixtures: Forms, Images, Lists & Tables

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three new fixture categories (Forms, Images, Lists & Tables) to the Falcon demo app, exercising HTML elements and interactions not yet covered by the existing 11 fixtures.

**Architecture:** Each category gets one fixture file in `example/server/src/fixtures/`. Forms needs one new client component (`FormControls.jsx`) for interactive inputs. Images and Lists & Tables are pure server components. The existing `category` field on fixture metadata groups them automatically.

**Tech Stack:** React server components, `'use client'` components, existing TextInput, JSX

**Prerequisite:** The `/fixtures` endpoint in `server.js` must return grouped format and `FalconApp.swift` must use nested navigation — both from the fixture-routing plan. If the server.js grouping was reverted, re-apply it first.

---

### Task 1: Re-apply grouped `/fixtures` endpoint (if reverted)

**Files:**
- Modify: `example/server/server.js:184-202`

**Step 1: Check if the endpoint returns flat or grouped format**

Run: `cd /Users/rickhanlonii/oss/falcon/example && node -e "const s = require('fs').readFileSync('server/server.js','utf8'); console.log(s.includes('categoryMap') ? 'GROUPED' : 'FLAT')"`

If GROUPED, skip to Task 2.

**Step 2: Re-apply the grouping logic**

Replace the `/fixtures` handler (lines 184-202) with:

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

**Step 3: Verify**

Run: `cd /Users/rickhanlonii/oss/falcon/example && timeout 3 node -e "require('./server/server.js')" &>/dev/null & sleep 1 && curl -s http://localhost:6000/fixtures | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.map(c=>c.category+': '+c.fixtures.length))})" ; kill %1 2>/dev/null`

Expected: Categories with fixture counts.

**Step 4: Commit**

```bash
git add example/server/server.js
git commit -m "fix: re-apply grouped /fixtures endpoint for nested navigation"
```

---

### Task 2: Create FormControls client component

**Files:**
- Create: `example/server/src/components/FormControls.jsx`

**Step 1: Write the component**

```jsx
'use client';

const React = require('react');
const {useState} = React;

function FormControls() {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div style={{padding: 12, backgroundColor: '#e8f5e9', borderRadius: 8}}>
        <p style={{color: '#2e7d32', fontWeight: 'bold', marginTop: 0, marginBottom: 4}}>
          Submitted!
        </p>
        <p style={{color: '#2e7d32', fontSize: 13, marginTop: 0}}>
          Name: {name || '(empty)'}, Bio: {bio || '(empty)'}
        </p>
        <button onClick={() => setSubmitted(false)}>Reset</button>
      </div>
    );
  }

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
      <div>
        <label style={{color: '#8e8e93', fontSize: 13}}>Name</label>
        <input
          value={name}
          placeholder="Enter your name"
          onChange={(e) => setName(e?.target?.value ?? e?.value ?? '')}
        />
      </div>
      <div>
        <label style={{color: '#8e8e93', fontSize: 13}}>Bio</label>
        <textarea
          value={bio}
          placeholder="Tell us about yourself"
          onChange={(e) => setBio(e?.target?.value ?? e?.value ?? '')}
        />
      </div>
      <button onClick={() => setSubmitted(true)}>Submit</button>
    </div>
  );
}

module.exports = FormControls;
module.exports.default = FormControls;
```

**Step 2: Commit**

```bash
git add example/server/src/components/FormControls.jsx
git commit -m "feat: add FormControls client component for forms fixture"
```

---

### Task 3: Create forms fixture (12-forms.js)

**Files:**
- Create: `example/server/src/fixtures/12-forms.js`

**Step 1: Write the fixture**

```jsx
const React = require('react');
const FormControls = require('../components/FormControls');

const fixture = {
  title: 'Forms',
  description: 'Form elements — input, textarea, button with onChange handling',
  category: 'Forms',
};

function Forms() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Forms</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Interactive form elements with controlled state
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Contact Form</h3>
        <FormControls />
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Fieldset</h3>
        <fieldset>
          <legend>Account Settings</legend>
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            <p style={{color: '#1c1c1e', marginTop: 0, marginBottom: 0}}>
              Fieldset groups related form elements with a border and legend.
            </p>
            <input placeholder="Username" />
            <input placeholder="Email" />
          </div>
        </fieldset>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Button Variants</h3>
        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
          <button>Default Button</button>
          <button style={{backgroundColor: '#007aff', color: '#ffffff', borderRadius: 8, padding: 12}}>
            Styled Button
          </button>
          <button style={{backgroundColor: '#e5e5ea', color: '#8e8e93', borderRadius: 8, padding: 12}}>
            Disabled-looking Button
          </button>
        </div>
      </div>
    </div>
  );
}

module.exports = Forms;
module.exports.default = Forms;
module.exports.fixture = fixture;
```

**Step 2: Commit**

```bash
git add example/server/src/fixtures/12-forms.js
git commit -m "feat: add forms fixture with interactive form controls"
```

---

### Task 4: Create images fixture (13-images.js)

**Files:**
- Create: `example/server/src/fixtures/13-images.js`

Uses public placeholder images via `picsum.photos` (requires simulator internet access).

**Step 1: Write the fixture**

```jsx
const React = require('react');

const fixture = {
  title: 'Images',
  description: 'Async image loading with various sizes and aspect ratios',
  category: 'Images',
};

function Images() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Images</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Async image loading from remote URLs
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Square</h3>
        <img src="https://picsum.photos/seed/falcon1/200/200" style={{width: 200, height: 200, borderRadius: 8}} />
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Landscape</h3>
        <img src="https://picsum.photos/seed/falcon2/320/180" style={{width: '100%', height: 180, borderRadius: 8}} />
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Image Row</h3>
        <div style={{display: 'flex', flexDirection: 'row', gap: 8}}>
          <img src="https://picsum.photos/seed/falcon3/100/100" style={{width: 100, height: 100, borderRadius: 8}} />
          <img src="https://picsum.photos/seed/falcon4/100/100" style={{width: 100, height: 100, borderRadius: 8}} />
          <img src="https://picsum.photos/seed/falcon5/100/100" style={{width: 100, height: 100, borderRadius: 8}} />
        </div>
      </div>
    </div>
  );
}

module.exports = Images;
module.exports.default = Images;
module.exports.fixture = fixture;
```

**Step 2: Commit**

```bash
git add example/server/src/fixtures/13-images.js
git commit -m "feat: add images fixture with async remote image loading"
```

---

### Task 5: Create lists & tables fixture (14-lists-and-tables.js)

**Files:**
- Create: `example/server/src/fixtures/14-lists-and-tables.js`

**Step 1: Write the fixture**

```jsx
const React = require('react');

const fixture = {
  title: 'Lists & Tables',
  description: 'Ordered/unordered lists, nested lists, and basic tables',
  category: 'Lists & Tables',
};

function ListsAndTables() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Lists & Tables</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Structured data with lists and tables
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Unordered List</h3>
        <ul>
          <li>React Server Components</li>
          <li>Yoga Layout Engine</li>
          <li>UIKit Native Views</li>
        </ul>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Ordered List</h3>
        <ol>
          <li>Server renders RSC</li>
          <li>Flight stream sent to client</li>
          <li>Client deserializes and hydrates</li>
          <li>Interactive components activate</li>
        </ol>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Nested List</h3>
        <ul>
          <li>Server
            <ul>
              <li>RSC rendering</li>
              <li>Flight protocol</li>
            </ul>
          </li>
          <li>Client
            <ul>
              <li>JavaScriptCore</li>
              <li>Custom reconciler</li>
            </ul>
          </li>
        </ul>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Table</h3>
        <table>
          <thead>
            <tr>
              <th style={{textAlign: 'left', padding: 8, borderBottomWidth: 1, borderBottomColor: '#c6c6c8'}}>Feature</th>
              <th style={{textAlign: 'left', padding: 8, borderBottomWidth: 1, borderBottomColor: '#c6c6c8'}}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{padding: 8}}>RSC Streaming</td>
              <td style={{padding: 8, color: '#34c759'}}>Done</td>
            </tr>
            <tr>
              <td style={{padding: 8}}>Client Hydration</td>
              <td style={{padding: 8, color: '#34c759'}}>Done</td>
            </tr>
            <tr>
              <td style={{padding: 8}}>Error Boundaries</td>
              <td style={{padding: 8, color: '#ff9500'}}>In Progress</td>
            </tr>
            <tr>
              <td style={{padding: 8}}>Suspense</td>
              <td style={{padding: 8, color: '#34c759'}}>Done</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

module.exports = ListsAndTables;
module.exports.default = ListsAndTables;
module.exports.fixture = fixture;
```

**Step 2: Commit**

```bash
git add example/server/src/fixtures/14-lists-and-tables.js
git commit -m "feat: add lists and tables fixture with ul, ol, nested lists, and table"
```

---

### Task 6: Build and verify in simulator

**Step 1: Start dev server**

Run: `cd /Users/rickhanlonii/oss/falcon/example && npm run dev`

**Step 2: Build and run app**

Use `/build-demo` skill.

**Step 3: Verify navigation**

1. Category list shows: Basics, Suspense, Error Handling, Kitchen Sink, Forms, Images, Lists & Tables
2. Tap Forms → see "Forms" fixture → tap → verify form renders with interactive inputs
3. Tap Images → see "Images" fixture → tap → verify images load from remote URLs
4. Tap Lists & Tables → see fixture → tap → verify lists and table render

**Step 4: Final commit (if any fixes needed)**
