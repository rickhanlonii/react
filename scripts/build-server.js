#!/usr/bin/env node
// Build server that runs predefined Xcode operations outside Claude's sandbox.
// No user-supplied input is passed to shell commands — all operations are
// hardcoded with validated parameters.
//
// Start in a separate terminal: node scripts/build-server.js
// Claude can then POST operations to http://localhost:6002/run

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 6002;
const PROJECT_ROOT = '/Users/rickhanlonii/oss/falcon';
const PROJECT_PATH = 'example/Falcon/Falcon.xcodeproj';
const SCHEME = 'Falcon';
const SIMULATOR_ID = '61F83D8B-36DF-474F-9AAD-61DC6D60FFED';
const BUNDLE_ID = 'com.react.Falcon';
const SCREENSHOT_PATH = '/tmp/falcon-screenshot.png';
const LOG_PATH = '/tmp/falcon-sim.log';

// Validate simulator ID format (UUID)
const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
if (!UUID_RE.test(SIMULATOR_ID)) {
  console.error('Invalid SIMULATOR_ID');
  process.exit(1);
}

// Fixed commands used internally. No user input reaches the shell.
const COMMANDS = {
  build: {
    command: 'xcodebuild',
    args: ['-project', PROJECT_PATH, '-scheme', SCHEME,
           '-destination', `id=${SIMULATOR_ID}`, 'build'],
    timeout: 300000,
  },
  'build-settings': {
    command: 'xcodebuild',
    args: ['-project', PROJECT_PATH, '-scheme', SCHEME,
           '-destination', `id=${SIMULATOR_ID}`, '-showBuildSettings'],
    timeout: 30000,
  },
  install: {
    command: 'xcrun',
    args: ['simctl', 'install', SIMULATOR_ID],
    // app path appended from DerivedData at runtime (validated)
    needsAppPath: true,
    timeout: 30000,
  },
  launch: {
    command: 'xcrun',
    args: ['simctl', 'launch', SIMULATOR_ID, BUNDLE_ID],
    timeout: 30000,
  },
};

// Each operation is a named action. No user input reaches the shell.
const OPERATIONS = {
  clean: {
    command: 'xcodebuild',
    args: ['-project', PROJECT_PATH, '-scheme', SCHEME,
           '-destination', `id=${SIMULATOR_ID}`, 'clean'],
    timeout: 60000,
  },
  test: {
    command: 'xcodebuild',
    args: ['-project', PROJECT_PATH, '-scheme', SCHEME,
           '-destination', `id=${SIMULATOR_ID}`, 'test'],
    timeout: 300000,
  },
  'resolve-packages': {
    command: 'xcodebuild',
    args: ['-resolvePackageDependencies', '-project', PROJECT_PATH,
           '-scheme', SCHEME],
    timeout: 120000,
  },
  'sim-terminate': {
    command: 'xcrun',
    args: ['simctl', 'terminate', SIMULATOR_ID, BUNDLE_ID],
    timeout: 10000,
  },
  'sim-screenshot': {
    command: 'xcrun',
    args: ['simctl', 'io', SIMULATOR_ID, 'screenshot', SCREENSHOT_PATH],
    timeout: 10000,
  },
  'sim-list': {
    command: 'xcrun',
    args: ['simctl', 'list', 'devices', '-j'],
    timeout: 10000,
  },
  'sim-open': {
    command: 'open',
    args: ['-a', 'Simulator'],
    timeout: 10000,
  },
  'test-swift': {
    command: 'xcodebuild',
    args: ['test',
           '-scheme', 'ReactDomNativeKit-Package',
           '-destination', `id=${SIMULATOR_ID}`,
           '-skipPackagePluginValidation',
           '-skip-testing:ReactDomNativeTests/EndToEndSSRTests',
           '-skip-testing:ReactDomNativeTests/EndToEndCSRTests'],
    cwd: 'packages/react-dom-native/ios',
    timeout: 300000,
  },
  'test-e2e-swift': {
    command: 'xcodebuild',
    args: ['test',
           '-scheme', 'ReactDomNativeKit-Package',
           '-destination', `id=${SIMULATOR_ID}`,
           '-skipPackagePluginValidation',
           '-only-testing:ReactDomNativeTests/EndToEndSSRTests',
           '-only-testing:ReactDomNativeTests/EndToEndCSRTests'],
    cwd: 'packages/react-dom-native/ios',
    timeout: 300000,
  },
};

// Resolved DerivedData app path (cached after first build-settings call)
let cachedAppPath = null;

// Active log capture process
let logProcess = null;
let logStream = null;

function resolveAppPath(stdout) {
  const lines = stdout.split('\n');
  let builtProductsDir = null;
  let productName = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('BUILT_PRODUCTS_DIR = ')) {
      builtProductsDir = trimmed.slice('BUILT_PRODUCTS_DIR = '.length);
    }
    if (trimmed.startsWith('FULL_PRODUCT_NAME = ')) {
      productName = trimmed.slice('FULL_PRODUCT_NAME = '.length);
    }
  }
  if (builtProductsDir && productName) {
    const appPath = path.join(builtProductsDir, productName);
    // Validate the path is under DerivedData
    if (appPath.includes('/DerivedData/') && appPath.endsWith('.app')) {
      return appPath;
    }
  }
  return null;
}

