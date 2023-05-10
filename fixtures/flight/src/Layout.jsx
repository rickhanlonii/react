import * as React from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <body>
        <link rel="stylesheet" href="/main.css" />
        <div className="container">
          <div className="background" />
          {children}
        </div>
      </body>
    </html>
  )
}
