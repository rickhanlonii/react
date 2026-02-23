#!/bin/bash
# PermissionRequest hook: auto-deny all permission requests and log them for review.
# Logs to .claude/permission-requests.md as a markdown table.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // .toolName // "unknown"')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // .input // {}')
LOG_FILE="$CLAUDE_PROJECT_DIR/.claude/permission-requests.md"

# Extract the permission rule snippet based on tool type
if [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$TOOL_INPUT" | jq -r '.command // ""' | head -1)
  # Get the first word (the executable)
  FIRST_WORD=$(echo "$CMD" | awk '{print $1}')
  RULE="Bash($FIRST_WORD:*)"
  DISPLAY="$CMD"
elif [ "$TOOL" = "Edit" ] || [ "$TOOL" = "Write" ]; then
  FILE=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""')
  RULE="$TOOL"
  DISPLAY="$TOOL $FILE"
else
  RULE="$TOOL"
  DISPLAY="$TOOL"
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Create the file with header if it doesn't exist
if [ ! -f "$LOG_FILE" ]; then
  cat > "$LOG_FILE" << 'HEADER'
# Permission Requests

Denied permission requests logged by the PermissionRequest hook. Copy a rule to `allow` or `deny` in `.claude/settings.json`.

| Time | Tool | Command | Allow Rule | Deny Rule |
|------|------|---------|------------|-----------|
HEADER
fi

# Escape pipes in the display string for markdown table
DISPLAY_ESCAPED=$(echo "$DISPLAY" | tr '\n' ' ' | sed 's/|/\\|/g' | cut -c1-80)

# Append the row
echo "| $TIMESTAMP | $TOOL | $DISPLAY_ESCAPED | \`\"$RULE\"\` | \`\"$RULE\"\` |" >> "$LOG_FILE"

# Deny the request via JSON on stdout (exit 0 required for JSON processing)
# The reason is shown to the agent so it can self-correct
REASON="Auto-denied by permission hook. This is logged. Use an allowed tool instead (do not use random bash commands). You may also check your available skills, and npm scripts (already allowed): npm test, npm run test:swift, npm run test:fantom, npm run dev, npm run dev:e2e, npm run build:e2e, npm run e2e:check, npm run e2e:test, npm run e2e:test -- <name>. Available skills: /build-demo, /build-e2e, /test-unit, /test-e2e, /e2e."

cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "deny",
      "message": $(echo "$REASON" | jq -Rs .)
    }
  }
}
EOF
exit 0
