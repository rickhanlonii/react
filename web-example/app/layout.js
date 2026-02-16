export const metadata = {
  title: 'react-dom-native — Web Comparison',
};

export default function RootLayout({children}) {
  return (
    <html lang="en">
      <body style={{margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'}}>
        {children}
      </body>
    </html>
  );
}
