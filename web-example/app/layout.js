export const metadata = {
  title: 'react-dom-native — Web Comparison',
};

export default function RootLayout({children}) {
  return (
    <html lang="en">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: 'a, a:active, a:focus { -webkit-tap-highlight-color: transparent; outline: none; }',
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#f2f2f7',
        }}>
        {children}
      </body>
    </html>
  );
}
