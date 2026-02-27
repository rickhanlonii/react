# SVG and MathML Elements with Correct Namespace

## Category
fizz

## Description
Validates that the Fizz renderer correctly handles SVG and MathML elements by emitting them in the proper XML namespace. SVG elements must be in the `http://www.w3.org/2000/svg` namespace and MathML elements in the `http://www.w3.org/1998/Math/MathML` namespace. The renderer must also handle namespace transitions (e.g., `<foreignObject>` inside SVG switches back to HTML namespace) and SVG-specific attribute casing (e.g., `viewBox`, `strokeWidth`).

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (SVG/MathML namespace tests)
- `packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js` (namespace handling)

## App Setup
```jsx
function SVGMathMLApp() {
  return (
    <div>
      {/* Basic SVG */}
      <svg id="basic-svg" width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="40" fill="red" stroke="black" strokeWidth="2" />
        <rect x="10" y="10" width="30" height="30" fill="blue" />
        <text x="50" y="80" textAnchor="middle" fontSize="12">Hello</text>
      </svg>

      {/* SVG with nested groups and paths */}
      <svg id="complex-svg" width="200" height="200">
        <g transform="translate(10,10)">
          <path d="M 0 0 L 100 0 L 100 100 Z" fill="green" />
          <line x1="0" y1="0" x2="100" y2="100" stroke="red" />
        </g>
        <defs>
          <linearGradient id="grad1">
            <stop offset="0%" stopColor="white" />
            <stop offset="100%" stopColor="black" />
          </linearGradient>
        </defs>
      </svg>

      {/* SVG with foreignObject (namespace switch) */}
      <svg id="foreign-svg" width="200" height="200">
        <foreignObject x="10" y="10" width="180" height="180">
          <div xmlns="http://www.w3.org/1999/xhtml">
            <p>This is HTML inside SVG</p>
          </div>
        </foreignObject>
      </svg>

      {/* MathML */}
      <math id="math-element" xmlns="http://www.w3.org/1998/Math/MathML">
        <mrow>
          <mi>x</mi>
          <mo>=</mo>
          <mfrac>
            <mrow>
              <mo>-</mo>
              <mi>b</mi>
              <mo>&PlusMinus;</mo>
              <msqrt>
                <mrow>
                  <msup>
                    <mi>b</mi>
                    <mn>2</mn>
                  </msup>
                  <mo>-</mo>
                  <mn>4</mn>
                  <mi>a</mi>
                  <mi>c</mi>
                </mrow>
              </msqrt>
            </mrow>
            <mrow>
              <mn>2</mn>
              <mi>a</mi>
            </mrow>
          </mfrac>
        </mrow>
      </math>

      {/* SVG with className (uses class, not className in SVG) */}
      <svg id="svg-class" className="icon" width="24" height="24">
        <circle className="circle-class" cx="12" cy="12" r="10" />
      </svg>
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<SVGMathMLApp />)`.

## Load Sequence
1. Server renders all elements, tracking the namespace context.
2. When entering an `<svg>` element, the renderer switches to SVG namespace.
3. Inside `<foreignObject>`, the renderer switches back to HTML namespace.
4. When entering a `<math>` element, the renderer switches to MathML namespace.
5. HTML is flushed and the client can hydrate.

## Actions
1. Server-render `<SVGMathMLApp />` and collect the HTML output.
2. Parse the HTML and verify elements are in correct namespaces.
3. Hydrate with `hydrateRoot`.

## Assertions
1. `#basic-svg` is rendered as an `<svg>` element with `viewBox="0 0 100 100"` (camelCase preserved for SVG attributes).
2. The `<circle>` inside the SVG has `stroke-width="2"` (React's `strokeWidth` maps to `stroke-width` in SVG).
3. The `<text>` element has `text-anchor="middle"` and `font-size="12"` (camelCase to kebab-case for SVG presentation attributes).
4. `#complex-svg` contains `<g>`, `<path>`, `<line>`, `<defs>`, `<linearGradient>`, and `<stop>` elements.
5. The `<stop>` elements have `stop-color` attribute (from React's `stopColor`).
6. `#foreign-svg` contains a `<foreignObject>` element with an HTML `<div>` and `<p>` inside it.
7. The HTML content inside `<foreignObject>` is rendered in HTML namespace (not SVG namespace).
8. `#math-element` is rendered as a `<math>` element containing `<mrow>`, `<mi>`, `<mo>`, `<mfrac>`, `<msqrt>`, `<msup>`, and `<mn>` elements.
9. `#svg-class` has `class="icon"` attribute (not `className`).
10. The `<circle>` inside `#svg-class` has `class="circle-class"`.
11. Hydration completes without warnings about namespace mismatches.
