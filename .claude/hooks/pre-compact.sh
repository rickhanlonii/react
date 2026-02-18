#!/bin/bash
# PreCompact hook: write compaction marker before context is compacted.
# Agents write state continuously, so this is a safety net.
mkdir -p "$CLAUDE_PROJECT_DIR/docs/plans/agent-state"
echo "Compacted at $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$CLAUDE_PROJECT_DIR/docs/plans/agent-state/COMPACTED"
exit 0
