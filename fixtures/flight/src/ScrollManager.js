'use client'

import { useLayoutEffect } from 'react';

export default function ScrollManager({ path, children }) {
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);
  return <div key={path}>{children}</div>
}
