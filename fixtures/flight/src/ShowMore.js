'use client';

import * as React from 'react';

export default function ShowMore({children}) {
  const [show, setShow] = React.useState(false);
  if (!show) {
    return <button onClick={() => setShow(true)}>Show More</button>;
  }
}
