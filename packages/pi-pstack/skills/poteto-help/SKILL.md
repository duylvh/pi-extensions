---
name: poteto-help
description: Guides users through pstack setup, /poteto-mode, and picking the skill, playbook, or principle for a task. Type /skill:poteto-help with a question.
disable-model-invocation: true
---

# Poteto help

Answer the user's question about pstack, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a pstack run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use pstack to fix this bug", is not a help question. Read [`poteto-mode`](../poteto-mode/SKILL.md), do the work under it, and mention once that `/poteto-mode` keeps it on for the whole session.

This file maps questions to the skills that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The package [README](../../README.md) covers install and what differs from the upstream plugin.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with `ask_user` and these options, then answer only the section they pick:

- Get set up
- Start a task with `/poteto-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make pstack my own

Check the state that changes the answer, and mention it only when it does:

- No `~/.pi/agent/pstack/models.json` means `/setup-pstack` hasn't run for this user, so every role runs on the parent session model.
- No `verify-*` skill or other app harness in the project means agents have no scripted way to drive the app. Mention `/skill:create-verification-skill` when the question is about proving a change works.
- No `Agent` tool in this session means the `pi-subagents` package is not installed, so the fan-out skills (`how`, `why`, `arena`, `swarm`, `interrogate`, `reflect`) and `poteto-agent` cannot spawn anything.

When the models file is missing and it matters, ask whether the user wants to pick a model for each role now. It matters when the user is new, the question is about setup or cost, or the answer depends on which models run. Ask at most once per chat. If the need is also unclear, ask both questions together. Offer two choices:

- Now: give them `/setup-pstack` to type, and answer their question too.
- Later: answer their question, and add one line saying every role keeps running on the parent model until they run `/setup-pstack`.

## Get set up

1. Install the package with `pi install` and the package path from the README, and make sure `pi-subagents` is installed too.
2. Run `/setup-pstack`. It lists the models this Pi session can use, maps one to each role, and writes `~/.pi/agent/pstack/models.json`. Each value is `inherit-parent`, `auto`, or a `provider/id` slug. Panel roles take several. The file applies from the next turn.
3. Start a real task with `/poteto-mode`, a goal, and a check that can pass or fail.

Reasoning effort has no setting in that file. The agent chooses a `thinking` level per spawn, and the user can steer it in the prompt, as in "max reasoning on the hard parts" or "keep it cheap".

Installing adds only the four discoverable skills (`how`, `why`, `unslop`, `typescript-best-practices`) to the model's skill list. Every other skill is hidden, so the user types `/skill:<name>` or `/poteto-mode` runs it. `/pstack off` hides even those four, and `/pstack on` brings them back.

If cost is the worry, say where the tokens go and how to spend fewer. pstack spends extra tokens on subagents and review panels. Rerun `/setup-pstack` and pick cheaper models. A role set to `auto` or `inherit-parent` runs on the session's model, which saves tokens when the session runs on a cheaper one. A shorter panel list runs fewer subagents, one for each entry. Save `/poteto-mode` for work that needs rigor.

## Start a task with `/poteto-mode`

`/poteto-mode` matches the task to a playbook, copies the playbook's steps into the todo list, and runs the other skills as the steps need them. A step it skips stays in the list as `skip: <reason>`. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read [`references/prompting.md`](references/prompting.md) before you help word one.

The mode is sticky:

- `/poteto-mode <task>` turns it on and sends the task. It stays on for the rest of the session, including after a restart of that session, until `/poteto-mode off`.
- `/skill:poteto-mode` also turns it on. The status line shows `pstack: poteto mode` while it is on.
- While it is on, the system prompt carries a one-line nudge to match a playbook for a new task and to skip the mode for a casual turn. Mid-chat, "new task" makes the mode match a fresh playbook.

`/poteto-mode` uses `poteto-agent` for the subagents its playbook steps spawn. To get the same style from a subagent of your own, spawn it with `Agent` and `subagent_type: "poteto-agent"`, and put the absolute path of `skills/poteto-mode/SKILL.md` in the prompt.

## Pick a skill

The default answer is `/poteto-mode`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [`/poteto-mode`](../poteto-mode/SKILL.md) |
| Check that the agent understood their goal and the problem before it starts | [`/skill:in-your-own-words`](../in-your-own-words/SKILL.md) |
| Aim a task higher before starting: more expert, more outcome-focused, not overspecified | [`/skill:sharpen`](../sharpen/SKILL.md) |
| Know how code works now, or where new code should live | [`/skill:how`](../how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [`/skill:why`](../why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [`/skill:teach`](../teach/SKILL.md) |
| Catch up on their own recent work on a topic | [`/skill:recall`](../recall/SKILL.md) |
| Catch up on what changed in this chat since their last message, in a few plain sentences and small visuals, with enough context to decide each action item | [`/skill:ketchup`](../ketchup/SKILL.md) |
| Know what a small diff could break outside itself | [`/skill:blast-radius`](../blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [`/skill:architect`](../architect/SKILL.md) |
| Get several attempts at one brief, merged into the best one | [`/skill:arena`](../arena/SKILL.md) |
| Run parallel checks over slices, or race workers, in background agents with their own worktrees | [`/skill:swarm`](../swarm/SKILL.md) |
| Have different models review a diff and try to break it | [`/skill:interrogate`](../interrogate/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [`/skill:tdd`](../tdd/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [`/skill:typescript-best-practices`](../typescript-best-practices/SKILL.md) |
| Strip comments before review, using a reviewer that didn't write them | [`/skill:no-comments`](../no-comments/SKILL.md) |
| Clean AI tells out of a diff before commit | [`/skill:deslop`](../deslop/SKILL.md) |
| Clean AI tells out of prose | [`/skill:unslop`](../unslop/SKILL.md) |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | [`/skill:technical-writing`](../technical-writing/SKILL.md) |
| Hear the last reply again in plain words | [`/skill:bro`](../bro/SKILL.md) |
| Give agents a scripted way to drive the app and prove behavior | [`/skill:create-verification-skill`](../create-verification-skill/SKILL.md) |
| Bring a verification skill and its feature map back in line with the app | [`/skill:maintain-verification-skill`](../maintain-verification-skill/SKILL.md) |
| Vet a performance number before reporting or acting on it | [`/skill:benchmark-checklist`](../benchmark-checklist/SKILL.md) |
| Run a large or cross-cutting change, or one to review after stepping away | [`/skill:figure-it-out`](../figure-it-out/SKILL.md) |
| Keep a decision log during a run, and review it afterward | [`/skill:show-me-your-work`](../show-me-your-work/SKILL.md) |
| Pick a model for each role | `/setup-pstack` ([skill fallback](../setup-pstack/SKILL.md)) |
| Turn their own working habits into a personal mode skill | [`/skill:automate-me`](../automate-me/SKILL.md) |
| Turn what a finished task taught into skill edits | [`/skill:reflect`](../reflect/SKILL.md) |
| Stop agents from repeating the same mistakes in this repo | [`/skill:correct`](../correct/SKILL.md) |
| Find their way around pstack | `/skill:poteto-help` |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/skill:how` explains what the code does. `/skill:why` explains the reasons. `/skill:teach` runs one or both and explains the result plainly.
- `/skill:arena` gives every worker the same brief and merges the best parts. `/skill:swarm` splits work into slices or a race and returns one report.
- `/skill:architect` implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- `/skill:interrogate` reviews the diff. `/skill:blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/skill:recall` rebuilds context across recent sessions. `/skill:ketchup` covers only this chat since the user's last message. Resuming one specific session or branch is the Session pickup playbook.
- `/skill:figure-it-out` designs one rigorous run. The Orchestrate playbook runs a program that spans days and many PRs. The Autonomous run playbook drives one task to a finish condition.

