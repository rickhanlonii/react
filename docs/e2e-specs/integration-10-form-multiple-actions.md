# Multiple Forms with Different Server Actions

## Category
integration

## Description
Validates that multiple forms on the same page can each have their own independent server action, and that submitting one form does not interfere with another. This tests the Flight action encoding system's ability to distinguish between different server actions serialized on the same page, including actions with `.bind()` for different bound arguments and actions on different form submit buttons via `formAction`. The test also verifies that `useActionState` state is tracked per-form-instance: when three identical `<Form>` components render with the same server action, submitting one updates only that form's state while the others retain their previous state.

## References
- `packages/react-server-dom-webpack/src/__tests__/ReactFlightDOMForm-test.js` - "can submit a multiple complex closure server action without hydrating it" (tests different `formAction` per button), "useActionState can reuse state during MPA form submission" (three identical forms, only submitted form updates), "useActionState preserves state if arity is the same, but different arguments are bound"
- `packages/react-dom/src/__tests__/ReactDOMFizzForm-test.js` - Form action serialization with multiple forms

## App Setup
```jsx
// RSC Server: rsc-server.js
import {
  renderToPipeableStream,
  decodeAction,
  decodeFormState,
} from 'react-server-dom-webpack/server';

// Server Action: newsletter signup
const newsletterSignup = serverExports(
  async function signup(prevState, formData) {
    const email = formData.get('email');
    // Simulate newsletter subscription
    return { subscribed: true, email, message: `${email} subscribed!` };
  }
);

// Server Action: contact form
const submitContact = serverExports(
  async function contact(category, prevState, formData) {
    const name = formData.get('name');
    const body = formData.get('body');
    return {
      sent: true,
      message: `${category} message from ${name} received.`,
    };
  }
);

// Server Action: quick poll
const submitVote = serverExports(
  async function vote(pollId, prevState, formData) {
    const choice = formData.get('choice');
    return {
      voted: true,
      pollId,
      choice,
      message: `Vote for "${choice}" in poll ${pollId} recorded.`,
    };
  }
);

// Server Component
function App() {
  return (
    <div id="multi-form-app">
      <h1>Multiple Forms Page</h1>

      <section id="newsletter-section">
        <h2>Newsletter</h2>
        <NewsletterForm action={newsletterSignup} />
      </section>

      <section id="contact-section">
        <h2>Contact Us</h2>
        {/* Two contact forms with different bound categories */}
        <ContactForm action={submitContact.bind(null, 'support')} label="Support" />
        <ContactForm action={submitContact.bind(null, 'sales')} label="Sales" />
      </section>

      <section id="poll-section">
        <h2>Quick Polls</h2>
        <PollForm action={submitVote.bind(null, 'poll-1')} question="Favorite framework?" options={['React', 'Vue', 'Angular']} />
        <PollForm action={submitVote.bind(null, 'poll-2')} question="Preferred language?" options={['JavaScript', 'TypeScript', 'Both']} />
      </section>
    </div>
  );
}

// Client Components ('use client')
'use client';
import { useActionState } from 'react';

export function NewsletterForm({ action }) {
  const [state, dispatch, isPending] = useActionState(action, {
    subscribed: false,
    email: null,
    message: null,
  });

  if (state.subscribed) {
    return (
      <div id="newsletter-success" className="success">
        {state.message}
      </div>
    );
  }

  return (
    <form id="newsletter-form" action={dispatch}>
      <input
        id="newsletter-email"
        type="email"
        name="email"
        placeholder="your@email.com"
        required
      />
      <button id="newsletter-btn" type="submit" disabled={isPending}>
        {isPending ? 'Subscribing...' : 'Subscribe'}
      </button>
    </form>
  );
}

export function ContactForm({ action, label }) {
  const [state, dispatch, isPending] = useActionState(action, {
    sent: false,
    message: null,
  });

  return (
    <form className="contact-form" data-category={label.toLowerCase()} action={dispatch}>
      <h3>{label} Contact</h3>
      {state.sent && (
        <div className="success contact-success">{state.message}</div>
      )}
      <input
        type="text"
        name="name"
        placeholder="Your name"
        className="contact-name"
        required
      />
      <textarea
        name="body"
        placeholder="Your message"
        className="contact-body"
        required
      />
      <button type="submit" className="contact-btn" disabled={isPending}>
        {isPending ? 'Sending...' : `Send to ${label}`}
      </button>
    </form>
  );
}

export function PollForm({ action, question, options }) {
  const [state, dispatch, isPending] = useActionState(action, {
    voted: false,
    choice: null,
    message: null,
  });

  return (
    <form className="poll-form" action={dispatch}>
      <p className="poll-question">{question}</p>
      {state.voted ? (
        <div className="poll-result success">{state.message}</div>
      ) : (
        <>
          {options.map(option => (
            <label key={option} className="poll-option">
              <input type="radio" name="choice" value={option} required />
              {option}
            </label>
          ))}
          <button type="submit" className="poll-btn" disabled={isPending}>
            {isPending ? 'Voting...' : 'Vote'}
          </button>
        </>
      )}
    </form>
  );
}
```

