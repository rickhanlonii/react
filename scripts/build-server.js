#!/usr/bin/env node
// Build server that runs predefined Xcode operations outside Claude's sandbox.
// No user-supplied input is passed to shell commands — all operations are
// hardcoded with validated parameters.
//
// Start in a separate terminal: node scripts/build-server.js
// Claude can then POST operations: POST http://localhost:6002/<operation>/<target>
//
// Supports three targets:
//   "demo" (default) — Falcon demo app on "Falcon Demo" simulator
//   "e2e"            — LayoutCompare app on "Falcon E2E" simulator
//   "standalone"     — Standalone Demo app on "Demo" simulator

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 6002;
const PROJECT_ROOT = '/Users/rickhanlonii/oss/falcon';
const AXE_PATH = path.join(PROJECT_ROOT, 'node_modules', 'xcodebuildmcp', 'bundled', 'axe');

// Validate simulator ID format (UUID)
const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

// Target configurations — all values are hardcoded, no user input
const TARGETS = {
  demo: {
    projectPath: 'fixtures/example/Falcon/Falcon.xcodeproj',
    scheme: 'Falcon',
    simulatorId: '61F83D8B-36DF-474F-9AAD-61DC6D60FFED',
    bundleId: 'com.react.Falcon',
    screenshotPath: '/tmp/falcon-screenshot.png',
    logPath: '/tmp/falcon-sim.log',
    processName: 'Falcon',
  },
  e2e: {
    projectPath: 'fixtures/layout/LayoutCompare/LayoutCompare.xcodeproj',
    scheme: 'LayoutCompare',
    simulatorId: '50E9E48E-D7F7-4338-9873-3EB801137EE7',
    bundleId: 'com.react.LayoutCompare',
    screenshotPath: '/tmp/e2e-screenshot.png',
    logPath: '/tmp/e2e-sim.log',
    processName: 'LayoutCompare',
  },
  standalone: {
    projectPath: 'fixtures/Demo/Demo.xcodeproj',
    scheme: 'Demo',
    simulatorId: '079D4CB9-AD9A-4F2A-B8D9-86315BDDEAA4',
    bundleId: 'com.react.Demo',
    screenshotPath: '/tmp/standalone-screenshot.png',
    logPath: '/tmp/standalone-sim.log',
    processName: 'Demo',
  },
};

// Validate all simulator IDs
for (const [name, cfg] of Object.entries(TARGETS)) {
  if (!UUID_RE.test(cfg.simulatorId)) {
    console.error(`Invalid simulator ID for target "${name}"`);
    process.exit(1);
  }
}

// Build commands and operations for a given target config
function commandsForTarget(t) {
  return {
    build: {
      command: 'xcodebuild',
      args: ['-project', t.projectPath, '-scheme', t.scheme,
             '-destination', `id=${t.simulatorId}`, 'build'],
      timeout: 300000,
    },
    'build-settings': {
      command: 'xcodebuild',
      args: ['-project', t.projectPath, '-scheme', t.scheme,
             '-destination', `id=${t.simulatorId}`, '-showBuildSettings'],
      timeout: 30000,
    },
    install: {
      command: 'xcrun',
      args: ['simctl', 'install', t.simulatorId],
      needsAppPath: true,
      timeout: 30000,
    },
    launch: {
      command: 'xcrun',
      args: ['simctl', 'launch', t.simulatorId, t.bundleId],
      timeout: 30000,
    },
  };
}

function operationsForTarget(t) {
  return {
    clean: {
      command: 'xcodebuild',
      args: ['-project', t.projectPath, '-scheme', t.scheme,
             '-destination', `id=${t.simulatorId}`, 'clean'],
      timeout: 60000,
    },
    test: {
      command: 'xcodebuild',
      args: ['-project', t.projectPath, '-scheme', t.scheme,
             '-destination', `id=${t.simulatorId}`, 'test'],
      timeout: 300000,
    },
    'resolve-packages': {
      command: 'xcodebuild',
      args: ['-resolvePackageDependencies', '-project', t.projectPath,
             '-scheme', t.scheme],
      timeout: 120000,
    },
    terminate: {
      command: 'xcrun',
      args: ['simctl', 'terminate', t.simulatorId, t.bundleId],
      timeout: 10000,
    },
    screenshot: {
      command: 'xcrun',
      args: ['simctl', 'io', t.simulatorId, 'screenshot', t.screenshotPath],
      timeout: 10000,
    },
    list: {
      command: 'xcrun',
      args: ['simctl', 'list', 'devices', '-j'],
      timeout: 10000,
    },
    open: {
      command: 'open',
      args: ['-a', 'Simulator'],
      timeout: 10000,
    },
  };
}

