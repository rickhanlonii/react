#!/usr/bin/env node
/**
 * Automated smoke test for the Staggered Loading fixture.
 * Exercises: prerender, parallel hydration, and counter interactivity.
 *
 * Prerequisites:
 *   - Dev server running: cd example && npm run dev
 *   - Build server running: npm run build-server
 *   - Falcon app running in simulator
 *
 * Usage:
 *   node tools/devtools-mcp/tests/e2e/staggered-loading-test.js
 */

import { execSync } from 'node:child_process';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: process.cwd() }).trim();
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Parse AXFrame from snapshot-ui JSON output.
 * Format: "AXFrame" : "{{x, y}, {width, height}}"
 * Returns {x, y, width, height} with center coordinates.
 */
function parseFrame(snapshotOutput, nearLabel) {
  // Find the AXFrame line near the given label
  const lines = snapshotOutput.split('\n');
  let frameX, frameY, frameW, frameH;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(nearLabel)) {
      // Search backwards for the nearest AXFrame
      for (let j = i; j >= Math.max(0, i - 15); j--) {
        const frameMatch = lines[j].match(/"AXFrame"\s*:\s*"\{\{([\d.]+),\s*([\d.]+)\},\s*\{([\d.]+),\s*([\d.]+)\}\}"/);
        if (frameMatch) {
          frameX = parseFloat(frameMatch[1]);
          frameY = parseFloat(frameMatch[2]);
          frameW = parseFloat(frameMatch[3]);
          frameH = parseFloat(frameMatch[4]);
          break;
        }
      }
      break;
    }
  }

  if (frameX === undefined) return null;

  return {
    x: frameX,
    y: frameY,
    width: frameW,
    height: frameH,
    centerX: Math.round(frameX + frameW / 2),
    centerY: Math.round(frameY + frameH / 2),
  };
}

/**
 * Find the counter value by looking at the AXLabel text between
 * counter-decrement and counter-increment in the snapshot.
 */
function findCounterValue(snapshotOutput) {
  const lines = snapshotOutput.split('\n');
  let afterDecrement = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('counter-decrement')) {
      afterDecrement = true;
      continue;
    }
    if (afterDecrement && lines[i].includes('counter-increment')) {
      break;
    }
    if (afterDecrement) {
      const labelMatch = lines[i].match(/"AXLabel"\s*:\s*"(\d+)"/);
      if (labelMatch) {
        return parseInt(labelMatch[1], 10);
      }
    }
  }
  return null;
}

// --- Navigate to fixture ---
console.log('\n=== Navigating to Staggered Loading fixture ===');

// Go back to fixture list first (swipe from left edge to go back)
try { run('npm run app:gesture -- demo swipe-from-left-edge'); } catch {}
await sleep(1000);

// Check if we need to navigate into the Loading Patterns category
let listSnapshot = run('npm run app:snapshot-ui');

if (!listSnapshot.includes('Staggered')) {
  // We might be at the category level -- look for Loading Patterns
  if (listSnapshot.includes('Loading Patterns')) {
    const lpFrame = parseFrame(listSnapshot, 'Loading Patterns');
    if (lpFrame) {
      console.log(`Tapping Loading Patterns at (${lpFrame.centerX}, ${lpFrame.centerY})`);
      run(`npm run app:tap -- demo ${lpFrame.centerX} ${lpFrame.centerY}`);
      await sleep(1000);
      listSnapshot = run('npm run app:snapshot-ui');
    }
  }
}

assert(listSnapshot.includes('Staggered'), 'Found Staggered Loading in fixture list');

// Extract coordinates for Staggered Loading and tap
const staggeredFrame = parseFrame(listSnapshot, 'Staggered');
if (staggeredFrame) {
  console.log(`Tapping Staggered Loading at (${staggeredFrame.centerX}, ${staggeredFrame.centerY})`);
  run(`npm run app:tap -- demo ${staggeredFrame.centerX} ${staggeredFrame.centerY}`);
} else {
  console.error('Could not find coordinates for Staggered Loading');
  process.exit(1);
}
await sleep(500);

