# Optional Claude Code hooks

The portable path (pi and Claude Code) is the workflow in SKILL.md, ending
with `svs finish`. In Claude Code, two hooks can run the same commands
automatically. They act only while a task is open (`svs start` … `svs finish`).

- `PostToolUse` on `Edit|Write`: runs `svs verify` on the edited file when it is in scope; a failure is fed back to the model.
- `Stop`: runs `svs finish`; a failure blocks the end of the turn once (then lets the user read `report.md`).

Add to `.claude/settings.json` (project) or `~/.claude/settings.json` (account),
replacing `<skill-dir>` with the absolute path of the installed skill:

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "node <skill-dir>/scripts/svs.mjs hook post-tool-use" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node <skill-dir>/scripts/svs.mjs hook stop" }] }
    ]
  }
}
```

Hooks never replace `svs finish`: without them the workflow is identical.
