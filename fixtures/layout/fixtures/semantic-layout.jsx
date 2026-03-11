'use strict';

var React = require('react');

module.exports = function SemanticLayout() {
  return (
    <div style={{width: 390}}>
      <header style={{padding: 10, backgroundColor: '#e0e0ff'}}>
        <h2>Page Title</h2>
      </header>
      <nav style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 16,
        padding: 10,
        backgroundColor: '#f0f0f0',
      }}>
        <span>Home</span>
        <span>About</span>
        <span>Contact</span>
      </nav>
      <main style={{padding: 10}}>
        <section style={{marginBottom: 10}}>
          <h3>Section One</h3>
          <p>Main content goes here.</p>
        </section>
        <aside style={{
          padding: 10,
          backgroundColor: '#fff8e0',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#cccccc',
        }}>
          <p>Sidebar content</p>
        </aside>
      </main>
      <footer style={{padding: 10, backgroundColor: '#e0e0e0'}}>
        <p>Footer text</p>
      </footer>
    </div>
  );
};
