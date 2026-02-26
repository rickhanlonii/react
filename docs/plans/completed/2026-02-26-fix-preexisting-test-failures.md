# Fix Pre-existing Test Failures

**Goal:** Fix the 3 groups of pre-existing test failures across JS unit tests and Fantom integration tests.

---

## Failure 1: `devtools.test.js` — `builder.config` is undefined (3 tests)

**Root cause:** `createBuilder()` in `example/scripts/builder.js` returns `{ build, compiler }` but the test expects `builder.config` to be exposed. The `config` variable exists in the function scope but isn't returned.

**Fix:** Add `config` to the return object in `example/scripts/builder.js`:
```js
return { build, compiler, config };
```

**Files:** `example/scripts/builder.js`

---

## Failure 2: `build.test.js` — react-refresh/babel rejects NODE_ENV=test (3 tests)

**Root cause:** Jest sets `NODE_ENV=test`, which is inherited by the child process running `node scripts/build.js`. The webpack config includes `react-refresh/babel` in dev mode, but that plugin throws if `NODE_ENV` isn't `development`.

**Fix:** In `example/scripts/__tests__/build.test.js`, pass `NODE_ENV=development` to the child process:
```js
execSync('node scripts/build.js', {
  cwd: ROOT,
  stdio: 'pipe',
  env: {...process.env, NODE_ENV: 'development'}
});
```

**Files:** `example/scripts/__tests__/build.test.js`

---

## Failure 3: Fantom Flight tests — "root chunk still pending" (6 tests across 3 files)

**Root cause:** Status string mismatch. The Flight client (`packages/react-dom-native/src/flight-client/client.js`) sets `chunk.status = 'fulfilled'`, but the Fantom test helper (`tools/fantom/src/index.js`) checks `root.status === 'resolved'`. The strings don't match, so resolved chunks are never recognized.

**Fix:** In `tools/fantom/src/index.js`, change the status check to match the Flight client:
```js
// was: if (root.status === 'resolved')
if (root.status === 'fulfilled')
```

**Files:** `tools/fantom/src/index.js`
