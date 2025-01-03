import React, {
  unstable_ViewTransition as ViewTransition,
  startTransition,
  useEffect,
  useState,
  unstable_Activity as Activity,
} from 'react';

import './Page.css';

const a = (
  <div key="a">
    <ViewTransition>
      <div>a</div>
    </ViewTransition>
  </div>
);

const b = (
  <div key="b">
    <ViewTransition>
      <div>b</div>
    </ViewTransition>
  </div>
);

export default function Page() {
  const [show, setShow] = useState(false);
  const ref = React.useRef(null);

  return (
    <div>
      <button
        ref={node => {
          function handleClick() {
            console.log('clicked');
          }
          node.addEventListener('click', handleClick);
          return () => {
            node.removeEventListener('click', handleClick);
          };
        }}
        onClick={() => {
          console.log('click', show);
          startTransition(() => {
            console.log('setting show', !show);
            setShow(!show);
          });
        }}>
        {show ? 'Hide' : 'Show'}
      </button>
      {show ? (
        <div>
          {a}
          {b}
        </div>
      ) : (
        <div>
          {b}
          {a}
        </div>
      )}
      <ViewTransition>
        {show ? <div>hello</div> : <section>Loading</section>}
      </ViewTransition>
      {show ? (
        <ViewTransition>
          <div>world</div>
        </ViewTransition>
      ) : null}
      <Activity mode={show ? 'visible' : 'hidden'}>
        <ViewTransition>
          <div>!!</div>
        </ViewTransition>
      </Activity>
    </div>
  );
}
