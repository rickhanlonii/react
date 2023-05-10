'use client';

import * as React from 'react'
import { createContext, useContext } from 'react';

export const ThemeContext = createContext();

export function ThemeButton({ theme, children }) {
  const setPageTheme = useContext(ThemeContext);
  return (
    <span onClick={() => {
      setPageTheme(theme)
    }}>
      {children}
    </span>
  );
}
