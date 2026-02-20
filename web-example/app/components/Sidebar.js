'use client';

import {useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

export default function Sidebar({categories}) {
  var pathname = usePathname();
  var currentFixture = pathname.startsWith('/fixture/')
    ? pathname.slice('/fixture/'.length)
    : null;

  var initialCategory = null;
  if (currentFixture) {
    for (var i = 0; i < categories.length; i++) {
      for (var j = 0; j < categories[i].fixtures.length; j++) {
        if (categories[i].fixtures[j].name === currentFixture) {
          initialCategory = categories[i].category;
          break;
        }
      }
      if (initialCategory) break;
    }
  }

  var [expanded, setExpanded] = useState(initialCategory);

  function toggleCategory(category) {
    setExpanded(expanded === category ? null : category);
  }

  return (
    <nav
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: '1px solid #e0e0e0',
        backgroundColor: '#f8f8f8',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}>
      <div style={{padding: 16, borderBottom: '1px solid #e0e0e0'}}>
        <Link href="/" style={{textDecoration: 'none', color: 'inherit'}}>
          <h1 style={{margin: 0, fontSize: 18, fontWeight: 700, color: '#1c1c1e'}}>
            Falcon Fixtures
          </h1>
        </Link>
      </div>
      <div style={{flex: 1, overflowY: 'auto'}}>
        {categories.map(function (cat) {
          var isExpanded = expanded === cat.category;
          return (
            <div key={cat.category}>
              <button
                onClick={function () {
                  toggleCategory(cat.category);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 16px',
                  border: 'none',
                  borderBottom: '1px solid #e8e8e8',
                  backgroundColor: isExpanded ? '#eef2ff' : 'transparent',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  textAlign: 'left',
                  color: '#1c1c1e',
                  fontFamily: 'inherit',
                }}>
                <span>
                  {cat.category}{' '}
                  <span style={{fontWeight: 400, color: '#8e8e93'}}>
                    ({cat.fixtures.length})
                  </span>
                </span>
                <span style={{fontSize: 10, color: '#8e8e93'}}>
                  {isExpanded ? '\u25BC' : '\u25B6'}
                </span>
              </button>
              {isExpanded &&
                cat.fixtures.map(function (fixture) {
                  var isActive = currentFixture === fixture.name;
                  return (
                    <Link
                      key={fixture.name}
                      href={'/fixture/' + fixture.name}
                      style={{
                        display: 'block',
                        padding: '8px 16px 8px 28px',
                        borderBottom: '1px solid #f0f0f0',
                        backgroundColor: isActive ? '#007AFF' : 'transparent',
                        textDecoration: 'none',
                        color: isActive ? '#fff' : '#1c1c1e',
                      }}>
                      <div style={{fontSize: 13, fontWeight: 500}}>
                        {fixture.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          marginTop: 2,
                          color: isActive
                            ? 'rgba(255,255,255,0.7)'
                            : '#8e8e93',
                        }}>
                        {fixture.description}
                      </div>
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
