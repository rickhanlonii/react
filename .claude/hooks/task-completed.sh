#!/bin/bash
# TaskCompleted hook: quality gate for fixer agents.
# Runs unit tests before allowing fixers to mark tasks complete.
INPUT=$(cat)
TEAMMATE=$(echo "$INPUT" | jq -r '.teammate_name // empty')

# Only gate fixer agents
if [[ "$TEAMMATE" == *"fixer"* ]]; then
  cd "$CLAUDE_PROJECT_DIR" || exit 0
  if ! npm test --silent 2>&1; then
    echo "Unit tests failing. Fix tests before completing this task." >&2
    exit 2
  fi
fi

exit 0
