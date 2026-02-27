# E2E Test Specifications

These are end-to-end test specifications for validating a new Fiber + Fizz renderer. Each spec file describes a test scenario -- what app to set up, how it loads, what actions to take, and what assertions to make. They are **not** Jest tests. They are human-readable documents that can be used to build automated E2E tests in any test framework (Playwright, Cypress, etc.) or to manually verify renderer behavior.

The specs cover four major areas of React's server rendering and hydration pipeline:

- **Fizz**: Server-side rendering with `renderToPipeableStream`, streaming, Suspense, error handling, forms, and static prerendering
- **Hydration**: Client-side hydration with `hydrateRoot`, mismatch handling, selective hydration, and partial hydration
- **Flight**: React Server Components protocol including server/client component rendering, serialization, streaming, server actions, and reply encoding
- **Integration**: Full end-to-end flows combining multiple systems (Fizz + Hydration + Flight) into complete application scenarios

## Spec File Format

Each spec file follows this template:

```markdown
# <Test Name>

## Category
fizz | hydration | flight | integration

## Description
What this test validates and why it matters for renderer compatibility.

## References
- Source test file(s) in the React repo that cover this behavior

## App Setup
Description of the React component tree / server setup needed,
including realistic code examples.

## Load Sequence
Step-by-step description of how the page loads (server render,
streaming, hydration, etc.)

## Actions
Numbered list of user/system actions to perform during the test.

## Assertions
Numbered list of things to verify at each stage.
```

## Complete File Listing

Specs are ordered by increasing complexity within each category.

### Fizz (38 files)

| # | File | Description |
|---|------|-------------|
| 01 | `fizz-01-text-escaping.md` | Text content escaping in HTML |
| 02 | `fizz-02-html-attributes.md` | HTML attribute rendering |
| 03 | `fizz-03-special-elements.md` | Special HTML elements (void, raw text) |
| 04 | `fizz-04-tables.md` | Table element rendering |
| 05 | `fizz-05-svg-mathml.md` | SVG and MathML namespace handling |
| 06 | `fizz-06-custom-elements.md` | Custom element rendering |
| 07 | `fizz-07-multibyte-encoding.md` | Multibyte character encoding |
| 08 | `fizz-08-hooks-state-rendering.md` | Hooks and state during server rendering |
| 09 | `fizz-09-hooks-context.md` | Context hooks in server rendering |
| 10 | `fizz-10-hooks-use-id.md` | useId hook for server/client ID matching |
| 11 | `fizz-11-class-component-lifecycle.md` | Class component lifecycle in SSR |
| 12 | `fizz-12-streaming-basic.md` | Basic streaming output |
| 13 | `fizz-13-streaming-shell-ready.md` | onShellReady callback |
| 14 | `fizz-14-streaming-all-ready.md` | onAllReady callback |
| 15 | `fizz-15-streaming-backpressure.md` | Streaming backpressure handling |
| 16 | `fizz-16-streaming-abort.md` | Stream abort and cleanup |
| 17 | `fizz-17-bootstrap-scripts.md` | Bootstrap script injection |
| 18 | `fizz-18-bootstrap-nonce.md` | Script nonce for CSP |
| 19 | `fizz-19-bootstrap-importmap.md` | Import map support |
| 20 | `fizz-20-bootstrap-identifier-prefix.md` | Identifier prefix for multiple roots |
| 21 | `fizz-21-resource-hints.md` | Resource hints (preload, prefetch) |
| 22 | `fizz-22-suspense-fallback.md` | Suspense fallback rendering |
| 23 | `fizz-23-suspense-nested.md` | Nested Suspense boundaries |
| 24 | `fizz-24-suspense-streaming-deferred.md` | Deferred Suspense streaming |
| 25 | `fizz-25-suspense-list.md` | SuspenseList ordering |
| 26 | `fizz-26-suspense-error-boundary.md` | Error boundaries with Suspense |
| 27 | `fizz-27-hooks-deferred-value.md` | useDeferredValue in SSR |
| 28 | `fizz-28-async-children.md` | Async children rendering |
| 29 | `fizz-29-forms-action-serialization.md` | Form action serialization |
| 30 | `fizz-30-forms-use-form-status.md` | useFormStatus hook |
| 31 | `fizz-31-forms-use-action-state.md` | useActionState hook |
| 32 | `fizz-32-forms-progressive-enhancement.md` | Form progressive enhancement |
| 33 | `fizz-33-error-shell-vs-boundary.md` | Shell errors vs boundary errors |
| 34 | `fizz-34-error-recovery-to-client.md` | Error recovery to client rendering |
| 35 | `fizz-35-static-prerender.md` | Static prerendering |
| 36 | `fizz-36-static-prerender-resume.md` | Static prerender with resume |
| 37 | `fizz-37-suppress-hydration-warning.md` | suppressHydrationWarning |
| 38 | `fizz-38-view-transitions.md` | View transitions support |

