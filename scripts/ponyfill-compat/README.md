# ponyfill-compat

Runs the use(store) test suites, unmodified, against the community ponyfill
[react-concurrent-store](https://github.com/thejustinwalsh/react-concurrent-store)
(`packages/use-store`, commit `2842481d49f6b54ed27bd6d0bb4b6973de6fd58e`), both
its experimental (`createStore(reducer, initial)` + `<StoreProvider>`) and its
stable (`createStore(initial, reducer)` + `useStore`) implementations, and
compares each test with the use(store) result. Measurement only.

## Files

- `src/`, `types/`: the ponyfill's TypeScript sources, fetched with `gh api`.
- `build.sh`: transpiles them with esbuild into `dist/{experimental,stable}.js`,
  factories that take React as an argument.
- `adapter.js`: `React.unstable_createStore` -> a facade over a ponyfill store,
  `store.update` -> `dispatch`/`update`, `use(store)` -> the ponyfill's
  `useStore`. Stores without a reducer get useState's reducer. Reading an
  underscore property of a store (our internals) throws `PONYFILL_ADAPTER_NA`
  and marks the test N/A.
- `setupPonyfill.js`: when `PONYFILL_IMPL` is set, mocks `react` with the
  adapted React. For the experimental ponyfill it also wraps every root's
  children (`updateContainer`, `updateContainerSync`,
  `createHydrationContainer`) and every Fizz request's children in
  `<StoreProvider>`.
- `setupPonyfillAfterEnv.js`: logs N/A tests to `na.jsonl`.
- `jest.config.js`: `scripts/jest/config.source.js` plus the two setup files.
  Without `PONYFILL_IMPL` it's the same as `yarn test --r=experimental`.
- `run.sh`, `runlist.sh`, `runset.sh`, `all.sh`, `reporter.js`, `report.js`:
  run a list of test files against use(store) (`none`), `experimental` and
  `stable`, and classify each test (pass-both / fail-ponyfill-only /
  fail-use(store)-only / fail-both / na). Tests gated off for the channel are
  inverted. Whole files under react-devtools, react-debug-tools, Flight and
  react-markup are N/A.
- `semantic.js`: groups the fail-ponyfill-only tests by root cause.
- `internals.js`: lists tests whose source reads store internals.
- `strip.js`: copies the core suites to `stripped/` without the single-line
  assertions on store internals, so the N/A tests can be compared on behavior.
- `proof/PonyfillDirect.js`: reproduces representative failures with the
  ponyfill's own API and no adapter.
- `lists/`: the test sets. `results/`: the outputs.

## Commands

The results in `results/` come from running the harness on an export of
commit `f01419287a` (the committed use(store) snapshot), because the working
tree was mid-redesign: `./snapshot.sh f01419287a /tmp/usestore-base`, then
`/tmp/usestore-base/scripts/ponyfill-compat/all.sh`. Its baseline is green:
67/67 core, 13/13 set b, 38/38 ported, 3231/3231 copies.


```sh
cd scripts/ponyfill-compat
./all.sh                                 # everything (~15 min on a loaded machine)
# or one set at a time:
./runset.sh core lists/core.txt 2        # ReactUseStore + ReactDOMStore
./runset.sh setb lists/setb.txt 2        # same-element bailout + TODOCorrectness
./runset.sh ported lists/ported.txt 2    # the ponyfill's own tests, ported
./runset.sh copies lists/copies.txt 5    # the *UseStore* copies of state tests
node report.js $PWD/results/core --list  # per-test classification
node semantic.js results/copies experimental --list

# From the repo root, the direct ponyfill reproductions:
NODE_ENV=development RELEASE_CHANNEL=experimental node ./scripts/jest/jest.js \
  --config ./scripts/ponyfill-compat/jest.config.js --ci \
  --testRegex 'ponyfill-compat/proof/.*\.js$' scripts/ponyfill-compat/proof
```

Nothing here lives in a `__tests__` directory, so `yarn test` doesn't pick it
up.
