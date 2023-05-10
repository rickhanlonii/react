import * as React from 'react'
import { db } from './database.js';

export default async function Layout({ children }) {
  const backgroundImage = await db.readTheme();
  return (
    <html>
      <body style={{
        backgroundColor: 'rgb(41, 44, 52)',
        backgroundImage,
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
