import Link from 'next/link';
import {getCategories} from '../lib/fixtures';

export default function Page() {
  var categories = getCategories();
  return (
    <div>
      <div
        style={{
          padding: '56px 16px 12px',
          backgroundColor: '#f2f2f7',
        }}>
        <h1
          style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 700,
            color: '#1c1c1e',
          }}>
          Fixtures
        </h1>
      </div>
      <div style={{backgroundColor: '#fff'}}>
        {categories.map(function (cat) {
          return (
            <Link
              key={cat.category}
              href={'/category/' + encodeURIComponent(cat.category)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '1px solid #e5e5ea',
                textDecoration: 'none',
                color: 'inherit',
              }}>
              <div>
                <div style={{fontSize: 17, color: '#1c1c1e'}}>
                  {cat.category}
                </div>
                <div style={{fontSize: 15, color: '#8e8e93', marginTop: 2}}>
                  {cat.fixtures.length} fixture
                  {cat.fixtures.length === 1 ? '' : 's'}
                </div>
              </div>
              <span style={{color: '#c7c7cc', fontSize: 20}}>›</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
