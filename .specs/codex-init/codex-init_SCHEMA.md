# Codex Init Schema

## Whitelist Entry

```json
{
  "pluginName": "context-menu",
  "featureSlug": "context-menu",
  "status": "Draft",
  "codexManifestPath": ".codex-plugin/plugin.json",
  "codexMarketplacePath": ".agents/plugins/marketplace.json",
  "installLauncher": "scripts/install-codex-context-menu.ps1",
  "runtimeContract": "Codex plugin install exposes only the Codex Windows Explorer context-menu launcher",
  "packageScope": {
    "skills": ["context-menu"],
    "hooks": [],
    "rules": [],
    "commands": []
  },
  "verification": {
    "method": "Integration test",
    "evidence": "real codex plugin CLI run or equivalent harness",
    "lastVerifiedAt": null
  }
}
```

### Fields

- `pluginName`: Codex-facing plugin or feature entry name.
- `featureSlug`: owning spec or feature slug.
- `status`: one of `Draft`, `In Progress`, `Supported`, `Blocked`, or `Deprecated`.
- `codexManifestPath`: path to the Codex-native `.codex-plugin/plugin.json`.
- `codexMarketplacePath`: path to the Codex marketplace catalog containing the entry.
- `installLauncher`: first-class user-facing install script for the whitelisted Codex feature.
- `runtimeContract`: short description of what must work at runtime.
- `packageScope`: installable Codex plugin surface. For `context-menu`, this is limited to the context-menu helper skill and no Claude hooks/rules/commands.
- `verification`: evidence object used before moving to `Supported`.

## Marketplace Entry

```json
{
  "name": "context-menu",
  "source": {
    "source": "local",
    "path": "./plugins/context-menu"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```

### Rules

- Codex-native manifest paths use lowercase `.codex-plugin/`.
- Marketplace paths live under `.agents/plugins/marketplace.json` unless a later Codex CLI proof justifies another path.
- A whitelist entry cannot reach `Supported` without verification evidence.
- Claude Code plugin artifacts are sibling compatibility artifacts, not substitutes for Codex-native metadata.
- The Codex `context-menu` package must not point at the full Claude skill catalog; it may expose only the context-menu skill surface.
- The user-facing Codex install path must be `scripts/install-codex-context-menu.ps1`, not a pasted internal `node -e ... bootstrap.cjs` command.