Not in this package:

- `control-cli` and `control-ui`. Use the project's own verification skill, or generate one with `/skill:create-verification-skill`.
- A loop command. Recurring wakes need a scheduler tool in the session, and authoring a skill follows the Authoring playbook.
- `make-bot-ui` and the benny automations, which depend on a hosted automation service.
- An `/orchestrate` skill. Orchestrate is a `/poteto-mode` playbook.

## Playbooks and principles

Playbooks are step lists inside `/poteto-mode`, not skills, so they have no command. Inside `/poteto-mode`, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship.
- "land the stack" runs Shipping.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs Autopilot-full. "stack them, don't ship" runs Autopilot-stack.
- "run the eval playbook" runs Eval.

Without `/poteto-mode`, a phrase such as "babysit this pr" gets whatever generic handling the session has instead of the playbook. The Playbooks section of [`poteto-mode`](../poteto-mode/SKILL.md) lists every playbook and when it applies.

pstack has no planning skill. For work that spans phases or stacked PRs, asking `/poteto-mode` for a plan runs the [Multi-phase plan playbook](../poteto-mode/playbooks/multi-phase-plan.md), which writes the plan and doesn't implement it. For a design question, the Prototype playbook or `/skill:architect` settles it in code first.

Principles are one-rule skills that `/poteto-mode` reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Typing `/skill:principle-<name>` still loads one on demand.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying | Check the status line for `pstack: poteto mode`. If it is missing, run `/poteto-mode` again. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode, or run `/poteto-mode off`. |
| A new model choice had no effect | The file from `/setup-pstack` applies from the next turn. Check that the role has a real slug, because roles left on `inherit-parent` or `auto` inject nothing. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | Only `how`, `why`, `unslop`, and `typescript-best-practices` are visible to the model. Type `/skill:<name>` for the rest, or let `/poteto-mode` run them. |
| A fan-out skill spawned nothing | Check that the `Agent` tool exists in the session. It comes from `pi-subagents`. |
| Parallel agents overwrote each other | Verify that the live `Agent` schema supports `isolation`. Give each writer a separate worktree and check its path and branch before edits. If automatic isolation is unavailable, create worktrees with `git worktree add` and use their absolute paths. Never run concurrent writers in one checkout. |
| An overnight run moved but finished nothing | The run needs a check that can pass or fail, not a duration. See the done checks in [`references/prompting.md`](references/prompting.md). |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |

For a run that drifts, [`references/prompting.md`](references/prompting.md) has one-line steers, and [`references/recipes.md`](references/recipes.md) has prompts worth copying.

## Make pstack my own

- [`/skill:automate-me`](../automate-me/SKILL.md) drafts a personal mode skill from the user's own history, to use alongside `/poteto-mode`.
- [`/skill:reflect`](../reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.
- `/poteto-mode write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [`references/recipes.md`](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.
