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
        <marquee>
          <h1>
            welcome to my personal collection of certified bangers!
            feel free to leave some comments on this beautiful
            little corner of the information superhighway....
          </h1>
        </marquee>
        <div className="container">
          <div className="background" />
          {children}
        </div>
      </body>
    </html>
  );
}
