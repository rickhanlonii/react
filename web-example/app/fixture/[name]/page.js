import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getFixtureComponent, getCategories} from '../../../lib/fixtures';

export default async function FixturePage({params}) {
  var {name} = await params;
  var Fixture = getFixtureComponent(name);
  if (!Fixture) {
    notFound();
  }
  // Find the category for back navigation
  var categories = getCategories();
  var category = null;
  for (var i = 0; i < categories.length; i++) {
    for (var j = 0; j < categories[i].fixtures.length; j++) {
      if (categories[i].fixtures[j].name === name) {
        category = categories[i].category;
        break;
      }
    }
    if (category) break;
  }
  return (
    <div style={{backgroundColor: '#f2f2f7', minHeight: '100vh'}}>
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: '#f2f2f7',
        }}>
        <Link
          href={category ? '/category/' + encodeURIComponent(category) : '/'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: '#fff',
            textDecoration: 'none',
          }}>
          <span
            style={{
              fontSize: 28,
              fontWeight: 300,
              color: '#1c1c1e',
              lineHeight: 1,
            }}>
            ‹
          </span>
        </Link>
      </div>
      <div style={{padding: '0 16px'}}>
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
          <Fixture />
        </div>
      </div>
    </div>
  );
}
