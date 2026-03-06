---
name: trace
description: Capture a performance trace around a UI interaction (tap, scroll, etc.) and analyze the results. Use when profiling interactions, measuring render/commit durations, or debugging performance.
argument-hint: <interaction> e.g. "tap stress-inc-0", "tap +1 All button", "scroll down"
user_invocable: true
---

# Performance Trace + Interaction

Captures a performance trace around a UI interaction and analyzes the results. Completes in 4 rounds.

## Arguments

`$ARGUMENTS` — describes the interaction to trace. Examples:
- `tap stress-inc-0` — tap an element by ID
- `tap the increment button on Item 0` — tap by description (will find ID first)
- `scroll down` — gesture interaction
- (no args) — just orient and let the user decide

## Workflow

### Round 1 — Orient (parallel)

Run these in a single parallel tool call:

```bash
npm run app:screenshot 2>&1
```
```bash
npm run app:snapshot-ui -- --filter AXUniqueId 2>&1 | grep -v "^\[" | grep -v "^>" | grep -v "^$" | sort -u
```

Read `/tmp/falcon-screenshot.png` to see the screen. Use the `AXUniqueId` list to identify tap targets.

If `$ARGUMENTS` specifies a target, match it to an ID. If no args, show the user the screenshot and available IDs.

### Round 2 — Record + Interact (sequential)

Start the trace, perform the interaction, wait briefly:

```
performance_start_trace(autoStop=false, reload=false)
```

Then perform the interaction:
- **Tap**: `npm run app:tap -- demo "id:<target-id>"`
- **Scroll/gesture**: `npm run app:gesture -- demo <preset>`
- **Swipe**: `npm run app:swipe -- demo <x1> <y1> <x2> <y2>`

Then wait 1 second:
```bash
sleep 1
```

### Round 3 — Collect (parallel)

Stop the trace and verify the interaction in a single parallel call:

```
performance_stop_trace(filePath=/tmp/falcon-trace.json)
```
```bash
npm run app:screenshot 2>&1
```

Read the screenshot to confirm the interaction worked (e.g., counter incremented).

### Round 4 — Analyze

Parse the trace file for lifecycle durations and event breakdown:

```bash
python3 -c "
import json
with open('/tmp/falcon-trace.json') as f:
    data = json.load(f)
events = [e for e in data.get('traceEvents', []) if e.get('cat') == 'blink.user_timing']
print('=== Lifecycle ===')
for name in ['Update','Render','Commit','Resolve Tree','Waiting for Paint']:
    b = [e for e in events if e.get('name')==name and e.get('ph')=='b']
    en = [e for e in events if e.get('name')==name and e.get('ph')=='e']
    if b and en: print('  %s: %.2f ms' % (name, (en[0]['ts']-b[0]['ts'])/1000))
print()
from collections import Counter
counts = Counter(e.get('name','?') for e in events)
print('=== Events (top 15) ===')
for name, count in counts.most_common(15): print('  %s: %d' % (name, count))
print()
print('Total user_timing events: %d' % len(events))
"
```

Present the results to the user.

## Rules

- **Never use MCP `take_snapshot`** for finding tap targets — use `app:snapshot-ui -- --filter AXUniqueId`
- **Never start log capture** (`log-start`) just for tracing — it relaunches the app and adds delay
- **Always parallelize** independent calls (orient, collect rounds)
- **Go straight to `AXUniqueId`** — don't search by `AXLabel`, `AXIdentifier`, or button type
- **If the trace has zero `blink.user_timing` events**, the app likely crashed — take a screenshot to verify, rebuild if needed
- **Trace file** is always saved to `/tmp/falcon-trace.json`
