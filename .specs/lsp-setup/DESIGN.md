# Design

## Реализуемые требования

- [FR-1: Extension Manifest](FR.md#fr-1-extension-manifest-feature1)
- [FR-2: LSP Server Installation](FR.md#fr-2-lsp-server-installation-feature2-feature3-feature4)
- [FR-3: Runtime Detection](FR.md#fr-3-runtime-detection-feature5)
- [FR-4: Plugin Installation](FR.md#fr-4-claude-code-plugin-installation-feature7)
- [FR-5: LSP Usage Rule](FR.md#fr-5-lsp-usage-rule-feature6)
- [FR-6: ENABLE_LSP_TOOL](FR.md#fr-6-enable_lsp_tool-environment-variable-feature1)
- [FR-7: Verification Report](FR.md#fr-7-verification-report-feature2-feature3-feature4)
- [FR-8: Idempotent Installation](FR.md#fr-8-idempotent-installation-feature1)
- [FR-9: Update Support](FR.md#fr-9-update-support-feature1)

## Архитектура

### Компоненты

```
extensions/lsp-setup/
├── extension.json                    # Manifest (FR-1, FR-6)
├── claude/
│   └── rules/
│       └── lsp-usage.md              # LSP usage instructions (FR-5)
└── tools/
    └── lsp-setup/
        ├── setup-lsp.ts              # postInstall/postUpdate script (FR-2, FR-3, FR-4, FR-7, FR-8, FR-9)
        ├── verify-lsp.ts             # Standalone verification (FR-7)
        └── plugins/                  # Fallback local plugins (FR-4)
            ├── marketplace.json
            ├── vtsls-lsp/
            │   ├── .claude-plugin/
            │   │   └── plugin.json
            │   └── .lsp.json
            ├── json-lsp/
            │   ├── .claude-plugin/
            │   │   └── plugin.json
            │   └── .lsp.json
            ├── pyright-lsp/
            │   ├── .claude-plugin/
            │   │   └── plugin.json
            │   └── .lsp.json
            └── csharp-lsp/
                ├── .claude-plugin/
                    └── plugin.json
                └── .lsp.json
```

### Setup-скрипт Flow (setup-lsp.ts)

```
1. Check Node.js >= 16 (fail-fast if missing)
2. Check dotnet version (optional, skip C# if missing/old)
3. For each LSP server:
   a. Check if binary already in PATH (idempotent)
   b. If missing → install via npm/dotnet
   c. Record result: installed | already_installed | skipped | failed
4. Install Claude Code plugins:
   a. Try: claude plugin marketplace add Piebald-AI/claude-code-lsps
   b. If success → claude plugin install for each server
   c. If fail → create local plugins from bundled templates
   d. Install from local
5. Print verification report table
```

### extension.json Structure

```json
{
  "name": "lsp-setup",
  "version": "1.0.0",
  "description": "Automated LSP server setup for Claude Code (TypeScript, Python, C#, JSON)",
  "platforms": ["claude"],
  "category": "development",
  "ruleFiles": {
    "claude": [
      "extensions/lsp-setup/claude/rules/lsp-usage.md"
    ]
  },
  "tools": {
    "lsp-setup": "tools/lsp-setup"
  },
  "toolFiles": {
    "lsp-setup": [
      "tools/lsp-setup/setup-lsp.ts",
      "tools/lsp-setup/verify-lsp.ts",
      "tools/lsp-setup/plugins/marketplace.json",
      "tools/lsp-setup/plugins/vtsls-lsp/.claude-plugin/plugin.json",
      "tools/lsp-setup/plugins/vtsls-lsp/.lsp.json",
      "tools/lsp-setup/plugins/json-lsp/.claude-plugin/plugin.json",
      "tools/lsp-setup/plugins/json-lsp/.lsp.json",
      "tools/lsp-setup/plugins/pyright-lsp/.claude-plugin/plugin.json",
      "tools/lsp-setup/plugins/pyright-lsp/.lsp.json",
      "tools/lsp-setup/plugins/csharp-lsp/.claude-plugin/plugin.json",
      "tools/lsp-setup/plugins/csharp-lsp/.lsp.json"
    ]
  },
  "envRequirements": [
    {
      "name": "ENABLE_LSP_TOOL",
      "required": false,
      "default": "1",
      "description": "Enable LSP tool in Claude Code for semantic code navigation [VERIFIED: official docs, Piebald-AI README]"
    }
  ],
  "postInstall": {
    "command": "npx tsx .dev-pomogator/tools/lsp-setup/setup-lsp.ts --install",
    "interactive": true,
    "skipInCI": true
  },
  "postUpdate": {
    "command": "npx tsx .dev-pomogator/tools/lsp-setup/setup-lsp.ts --update",
    "interactive": false,
    "skipInCI": true
  }
}
```

### LSP Server Registry (внутри setup-lsp.ts)

```typescript
interface LspServer {
  name: string;
  language: string;
  installCmd: string;
  binary: string;
  runtime: 'node' | 'dotnet';
  minRuntimeVersion?: number;
  args: string[];
  extensionToLanguage: Record<string, string>;
}

const LSP_SERVERS: LspServer[] = [
  {
    name: 'vtsls',
    language: 'TypeScript/JavaScript',
    installCmd: 'npm install -g @vtsls/language-server typescript',
    binary: 'vtsls',
    runtime: 'node',
    args: ['--stdio'],
    extensionToLanguage: {
      '.ts': 'typescript', '.tsx': 'typescriptreact',
      '.js': 'javascript', '.jsx': 'javascriptreact',
      '.mts': 'typescript', '.cts': 'typescript',
      '.mjs': 'javascript', '.cjs': 'javascript'
    }
  },
  {
    name: 'pyright',
    language: 'Python',
    installCmd: 'npm install -g pyright',
    binary: 'pyright-langserver',
    runtime: 'node',
    args: ['--stdio'],
    extensionToLanguage: { '.py': 'python', '.pyi': 'python' }
  },
  {
    name: 'json',
    language: 'JSON',
    installCmd: 'npm install -g vscode-langservers-extracted',
    binary: 'vscode-json-languageserver',
    runtime: 'node',
    args: ['--stdio'],
    extensionToLanguage: { '.json': 'json', '.jsonc': 'jsonc' }
  },
  {
    name: 'csharp',
    language: 'C#',
    installCmd: 'dotnet tool install -g csharp-ls',
    binary: 'csharp-ls',
    runtime: 'dotnet',
    minRuntimeVersion: 10,
    args: [],
    extensionToLanguage: { '.cs': 'csharp' }
  }
];
```

### Reuse Plan

| Что переиспользуем | Откуда | Зачем |
|---------------------|--------|-------|
| envRequirements injection | `src/installer/claude.ts` (существует) | ENABLE_LSP_TOOL=1 автоматически |
| postInstall hook execution | `src/installer/extensions.ts` (существует) | Запуск setup-lsp.ts |
| Extension manifest format | `extensions/auto-commit/extension.json` | Шаблон для envRequirements |
| Tool installation flow | `src/installer/claude.ts` (существует) | Copy tools → .dev-pomogator/tools/ |
| Rule installation flow | `src/installer/claude.ts` (существует) | Copy rules → .claude/rules/ |

## BDD Test Infrastructure

**Classification:** TEST_DATA_NONE

**Evidence:** Тесты lsp-setup проверяют результат установки (файлы на диске, бинари в PATH) — stateless проверки. Не создают/изменяют данные через API/БД. Не требуют cleanup.

**Verdict:** Hooks/fixtures не требуются. Тесты stateless.