// Shared operations (not target-specific)
const SHARED_OPERATIONS = {
  'test-swift': {
    command: 'xcodebuild',
    args: ['test',
           '-scheme', 'ReactDomNativeKit-Package',
           '-destination', `id=${TARGETS.demo.simulatorId}`,
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
           '-destination', `id=${TARGETS.demo.simulatorId}`,
           '-skipPackagePluginValidation',
           '-only-testing:ReactDomNativeTests/EndToEndSSRTests',
           '-only-testing:ReactDomNativeTests/EndToEndCSRTests'],
    cwd: 'packages/react-dom-native/ios',
    timeout: 300000,
  },
};

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

    proc.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on('error', (err) => resolve({ code: 1, stdout: '', stderr: err.message }));
  });
}

// Per-target log capture state
const logState = {};

// Per-target debug (LLDB) session state
const debugState = {};

async function handleLogStart(res, target) {
  const t = TARGETS[target];
  const state = logState[target] || {};

  // Clean up any previous log capture
  if (state.process) {
    state.process.kill();
  }
  if (state.stream) {
    state.stream.close();
  }

  fs.writeFileSync(t.logPath, '');
  const stream = fs.createWriteStream(t.logPath, { flags: 'a' });

  // Terminate the running app, then relaunch with --console-pty to capture stdout
  // (--console doesn't produce output on macOS; --console-pty allocates a pty which forces stdio flushing)
  await exec('xcrun', ['simctl', 'terminate', t.simulatorId, t.bundleId], 10000);

  const proc = spawn('xcrun', [
    'simctl', 'launch', '--console-pty', t.simulatorId, t.bundleId,
  ], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
  });

  proc.stdout.pipe(stream);
  proc.stderr.pipe(stream);

  proc.on('close', () => {
    console.log(`  [${target}] log process exited`);
    logState[target] = {};
    stream.close();
  });

  logState[target] = { process: proc, stream };

  console.log(`\n> [${target}/log-start] relaunched with --console, capturing to ${t.logPath}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 0, stdout: `Log capture started, writing to ${t.logPath}`, stderr: '' }));
}

function handleLogStop(res, target) {
  const t = TARGETS[target];
  const state = logState[target] || {};

  if (state.process) {
    state.process.kill();
  }
  if (state.stream) {
    state.stream.close();
  }
  logState[target] = {};

  let logs = '';
  try {
    logs = fs.readFileSync(t.logPath, 'utf-8');
  } catch {
    // No log file
  }

  console.log(`\n> [${target}/log-stop] returning ${logs.length} bytes of logs`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 0, stdout: logs, stderr: '' }));
}

function handleLogRead(res, target) {
  const t = TARGETS[target];

  let logs = '';
  try {
    logs = fs.readFileSync(t.logPath, 'utf-8');
  } catch {
    // No log file
  }

  console.log(`\n> [${target}/log-read] returning ${logs.length} bytes of logs`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 0, stdout: logs, stderr: '' }));
}

async function parseBody(req) {
  if (req.method !== 'POST') return {};
  const chunks = [];
  let size = 0;
  const MAX_BODY = 64 * 1024; // 64KB
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString();
  if (raw) return JSON.parse(raw);
  return {};
}

// --- Input validation ---

function assertNumber(val, name) {
  const n = Number(val);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a finite number, got: ${JSON.stringify(val)}`);
  }
  return n;
}

