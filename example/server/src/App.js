const React = require('react');
const { Suspense } = React;
const Counter = require('./components/Counter');
const TextInput = require('./components/TextInput');

// Debug: outline every element to visualize margin vs padding
const d = {
  border: '1px solid rgba(255, 0, 0, 0.4)',
  backgroundColor: 'rgba(255, 0, 0, 0.05)',
};

async function SlowSection({ delay, title, children }) {
  await new Promise(resolve => setTimeout(resolve, delay));
  return <div style={d}><h2 style={d}>{title}</h2>{children}</div>;
}

function App() {
  const timestamp = new Date().toLocaleTimeString();

  return (
    <div>
      {/*<h1 style={d}>react-dom-native</h1>*/}
      {/*<p style={d}>This page is rendered by React Server Components on native iOS.</p>*/}
      
      <div style={d}>
        <h2 style={d}>Counter</h2>
        <Counter initialCount={0} />
      </div>
      
      {/*<div style={d}>*/}
      {/*  <h2 style={d}>Search</h2>*/}
      {/*  <TextInput placeholder="Search fruits..." />*/}
      {/*</div>*/}

      {/* ── Inline Text ── */}
      {/*<div style={d}>*/}
      {/*  <h2 style={d}>Inline Text</h2>*/}
      {/*  <p style={d}>*/}
      {/*    This is <b>bold</b>, <i>italic</i>, <u>underline</u>, and{' '}*/}
      {/*    <s>strikethrough</s> text.*/}
      {/*  </p>*/}
      {/*  <p style={d}>*/}
      {/*    <del>Deleted text</del> and <ins>inserted text</ins> show edits.*/}
      {/*  </p>*/}
      {/*  <p style={d}>*/}
      {/*    Use <mark>mark for highlights</mark> and <small>small for fine print</small>.*/}
      {/*  </p>*/}
      {/*  <p style={d}>*/}
      {/*    Inline code: <code>const x = 42</code>, keyboard: <kbd>Cmd+S</kbd>,*/}
      {/*    output: <samp>Hello World</samp>.*/}
      {/*  </p>*/}
      {/*  <p style={d}>*/}
      {/*    <cite>The Art of Programming</cite> defines{' '}*/}
      {/*    <dfn>algorithm</dfn> as a set of steps. The variable{' '}*/}
      {/*    <var>x</var> is commonly used.*/}
      {/*  </p>*/}
      {/*  <p style={d}>*/}
      {/*    The <abbr>HTML</abbr> spec was updated at{' '}*/}
      {/*    <time>2026-02-15</time>.*/}
      {/*  </p>*/}
      {/*  <p style={d}>*/}
      {/*    <q>Quoted inline text</q> works well.*/}
      {/*  </p>*/}
      {/*  <p style={d}>*/}
      {/*    H<sub>2</sub>O and E=mc<sup>2</sup> show subscript and superscript.*/}
      {/*  </p>*/}
      {/*</div>*/}
      
      {/*/!* ── Block Containers ── *!/*/}
      {/*<div style={d}>*/}
      {/*  <h2 style={d}>Block Containers</h2>*/}
      
      {/*  <address style={d}>*/}
      {/*    123 Main Street{'\n'}*/}
      {/*    San Francisco, CA 94105*/}
      {/*  </address>*/}
      
      {/*  <blockquote style={d}>*/}
      {/*    <p style={d}>The best way to predict the future is to invent it.</p>*/}
      {/*  </blockquote>*/}
      
      {/*  <figure style={d}>*/}
      {/*    <div style={d}>*/}
      {/*      <p style={d}>[Image placeholder]</p>*/}
      {/*    </div>*/}
      {/*    <figcaption style={d}>Figure 1: A placeholder image</figcaption>*/}
      {/*  </figure>*/}
      
      {/*  <pre style={d}>*/}
      {/*    {'function hello() {\n  return "world";\n}'}*/}
      {/*  </pre>*/}
      
      {/*  <details style={d}>*/}
      {/*    <summary style={d}>Click to expand</summary>*/}
      {/*    <p style={d}>This is the expanded content inside details.</p>*/}
      {/*  </details>*/}
      
      {/*  <dialog style={d}>*/}
      {/*    <p style={d}>This is a dialog box with a border.</p>*/}
      {/*  </dialog>*/}
      
      {/*  <fieldset style={d}>*/}
      {/*    <legend style={d}>User Info</legend>*/}
      {/*    <p style={d}>Name: Jane Doe</p>*/}
      {/*    <p style={d}>Email: jane@example.com</p>*/}
      {/*  </fieldset>*/}
      {/*</div>*/}
      
      {/* ── Definition Lists ── */}
      {/*<div style={d}>*/}
      {/*  <h2 style={d}>Definition Lists</h2>*/}
      {/*  <dl style={d}>*/}
      {/*    <dt style={d}>React</dt>*/}
      {/*    <dd style={d}>A JavaScript library for building user interfaces.</dd>*/}
      {/*    <dt style={d}>JSX</dt>*/}
      {/*    <dd style={d}>A syntax extension for JavaScript used with React.</dd>*/}
      {/*    <dt style={d}>Yoga</dt>*/}
      {/*    <dd style={d}>A cross-platform layout engine implementing Flexbox.</dd>*/}
      {/*  </dl>*/}
      {/*</div>*/}
      {/* ── Tables ── */}
      {/*<Suspense fallback={<p style={d}>Loading tables...</p>}>*/}
      {/*  <SlowSection delay={1000} title="Tables (streamed)">*/}
      {/*    <table style={d}>*/}
      {/*      <caption style={d}>Element Support Matrix</caption>*/}
      {/*      <thead style={d}>*/}
      {/*        <tr style={d}>*/}
      {/*          <th style={d}>Element</th>*/}
      {/*          <th style={d}>Category</th>*/}
      {/*          <th style={d}>Status</th>*/}
      {/*        </tr>*/}
      {/*      </thead>*/}
      {/*      <tbody style={d}>*/}
      {/*        <tr style={d}>*/}
      {/*          <td style={d}>div</td>*/}
      {/*          <td style={d}>Block</td>*/}
      {/*          <td style={d}>Supported</td>*/}
      {/*        </tr>*/}
      {/*        <tr style={d}>*/}
      {/*          <td style={d}>table</td>*/}
      {/*          <td style={d}>Table</td>*/}
      {/*          <td style={d}>Supported</td>*/}
      {/*        </tr>*/}
      {/*        <tr style={d}>*/}
      {/*          <td style={d}>video</td>*/}
      {/*          <td style={d}>Media</td>*/}
      {/*          <td style={d}>Placeholder</td>*/}
      {/*        </tr>*/}
      {/*      </tbody>*/}
      {/*      <tfoot style={d}>*/}
      {/*        <tr style={d}>*/}
      {/*          <td style={d}>Total</td>*/}
      {/*          <td style={d}>—</td>*/}
      {/*          <td style={d}>45+</td>*/}
      {/*        </tr>*/}
      {/*      </tfoot>*/}
      {/*    </table>*/}
      {/*  </SlowSection>*/}
      {/*</Suspense>*/}

      {/* ── Form Controls ── */}
      {/*<div style={d}>*/}
      {/*  <h2 style={d}>Form Controls</h2>*/}
      {/*  <div style={d}>*/}
      {/*    <label style={d}>Username</label>*/}
      {/*    <progress />*/}
      {/*    <p style={d}>Loading progress bar above</p>*/}
      {/*  </div>*/}
      {/*</div>*/}

      <Suspense fallback={<p style={d}>Fallback A...</p>}>
        <SlowSection delay={1000} title="Content A (streamed)">
          <p>Content A</p>
          {/*<Suspense fallback={<p style={d}>Nested Fallback A...</p>}>*/}
          {/*  <div style={{margin: '10px'}}>*/}
          {/*  <SlowSection delay={1500} title="Nested Content A (streamed)">*/}
          {/*    <p>Nested Content A</p>*/}
          {/*  </SlowSection>*/}
          {/*  </div>*/}
          {/*</Suspense>*/}
        </SlowSection>
      </Suspense>
      {/* ── Media Placeholders ── */}
      <Suspense fallback={<p style={d}>Fallback B...</p>}>
        <SlowSection delay={2500} title="Content B (streamed)">
          
            <p style={d}>Content</p>
          
        </SlowSection>
      </Suspense>

      {/*<p style={d}>*/}
      {/*  {`Rendered at ${timestamp}`}*/}
      {/*</p>*/}
    </div>
  );
}

module.exports = App;
module.exports.default = App;
