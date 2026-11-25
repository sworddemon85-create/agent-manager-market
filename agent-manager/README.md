# Agent Manager (智能体管家)

A ZCode plugin for **managing subagents**: inventory, create, edit and validate agent definition files — and dispatch one task to **multiple agents in parallel**, then merge their reports.

[中文说明](./README_CN.md)

## What you get

| Component | Name | Purpose |
|---|---|---|
| Skill | `agent-registry` | Agent definition butler: inventory, view, create, edit, validate or retire agent definition files (user scope `~/.zcode/agents/` and workspace scope `<workspace>/.zcode/agents/`). Validation reports problems; it never edits files on its own. |
| Skill | `agent-team` | Multi-agent dispatcher: split a task → pick agents by their descriptions → dispatch independent subtasks in parallel in a single message → merge results into one report. |
| Commands | `/agent-list` `/agent-show` `/agent-new` `/agent-check` `/agent-team` | Quick access to inventory / view / create / validate / dispatch. |
| Agents (bundled templates) | `doc-writer` `test-runner` `issue-triage` | Ready-to-dispatch agents: documentation writing, test execution with failure analysis, and issue triage. |
| Hook | SessionStart | Prints a compact inventory of locally defined agents at every session start. |

## Install

1. In ZCode open **Plugin Marketplace** and search for **Agent Manager** (official marketplace), or **Add → Add Plugin Marketplace** with `sworddemon85-create/agent-manager-market` to install from the author's mirror.
2. Find **Agent Manager** → **Install**, then restart ZCode.

## Try it

- `/agent-list` — list all your agents, flagging name conflicts across scopes
- "Create an agent named `doc-writer` that maintains project documentation" — walks the creation flow and writes a spec-compliant definition
- `/agent-team 审查 src 目录的代码并总结问题` — dispatches reviewers in parallel and returns a merged report

## Behavior and side effects (disclosure)

- **File writes**: the create/edit flows write Markdown agent definition files under `~/.zcode/agents/` or `<workspace>/.zcode/agents/`. Validation and inventory are read-only.
- **Command execution**: the SessionStart hook runs a bundled read-only Node.js script (`scripts/inventory.mjs`) that scans user, workspace and bundled definition directories; dispatch flows invoke subagents via ZCode's Agent tool.
- **Hook**: `SessionStart` only. Its output is injected as session context and it always exits 0, so it never blocks startup.
- **Network**: independent model workers send supplied context to the configured model provider; native dispatch adds no separate provider calls. The bundled `issue-triage` agent may use WebFetch when you ask it to verify external references.
- **Bundled agents act with their own tools**: `doc-writer` writes project documentation files and `test-runner` runs project test commands when dispatched — send them only tasks whose effects you accept.
- **MCP server included; independent mode requires provider credentials. No telemetry.**
- **Windows note**: the hook and MCP server require Node.js 20.3+ on PATH.

## Agent definition format

Each agent is one Markdown file: YAML frontmatter plus a system-prompt body.

```markdown
---
name: "crawl"
description: "One-line responsibility; the main session dispatches based on this"
color: yellow
injectAgentsMd: true
tools: Read, Bash
---

Body = the agent's system prompt (role, duties, constraints, output format).
```

## License

[MIT](./LICENSE)

Independent model teams (0.2.0): Node.js 20.3+ is required. Set AGENT_API_BASE, AGENT_API_KEY and AGENT_MODEL in the host environment. The bundled MCP team_run tool and runtime/team-cli.mjs support concurrent text-only workers with dependencies. Context is sent to the configured provider and may incur charges. Workers cannot edit files or execute tests; use native host agents for those operations. SessionStart now uses scripts/inventory.mjs and emits structured JSON context; Bash is not required for inventory.
