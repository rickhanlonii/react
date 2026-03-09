# Plan: Improve tools and instructions for trace workflow

## Context

Running a performance trace with a tap interaction took ~15 minutes and produced a wrong diagnosis. The conversation had 8 distinct slowdowns:

1. **Wrong tap syntax** — CLI docs omit required `demo` target for commands with positional args
2. **Unnecessary massive snapshot** — used MCP snapshot instead of `snapshot-ui --filter`
3. **Screenshot confusion** — `npm run app:screenshot` output wasn't the actual screen
4. **Iterative trace parsing** — should have parsed trace file smartly on first attempt
5. **Heavyweight Explore agent** — overkill for targeted code search
6. **Tried evaluate_script 5 times** — MCP devtools can't eval JSC, tool shouldn't be exposed
7. **Didn't check if app was alive** — app had crashed; never verified
8. **Read unnecessary large files** — full 687-line file when only a few lines mattered

## Changes Made

1. Removed `consoleTools` and `scriptTools` from MCP tool aggregation in `tools/devtools-mcp/src/tools/tools.ts`
2. Fixed all CLI reference commands with positional args to include `demo` target
3. Added Performance Tracing section to CLI reference
4. Updated CLAUDE.md JS runtime debugging to use app log capture instead of MCP tools
5. Added app health check guidance to CLAUDE.md Debugging Rules
6. Fixed tap syntax in CLAUDE.md UI Automation section