function exec(command, args, timeout, cwd) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: cwd || PROJECT_ROOT,
      env: { ...process.env },
      timeout,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    proc.on('error', (err) => resolve({ code: 1, stdout: '', stderr: err.message }));
  });
}

function handleLogStart(res) {
  // Kill existing log process if any
  if (logProcess) {
    logProcess.kill();
    logProcess = null;
  }
  if (logStream) {
    logStream.close();
    logStream = null;
  }

  // Clear previous log file
  fs.writeFileSync(LOG_PATH, '');
  logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });

  // Start log stream filtered to our app's bundle ID
  logProcess = spawn('xcrun', [
    'simctl', 'spawn', SIMULATOR_ID,
    'log', 'stream',
    '--style', 'compact',
    '--predicate', `subsystem == "${BUNDLE_ID}" OR processImagePath ENDSWITH "Falcon"`,
  ], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
  });

  logProcess.stdout.pipe(logStream);
  logProcess.stderr.pipe(logStream);

  logProcess.on('close', () => {
    console.log('  log process exited');
    logProcess = null;
    if (logStream) {
      logStream.close();
      logStream = null;
    }
  });

  console.log(`\n> [log-start] capturing logs to ${LOG_PATH}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 0, stdout: `Log capture started, writing to ${LOG_PATH}`, stderr: '' }));
}

function handleLogStop(res) {
  if (logProcess) {
    logProcess.kill();
    logProcess = null;
  }
  if (logStream) {
    logStream.close();
    logStream = null;
  }

  let logs = '';
  try {
    logs = fs.readFileSync(LOG_PATH, 'utf-8');
  } catch {
    // No log file
  }

  console.log(`\n> [log-stop] returning ${logs.length} bytes of logs`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 0, stdout: logs, stderr: '' }));
}

function handleLogRead(res) {
  let logs = '';
  try {
    logs = fs.readFileSync(LOG_PATH, 'utf-8');
  } catch {
    // No log file
  }

  console.log(`\n> [log-read] returning ${logs.length} bytes of logs`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 0, stdout: logs, stderr: '' }));
}

async function handleRun(res) {
  // 1. Build
  const buildCmd = COMMANDS.build;
  console.log(`\n> [run] step 1/3: build`);
  const buildResult = await exec(buildCmd.command, buildCmd.args, buildCmd.timeout);
  console.log(`  build exit: ${buildResult.code}`);
  if (buildResult.code !== 0) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: buildResult.code, step: 'build', stdout: buildResult.stdout, stderr: buildResult.stderr }));
    return;
  }

  // 2. Resolve app path from build settings
  const settingsCmd = COMMANDS['build-settings'];
  const settingsResult = await exec(settingsCmd.command, settingsCmd.args, settingsCmd.timeout);
  const appPath = resolveAppPath(settingsResult.stdout);
  if (!appPath) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Could not resolve app path from build settings.' }));
    return;
  }

  // 3. Install
  const installCmd = COMMANDS.install;
  const installArgs = [...installCmd.args, appPath];
  console.log(`  step 2/3: install ${appPath}`);
  const installResult = await exec(installCmd.command, installArgs, installCmd.timeout);
  console.log(`  install exit: ${installResult.code}`);
  if (installResult.code !== 0) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: installResult.code, step: 'install', stdout: installResult.stdout, stderr: installResult.stderr }));
    return;
  }

  // 4. Launch
  const launchCmd = COMMANDS.launch;
  console.log(`  step 3/3: launch`);
  const launchResult = await exec(launchCmd.command, launchCmd.args, launchCmd.timeout);
  console.log(`  launch exit: ${launchResult.code}`);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    code: launchResult.code,
    step: 'complete',
    stdout: launchResult.stdout,
    stderr: launchResult.stderr,
  }));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/run') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const { operation } = parsed;

      // Handle log operations separately (streaming process)
      if (operation === 'log-start') return handleLogStart(res);
      if (operation === 'log-stop') return handleLogStop(res);
      if (operation === 'log-read') return handleLogRead(res);

      // Handle 'run' — build, install, launch in sequence
      if (operation === 'run') return handleRun(res);

      if (!operation || !OPERATIONS[operation]) {
        const allOps = [...Object.keys(OPERATIONS), 'run', 'log-start', 'log-stop', 'log-read'];
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: `Unknown operation "${operation}". Available: ${allOps.join(', ')}`,
        }));
        return;
      }

      const op = OPERATIONS[operation];
      const args = [...op.args];

      console.log(`\n> [${operation}] ${op.command} ${args.join(' ')}`);
      const opCwd = op.cwd ? path.join(PROJECT_ROOT, op.cwd) : undefined;
      const result = await exec(op.command, args, op.timeout, opCwd);
      console.log(`  exit: ${result.code}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Build server listening on http://localhost:${PORT}`);
  console.log(`Project: ${PROJECT_PATH}`);
  console.log(`Scheme:  ${SCHEME}`);
  console.log(`Simulator: ${SIMULATOR_ID}`);
  console.log(`\nAvailable operations:`);
  for (const name of [...Object.keys(OPERATIONS), 'run', 'log-start', 'log-stop', 'log-read']) {
    console.log(`  - ${name}`);
  }
  console.log(`\nUsage: POST http://localhost:${PORT}/run`);
  console.log(`  Body: { "operation": "run" }`);
});
