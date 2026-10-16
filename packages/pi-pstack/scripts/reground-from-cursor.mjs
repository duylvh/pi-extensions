#!/usr/bin/env node
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DISCOVERABLE = ["how", "typescript-best-practices", "unslop", "why"];

const EXTENSION_COMMANDS = new Set(["/poteto-mode", "/setup-pstack", "/pstack"]);

const CURSOR_FRONTMATTER_KEYS = new Set(["mode", "icon", "color", "reminder", "paths"]);

const CURSOR_SLUG =
	"(?:claude|grok|gpt|composer)-[a-z0-9.]+(?:-[a-z0-9.]+)*?-(?:max|xhigh|high|medium|low)(?:-fast)?(?![a-z0-9-])";
export const CURSOR_SLUG_RE = new RegExp(`(?<![\\w-])${CURSOR_SLUG}`);
const CURSOR_DEFAULT_SLUGS = new RegExp(
	"`?" + CURSOR_SLUG + "`?(?:\\s*,\\s*`?" + CURSOR_SLUG + "`?)*",
	"g",
);

export const CLASS_RULES = [
	{ pattern: "skills/make-bot-ui/**", class: "never-copy" },
	{ pattern: "make-bot-ui/**", class: "never-copy" },
	{ pattern: "assets/**", class: "never-copy" },
	{ pattern: "automations/**", class: "never-copy" },
	{ pattern: "docs/**", class: "never-copy" },
	{ pattern: ".cursor-plugin/**", class: "never-copy" },
	{ pattern: "agents/**", class: "never-copy" },
	{ pattern: "README.md", class: "never-copy" },
	{ pattern: "LICENSE", class: "never-copy" },

	{ pattern: "skills/poteto-mode/scripts/check-plan.test.ts", class: "never-copy" },

	{ pattern: "skills/deslop/**", class: "pi-only" },
	{ pattern: "skills/setup-pstack/SKILL.md", class: "pi-only" },
	{ pattern: "skills/poteto-help/SKILL.md", class: "pi-only" },
	{ pattern: "skills/poteto-mode/scripts/check-plan.test.mjs", class: "pi-only" },
	{ pattern: "skills/poteto-mode/scripts/bun.lock", class: "pi-only" },

	{ pattern: "skills/principle-*/**", class: "copy" },
	{ pattern: "skills/typescript-best-practices/references/patterns.md", class: "copy" },

	{ pattern: "skills/**", class: "adapt" },
];

const DEST_ONLY_NEVER = [
	"extensions/**",
	"package.json",
	"CHANGELOG.md",
	"agents/**",
	"README.md",
];

const KNOWN_TOP = new Set(
	CLASS_RULES.map((rule) => rule.pattern.split("/")[0].replaceAll("*", "")).filter(Boolean),
);

const SKIP_WALK = new Set([".git", "node_modules"]);

let skillNamesForSlash = new Set(["deslop"]);

const READONLY_PROMPT =
	"a read-only prompt (`Agent` has no readonly flag, so the prompt forbids edits)";
const VERIFY_HARNESS = "the project's verification skill or harness";
const SESSION_DIR = "`~/.pi/agent/sessions/--<cwd with / as ->--/`";
const WORKTREE_AGENT =
	'a background `Agent` in its own verified worktree (`isolation: "worktree"`, per **Worktree safety** in the **poteto-mode** skill)';
const WORKTREE_SAFETY =
	'**Worktree safety.** `isolation: "worktree"` takes effect only when `pi-subagents` has worktrees enabled. Otherwise `Agent` drops the field without an error and the worker shares this checkout. Before spawning parallel writers, inspect the live `Agent` schema for an `isolation` input. If it is absent, run `git worktree add <path> -b <branch>` per writer and pass that exact path in the prompt. Before any edit, each writer must verify its assigned worktree with `pwd` and `git branch --show-current` and stop on a path or branch mismatch. Use absolute file paths under that worktree and `git -C <path>` for Git commands. If separate writer worktrees cannot be verified, do not fan out writers. Topology operations (chain rebases, force-pushes, base retargets) run only in a verified separate worktree, even when serial, never in the coordinator\'s checkout. Never change user settings or fall back to the shared checkout to make a fan-out fit. Read-only fan-out needs no isolation.';

