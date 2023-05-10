import * as React from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <body style={{
        backgroundColor: 'rgb(41, 44, 52)',
        transition: 'background-image 1s ease-in-out',
      }}>
        <link rel="stylesheet" href="/main.css" />
        <div className="container">
          <div className="background" />
          {children}
        </div>
      </body>
    </html>
  );
}













/*
'use client';

import * as React from 'react'
import { useState } from 'react'
import { ThemeContext } from './Theme.js';

export default function Layout({ children }) {
  const [ pageTheme, setPageTheme] = useState(null);
  return (
    <html>
      <body style={{
        backgroundColor: 'rgb(41, 44, 52)',
        backgroundImage: pageTheme,
        transition: 'background-image 1s ease-in-out',
      }}>
        <link rel="stylesheet" href="/main.css" />
        <div className="container">
          <div className="background" />
          <ThemeContext.Provider value={setPageTheme}>
            {children}
          </ThemeContext.Provider>
        </div>
      </body>
    </html>
  );
}
*/