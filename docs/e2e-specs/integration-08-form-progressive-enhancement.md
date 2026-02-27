# Form Progressive Enhancement (Works Without JavaScript)

## Category
integration

## Description
Validates that forms with server actions work as progressive enhancement: the form submits correctly even when JavaScript has not loaded or is disabled, using a full-page MPA (multi-page application) navigation. The server action is encoded into the form's HTML `action` attribute by Fizz during SSR, allowing the browser to submit the form natively via HTTP POST. The server receives the `FormData`, decodes the action using `decodeAction`, executes it, and returns a new page. This is the baseline behavior that ensures forms are usable before hydration.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMForm-test.js` - "can submit a passed server action without hydrating it", "can submit an imported server action without hydrating it", "can submit a complex closure server action without hydrating it"
- `packages/react-dom/src/__tests__/ReactDOMFizzForm-test.js` - Form action serialization, `$$FORM_ACTION` protocol
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` - Fizz rendering of forms with server actions

## App Setup
```jsx
// RSC Server: rsc-server.js
import { renderToPipeableStream, decodeAction, decodeFormState } from 'react-server-dom-webpack/server';

// Server Action
async function submitFeedback(formData) {
  'use server';
  const name = formData.get('name');
  const message = formData.get('message');
  const rating = formData.get('rating');

  // Simulate saving to database
  await saveFeedback({ name, message, rating });

  return `Thank you, ${name}! Your feedback has been received.`;
}

// Server Component
function App({ confirmation }) {
  return (
    <div id="feedback-app">
      <h1>Feedback Form</h1>
      {confirmation && (
        <div id="confirmation" className="success">
          {confirmation}
        </div>
      )}
      <FeedbackForm action={submitFeedback} />
    </div>
  );
}

// Handle GET request - initial page render
function handleGET(req, res) {
  const rscStream = renderToPipeableStream(<App />, webpackMap);
  const response = createFromNodeStream(rscStream, ssrManifest);
  const { pipe } = renderToPipeableStream(response, {
    bootstrapScripts: ['/client.js'],
    onShellReady() {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      pipe(res);
    },
  });
}

// Handle POST request - form submission (MPA style)
async function handlePOST(req, res) {
  const formData = await parseFormData(req);
  const action = await decodeAction(formData, webpackServerMap);
  const result = await action();
  const formState = await decodeFormState(result, formData, webpackServerMap);

  // Re-render the page with the result
  const rscStream = renderToPipeableStream(
    <App confirmation={result} />,
    webpackMap
  );
  const response = createFromNodeStream(rscStream, ssrManifest);
  const { pipe } = renderToPipeableStream(response, {
    bootstrapScripts: ['/client.js'],
    formState: formState,
    onShellReady() {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      pipe(res);
    },
  });
}

// ClientComponents.js ('use client')
'use client';

export function FeedbackForm({ action }) {
  return (
    <form id="feedback-form" action={action} method="post">
      <div>
        <label htmlFor="name">Your Name:</label>
        <input id="name" type="text" name="name" required />
      </div>
      <div>
        <label htmlFor="message">Message:</label>
        <textarea id="message" name="message" rows="4" required />
      </div>
      <div>
        <label htmlFor="rating">Rating:</label>
        <select id="rating" name="rating">
          <option value="5">Excellent</option>
          <option value="4">Good</option>
          <option value="3">Average</option>
          <option value="2">Poor</option>
          <option value="1">Terrible</option>
        </select>
      </div>
      <button id="submit-btn" type="submit">Submit Feedback</button>
    </form>
  );
}
```

## Load Sequence
1. Client sends HTTP GET request.
2. RSC server renders `<App />` with no confirmation. The `submitFeedback` server action is serialized as a Flight server reference.
3. Fizz SSR renders the form. The server action reference is encoded into the form's `action` attribute as a URL (typically the current page URL) with hidden input fields containing the action's encoded ID and any bound arguments.
4. The HTML includes `<form id="feedback-form" action="..." method="POST">` with hidden `<input>` fields for the Flight action encoding.
5. The HTML is streamed to the browser and displayed. The form is fully visible and functional as a native HTML form.
6. JavaScript has NOT loaded yet (or is disabled entirely).
7. The user fills in the form and clicks "Submit Feedback".
8. The browser performs a native HTML form submission: it collects all form field values into `FormData` and sends an HTTP POST request to the form's `action` URL.
9. The server receives the POST request with the `FormData`.
10. The server calls `decodeAction(formData, webpackServerMap)` to extract the bound server action from the form data.
11. The server executes the action, which returns the confirmation message.
12. The server calls `decodeFormState` to create a form state object for hydration consistency.
13. The server re-renders the page with `<App confirmation={result} />` and passes `formState` to Fizz's `renderToPipeableStream`.
14. A full new HTML page is sent to the browser, now including the confirmation message.

## Actions
1. Navigate to the page URL with JavaScript DISABLED in the browser.
2. Verify the form renders with all fields (name, message, rating, submit button).
3. Fill in the "Your Name" field with "Alice".
4. Fill in the "Message" field with "This app is great!".
5. Select "Good" from the Rating dropdown.
6. Click "Submit Feedback".
7. Wait for the full page navigation to complete (browser loads a new page).
8. Verify the confirmation message appears on the new page.
9. Verify the form is still present for another submission.

## Assertions
1. Initial render: the form is present in the HTML with `action` and `method="post"` attributes.
2. Initial render: hidden `<input>` fields are present in the form containing the encoded server action reference (Flight action ID).
3. The form contains visible inputs for `name`, `message`, and `rating` with proper labels.
4. The submit button is present and not disabled (no JavaScript required).
5. After form submission WITHOUT JavaScript: a full HTTP POST request is sent to the server.
6. The POST request includes all form data: `name=Alice`, `message=This app is great!`, `rating=4`, plus the hidden action encoding fields.
7. After the POST is processed: the browser displays a new page (full page navigation, not AJAX).
8. The new page contains `<div id="confirmation">Thank you, Alice! Your feedback has been received.</div>`.
9. The new page still contains the feedback form, allowing another submission.
10. The entire flow works with JavaScript completely disabled -- this is true progressive enhancement.
11. If JavaScript IS enabled and hydration occurs before submission: the same form works via the Flight protocol (AJAX-style) without a full page reload, but the result is identical.
