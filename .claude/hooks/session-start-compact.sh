#!/bin/bash
# SessionStart hook (compact matcher): inject recovery context after compaction.
MARKER="$CLAUDE_PROJECT_DIR/docs/plans/agent-state/COMPACTED"
if [ -f "$MARKER" ]; then
  TIMESTAMP=$(cat "$MARKER")
  cat <<EOF
You were orchestrating a react-dom-native QA agent team. Context was compacted ($TIMESTAMP).
To recover:
1. Read docs/plans/agent-team-state.md for overall progress
2. Read docs/plans/agent-state/*.md for per-agent state
3. Invoke the /team-orchestrator skill to rebuild the team and continue
EOF
  rm -f "$MARKER"
fi
exit 0