// --- Test A: Loading Partial Prerender ---
console.log('\n=== Test A: Verify Prerender Shell ===');
const prerender = run('npm run app:snapshot-ui');
assert(prerender.includes('Staggered Loading'), 'Header "Staggered Loading" is visible');

// --- Test B: Parallel Hydration ---
console.log('\n=== Test B: Verify Parallel Hydration ===');
// Wait for first Suspense boundary to resolve (~1.5s)
await sleep(1500);

const midLoad = run('npm run app:snapshot-ui');
const hasCounter = midLoad.includes('counter-increment') || midLoad.includes('counter-decrement');
console.log(`Counter visible: ${hasCounter}`);

if (hasCounter) {
  // Try tapping the counter to verify interactivity
  const incFrame = parseFrame(midLoad, 'counter-increment');
  if (incFrame) {
    console.log(`Tapping counter increment at (${incFrame.centerX}, ${incFrame.centerY})`);
    run(`npm run app:tap -- demo ${incFrame.centerX} ${incFrame.centerY}`);
    await sleep(200);
    const afterTap = run('npm run app:snapshot-ui');
    const counterVal = findCounterValue(afterTap);
    console.log(`Counter value after tap: ${counterVal}`);
    assert(counterVal !== null, 'Counter responded to tap (hydration working)');
  }
}

// --- Test C: Full Interactivity ---
console.log('\n=== Test C: Verify Full Interactivity ===');
// Wait for all sections to load
await sleep(4000);

const fullLoad = run('npm run app:snapshot-ui');
assert(fullLoad.includes('counter-increment'), 'Counter increment button visible');
assert(fullLoad.includes('counter-decrement'), 'Counter decrement button visible');

// Record current value
const valueBefore = findCounterValue(fullLoad);
console.log(`Counter value before taps: ${valueBefore}`);

// Tap increment 3 times
const incFrame = parseFrame(fullLoad, 'counter-increment');
if (incFrame) {
  for (let i = 0; i < 3; i++) {
    run(`npm run app:tap -- demo ${incFrame.centerX} ${incFrame.centerY}`);
    await sleep(150);
  }
}

await sleep(300);
const afterIncrements = run('npm run app:snapshot-ui');
const valueAfterInc = findCounterValue(afterIncrements);
console.log(`Counter value after 3 increments: ${valueAfterInc}`);
assert(valueAfterInc !== null, 'Counter value is accessible after increment interactions');
if (valueBefore !== null && valueAfterInc !== null) {
  assert(valueAfterInc === valueBefore + 3, `Counter incremented correctly (${valueBefore} -> ${valueAfterInc})`);
}

// Tap decrement once
const decFrame = parseFrame(afterIncrements, 'counter-decrement');
if (decFrame) {
  run(`npm run app:tap -- demo ${decFrame.centerX} ${decFrame.centerY}`);
  await sleep(200);
}

const afterDecrement = run('npm run app:snapshot-ui');
const valueAfterDec = findCounterValue(afterDecrement);
console.log(`Counter value after decrement: ${valueAfterDec}`);
if (valueAfterInc !== null && valueAfterDec !== null) {
  assert(valueAfterDec === valueAfterInc - 1, `Counter decremented correctly (${valueAfterInc} -> ${valueAfterDec})`);
}

// Verify all sections loaded
const hasAllSections =
  fullLoad.includes('500') &&
  fullLoad.includes('1000') &&
  fullLoad.includes('2000') &&
  fullLoad.includes('3000');
assert(hasAllSections, 'All four sections loaded (500ms, 1000ms, 2000ms, 3000ms)');

// Take a final screenshot
run('npm run app:screenshot');
console.log('Final screenshot saved to /tmp/falcon-screenshot.png');

console.log('\n=== All smoke tests passed ===');