function assertString(val, name) {
  if (typeof val !== 'string' || val.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return val;
}

const GESTURE_PRESETS = new Set([
  'scroll-up', 'scroll-down', 'scroll-left', 'scroll-right',
  'swipe-from-left-edge', 'swipe-from-right-edge',
  'swipe-from-top-edge', 'swipe-from-bottom-edge',
]);

const BUTTON_TYPES = new Set([
  'apple-pay', 'home', 'lock', 'side-button', 'siri',
]);

function assertEnum(val, name, allowed) {
  if (!allowed.has(val)) {
    throw new Error(`${name} must be one of: ${[...allowed].join(', ')}, got: ${JSON.stringify(val)}`);
  }
  return val;
}

// Block LLDB commands that escape to the OS shell
const LLDB_BLOCKED_RE = /^\s*(platform\s+shell|shell\s|script\s|!\s*\S|command\s+script|process\s+launch|target\s+create)/i;

function assertSafeLldbCommand(cmd) {
  if (typeof cmd !== 'string') {
    throw new Error('LLDB command must be a string');
  }
  // Check each line — newlines could inject multiple commands
  const lines = cmd.split('\n');
  if (lines.length > 1) {
    throw new Error('LLDB command must not contain newlines');
  }
  if (LLDB_BLOCKED_RE.test(cmd)) {
    throw new Error(`Blocked LLDB command (shell escape): ${cmd.slice(0, 60)}`);
  }
  return cmd;
}

// Validate lldb identifier (file path, function name) — no newlines or control chars
function assertLldbIdentifier(val, name) {
  assertString(val, name);
  if (/[\n\r\x00]/.test(val)) {
    throw new Error(`${name} must not contain newlines or control characters`);
  }
  return val;
}

// --- UI Automation via axe ---

function buildAxeArgs(operation, body, simulatorId) {
  const args = [];
  switch (operation) {
    case 'tap':
      args.push('tap');
      if (body.id) { args.push('--id', assertString(body.id, 'id')); }
      else if (body.label) { args.push('--label', assertString(body.label, 'label')); }
      else {
        throw new Error('tap requires "id" or "label"');
      }
      break;
    case 'swipe':
      args.push('swipe',
        '--start-x', String(assertNumber(body.x1, 'x1')),
        '--start-y', String(assertNumber(body.y1, 'y1')),
        '--end-x', String(assertNumber(body.x2, 'x2')),
        '--end-y', String(assertNumber(body.y2, 'y2')));
      if (body.duration != null) args.push('--duration', String(assertNumber(body.duration, 'duration')));
      break;
    case 'gesture':
      args.push('gesture', assertEnum(body.preset, 'preset', GESTURE_PRESETS));
      break;
    case 'type-text':
      args.push('type', assertString(body.text, 'text'));
      break;
    case 'long-press':
      args.push('touch',
        '-x', String(assertNumber(body.x, 'x')),
        '-y', String(assertNumber(body.y, 'y')),
        '--down', '--up',
        '--delay', String(assertNumber(body.duration || 1000, 'duration') / 1000));
      break;
    case 'touch':
      args.push('touch',
        '-x', String(assertNumber(body.x, 'x')),
        '-y', String(assertNumber(body.y, 'y')));
      if (body.down) args.push('--down');
      if (body.up) args.push('--up');
      if (body.delay != null) args.push('--delay', String(assertNumber(body.delay, 'delay')));
      break;
    case 'button':
      args.push('button', assertEnum(body.type, 'type', BUTTON_TYPES));
      break;
    case 'key-press':
      args.push('key', String(assertNumber(body.keyCode, 'keyCode')));
      if (body.duration != null) args.push('--duration', String(assertNumber(body.duration, 'duration')));
      break;
    case 'key-sequence': {
      if (!Array.isArray(body.keyCodes) || body.keyCodes.length === 0) {
        throw new Error('keyCodes must be a non-empty array of numbers');
      }
      const validated = body.keyCodes.map((k, i) => assertNumber(k, `keyCodes[${i}]`));
      args.push('key-sequence', '--keycodes', validated.join(','));
      if (body.delay != null) args.push('--delay', String(assertNumber(body.delay, 'delay')));
      break;
    }
    case 'snapshot-ui':
      args.push('describe-ui');
      break;
    default:
      return null;
  }
  args.push('--udid', simulatorId);
  return args;
}

const AXE_OPERATIONS = new Set([
  'tap', 'swipe', 'gesture', 'type-text', 'long-press',
  'touch', 'button', 'key-press', 'key-sequence', 'snapshot-ui',
]);

async function handleAxeOp(res, target, operation, body) {
  const t = TARGETS[target];
  let args;
  try {
    args = buildAxeArgs(operation, body, t.simulatorId);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
    return;
  }
  if (!args) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unknown axe operation: ${operation}` }));
    return;
  }
  console.log(`\n> [${target}/${operation}] ${AXE_PATH} ${args.join(' ')}`);
  const result = await exec(AXE_PATH, args, 10000);
  console.log(`  exit: ${result.code}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}

// --- LLDB Debug Proxy ---

function handleDebugAttach(res, target) {
  const t = TARGETS[target];
  // Clean up stale sessions where the lldb process has exited
  if (debugState[target] && debugState[target].process) {
    if (debugState[target].process.exitCode !== null) {
      debugState[target] = {};
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 0, stdout: 'Already attached', stderr: '' }));
      return;
    }
  }

  // Find the app's PID via simctl — more reliable than name-based attach for simulator processes
  const { execSync } = require('child_process');
  const lldbPath = execSync('xcrun --find lldb', { encoding: 'utf8' }).trim();
  let pid;
  try {
    const listOutput = execSync(
      `xcrun simctl spawn ${t.simulatorId} launchctl list`, { encoding: 'utf8' }
    );
    const match = listOutput.split('\n').find(l => l.includes(t.bundleId));
    if (match) pid = match.trim().split(/\s+/)[0];
  } catch (e) { /* fall through to name-based attach */ }

  if (!pid || pid === '-') {
    console.log(`\n> [${target}/debug-attach] FAILED: app is not running`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      code: 1,
      stdout: `App "${t.processName}" is not running. Launch it first with: npm run app:run`,
      stderr: '',
    }));
    return;
  }

  // Check if the process is already being debugged (e.g. by Xcode)
  try {
    const ppidOutput = execSync(`ps -o ppid= -p ${pid}`, { encoding: 'utf8' }).trim();
    const ppid = parseInt(ppidOutput, 10);
    if (ppid) {
      const parentComm = execSync(`ps -o comm= -p ${ppid}`, { encoding: 'utf8' }).trim();
      if (parentComm.includes('debugserver')) {
        console.log(`\n> [${target}/debug-attach] FAILED: app is under Xcode debugger (debugserver pid ${ppid})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          code: 1,
          stdout: `App is being debugged by Xcode (debugserver pid ${ppid}). ` +
            `Terminate and relaunch without Xcode first.`,
          stderr: '',
        }));
        return;
      }
    }
  } catch (e) { /* ignore — proceed with attach */ }

  const attachCmd = `process attach --pid ${pid}`;
  const proc = spawn(lldbPath, ['-o', attachCmd], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
  });

  let buffer = '';
  debugState[target] = { process: proc };

  proc.stdout.on('data', d => { buffer += d; });
  proc.stderr.on('data', d => { buffer += d; });
  proc.on('close', () => {
    console.log(`  [${target}] lldb process exited`);
    debugState[target] = {};
  });

  // Wait for output indicating attach result.
  // Xcode's LLDB outputs "Target 0: (Falcon) stopped." while Meta's LLDB
  // outputs "Process <pid> stopped", so we match both patterns.
  const timeout = 20000;
  const start = Date.now();
  const poll = setInterval(() => {
    const hasError = buffer.includes('error:');
    const hasAttached = buffer.includes('stopped') && (
      buffer.includes('Process') || buffer.includes('Target')
    );
    if (hasError || hasAttached) {
      clearInterval(poll);
      console.log(`\n> [${target}/debug-attach] ${hasError ? 'FAILED' : 'attached to ' + t.processName + ' (pid ' + pid + ')'}`);
      if (hasError) {
        proc.stdin.write('quit\n');
        debugState[target] = {};
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: hasError ? 1 : 0, stdout: buffer, stderr: '' }));
      if (!hasError) {
        buffer = '';
        // Continue so the app doesn't stay paused
        proc.stdin.write('continue\n');
      }
    } else if (Date.now() - start > timeout) {
      clearInterval(poll);
      console.log(`\n> [${target}/debug-attach] timeout waiting for attach`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 1, stdout: buffer, stderr: 'Timeout waiting for LLDB attach' }));
    }
  }, 200);
}

function handleDebugDetach(res, target) {
  const state = debugState[target];
  if (!state || !state.process) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, stdout: 'No active debug session', stderr: '' }));
    return;
  }

  state.process.stdin.write('detach\n');
  state.process.stdin.write('quit\n');

  setTimeout(() => {
    if (state.process && !state.process.killed) {
      state.process.kill();
    }
    debugState[target] = {};
    console.log(`\n> [${target}/debug-detach] detached`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, stdout: 'Detached', stderr: '' }));
  }, 500);
}

function handleDebugCommand(res, target, command) {
  const state = debugState[target];
  if (!state || !state.process) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No active debug session. Call debug-attach first.' }));
    return;
  }

  let output = '';
  const onData = d => { output += d; };
  state.process.stdout.on('data', onData);
  state.process.stderr.on('data', onData);

  state.process.stdin.write(command + '\n');

  // Wait for output to stabilize (no new data for 500ms) or timeout
  const timeout = 10000;
  const start = Date.now();
  let lastLen = 0;
  let stableAt = 0;
  const poll = setInterval(() => {
    if (output.length > 0 && output.length === lastLen) {
      // Output hasn't changed
      if (!stableAt) stableAt = Date.now();
      if (Date.now() - stableAt > 500) {
        clearInterval(poll);
        state.process.stdout.removeListener('data', onData);
        state.process.stderr.removeListener('data', onData);
        console.log(`\n> [${target}/debug-lldb] ${command}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, stdout: output, stderr: '' }));
        return;
      }
    } else {
      lastLen = output.length;
      stableAt = 0;
    }
    if (Date.now() - start > timeout) {
      clearInterval(poll);
      state.process.stdout.removeListener('data', onData);
      state.process.stderr.removeListener('data', onData);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 1, stdout: output, stderr: 'Timeout waiting for LLDB response' }));
    }
  }, 100);
}