## Load Sequence
1. Client sends HTTP GET request.
2. RSC server renders `<App />`. Server actions are serialized with their respective bound arguments: `submitContact.bind(null, 'support')` and `submitContact.bind(null, 'sales')` produce different bound closures with the same base action ID but different bound data.
3. Fizz SSR renders all five forms (1 newsletter, 2 contact, 2 poll). Each `useActionState` initializes with its respective initial state.
4. Each form gets its own hidden input fields encoding its specific server action reference and bound arguments.
5. The HTML is streamed to the browser showing all forms in their initial state.
6. Client JavaScript loads and `hydrateRoot` runs.
7. Each `useActionState` instance maintains independent state.

## Actions
1. Navigate to the page and verify all five forms are visible.
2. Wait for hydration to complete.
3. Fill in the newsletter email with "alice@example.com" and click "Subscribe".
4. Wait for the newsletter action to complete. Verify the success message appears.
5. Fill in the Support contact form: name "Bob", message "Need help". Click "Send to Support".
6. Wait for the action to complete. Verify the support success message.
7. Verify the Sales contact form is still in its initial state (not submitted).
8. Fill in the Sales contact form: name "Carol", message "Pricing inquiry". Click "Send to Sales".
9. Wait for the action to complete. Verify the sales success message.
10. Select "React" in poll 1 and click "Vote".
11. Wait for the vote to be recorded.
12. Select "TypeScript" in poll 2 and click "Vote".
13. Wait for the vote to be recorded.

## Assertions
1. Initial render: all five forms are visible with their correct labels and placeholders.
2. Each form has distinct hidden inputs encoding different server action references.
3. The two contact forms have different bound arguments (`category: 'support'` vs `category: 'sales'`), verified by distinct hidden field values.
4. After newsletter submission: `<div id="newsletter-success">` shows "alice@example.com subscribed!" and the form is replaced by the success message.
5. After newsletter submission: all other forms remain in their initial state, unaffected.
6. After submitting the Support contact form: the success message shows "support message from Bob received." The Sales form remains unsubmitted.
7. After submitting the Sales contact form: the success message shows "sales message from Carol received." The Support form's success message remains unchanged.
8. The bound `category` argument is correctly passed through the Flight protocol: "support" for one form, "sales" for the other, despite using the same underlying server action function.
9. After voting in poll 1: the result shows `Vote for "React" in poll poll-1 recorded.` Poll 2 remains in its voting state.
10. After voting in poll 2: the result shows `Vote for "TypeScript" in poll poll-2 recorded.` Poll 1's result is unchanged.
11. `useActionState` instances are independent: each form tracks its own `isPending`, its own state, and its own dispatch function.
12. No cross-form state contamination occurs: submitting form A never modifies the state of form B.
13. In MPA mode (without JavaScript): submitting the second contact form (Sales) via POST correctly updates only the Sales form's `useActionState`. The server passes `formState` to Fizz, and on the re-rendered page, only the Sales form shows its updated state while Support and Newsletter remain at their initial states.
