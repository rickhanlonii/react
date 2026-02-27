# Table Elements: table, tbody, thead, tfoot, tr, td, th, colgroup, col, caption

## Category
fizz

## Description
Validates that the Fizz renderer correctly generates HTML for table-related elements with proper nesting. Table elements have strict HTML nesting rules (e.g., `<tr>` must be inside `<tbody>`, `<thead>`, or `<tfoot>`; `<td>` and `<th>` must be inside `<tr>`). The renderer must produce valid table HTML that browsers parse correctly without implicit element insertion causing hydration mismatches.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (table rendering tests)
- `packages/react-dom-bindings/src/server/ReactFizzConfigDOM.js` (format context for tables)

## App Setup
```jsx
function TableApp() {
  return (
    <div>
      {/* Full table structure */}
      <table id="full-table">
        <caption>Sales Data</caption>
        <colgroup>
          <col span={1} style={{ backgroundColor: 'yellow' }} />
          <col span={2} />
        </colgroup>
        <thead>
          <tr>
            <th>Product</th>
            <th>Q1</th>
            <th>Q2</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Widget</td>
            <td>100</td>
            <td>200</td>
          </tr>
          <tr>
            <td>Gadget</td>
            <td>150</td>
            <td>250</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td>250</td>
            <td>450</td>
          </tr>
        </tfoot>
      </table>

      {/* Simple table without explicit tbody */}
      <table id="simple-table">
        <tr>
          <td>A</td>
          <td>B</td>
        </tr>
        <tr>
          <td>C</td>
          <td>D</td>
        </tr>
      </table>

      {/* Table with multiple tbody sections */}
      <table id="multi-tbody">
        <tbody>
          <tr><td>Group 1</td></tr>
        </tbody>
        <tbody>
          <tr><td>Group 2</td></tr>
        </tbody>
      </table>

      {/* Table with colSpan and rowSpan */}
      <table id="span-table">
        <tbody>
          <tr>
            <td colSpan={2}>Merged columns</td>
          </tr>
          <tr>
            <td rowSpan={2}>Merged rows</td>
            <td>B</td>
          </tr>
          <tr>
            <td>C</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<TableApp />)`.

## Load Sequence
1. Server renders all table structures maintaining proper nesting.
2. The Fizz renderer uses format context tracking to ensure text and elements are placed correctly within table scope (e.g., no raw text directly inside `<table>` or `<tr>`).
3. HTML is flushed to the client.
4. Browser parses the table HTML; if the structure is valid, no implicit `<tbody>` insertion occurs that would differ from the server output.
5. Client hydrates.

## Actions
1. Server-render `<TableApp />` and collect the HTML output.
2. Parse the HTML and verify the table structure in the DOM.
3. Hydrate with `hydrateRoot`.

## Assertions
1. `#full-table` contains `<caption>`, `<colgroup>`, `<thead>`, `<tbody>`, and `<tfoot>` elements in that order.
2. The `<colgroup>` contains `<col>` elements with correct `span` attributes.
3. The `<col>` with `span="1"` has a `style` attribute containing `background-color:yellow`.
4. `<thead>` contains one `<tr>` with three `<th>` elements.
5. `<tbody>` contains two `<tr>` elements, each with three `<td>` elements.
6. `<tfoot>` contains one `<tr>` with three `<td>` elements.
7. `#simple-table` renders `<tr>` elements; the browser may implicitly wrap them in `<tbody>`, and the server output accounts for this.
8. `#multi-tbody` has two separate `<tbody>` sections.
9. `#span-table` has `colspan="2"` on the first `<td>` and `rowspan="2"` on the appropriate `<td>` (note: React uses camelCase `colSpan`/`rowSpan` but outputs lowercase HTML attributes).
10. Hydration completes without mismatch warnings for all tables.
