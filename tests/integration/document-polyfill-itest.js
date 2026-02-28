'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Document polyfill', function () {
  it('document global exists', function () {
    expect(typeof document).toBe('object');
    expect(document).not.toBeNull();
  });

  it('document.createElement returns a fake element with correct API', function () {
    var script = document.createElement('script');
    expect(script).toBeTruthy();
    expect(typeof script.setAttribute).toBe('function');
    expect(typeof script.getAttribute).toBe('function');
    expect(typeof script.removeChild).toBe('function');
  });

  it('document.createElement preserves tag type', function () {
    var script = document.createElement('script');
    expect(script._tag).toBe('script');

    var link = document.createElement('link');
    expect(link._tag).toBe('link');
  });

  it('fake element setAttribute and getAttribute work', function () {
    var script = document.createElement('script');
    script.setAttribute('charset', 'utf-8');
    expect(script.getAttribute('charset')).toBe('utf-8');
  });

  it('fake element getAttribute reads src from property', function () {
    var script = document.createElement('script');
    script.src = 'http://localhost:6000/chunk.js';
    expect(script.getAttribute('src')).toBe('http://localhost:6000/chunk.js');
  });

  it('document.head is available immediately', function () {
    expect(document.head).not.toBeNull();
    expect(typeof document.head.appendChild).toBe('function');
  });

  it('document.documentElement is available immediately', function () {
    expect(document.documentElement).not.toBeNull();
  });

  it('document.head.appendChild tracks scripts for getElementsByTagName dedup', function () {
    // Create and append a script to head
    var script = document.createElement('script');
    script.src = 'http://localhost:99999/nonexistent-chunk.js';
    document.head.appendChild(script);

    // getElementsByTagName should now include this script
    var scripts = document.getElementsByTagName('script');
    expect(scripts.length).toBeGreaterThan(0);

    // The appended script should have parentNode set to head
    expect(script.parentNode).toBe(document.head);
  });

  it('document.currentScript is null', function () {
    expect(document.currentScript).toBeNull();
  });

  it('document.baseURI is initially empty string', function () {
    expect(document.baseURI).toBe('');
  });

  it('renders html/head/body structure correctly in shadow tree', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <html>
          <head />
          <body>
            <div>Hello</div>
          </body>
        </html>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var html = output.children[0];
    expect(html.type).toBe('html');

    // head is display:none, body contains visible content
    var head = html.children[0];
    var body = html.children[1];
    expect(head.type).toBe('head');
    expect(head.props.style.display).toBe('none');
    expect(body.type).toBe('body');
    expect(body.props.style.display).toBe('block');
    expect(body.children[0].type).toBe('div');
  });

  it('useEffect can insert script into document.head via appendChild', function () {
    var effectRan = false;
    var scriptAppended = false;

    function App() {
      React.useEffect(function () {
        effectRan = true;
        var script = document.createElement('script');
        script.src = 'http://localhost:99999/test-chunk.js';
        document.head.appendChild(script);
        scriptAppended = true;
      }, []);
      return (
        <html>
          <head />
          <body>
            <div>App</div>
          </body>
        </html>
      );
    }

    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<App />);
    });

    // useEffect fires synchronously during runTask ($$flushWork drains setTimeout queue)
    expect(effectRan).toBe(true);
    expect(scriptAppended).toBe(true);

    // Script should be tracked for getElementsByTagName dedup
    var scripts = document.getElementsByTagName('script');
    expect(scripts.length).toBeGreaterThan(0);

    // The appended script should have the correct src
    var lastScript = scripts[scripts.length - 1];
    expect(lastScript.src).toBe('http://localhost:99999/test-chunk.js');
    expect(lastScript.parentNode).toBe(document.head);
  });
});
