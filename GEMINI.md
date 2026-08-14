# Gemini CLI

This project uses `AGENTS.md` as the agent instruction file.

If your Gemini CLI does not pick it up automatically, set `.gemini/settings.json`:

```json
{ "context": { "fileName": "AGENTS.md" } }
```

Skills: copy `skills/agent-relay` into your Gemini skills directory, or keep using the `relay` CLI from the shell (Gemini is good at that).
