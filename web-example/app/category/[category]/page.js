import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getCategories} from '../../../lib/fixtures';

export default async function CategoryPage({params}) {
  var {category} = await params;
  category = decodeURIComponent(category);
  var categories = getCategories();
  var cat = categories.find(function (c) {
    return c.category === category;
  });
  if (!cat) {
    notFound();
  }
  return (
    <div style={{backgroundColor: '#f2f2f7', minHeight: '100vh'}}>
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: '#f2f2f7',
        }}>
        <Link
          href="/"
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
        <h1
          style={{
            margin: 0,
            marginTop: 8,
            fontSize: 34,
            fontWeight: 700,
            color: '#1c1c1e',
          }}>
          {category}
        </h1>
      </div>
      <div style={{padding: '0 16px'}}>
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
          {cat.fixtures.map(function (fixture, index) {
            return (
              <Link
                key={fixture.name}
                href={'/fixture/' + fixture.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderBottom:
                    index < cat.fixtures.length - 1
                      ? '1px solid #e5e5ea'
                      : 'none',
                  textDecoration: 'none',
                  color: 'inherit',
                }}>
                <div>
                  <div style={{fontSize: 17, color: '#1c1c1e'}}>
                    {fixture.title}
                  </div>
                  <div style={{fontSize: 15, color: '#8e8e93', marginTop: 2}}>
                    {fixture.description}
                  </div>
                </div>
                <span style={{color: '#c7c7cc', fontSize: 20}}>›</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
