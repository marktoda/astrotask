# Claude Agent Guide – Astrolabe

> **Audience:** This document is for Anthropic Claude (or any external LLM) wired up to the Astrolabe repository.  It explains how to become a helpful, context-aware pair-programmer without violating project guards.

[AGENTS.md](mdc:AGENTS.md) is your north-star for architecture, tech-stack & conventions.  **Read it first.**

---

## 1 · Principles

1. **Local-First First.** Assume the developer may be offline.  Prefer solutions that work with the local SQLite replica and don't rely on always-on cloud infrastructure.
2. **Type Safety or Bust.**  All runtime data **must** flow through Zod schemas and compile under `pnpm type-check`.
3. **One MCP Call → Full Context.**  When you need project information, call `getTaskContext` or the MCP tools listed in the rules instead of spelunking arbitrary files.
4. **Eager Logging.**  Append findings to the relevant Task Master subtask with `update_subtask` as you go (see dev_workflow rule).
5. **No `any`, No `console.log`.** Biome rules will shout; avoid fighting them.

---

## 2 · Quick-Start Prompt Template

```text
You are Claude, an AI engineer working on Astrolabe.
Goal: <state the small, specific goal in one sentence>
Relevant task ID: <id or none>

Constraints:
- Adhere to conventions in AGENTS.md (TypeScript strict, Zod, Biome).
- If code change: provide explicit diff or patch chunks only.
- After thinking, either:
  • propose a patch (use correct file path & minimal diff), or
  • call an MCP tool (see taskmaster.mdc), or
  • ask a **single** clarifying question.

Respond in markdown.
```

---

## 3 · Common Workflows

| Need… | Prefer | Example |
| --- | --- | --- |
| Project status | `next_task` MCP tool | "show me the next task" |
| Append research | `update_subtask` | id=`3.2`, prompt=`Found better CRDT lib…` |
| Add code | Diff via `edit_file` | target=`packages/core/src/database/store.ts` |
| Generate subtasks | `expand_task` | id=`7`, num=`5`, research=`true` |

For full list, see [dev_workflow.mdc](mdc:.cursor/rules/dev_workflow.mdc).

---

## 4 · Prompt Anti-Patterns

❌ *"Write a full file from scratch"*  → Too much boilerplate & risk of drift.  **Prefer surgical diffs.**

❌ *"Do X and Y and Z in one go"* → Split into discrete steps; log progress between them.

❌ *Long speculative essays* → Keep to actionable reasoning and next action.

---

## 5 · Useful Links

- AGENTS overview: [AGENTS.md](mdc:AGENTS.md)
- Task Workflow rule: [dev_workflow.mdc](mdc:.cursor/rules/dev_workflow.mdc)
- Taskmaster reference: [taskmaster.mdc](mdc:.cursor/rules/taskmaster.mdc)
- Self-improvement guide: [self_improve.mdc](mdc:.cursor/rules/self_improve.mdc)
- Cursor rule format: [cursor_rules.mdc](mdc:.cursor/rules/cursor_rules.mdc)

---

**Happy hacking, Claude!**  Stay concise, stay safe, and always reference the stars (a.k.a. the rules). 🌌