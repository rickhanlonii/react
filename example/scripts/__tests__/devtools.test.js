'use strict';

const {execSync} = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

describe('dev-server', () => {
  const {createDevServer} = require('../dev-server');
  let server;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  it('creates a dev server with default port', () => {
    server = createDevServer({port: 0});
    expect(server).toBeDefined();
    expect(server.notifyReload).toBeInstanceOf(Function);
    expect(server.notifyError).toBeInstanceOf(Function);
    expect(server.notifyClearErrors).toBeInstanceOf(Function);
    expect(server.close).toBeInstanceOf(Function);
  });

  it('starts with zero clients', () => {
    server = createDevServer({port: 0});
    expect(server.clientCount).toBe(0);
  });

  it('broadcast does not throw with no clients', () => {
    server = createDevServer({port: 0});
    expect(() => server.broadcast({type: 'test'})).not.toThrow();
  });

  it('notifyReload does not throw with no clients', () => {
    server = createDevServer({port: 0});
    expect(() => server.notifyReload()).not.toThrow();
  });

  it('notifyError does not throw with no clients', () => {
    server = createDevServer({port: 0});
    expect(() =>
      server.notifyError({message: 'test error', stack: 'stack'}),
    ).not.toThrow();
  });
});

describe('builder', () => {
  const {createBuilder} = require('../builder');

  it('creates a builder with default options', () => {
    const builder = createBuilder({rootDir: ROOT});
    expect(builder).toBeDefined();
    expect(builder.build).toBeInstanceOf(Function);
    expect(builder.config).toBeDefined();
  });

  it('configures development mode by default', () => {
    const builder = createBuilder({rootDir: ROOT});
    expect(builder.config.mode).toBe('development');
    expect(builder.config.devtool).toBe('source-map');
  });

  it('configures production mode', () => {
    const builder = createBuilder({rootDir: ROOT, mode: 'production'});
    expect(builder.config.mode).toBe('production');
    expect(builder.config.optimization.minimize).toBe(true);
  });

  it('builds successfully', () => {
    // Run as child process — babel-loader uses dynamic import() which is
    // incompatible with Jest's VM without --experimental-vm-modules.
    execSync('node scripts/build.js', {
      cwd: ROOT,
      stdio: 'pipe',
      env: {...process.env, NODE_ENV: 'development'},
    });
  });
});

describe('watcher', () => {
  const {createWatcher} = require('../watcher');

  it('creates a watcher', () => {
    const watcher = createWatcher({
      exampleDir: ROOT,
      libraryDir: path.join(ROOT, '../packages/react-dom-native'),
      onChange: jest.fn(),
    });
    expect(watcher).toBeDefined();
    expect(watcher.start).toBeInstanceOf(Function);
    expect(watcher.close).toBeInstanceOf(Function);
  });

  it('close does not throw when not started', () => {
    const watcher = createWatcher({
      exampleDir: ROOT,
      libraryDir: path.join(ROOT, '../packages/react-dom-native'),
      onChange: jest.fn(),
    });
    expect(() => watcher.close()).not.toThrow();
  });
});

