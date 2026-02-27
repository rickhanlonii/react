# Forms That Work Before JS Loads (Progressive Enhancement)

## Category
fizz

## Description
Validates that forms rendered by Fizz work via native HTML form submission before client JavaScript loads and hydrates the page. This is the core progressive enhancement guarantee: server-rendered forms with server actions have proper `action`, `method`, and hidden field attributes so that submitting the form causes a full-page POST to the server, which processes the action and returns updated HTML. After hydration, the same submission is handled client-side without a page reload.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzForm-test.js` (progressive enhancement tests)
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (form hydration)

## App Setup
```jsx
async function submitFeedback(prevState, formData) {
  'use server';
  const message = formData.get('message');
  const rating = formData.get('rating');
  // Process feedback
  return { submitted: true, message, rating: parseInt(rating) };
}

function FeedbackForm() {
  const [state, formAction] = React.useActionState(
    submitFeedback,
    { submitted: false, message: '', rating: 0 },
    '/feedback' // permalink for no-JS fallback
  );

  if (state.submitted) {
    return (
      <div id="feedback-thanks">
        Thank you for your feedback: "{state.message}" (Rating: {state.rating})
      </div>
    );
  }

  return (
    <form id="feedback-form" action={formAction}>
      <label htmlFor="message">Message:</label>
      <textarea id="message" name="message" required />

      <label htmlFor="rating">Rating:</label>
      <select id="rating" name="rating" defaultValue="5">
        <option value="1">1 - Poor</option>
        <option value="2">2 - Fair</option>
        <option value="3">3 - Good</option>
        <option value="4">4 - Great</option>
        <option value="5">5 - Excellent</option>
      </select>

      <button id="submit-btn" type="submit">Submit Feedback</button>
    </form>
  );
}

function ProgressiveApp() {
  return (
    <html>
      <head><title>Feedback</title></head>
      <body>
        <h1>Feedback Form</h1>
        <FeedbackForm />
      </body>
    </html>
  );
}
```

### Server setup:
```js
const { pipe } = renderToPipeableStream(<ProgressiveApp />, {
  bootstrapScripts: ['client.js'],
  onShellReady() {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html');
    pipe(response);
  },
});
```

## Load Sequence
1. Server renders the feedback form with all necessary HTML attributes.
2. The form has `action="/feedback"` (permalink), `method="POST"`, and hidden fields for the action.
3. The client receives the HTML. The form is functional before `client.js` loads.
4. If the user submits before JS loads: a native form POST goes to `/feedback`.
5. The server processes the action and returns new HTML with the thank-you message.
6. If the user waits for JS to load and hydrate: form submission is intercepted by React.
7. React calls the server action via fetch and updates the UI without a page reload.

## Actions
1. Server-render `<ProgressiveApp />` and collect HTML output.
2. Verify the form has proper HTML attributes for native submission.
3. Test submitting the form WITHOUT JavaScript (native POST).
4. Verify the server processes the action and returns updated HTML.
5. Test with hydration: submit the form after JS loads.
6. Verify client-side action handling.

## Assertions
1. `#feedback-form` has an `action` attribute pointing to `/feedback` (the permalink).
2. The form has `method="POST"` (or defaults to POST via hidden field).
3. The form contains hidden fields for the action reference (e.g., `$ACTION_REF_...`).
4. The `<textarea>`, `<select>`, and `<button>` elements are proper HTML form elements.
5. The `<select>` has `<option value="5">` with `selected` attribute (defaultValue).
6. Before JS loads, clicking the submit button causes a native form POST to `/feedback`.
7. The native POST includes all form fields: message, rating, and hidden action fields.
8. The server can process the form data and return a new page.
9. After hydration, submitting the form does NOT cause a page reload.
10. After hydration, the form submission updates the UI to show the thank-you message.
11. The form works identically whether submitted before or after hydration (progressive enhancement).
