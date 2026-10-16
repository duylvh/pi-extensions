# @zenspc/pi-pstack

pstack for Pi: rigorous agent workflows you can parallelize with confidence. Ported from the Cursor pstack plugin.

This is the `duylvh/pi-extensions` fork. It tracks cursor/plugins `pstack` **0.15.25** at commit `f713f14203cd6420cec13cd7c55c32d598dbab68` and keeps the `@zenspc` package scope so existing settings still resolve. The version `0.7.0-duylvh.1` tells it apart from the npm release. The pin lives in [`scripts/upstream-pin.json`](scripts/upstream-pin.json).

If you want to go fast, go deep first. pstack helps you write less, but higher quality code. It gives you fearless parallelism: when an agent goes deep and writes good, verifiable code, you can parallelize with confidence. Start multiple agents with `poteto-mode` and trust they will apply rigorous engineering principles to their work.

## Install

```bash
git clone https://github.com/duylvh/pi-extensions /path/to/fork
pi install /path/to/fork/packages/pi-pstack
```

A path install is not copied, so `git pull` in the clone updates it. Restart Pi or `/reload`.
Remove any `npm:@zenspc/pi-pstack` entry from your Pi settings first, because two copies of the same skills collide.

Requires [`@tintinweb/pi-subagents`](https://www.npmjs.com/package/@tintinweb/pi-subagents) for the `Agent` tool behind `poteto-agent`, `comment-sicko`, and the workflow fan-outs (`how`, `why`, `arena`, `swarm`, `interrogate`, `reflect`). The package declares its agents through `pi.subagents.agents` in `package.json`.

## Get started

1. Run `/setup-pstack` once to pick which models each role uses (optional; every role inherits the parent session model otherwise).
2. Use `/poteto-mode` for sticky Poteto Mode. It stays on until `/poteto-mode off`. `/skill:poteto-mode` also enables it.
3. Run `/pstack off` to hide even the four Discoverable skills (`how`, `why`, `unslop`, `typescript-best-practices`) from the Skill catalog.
   Off persists in `~/.pi/agent/pstack/models.json`.
   `/skill:<name>` keeps working.
   `/pstack on` restores those four, not all 54.

That is it.
The other skills are Hidden; the mode skill uses them as needed.

## What you get

- **54 skills**, including:
  - `poteto-mode`: the main entry point. Reads your request, matches one of 23 playbooks (bug fix, perf, feature, refactoring, investigation, shipping, orchestrate, autopilot, and more), copies its steps in verbatim, and routes to the other skills as steps fire.
  - Workflow skills: `how`, `why`, `recall`, `blast-radius`, `architect`, `arena`, `swarm`, `interrogate`, `reflect`, `teach`, `tdd`, `no-comments`, `unslop`, `deslop`, `bro`, `figure-it-out`, `show-me-your-work`, `create-verification-skill`, `maintain-verification-skill`, `automate-me`, `technical-writing`, `typescript-best-practices`, `poteto-help`, `ketchup`, `correct`, `sharpen`, `in-your-own-words`, `benchmark-checklist`.
  - 24 principle skills (`principle-laziness-protocol`, `principle-model-the-domain`, `principle-prove-it-works`, ...), one rule each, indexed inline by `poteto-mode`.
- **2 subagents** (loaded by `pi-subagents`):
  - `poteto-agent`: runs poteto's style end to end. Reads `poteto-mode` in full before any work.
  - `comment-sicko`: read-only comment reviewer that savors deletion. Usually invoked through the `no-comments` skill.
- **Bundled scripts**: `poteto-mode/scripts/` ships the `orch` coordination CLI (orchestrate playbook) and the `watch-pr` watcher (babysit playbook). Both run under [bun](https://bun.sh).

## Model roles

Per-role model choices live in `~/.pi/agent/pstack/models.json`. Run `/setup-pstack` to write it. The extension injects the role table only when a role has a real model slug. Default inherit-all injects nothing. `inherit-parent` or `auto` runs on the parent session model.

## Differences from the Cursor plugin

- Hidden skills set `disable-model-invocation: true`, so they stay out of the Skill catalog.
  `/skill:name` still loads the Skill body.
  The four Discoverable skills are `how`, `why`, `unslop`, and `typescript-best-practices`.
- Slash commands are `/skill:<name>` instead of `/name`.
- Subagent delegation uses the `Agent` tool from `pi-subagents` (`Agent({ subagent_type, prompt, model, thinking, run_in_background, ... })`, with `get_subagent_result` and `steer_subagent`) instead of Cursor's Task tool. This package does not ship a replacement tool.
  - Cursor's readonly spawn becomes a read-only instruction in the prompt on a `general-purpose` agent, because `Agent` has no readonly flag. Cursor's Ask mode warning becomes `isolated: true`, which strips MCP tools.
  - Cursor cloud agents become background agents with `isolation: "worktree"`. `pi-subagents` drops that field without an error when worktrees are disabled, so the generated instructions check the live `Agent` schema first. Without automatic isolation, create and verify real `git worktree`s before writers edit. Never run parallel writers in one checkout.
  - Cursor's per-slug reasoning budget becomes the `Agent` `thinking` input (`off` to `max`). The models file stores no budget.
- Questions use `ask_user`, not `AskQuestion`. The tool comes from [`@mrclrchtr/supi-ask-user`](https://www.npmjs.com/package/@mrclrchtr/supi-ask-user), which the prompts depend on. This package does not install or ship it.
- Session transcripts live under `~/.pi/agent/sessions/` instead of `~/.cursor/projects/`. Files are grouped by cwd slug (`--<cwd>--`, absolute cwd with `/` replaced by `-`), one `<timestamp>_<id>.jsonl` per session.
- `poteto-help` is hand-written for Pi. It covers the sticky mode, `/pstack`, and `/setup-pstack`, and has no Custom Mode or guide-page links.
- The benny automation pack is not ported; it depends on Cursor automations. Model roles live in `~/.pi/agent/pstack/models.json`, written by `/setup-pstack` and injected only when a role has a real model slug.
- `make-bot-ui` is not ported. It is Cursor Grok Bot / routine webhook UI.

## Syncing from upstream

`scripts/reground-from-cursor.mjs` regenerates the skills from a cursor/plugins checkout. `CLASS_RULES` decides which files are copied, adapted, Pi-owned, or never copied, and `SEAMS` rewrites Cursor constructs into Pi ones.

```bash
git clone https://github.com/cursor/plugins /tmp/cursor-plugins
git -C /tmp/cursor-plugins checkout f713f14203cd6420cec13cd7c55c32d598dbab68
node scripts/reground-from-cursor.mjs --from /tmp/cursor-plugins/pstack --to . --dry-run
node scripts/reground-from-cursor.mjs --from /tmp/cursor-plugins/pstack --to .
PSTACK_UPSTREAM=/tmp/cursor-plugins/pstack npm test
```

A second run on the same pin changes no byte. Hand-edited Pi files are `pi-only` in `CLASS_RULES`: `setup-pstack`, `poteto-help`, `deslop`, `check-plan.test.mjs`, and `bun.lock`, plus the files under `agents/` and `extensions/`.

## License

MIT
