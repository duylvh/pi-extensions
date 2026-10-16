---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /skill:swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

## Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
4. Pick the worker model from the `swarm workers` line in `~/.pi/agent/pstack/models.json`. If the role table or that line is missing, use `inherit-parent`. For `auto` or `inherit-parent`, omit `model` so the workers run on the parent model. If the `Agent` tool rejects a slug, use `inherit-parent` (omit `model`) and say so. For a model race, name each arm's model up front. Pick each subagent's `thinking` level for the job, per the Subagents section of the **poteto-mode** skill.
5. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Spawn all N workers in one message with `subagent_type: "general-purpose"`, `isolation: "worktree"`, `run_in_background: true`, and the step 4 model, left unset for `auto` or `inherit-parent`. Use `isolation: "off"` only when the worker needs this checkout's uncommitted state or something else on the user's computer.

When a worker must start from a non-default branch, name that branch and its SHA in the brief and have the worker check it out first.

**Worktree safety.** `isolation: "worktree"` takes effect only when `pi-subagents` has worktrees enabled. Otherwise `Agent` drops the field without an error and the worker shares this checkout. Before spawning parallel writers, inspect the live `Agent` schema for an `isolation` input. If it is absent, run `git worktree add <path> -b <branch>` per writer and pass that exact path in the prompt. Before any edit, each writer must verify its assigned worktree with `pwd` and `git branch --show-current` and stop on a path or branch mismatch. Use absolute file paths under that worktree and `git -C <path>` for Git commands. If separate writer worktrees cannot be verified, do not fan out writers. Topology operations (chain rebases, force-pushes, base retargets) run only in a verified separate worktree, even when serial, never in the coordinator's checkout. Never change user settings or fall back to the shared checkout to make a fan-out fit. Read-only fan-out needs no isolation.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