const DEBUG_OPERATIONS = new Set([
  'debug-attach', 'debug-detach', 'debug-breakpoint-add',
  'debug-breakpoint-remove', 'debug-continue', 'debug-lldb',
  'debug-stack', 'debug-variables',
]);

async function handleDebugOp(res, target, operation, body) {
  try {
    switch (operation) {
      case 'debug-attach':
        return handleDebugAttach(res, target);
      case 'debug-detach':
        return handleDebugDetach(res, target);
      case 'debug-breakpoint-add': {
        let cmd;
        if (body.file && body.line) {
          assertLldbIdentifier(body.file, 'file');
          assertNumber(body.line, 'line');
          cmd = `breakpoint set -f ${body.file} -l ${body.line}`;
        } else if (body.function) {
          assertLldbIdentifier(body.function, 'function');
          cmd = `breakpoint set -n ${body.function}`;
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Provide file+line or function' }));
          return;
        }
        if (body.condition) {
          assertLldbIdentifier(body.condition, 'condition');
          cmd += ` -c '${body.condition.replace(/'/g, "\\'")}'`;
        }
        assertSafeLldbCommand(cmd);
        return handleDebugCommand(res, target, cmd);
      }
      case 'debug-breakpoint-remove':
        assertNumber(body.breakpointId, 'breakpointId');
        return handleDebugCommand(res, target, `breakpoint delete ${body.breakpointId}`);
      case 'debug-continue':
        return handleDebugCommand(res, target, 'continue');
      case 'debug-lldb':
        assertSafeLldbCommand(body.command);
        return handleDebugCommand(res, target, body.command);
      case 'debug-stack':
        if (body.maxFrames != null) assertNumber(body.maxFrames, 'maxFrames');
        return handleDebugCommand(res, target, `bt ${body.maxFrames || ''}`);
      case 'debug-variables':
        return handleDebugCommand(res, target, 'frame variable');
      default:
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown debug operation: ${operation}` }));
    }
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

async function handleRun(res, target) {
  const t = TARGETS[target];
  const commands = commandsForTarget(t);

  // 1. Build
  const buildCmd = commands.build;
  console.log(`\n> [${target}/run] step 1/3: build`);
  const buildResult = await exec(buildCmd.command, buildCmd.args, buildCmd.timeout);
  console.log(`  build exit: ${buildResult.code}`);
  if (buildResult.code !== 0) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: buildResult.code, step: 'build', stdout: buildResult.stdout, stderr: buildResult.stderr }));
    return;
  }

  // 2. Resolve app path from build settings
  const settingsCmd = commands['build-settings'];
  const settingsResult = await exec(settingsCmd.command, settingsCmd.args, settingsCmd.timeout);
  const appPath = resolveAppPath(settingsResult.stdout);
  if (!appPath) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Could not resolve app path from build settings.' }));
    return;
  }

  // 2.5. Boot simulator if needed
  const bootResult = await exec('xcrun', ['simctl', 'boot', t.simulatorId], 30000);
  // Ignore errors — already booted returns non-zero

  // 3. Install
  const installCmd = commands.install;
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
  const launchCmd = commands.launch;
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

// Parse path: /<operation>/<target>?=<filter> where target defaults to "demo"
function parsePath(url) {
  const [pathPart, queryPart] = url.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const filter = queryPart && queryPart.startsWith('=') ? queryPart.slice(1) : null;
  if (parts.length === 0) return { operation: null, target: 'demo', filter };
  if (parts.length === 1) return { operation: parts[0], target: 'demo', filter };
  return { operation: parts[0], target: parts[1], filter };
}

// Filter stdout lines by query string (case-insensitive)
function filterResponse(jsonStr, filter) {
  if (!filter) return jsonStr;
  const obj = JSON.parse(jsonStr);
  if (obj.stdout) {
    const query = decodeURIComponent(filter).toLowerCase();
    obj.stdout = obj.stdout
      .split('\n')
      .filter(line => line.toLowerCase().includes(query))
      .join('\n');
  }
  return JSON.stringify(obj);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', targets: Object.keys(TARGETS) }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const { operation, target, filter } = parsePath(req.url);

  if (!TARGETS[target]) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unknown target "${target}". Available: ${Object.keys(TARGETS).join(', ')}` }));
    return;
  }

  // Wrap res.end to apply stdout filtering when ?=<query> is present
  if (filter) {
    const origEnd = res.end.bind(res);
    res.end = (data, ...args) => origEnd(filterResponse(data, filter), ...args);
  }

  // Parse request body for POST requests
  let body = {};
  try {
    body = await parseBody(req);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Invalid JSON body: ${e.message}` }));
    return;
  }

  const t = TARGETS[target];
  const operations = { ...operationsForTarget(t), ...SHARED_OPERATIONS };

  // Handle log operations
  if (operation === 'log-start') return handleLogStart(res, target);
  if (operation === 'log-stop') return handleLogStop(res, target);
  if (operation === 'log-read') return handleLogRead(res, target);

  // Handle 'run' — build, install, launch in sequence
  if (operation === 'run') return handleRun(res, target);

  // Handle UI automation via axe
  if (AXE_OPERATIONS.has(operation)) return handleAxeOp(res, target, operation, body);

  // Handle debug operations via LLDB
  if (DEBUG_OPERATIONS.has(operation)) return handleDebugOp(res, target, operation, body);

  if (!operation || !operations[operation]) {
    const allOps = [
      ...Object.keys(operations), 'run', 'log-start', 'log-stop', 'log-read',
      ...AXE_OPERATIONS, ...DEBUG_OPERATIONS,
    ];
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: `Unknown operation "${operation}". Available: ${allOps.join(', ')}`,
    }));
    return;
  }

  const op = operations[operation];
  const args = [...op.args];

  console.log(`\n> [${target}/${operation}] ${op.command} ${args.join(' ')}`);
  const opCwd = op.cwd ? path.join(PROJECT_ROOT, op.cwd) : undefined;
  const result = await exec(op.command, args, op.timeout, opCwd);
  console.log(`  exit: ${result.code}`);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
});

server.listen(PORT, () => {
  console.log(`Build server listening on http://localhost:${PORT}`);
  console.log(`\nTargets:`);
  for (const [name, cfg] of Object.entries(TARGETS)) {
    console.log(`  ${name}: ${cfg.scheme} → ${cfg.simulatorId}`);
  }
  const sampleOps = [
    ...Object.keys(operationsForTarget(TARGETS.demo)), ...Object.keys(SHARED_OPERATIONS),
    'run', 'log-start', 'log-stop', 'log-read',
    ...AXE_OPERATIONS, ...DEBUG_OPERATIONS,
  ];
  console.log(`\nOperations: ${sampleOps.join(', ')}`);
  console.log(`\nUsage: POST http://localhost:${PORT}/<operation>/<target>`);
  console.log(`  Example: curl -X POST http://localhost:${PORT}/run/demo`);
});
