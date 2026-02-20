import {getCategories} from '../lib/fixtures';
import Sidebar from './components/Sidebar';

export const metadata = {
  title: 'react-dom-native — Web Comparison',
};

export default function RootLayout({children}) {
  var categories = getCategories();
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
        <div style={{display: 'flex'}}>
          <Sidebar categories={categories} />
          <main
            style={{
              flex: 1,
              overflowY: 'auto',
              backgroundColor: '#f2f2f7',
              minHeight: '100vh',
            }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
