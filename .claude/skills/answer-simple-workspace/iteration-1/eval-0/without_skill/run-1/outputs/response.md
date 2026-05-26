I don't recognize `/answer-simple` as a built-in slash command — it's not part of the standard Claude Code command set (like `/help`, `/clear`, `/config`, etc.), and I don't see a custom command definition for it in this project's `.claude/commands/` directory that I can resolve right now.

That said, I can take a stab at what you're asking literally. You quoted:

> Wave 14 (gates+OpenRouter) ПЕРЕД Wave 11 — Keep / Swap / Parallel?

This reads like a roadmap-sequencing question — you've got a Wave 14 (which bundles "gates" + OpenRouter integration) currently scheduled to run **before** Wave 11, and you want a recommendation: keep that ordering, swap them, or run them in parallel.

I can't give you a grounded answer without more context. A few things I'd need to know:

1. **What's in Wave 11?** You named Wave 14's contents but not Wave 11's. The decision hinges entirely on whether Wave 11 produces something Wave 14 consumes (or vice versa).
2. **What are "gates" here?** CI gates? Spec/audit gates? Permission gates? Each has different blast radius.
3. **Where does this roadmap live?** Is there a planning doc (`.specs/`, a roadmap MD, a Jira board) I should read first? If you point me at it I can give a real recommendation instead of guessing.
4. **What's the constraint driving the question?** Dependency order, parallelism capacity, risk isolation, or just calendar pressure?

If you meant to invoke an actual project command called `/answer-simple` and it's not loading, the likely causes are:
- The command file doesn't exist under `.claude/commands/answer-simple.md` (project) or `~/.claude/commands/answer-simple.md` (user)
- The skill/command exists but hasn't been picked up this session — try `/help` to list what's actually registered
- It's defined in an extension that isn't installed in this project

Want me to (a) search the repo for any `answer-simple` definition and tell you where it lives, or (b) just answer the Wave 14-vs-Wave 11 question once you give me the context above?
