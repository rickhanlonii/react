'use client';

import * as React from 'react';
import { useTransition } from 'react';

export default function ImageButton({ src, alt, gradient, updateTheme }) {
  const [isPending, startTransition] = useTransition();
  return (
    <img
      src={src}
      alt={alt}
      style={{
        opacity: isPending ? 0.7 : 1,
        transition: 'opacity 0.4s ease-in',
      }}
      onClick={() => {
        startTransition(() => updateTheme(gradient));
      }} />
  );
}