// Match whole Cursor instructions before replacing individual tool names.
export const SEAMS = [
	{ id: "ask-question", cursor: /AskQuestion/g, pi: "ask_user" },

	{
		id: "orch-worker",
		cursor:
			/Always `environment: "cloud"` unless the task needs this machine: `control-ui` or `control-cli` runtime verification \(from `cursor-team-kit`\)\. Reading local transcripts under `agent-transcripts\/`\./g,
		pi: `Always ${WORKTREE_AGENT} unless the task needs this machine or the main checkout's uncommitted state: runtime verification through ${VERIFY_HARNESS}. Reading local session transcripts under \`~/.pi/agent/sessions/\`.`,
	},
	{
		id: "control-such-as",
		cursor: /with the matching control skill \(such as `control-ui` or `control-cli` from `cursor-team-kit`\)/g,
		pi: `with ${VERIFY_HARNESS}`,
	},
	{
		id: "control-runtime",
		cursor: /`control-ui` or `control-cli` runtime verification \(from `cursor-team-kit`\)/g,
		pi: `runtime verification through ${VERIFY_HARNESS}`,
	},
	{
		id: "orch-nesting",
		cursor:
			/\(nesting works to depth 3, and a nested spawn has the full Task schema including `environment`\)/g,
		pi: "(nested spawns exist only when `pi-subagents` nesting is enabled in the session, so confirm that before you plan on a deeper tree)",
	},
	{
		id: "orch-cloud-store",
		cursor: /Cloud agents cannot read the local store, so their briefs inline what they need or point at repo paths\./g,
		pi: "A worktree agent sees only committed files, so its brief inlines what it needs or points at repo paths.",
	},
	{
		id: "orch-spawn-paste",
		cursor:
			/Local spawns may reference the standing-orders file by store path\. Verbatim paste is for cloud spawns and every resume\./g,
		pi: "Spawns on the main checkout may reference the standing-orders file by store path. Verbatim paste is for worktree-isolated spawns and every resume.",
	},
	{
		id: "orch-budget",
		cursor: /its spawn budget with the cloud default and the local exception list/g,
		pi: "its spawn budget with the worktree default and the main-checkout exception list",
	},
	{
		id: "orch-rebase",
		cursor: /Chain rebases run in cloud\. A local rebase at this scale takes the laptop down\./g,
		pi: `Chain rebases run in ${WORKTREE_AGENT}, even when the stacker is serial, never in the coordinator's checkout.`,
	},
	{
		id: "orch-dashboard",
		cursor: /the cloud agent's status in the Cursor dashboard/g,
		pi: "the agent's status from `get_subagent_result`",
	},
	{
		id: "orch-restart",
		cursor: /After a Cursor restart: local agents are dead, cloud work is not\./g,
		pi: "After a restart: running agents are dead, pushed branches and PRs are not.",
	},
	{
		id: "orch-reattach",
		cursor: /reattach cloud work by PR and branch/g,
		pi: "reattach work by PR and branch",
	},
	{
		id: "loop-hourly",
		cursor: /`\/loop 1h`/g,
		pi: "an hourly recurring wake",
	},
	{
		id: "loop-command",
		cursor: /using Cursor's `\/loop` command \(a built-in, not a pstack skill\)/g,
		pi: "from what this session offers: a scheduled prompt or recurring wake if a tool provides one, otherwise a watcher subagent",
	},
	{ id: "with-loop", cursor: /with Cursor's `\/loop` command/g, pi: "with a recurring wake" },
	{
		id: "loop-per-component",
		cursor: /`\/loop` per component until the diff is zero\./g,
		pi: "Repeat per component until the diff is zero.",
	},
	{
		id: "loop-predicate",
		cursor: /give `\/loop` that predicate/g,
		pi: "give the recurring wake that predicate",
	},
	{ id: "loop-until", cursor: /\/loop until (\w+)/g, pi: (_m, what) => `run until ${what}` },
	{
		id: "babysit-replaces",
		cursor: /replaces Cursor's built-in babysit skill for these requests, so do not route there/g,
		pi: "replaces any generic review or babysit command for these requests, so do not route there",
	},
	{
		id: "create-skill-hand",
		cursor: /hand to Cursor's built-in `create-skill` skill and run its draft \/ test \/ iterate loop/g,
		pi: "follow `playbooks/authoring-a-skill.md` in the **poteto-mode** skill and run its draft / test / iterate loop",
	},
	{
		id: "create-skill-builtin",
		cursor: /the \*\*create-skill\*\* skill \(Cursor's built-in for authoring SKILL\.md files\)/g,
		pi: "`playbooks/authoring-a-skill.md` and `/skill:unslop`",
	},
	{
		id: "create-skill-use",
		cursor: /Use the \*\*create-skill\*\* skill \(Cursor's built-in for authoring SKILL\.md files\)\./g,
		pi: "Author SKILL.md to the Pi Agent Skills standard. Run `/skill:unslop` on every line.",
	},
	{
		id: "env-local",
		cursor:
			/Use `environment: "local"` only when the worker needs access to something on the user's computer\./g,
		pi: "Use `isolation: \"off\"` only when the worker needs this checkout's uncommitted state or something else on the user's computer.",
	},
	{
		id: "cloud-base-branch",
		cursor: /When a worker must start from a non-default pushed branch, pass `cloud_base_branch`\./g,
		pi: `When a worker must start from a non-default branch, name that branch and its SHA in the brief and have the worker check it out first.\n\n${WORKTREE_SAFETY}`,
	},


	{
		id: "models-path",
		cursor: /~\/\.cursor\/rules\/pstack-models\.mdc/g,
		pi: "~/.pi/agent/pstack/models.json",
	},
	{
		id: "models-rule",
		cursor: /the `pstack-models\.mdc` rule/g,
		pi: "the pstack role table (`~/.pi/agent/pstack/models.json`)",
	},
	{ id: "models-file", cursor: /`pstack-models\.mdc`/g, pi: "`~/.pi/agent/pstack/models.json`" },
	{
		id: "rule-missing",
		cursor: /the rule or (that|the) line is missing/g,
		pi: (_m, which) => `the role table or ${which} line is missing`,
	},
	{
		id: "setup-rule",
		cursor: /the `\/setup-pstack` rule/g,
		pi: "the injected pstack role table",
	},

	{
		id: "recall-transcripts",
		cursor:
			/`~\/\.cursor\/projects\/<slug>\/agent-transcripts\/<uuid>\/<uuid>\.jsonl`, where `<slug>` is the workspace path with the leading slash dropped and each "\/" turned into "-" \(so `\/Users\/you\/proj` becomes `Users-you-proj`\)\. Every line is one chat message\./g,
		pi: '`~/.pi/agent/sessions/--<slug>--/<timestamp>_<uuid>.jsonl`, where `<slug>` is the workspace path with the leading slash dropped and each "/" turned into "-" (so `/Users/you/proj` becomes `--Users-you-proj--`). Every line is one JSON entry. Chat turns are the `"type":"message"` entries.',
	},
	{
		id: "transcripts-ls",
		cursor:
			/ls -t <agent-transcripts>\/\*\.jsonl <agent-transcripts>\/\*\/\*\.jsonl <agent-transcripts>\/\*\/subagents\/\*\.jsonl 2>\/dev\/null \| head -10/g,
		pi: "ls -t <session-dir>/*.jsonl 2>/dev/null | head -10",
	},
	{
		id: "transcripts-layouts",
		cursor:
			/That covers the legacy flat \(`<id>\.jsonl`\), current nested \(`<id>\/<id>\.jsonl`\), and subagent \(`<parent>\/subagents\/<child>\.jsonl`\) layouts\. For each candidate, read the first JSONL line\. Take the file whose `message\.content\[0\]\.text` contains the conversation's opening user prompt\./g,
		pi: 'Pi writes one flat `<timestamp>_<uuid>.jsonl` per session. For each candidate, read the first entry with `"type":"message"` and `"role":"user"`. Take the file whose first user message contains the conversation\'s opening user prompt.',
	},
	{
		id: "session-dir-open-paren",
		cursor:
			/the active workspace's `agent-transcripts\/` directory \(the system prompt names the path\. Do not glob/g,
		pi: `the active workspace's session directory (${SESSION_DIR}. Do not glob`,
	},
	{
		id: "session-dir-named",
		cursor: /the `agent-transcripts\/` directory the system prompt names/g,
		pi: `this workspace's session directory (${SESSION_DIR})`,
	},
	{
		id: "session-dir-active",
		cursor:
			/the active workspace's `agent-transcripts\/` directory \(the system prompt names (?:the|this) path\)/g,
		pi: `the active workspace's session directory (${SESSION_DIR})`,
	},
	{
		id: "session-dir-workspace",
		cursor:
			/The system prompt names the workspace's `agent-transcripts\/` directory\. Use only that path\./g,
		pi: `Use only this workspace's session directory (${SESSION_DIR}).`,
	},
	{
		id: "sessions-path",
		cursor: /~\/\.cursor\/projects\/[^`\s]*/g,
		pi: "~/.pi/agent/sessions/",
	},
	{ id: "transcripts-dir", cursor: /`agent-transcripts\/`/g, pi: "`~/.pi/agent/sessions/`" },
	{
		id: "skills-dir",
		cursor: /(?:~\/\.cursor\/skills\/|\.cursor\/skills\/)/g,
		pi: (m) => (m.startsWith("~") ? "~/.pi/agent/skills/" : ".pi/skills/"),
	},
	{
		id: "plugins-dir",
		cursor: /~\/\.cursor\/plugins\//g,
		pi: "~/.pi/agent/npm/node_modules/",
	},

	{
		id: "deslop",
		cursor: /the `deslop` skill from the `cursor-team-kit` plugin \(`\/deslop`\)|(?<!skill:)\/deslop\b/g,
		pi: (m) => (m.includes("cursor-team-kit") ? "the **deslop** skill (`/skill:deslop`)" : "/skill:deslop"),
	},
	{
		id: "control-pick",
		cursor:
			/Browser, Electron, and web UIs use `control-ui` from `cursor-team-kit`\. CLIs and TUIs use `control-cli` from `cursor-team-kit`\./g,
		pi: `Browser, Electron, web UIs, CLIs, and TUIs use ${VERIFY_HARNESS}.`,
	},
	{
		id: "control-drive",
		cursor: /Drive through `control-ui` or `control-cli` from `cursor-team-kit`\./g,
		pi: `Drive through ${VERIFY_HARNESS}.`,
	},
	{
		id: "control-matching",
		cursor: /via the matching control skill/g,
		pi: `through ${VERIFY_HARNESS}`,
	},
	{
		id: "control-pair",
		cursor: /`control-ui` or `control-cli`|`control-cli` or `control-ui`/g,
		pi: VERIFY_HARNESS,
	},
	{
		id: "control-from",
		cursor: /`control-ui` from (?:`[^`]*`|\.)|`control-cli` from (?:`[^`]*`|\.)/g,
		pi: VERIFY_HARNESS,
	},
	{
		id: "control-publish",
		cursor:
			/the matching control skill\.\s*(?:`[^`]+`\s*)?publishes `control-cli` \(CLIs and TUIs\) and `control-ui` \(browser \/ Electron \/ web UIs\)/g,
		pi: "verify on the real surface: drive the browser or app through the project's verification skill or an automation harness",
	},
	{ id: "cursor-team-kit", cursor: /`cursor-team-kit`|cursor-team-kit/g, pi: "the project's verification skill" },
	{
		id: "visualize-skill",
		cursor: /a chart or diagram from `\/visualize`/g,
		pi: "a chart or diagram you drew from facts you have",
	},
	{ id: "visualize-chart", cursor: /a `\/visualize` chart for numbers/g, pi: "a chart for numbers" },

	{
		id: "how-spawn",
		cursor: /Every spawn is a Task subagent with `subagent_type: generalPurpose` and `readonly: true`\./g,
		pi: `Every spawn is an \`Agent\` call with \`subagent_type: "general-purpose"\` and ${READONLY_PROMPT}.`,
	},
	{
		id: "interrogate-spawn",
		cursor: /`subagent_type: generalPurpose`, `readonly: true`, and `model`/g,
		pi: `\`subagent_type: "general-purpose"\`, ${READONLY_PROMPT}, and \`model\``,
	},
	{
		id: "why-spawn",
		cursor:
			/Every spawn is `generalPurpose` with `readonly: false` \(agent mode\)\. \*\*Do not use readonly\/Ask mode\.\*\* It strips MCP access/g,
		pi: 'Every spawn is an `Agent` call with `subagent_type: "general-purpose"`. **Do not pass `isolated: true`.** It strips MCP access',
	},
	{ id: "agent-mode", cursor: /agent mode \(`readonly: false`\)/g, pi: "no `isolated: true`" },
	{ id: "readonly-strips", cursor: /readonly strips MCPs?/g, pi: "`isolated: true` strips MCP tools" },
	{
		id: "readonly-judge",
		cursor: /readonly judge subagent/g,
		pi: "read-only judge subagent (its prompt forbids edits)",
	},
	{
		id: "general-purpose-type",
		cursor: /`subagent_type:\s*generalPurpose`|subagent_type:\s*generalPurpose/g,
		pi: '`subagent_type: "general-purpose"`',
	},
	{
		id: "reject-slug",
		cursor:
			/If the Task tool rejects a slug, use the default and say so\. If it rejects the default, use the closest valid slug of the same family from its error message\./g,
		pi: "If the `Agent` tool rejects a slug, use `inherit-parent` (omit `model`) and say so.",
	},
	{
		id: "reject-entry",
		cursor:
			/If the Task tool rejects a configured entry, run that (reviewer|seat) on its family's (?:table )?default and say so\..*?(?= (?:Do not block|Spawn more))/g,
		pi: (_m, role) =>
			`If the \`Agent\` tool rejects a configured entry, run that ${role} on \`inherit-parent\` (omit \`model\`) and say so.`,
	},
	{
		id: "fallback-either",
		cursor: /apply either fallback to it/g,
		pi: "apply that fallback to it",
	},
	{
		id: "resume-reuse",
		cursor: /Resume, message, or queue a follow-up on an existing subagent/g,
		pi: "Resume (`Agent` with `resume`), steer (`steer_subagent`), or queue a follow-up on an existing subagent",
	},
	{ id: "task-tool", cursor: /\bTask tool\b/g, pi: "`Agent` tool" },
	{ id: "task-subagent", cursor: /Task subagent/g, pi: "`Agent` subagent" },
	{ id: "task-article", cursor: /\ba `Task`/g, pi: "an `Agent`" },
	{ id: "task-response", cursor: /`Task` response body/g, pi: "`Agent` result" },
	{ id: "task-tick", cursor: /`Task`/g, pi: "`Agent`" },
	{
		id: "effort-pick",
		cursor: /reasoning level and fast or standard speed for the job/g,
		pi: "`thinking` level for the job",
	},

	{
		id: "env-cloud",
		cursor: /`environment: "cloud"`/g,
		pi: '`isolation: "worktree"`',
	},
	{ id: "loop-skill", cursor: /via the loop skill/g, pi: "via a recurring wake" },
	{
		id: "cursor-cloud-agent",
		cursor: /a Cursor cloud agent/g,
		pi: WORKTREE_AGENT,
	},

	{
		id: "create-skill-cursor",
		cursor: /Cursor's built-in `create-skill`/g,
		pi: "`playbooks/authoring-a-skill.md`",
	},
	{
		id: "create-skill-tick",
		cursor: /`create-skill`/g,
		pi: "`playbooks/authoring-a-skill.md`",
	},
	{ id: "create-skill-bare", cursor: /create-skill/g, pi: "authoring-a-skill" },

	{ id: "under-loop", cursor: /under `\/loop`/g, pi: "under a recurring wake" },
	{ id: "cursor-loop", cursor: /Cursor's `\/loop` command/g, pi: "a recurring wake" },
	{ id: "slash-loop", cursor: /`\/loop`/g, pi: "a recurring wake" },
	{
		id: "babysit-cursor",
		cursor: /not Cursor's built-in babysit skill/g,
		pi: "not any generic review command",
	},
	{
		id: "control-skill",
		cursor: /via the control skill/g,
		pi: `through ${VERIFY_HARNESS}`,
	},
	{ id: "loop-terminal", cursor: /a real terminal `\/loop`/g, pi: "a recurring wake" },
	{
		id: "mcp-discovery",
		cursor:
			/list the available MCPs from the Cursor environment\. Use the available-tools map when present\. Otherwise inspect the `mcps\/` directory Cursor exposes for enabled MCP servers\./g,
		pi: "list the MCP servers and tools in this session's tool list. If MCP servers sit behind a gateway tool, ask the gateway for its server and tool list before classifying.",
	},
	{
		id: "home-cursor",
		cursor: /\$HOME\/\.cursor\/projects\/[^\s"']*/g,
		pi: "$HOME/.pi/agent/sessions",
	},
	{ id: "cloud-agent", cursor: /, cloud-agent URL,/g, pi: ", an async run record," },
	{ id: "cloud-agent-article", cursor: /a cloud-agent URL/g, pi: "an async run record" },
	{ id: "cursor-restart", cursor: /, a Cursor restart,/g, pi: ", a restart," },
	{ id: "cloud-vm", cursor: /on its own cloud VM at the PR head/g, pi: "at the PR head" },
	{
		id: "ten-lanes",
		cursor: /Ten lanes on [^\n]+ at the PR head/g,
		pi: "Ten lanes at the PR head",
	},
	{
		id: "check-plan-path",
		cursor: /node pstack\/skills\/poteto-mode\/scripts\/check-plan\.mjs/g,
		pi: "node skills/poteto-mode/scripts/check-plan.mjs",
	},
	{
		id: "standing-goal",
		cursor: /arm a `\/goal` with this exact text/g,
		pi: "record a standing goal with this exact text",
	},
	{ id: "standing-goal-tick", cursor: /the armed \/goal/g, pi: "the standing goal" },

	{
		id: "default-runner-pair",
		cursor: new RegExp(`default to one each on \`?${CURSOR_SLUG}\`? and \`?${CURSOR_SLUG}\`?`, "g"),
		pi: "default to two runners, both `inherit-parent`",
	},
	{
		id: "default-judge-pair",
		cursor: new RegExp(`choose from \`?${CURSOR_SLUG}\`? and \`?${CURSOR_SLUG}\`?`, "g"),
		pi: "choose `inherit-parent`",
	},
	{
		id: "default-use-pair",
		cursor: new RegExp(`use \`?${CURSOR_SLUG}\`? and \`?${CURSOR_SLUG}\`?`, "g"),
		pi: "use two `inherit-parent` runners",
	},
	{
		id: "inherit-pair",
		cursor: new RegExp(`\`?${CURSOR_SLUG}\`? and \`?${CURSOR_SLUG}\`?`, "g"),
		pi: "`inherit-parent`",
	},
	{ id: "inherit-parent", cursor: CURSOR_DEFAULT_SLUGS, pi: "`inherit-parent`" },
	{
		id: "control-noun",
		cursor: /\b[Cc]ontrol skill\b/g,
		pi: (m) => (m[0] === "C" ? "Verification skill" : "verification skill"),
	},
	{
		id: "slash-skill",
		cursor: /(?<![\w/.])\/([a-z][a-z0-9-]*)\b/g,
		pi: (m, name) => {
			if (EXTENSION_COMMANDS.has(`/${name}`)) return m;
			if (!skillNamesForSlash.has(name)) return m;
			return `/skill:${name}`;
		},
	},
];

export const FILE_SEAMS = [
	{
		id: "plan-lanes",
		files: ["skills/poteto-mode/scripts/check-plan.mjs"],
		cursor: /const LANES = [^\n]+;/,
		pi: "const LANES = /Ten lanes (?:on `[^`<>]+` )?at the PR head/;",
	},
	{
		id: "plan-lanes-message",
		files: ["skills/poteto-mode/scripts/check-plan.mjs"],
		cursor: /lacks "Ten lanes on \\`<swarm workers model>\\` at the PR head" with the model filled in/,
		pi: 'lacks "Ten lanes at the PR head"',
	},
	{
		id: "plan-tick-marker",
		files: ["skills/poteto-mode/scripts/check-plan.mjs"],
		cursor: /"\/loop 1h"/,
		pi: '"hourly recurring wake"',
	},
	{
		id: "tools-package-name",
		files: ["skills/poteto-mode/scripts/package.json"],
		cursor: /"name": "@cursor-skill\/poteto-mode-tools"/,
		pi: '"name": "@zenspc/pi-pstack-tools"',
	},
	{
		id: "tools-package-test",
		files: ["skills/poteto-mode/scripts/package.json"],
		cursor: /bun test orch watch-pr check-plan\.test\.ts/,
		pi: "bun test orch watch-pr",
	},
	{
		id: "audit-transcripts",
		files: ["skills/poteto-mode/scripts/worktree-audit.sh"],
		cursor:
			/# Transcripts dir: ~\/\.cursor\/projects\/<slugified-repo-path>\/agent-transcripts\.\nslug=\$\(printf '%s' "\$main_wt" \| sed 's#\^\/##; s#\/#-#g'\)\ntranscripts="\$HOME\/\.cursor\/projects\/\$slug\/agent-transcripts"/,
		pi: '# Transcripts dir: ~/.pi/agent/sessions (JSONL, one file per session).\ntranscripts="$HOME/.pi/agent/sessions"',
	},
];

function matchGlob(rel, pattern) {
	let out = "";
	for (let i = 0; i < pattern.length; i++) {
		if (pattern[i] === "*" && pattern[i + 1] === "*") {
			out += ".*";
			i++;
		} else if (pattern[i] === "*") {
			out += "[^/]*";
		} else if (".+^${}()|[]\\".includes(pattern[i])) {
			out += `\\${pattern[i]}`;
		} else {
			out += pattern[i];
		}
	}
	return new RegExp(`^${out}$`).test(rel);
}

function matchesAny(rel, patterns) {
	return patterns.some((pattern) => matchGlob(rel, pattern));
}

export function asRelPath(value) {
	if (typeof value !== "string" || value === "") {
		throw new Error("rel path required");
	}
	if (value.includes("\\") || value.includes("..") || value.startsWith("/")) {
		throw new Error(`invalid rel path: ${value}`);
	}
	return value;
}

export function classify(rel) {
	rel = asRelPath(rel);
	for (const rule of CLASS_RULES) {
		if (matchGlob(rel, rule.pattern)) return rule.class;
	}
	if (rel === "skills" || rel.startsWith("skills/")) return "adapt";
	const top = rel.split("/")[0];
	if (rel.includes("/") && !top.startsWith(".") && !KNOWN_TOP.has(top)) {
		throw new Error(`unclassified Cursor path: ${rel}`);
	}
	return "never-copy";
}

export function parseArgs(argv) {
	let from;
	let to;
	let dryRun = false;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--from") {
			from = argv[++i];
		} else if (arg === "--to") {
			to = argv[++i];
		} else if (arg === "--dry-run") {
			dryRun = true;
		} else {
			throw new Error(`unknown arg: ${arg}`);
		}
	}
	if (!from || !to) {
		throw new Error("usage: --from <cursor-pstack> --to <pi-pstack> [--dry-run]");
	}
	from = resolve(from);
	to = resolve(to);
	if (!existsSync(join(from, "skills"))) {
		throw new Error(`no skills/ in ${from}`);
	}
	if (!existsSync(join(to, "skills"))) {
		throw new Error(`no skills/ in ${to}`);
	}
	return { from, to, dryRun };
}

function walkFiles(root) {
	const out = [];
	function rec(dir, relBase) {
		for (const ent of readdirSync(dir, { withFileTypes: true })) {
			if (SKIP_WALK.has(ent.name)) continue;
			const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
			const abs = join(dir, ent.name);
			if (ent.isDirectory()) rec(abs, rel);
			else out.push(asRelPath(rel));
		}
	}
	rec(root, "");
	return out;
}

function refreshSkillNames(fromRoot, toRoot) {
	skillNamesForSlash = new Set(["deslop"]);
	for (const root of [fromRoot, toRoot]) {
		const dir = join(root, "skills");
		if (!existsSync(dir)) continue;
		for (const ent of readdirSync(dir, { withFileTypes: true })) {
			if (ent.isDirectory() && ent.name !== "make-bot-ui") {
				skillNamesForSlash.add(ent.name);
			}
		}
	}
}

function skillDirsAfter(to, actions) {
	const dir = join(to, "skills");
	const dirs = new Set(
		readdirSync(dir, { withFileTypes: true })
			.filter((ent) => ent.isDirectory())
			.map((ent) => ent.name),
	);
	for (const action of actions) {
		const rel = action.rel;
		if (!rel) continue;
		const m = /^skills\/([^/]+)\//.exec(rel);
		if (!m) continue;
		if (action.kind === "write") dirs.add(m[1]);
		if (action.kind === "delete" && rel === `skills/${m[1]}/SKILL.md`) dirs.delete(m[1]);
	}
	return dirs;
}

function playbookCountAfter(to, actions) {
	const dir = join(to, "skills/poteto-mode/playbooks");
	const files = new Set(
		existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".md")) : [],
	);
	for (const action of actions) {
		const m = action.rel && /^skills\/poteto-mode\/playbooks\/([^/]+\.md)$/.exec(action.rel);
		if (!m) continue;
		if (action.kind === "write") files.add(m[1]);
		if (action.kind === "delete") files.delete(m[1]);
	}
	return files.size;
}

function readOptional(path) {
	return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function needsCatalogCounts(to, counts) {
	const text = readOptional(join(to, "extensions/pstack/skill-catalog.test.ts"));
	return (
		!text.includes(`assert.equal(skills.length, ${counts.total})`) ||
		!text.includes(`assert.equal(skills.filter((skill) => skill.hidden).length, ${counts.hidden})`) ||
		!text.includes(`assert.equal(hidden.length, ${counts.hidden})`)
	);
}

function needsReadmeCounts(to, counts) {
	const text = readOptional(join(to, "README.md"));
	return (
		!text.includes(`**${counts.total} skills**`) ||
		!text.includes(`${counts.playbooks} playbooks`) ||
		!text.includes(`${counts.principles} principle skills`) ||
		!text.includes(`not all ${counts.total}`)
	);
}

const POTETO_INTRO = [
	"`/poteto-mode` enables this mode for the rest of the session.",
	"`/poteto-mode off` disables it.",
	"`/skill:poteto-mode` also enables it.",
	"The role table is injected from `~/.pi/agent/pstack/models.json` only when a role has a real model slug.",
	"",
	"",
].join("\n");

const SUBAGENT_DEFAULTS =
	"**Defaults for every `Agent` call.** `run_in_background: true`, file pointers not inlined context, explicit `model` per role. Every role defaults to the parent session model (`inherit-parent`; omit `model`). `/setup-pstack` writes `~/.pi/agent/pstack/models.json`, and the injected pstack role table lists only roles with a real provider-qualified slug. Pass that slug as `model`. `inherit-parent` and `auto` mean omit `model`. Never pass `isolated: true`, because it strips MCP tools. Code delegates tier by difficulty. The hardest changes (cross-cutting design, gnarly concurrency, subtle algorithms) go to the model configured for `hardest tasks`, else the parent model, when the task needs judgment or the intent is vague, and to your strongest instruction-following model when the work is a precisely specified sequence of steps to execute to the letter. Trivial mechanical edits go to your fast code model. Per-role lines in the injected pstack role table override these defaults and the model choices in the routed skills (`how`, `why`, `arena`, `swarm`, `architect`, `interrogate`, `reflect`). A role with no line keeps its default, and a role line of `inherit-parent` or `auto` runs that role on the parent chat model (omit `model`). Each code playbook's configured model comes from its line (`feature, refactoring`, `bug-fix`, `perf-issue`, or `hillclimb`), and the hardest changes read `hardest tasks`. Prose and judgment read `judgment and prose`.";

const MATCH_MODEL =
	"**Match the model to the job.** Before each spawn, start from the role's line or default and pick the `thinking` level the job needs (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`). Omit `thinking` to run at the agent's own default level. If the user states a reasoning budget, such as \"max reasoning\" or \"keep it cheap\", that sets the starting level for every spawn. Raise it one step, up to `max`, for the hardest or subtlest work. Lower it one step for judgment and two or more steps for routine work. The `Agent` tool has no fast-mode variant, so choose speed through the model alone. Verification is the exception and stays on the `swarm workers` model. Change only `thinking` and keep the model the role names, so a diverse panel stays diverse. A role on `auto` or `inherit-parent` stays on the parent model. Pi clamps a level the model does not support, so do not retry with another level.";

function replaceRequired(text, pattern, replacement, label) {
	if (!pattern.test(text)) throw new Error(`poteto-mode patch target missing: ${label}`);
	return text.replace(pattern, () => replacement);
}

export function patchPotetoModePi(text) {
	text = replaceRequired(text, /# Poteto mode\n\n/, `# Poteto mode\n\n${POTETO_INTRO}`, "title");
	text = replaceRequired(
		text,
		/\*\*Defaults for every `Task` call\.\*\*[^\n]*/,
		`${SUBAGENT_DEFAULTS}\n\n${WORKTREE_SAFETY}`,
		"defaults",
	);
	text = replaceRequired(text, /\*\*Match the model to the job\.\*\*[^\n]*/, MATCH_MODEL, "match the model");
	return text;
}

export function plan(paths) {
	refreshSkillNames(paths.from, paths.to);
	const cursorRels = walkFiles(paths.from);
	const cursorSet = new Set(cursorRels);
	const actions = [];

	for (const rel of cursorRels) {
		const fileClass = classify(rel);
		if (fileClass === "never-copy" || fileClass === "pi-only") {
			actions.push({ kind: "skip", rel, class: fileClass });
			continue;
		}
		actions.push({
			kind: "write",
			rel,
			dest: join(paths.to, rel),
			class: fileClass,
		});
	}

	const destSkillRoot = join(paths.to, "skills");
	const destRels = existsSync(destSkillRoot)
		? walkFiles(destSkillRoot).map((rel) => asRelPath(`skills/${rel}`))
		: [];
	for (const rel of destRels) {
		if (matchesAny(rel, DEST_ONLY_NEVER)) continue;
		const fileClass = classify(rel);
		if (fileClass === "pi-only") continue;
		const counterpart = cursorSet.has(rel) ? classify(rel) : null;
		if (counterpart === "copy" || counterpart === "adapt") continue;
		if (counterpart === "pi-only") continue;
		actions.push({ kind: "delete", dest: join(paths.to, rel), rel });
	}

	const dirs = skillDirsAfter(paths.to, actions);
	const counts = {
		total: dirs.size,
		discoverable: DISCOVERABLE.length,
		hidden: dirs.size - DISCOVERABLE.length,
		principles: [...dirs].filter((name) => name.startsWith("principle-")).length,
		playbooks: playbookCountAfter(paths.to, actions),
	};

	if (needsCatalogCounts(paths.to, counts)) {
		actions.push({
			kind: "patch",
			dest: join(paths.to, "extensions/pstack/skill-catalog.test.ts"),
			derived: "catalog-counts",
		});
	}
	if (needsReadmeCounts(paths.to, counts)) {
		actions.push({
			kind: "patch",
			dest: join(paths.to, "README.md"),
			derived: "readme-counts",
		});
	}
	return { paths, actions, counts };
}

export function printPlan(planned) {
	const tallies = { write: 0, delete: 0, patch: 0, skip: 0 };
	for (const action of planned.actions) {
		tallies[action.kind] += 1;
		if (action.kind === "write") {
			console.log(`write\t${action.class}\t${action.rel}`);
		} else if (action.kind === "delete") {
			console.log(`delete\t\t${action.rel}`);
		} else if (action.kind === "patch") {
			console.log(`patch\t${action.derived}\t${action.dest}`);
		} else {
			console.log(`skip\t${action.class}\t${action.rel}`);
		}
	}
	console.log(
		`# ${tallies.write} write, ${tallies.delete} delete, ${tallies.patch} patch, ${tallies.skip} skip`,
	);
	console.log(
		`# catalog ${planned.counts.total}/${planned.counts.discoverable}/${planned.counts.hidden} principles ${planned.counts.principles} playbooks ${planned.counts.playbooks}`,
	);
}

function frontmatterKey(line) {
	const i = line.indexOf(":");
	return i === -1 ? "" : line.slice(0, i).trim();
}

export function applyFrontmatterPolicy(text, skillDir) {
	if (!text.startsWith("---\n")) return text;
	const close = text.indexOf("\n---\n", 4);
	if (close === -1) return text;
	const body = text.slice(close + "\n---\n".length);
	const lines = text
		.slice(4, close)
		.split("\n")
		.map((line) => line.replace(/^name:\s*"?Poteto Mode"?\s*$/, "name: poteto-mode"))
		.filter((line) => {
			const key = frontmatterKey(line);
			if (CURSOR_FRONTMATTER_KEYS.has(key)) return false;
			if (key === "disable-model-invocation") return false;
			return true;
		});
	if (!DISCOVERABLE.includes(skillDir)) {
		lines.push("disable-model-invocation: true");
	}
	while (lines.length && lines[lines.length - 1] === "") lines.pop();
	return `---\n${lines.join("\n")}\n---\n${body}`;
}

export function applyBodyTransforms(text) {
	for (let i = 0; i < 20; i++) {
		let next = text;
		for (const seam of SEAMS) {
			next = next.replace(seam.cursor, seam.pi);
		}
		if (next === text) return next;
		text = next;
	}
	throw new Error("seam fixpoint did not converge");
}

export function applyFileTransforms(text, rel) {
	for (const seam of FILE_SEAMS) {
		if (!seam.files.includes(rel)) continue;
		if (!seam.cursor.test(text)) throw new Error(`file seam ${seam.id} found no match in ${rel}`);
		text = text.replace(seam.cursor, () => seam.pi);
	}
	return text;
}

export function renderWrite(action, paths) {
	refreshSkillNames(paths.from, paths.to);
	const src = join(paths.from, action.rel);
	let text = readFileSync(src, "utf8");
	const parts = action.rel.split("/");
	const base = parts[parts.length - 1];
	const skillDir = parts[0] === "skills" ? parts[1] : "";
	if (base === "SKILL.md") {
		text = applyFrontmatterPolicy(text, skillDir);
	}
	if (action.rel === "skills/poteto-mode/SKILL.md") {
		text = patchPotetoModePi(text);
	}
	if (action.class === "adapt") {
		text = base.endsWith(".md") ? applyBodyTransforms(text) : applyFileTransforms(text, action.rel);
	}
	return text;
}

function writeIfChanged(dest, text, modeSrc) {
	mkdirSync(dirname(dest), { recursive: true });
	if (existsSync(dest) && readFileSync(dest, "utf8") === text) return false;
	const opts = {};
	if (modeSrc && existsSync(modeSrc)) {
		opts.mode = lstatSync(modeSrc).mode & 0o777;
	} else if (existsSync(dest)) {
		opts.mode = lstatSync(dest).mode & 0o777;
	}
	writeFileSync(dest, text, opts);
	return true;
}

function patchCatalogCounts(text, counts) {
	return text
		.replace(/assert\.equal\(skills\.length, \d+\)/g, `assert.equal(skills.length, ${counts.total})`)
		.replace(
			/assert\.equal\(skills\.filter\(\(skill\) => skill\.hidden\)\.length, \d+\)/g,
			`assert.equal(skills.filter((skill) => skill.hidden).length, ${counts.hidden})`,
		)
		.replace(/assert\.equal\(hidden\.length, \d+\)/g, `assert.equal(hidden.length, ${counts.hidden})`);
}

function patchReadmeCounts(text, counts) {
	return text
		.replace(/\*\*\d+ skills\*\*/g, `**${counts.total} skills**`)
		.replace(/not all \d+/g, `not all ${counts.total}`)
		.replace(/\d+ playbooks/g, `${counts.playbooks} playbooks`)
		.replace(/\d+ principle skills/g, `${counts.principles} principle skills`);
}

export function applyDerivedPatch(kind, destRoot, counts) {
	if (kind === "catalog-counts") {
		const dest = join(destRoot, "extensions/pstack/skill-catalog.test.ts");
		writeIfChanged(dest, patchCatalogCounts(readFileSync(dest, "utf8"), counts));
		return;
	}
	if (kind === "readme-counts") {
		const dest = join(destRoot, "README.md");
		writeIfChanged(dest, patchReadmeCounts(readFileSync(dest, "utf8"), counts));
		return;
	}
}

function removeEmptyDirs(dir, stopAt) {
	while (dir !== stopAt && dir.startsWith(stopAt) && readdirSync(dir).length === 0) {
		rmdirSync(dir);
		dir = dirname(dir);
	}
}

export function apply(planned) {
	refreshSkillNames(planned.paths.from, planned.paths.to);
	for (const action of planned.actions) {
		if (action.kind === "skip") continue;
		if (action.kind === "write") {
			writeIfChanged(
				action.dest,
				renderWrite(action, planned.paths),
				join(planned.paths.from, action.rel),
			);
			continue;
		}
		if (action.kind === "delete") {
			if (existsSync(action.dest)) unlinkSync(action.dest);
			removeEmptyDirs(dirname(action.dest), join(planned.paths.to, "skills"));
			continue;
		}
		if (action.kind === "patch") {
			applyDerivedPatch(action.derived, planned.paths.to, planned.counts);
		}
	}
}

const CURSOR_LEFTOVERS = [
	["AskQuestion", /AskQuestion/],
	["ask_user_question", /ask_user_question/],
	["subagent({", /subagent\(\{|`subagent\(\)`/],
	["Task tool", /\bTask (?:tool|subagent)\b|`Task`/],
	["generalPurpose", /generalPurpose/],
	["readonly flag", /`readonly: (?:true|false)`/],
	["cloud environment", /environment: "(?:cloud|local)"|cloud_base_branch|[Cc]loud[- ][Aa]gent|cloud VM/],
	["pstack-models.mdc", /pstack-models\.mdc/],
	["cursor-team-kit", /cursor-team-kit/],
	["Cursor path", /\$HOME\/\.cursor|~\/\.cursor|\.cursor\/(?:skills|rules|projects|plugins)/],
	["Cursor product", /(?<!Support\/)\bCursor(?:'s)?\b/],
	["agent-transcripts", /agent-transcripts/],
	["slash loop", /\/loop\b|\/goal\b/],
	["@cursor-skill", /@cursor-skill/],
	["merge marker", /<<<<<<</],
	["Cursor model slug", CURSOR_SLUG_RE],
];

export function findCursorLeftovers(text) {
	return CURSOR_LEFTOVERS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

export function assertNoCursorSeams(destRoot) {
	const skillsRoot = join(destRoot, "skills");
	const rels = walkFiles(skillsRoot).map((rel) => asRelPath(`skills/${rel}`));
	const leftover = [];
	for (const rel of rels) {
		if (matchesAny(rel, DEST_ONLY_NEVER)) continue;
		if (classify(rel) === "never-copy") continue;
		const text = readFileSync(join(destRoot, rel), "utf8");
		if (rel.endsWith(".md")) {
			for (const label of findCursorLeftovers(text)) leftover.push(`${rel}: ${label}`);
		}
		const parts = rel.split("/");
		if (parts[parts.length - 1] !== "SKILL.md") continue;
		const skillDir = parts[1];
		const close = text.startsWith("---\n") ? text.indexOf("\n---\n", 4) : -1;
		const fm = close === -1 ? "" : text.slice(4, close);
		const hidden = /^disable-model-invocation:\s*true\s*$/m.test(fm);
		if (DISCOVERABLE.includes(skillDir)) {
			if (/^disable-model-invocation\s*:/m.test(fm)) {
				leftover.push(`${rel}: Discoverable skill must omit disable-model-invocation`);
			}
		} else if (!hidden) {
			leftover.push(`${rel}: Hidden skill missing disable-model-invocation`);
		}
	}
	if (leftover.length) {
		throw new Error(`cursor seams remain:\n${leftover.join("\n")}`);
	}
}

export function main(argv = process.argv.slice(2)) {
	const args = parseArgs(argv);
	const planned = plan(args);
	if (args.dryRun) {
		printPlan(planned);
		return;
	}
	apply(planned);
	assertNoCursorSeams(args.to);
}

const isMain =
	process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
	try {
		main(process.argv.slice(2));
	} catch (err) {
		console.error(err instanceof Error ? err.message : err);
		process.exitCode = 1;
	}
}