### Hydration (21 files)

| # | File | Description |
|---|------|-------------|
| 01 | `hydration-01-basic-hydrate-root.md` | Basic hydrateRoot |
| 02 | `hydration-02-text-and-attributes.md` | Text and attribute hydration |
| 03 | `hydration-03-event-reattachment.md` | Event handler reattachment |
| 04 | `hydration-04-ref-attachment.md` | Ref attachment during hydration |
| 05 | `hydration-05-effect-firing.md` | Effect firing after hydration |
| 06 | `hydration-06-mismatch-text.md` | Text content mismatch |
| 07 | `hydration-07-mismatch-element.md` | Element type mismatch |
| 08 | `hydration-08-mismatch-attribute.md` | Attribute mismatch |
| 09 | `hydration-09-mismatch-children.md` | Children count mismatch |
| 10 | `hydration-10-suppress-hydration-warning.md` | suppressHydrationWarning |
| 11 | `hydration-11-on-recoverable-error.md` | onRecoverableError callback |
| 12 | `hydration-12-selective-click.md` | Selective hydration on click |
| 13 | `hydration-13-selective-keyboard.md` | Selective hydration on keyboard |
| 14 | `hydration-14-selective-focus.md` | Selective hydration on focus |
| 15 | `hydration-15-selective-suspense.md` | Selective hydration with Suspense |
| 16 | `hydration-16-partial-deferred.md` | Partial hydration with deferred content |
| 17 | `hydration-17-partial-user-interaction.md` | Partial hydration with user interaction |
| 18 | `hydration-18-partial-activity.md` | Partial hydration with Activity |
| 19 | `hydration-19-shell-suspension.md` | Shell suspension during hydration |
| 20 | `hydration-20-shell-error-boundary.md` | Shell error boundary during hydration |
| 21 | `hydration-21-shell-transition.md` | Shell transition during hydration |

### Flight (22 files)

| # | File | Description |
|---|------|-------------|
| 01 | `flight-01-server-component-render.md` | Server Component rendering |
| 02 | `flight-02-client-component-reference.md` | Client Component references |
| 03 | `flight-03-mixed-server-client-tree.md` | Mixed server/client component tree |
| 04 | `flight-04-async-server-component.md` | Async Server Components |
| 05 | `flight-05-progressive-rendering.md` | Progressive rendering |
| 06 | `flight-06-serialization-primitives.md` | Primitive type serialization |
| 07 | `flight-07-serialization-complex-types.md` | Complex type serialization |
| 08 | `flight-08-serialization-special-objects.md` | Special object serialization |
| 09 | `flight-09-serialization-cyclic-refs.md` | Cyclic reference handling |
| 10 | `flight-10-serialization-deduplication.md` | Serialization deduplication |
| 11 | `flight-11-streaming-readable-stream.md` | ReadableStream streaming |
| 12 | `flight-12-streaming-async-iterable.md` | Async iterable streaming |
| 13 | `flight-13-streaming-abort.md` | Stream abort |
| 14 | `flight-14-server-action-basic.md` | Basic server actions |
| 15 | `flight-15-server-action-bind.md` | Server action bind |
| 16 | `flight-16-server-action-use-action-state.md` | Server action with useActionState |
| 17 | `flight-17-server-action-form-submission.md` | Server action form submission |
| 18 | `flight-18-server-action-mpa-state.md` | Server action MPA state |
| 19 | `flight-19-reply-encoding.md` | Reply encoding |
| 20 | `flight-20-reply-form-data.md` | Reply FormData encoding |
| 21 | `flight-21-reply-streaming.md` | Reply streaming |
| 22 | `flight-22-debug-channel.md` | Debug channel |

### Integration (10 files)

| # | File | Description |
|---|------|-------------|
| 01 | `integration-01-ssr-stream-hydrate-interactive.md` | Full SSR: stream to hydrate to interactive |
| 02 | `integration-02-streaming-progressive-hydration.md` | Streaming with progressive hydration |
| 03 | `integration-03-server-error-client-fallback.md` | Server error with client fallback recovery |
| 04 | `integration-04-multiple-containers.md` | Multiple containers with identifierPrefix |
| 05 | `integration-05-user-input-before-hydration.md` | User input preservation before hydration |
| 06 | `integration-06-flight-fizz-hydration.md` | Flight to Fizz to client hydration |
| 07 | `integration-07-flight-server-actions-e2e.md` | Server Actions through Flight protocol |
| 08 | `integration-08-form-progressive-enhancement.md` | Form progressive enhancement without JS |
| 09 | `integration-09-form-action-state-roundtrip.md` | useActionState server action roundtrip |
| 10 | `integration-10-form-multiple-actions.md` | Multiple forms with different server actions |
