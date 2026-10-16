import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	applyBodyTransforms,
	asRelPath,
	assertNoCursorSeams,
	classify,
	main,
	patchPotetoModePi,
	plan,
	renderWrite,
} from "./reground-from-cursor.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..");
const PIN = JSON.parse(readFileSync(join(HERE, "upstream-pin.json"), "utf8"));

const POTETO_MODE = `---
name: Poteto Mode
description: poteto's agent style.
disable-model-invocation: true
icon: crown
color: yellow
---

# Poteto mode

Bundled skills live at \`../<name>/SKILL.md\` from this file.

**Defaults for every \`Task\` call.** \`run_in_background: true\`, agent mode (readonly strips MCP), explicit model per role. Defaults \`grok-4.7-xhigh-fast\` for code.

**Match the model to the job.** The \`/setup-pstack\` budget sets each role's starting level. Use fast mode only when urgent.
`;

const FIXTURE_UPSTREAM = {
	"skills/how/SKILL.md": `---
name: how
description: "Explain code."
disable-model-invocation: true
mode: agent
---

# How

Every spawn is a Task subagent with \`subagent_type: generalPurpose\` and \`readonly: true\`. Explorers use the \`how explorer\` line in the \`pstack-models.mdc\` rule (default \`grok-4.7-xhigh-fast\`). If the rule or that line is missing, use the default. If the Task tool rejects a slug, use the default and say so. If it rejects the default, use the closest valid slug of the same family from its error message.

About to \`AskQuestion\` here? Run /deslop first. See [\`/how\`](../how/SKILL.md) and [arena](../../arena/SKILL.md). Spawn all N workers with \`subagent_type: generalPurpose\`, \`environment: "cloud"\`, \`run_in_background: true\`. Use \`subagent_type: "poteto-agent"\` for delegates. Arm \`/loop 1h\` to audit. Read the transcript under the active workspace's \`agent-transcripts/\` directory (the system prompt names the path). Pick each subagent's reasoning level and fast or standard speed for the job. Use \`claude-opus-5-5-xhigh\` and \`grok-4.7-xhigh-fast\` by default.
`,
	"skills/principle-demo/SKILL.md": "---\nname: principle-demo\ndescription: demo\ndisable-model-invocation: true\n---\n\n- A rule. Not a slug: gpt-4o.\n",
	"skills/poteto-mode/SKILL.md": POTETO_MODE,
	"skills/poteto-mode/playbooks/feature.md": "1. Delegate with `subagent_type: \"poteto-agent\"`.\n",
	"skills/poteto-mode/scripts/check-plan.mjs": `const LANES = /Ten lanes on \`[^\`<>]+\` at the PR head/;
const PROGRAM_MARKERS = ["git show origin/main:", "/loop 1h", "status message"];
fail(\`lacks "Ten lanes on \\\`<swarm workers model>\\\` at the PR head" with the model filled in\`);
`,
	"skills/poteto-mode/scripts/check-plan.test.ts": "// upstream bun test\n",
	"skills/poteto-mode/scripts/package.json": `{
  "name": "@cursor-skill/poteto-mode-tools",
  "scripts": {
    "test": "bun test orch watch-pr check-plan.test.ts"
  }
}
`,
	"skills/poteto-mode/scripts/worktree-audit.sh": `#!/usr/bin/env bash
# Transcripts dir: ~/.cursor/projects/<slugified-repo-path>/agent-transcripts.
slug=$(printf '%s' "$main_wt" | sed 's#^/##; s#/#-#g')
transcripts="$HOME/.cursor/projects/$slug/agent-transcripts"
`,
	"skills/poteto-help/SKILL.md": "---\nname: poteto-help\ndescription: upstream help\n---\n\nCustom Modes and ~/.cursor/rules/pstack-models.mdc.\n",
	"skills/poteto-help/references/recipes.md": "- `/poteto-mode go. /loop until done.` then `/how` it.\n",
	"skills/make-bot-ui/SKILL.md": "---\nname: make-bot-ui\ndescription: Cursor only\n---\n",
	"agents/poteto-agent.md": "---\nname: poteto-agent\n---\n",
	"README.md": "# upstream\n",
};

const FIXTURE_TARGET = {
	"skills/poteto-help/SKILL.md": "---\nname: poteto-help\ndescription: Pi help\ndisable-model-invocation: true\n---\n\nPi owned.\n",
	"skills/setup-pstack/SKILL.md": "---\nname: setup-pstack\ndescription: Pi\ndisable-model-invocation: true\n---\n",
	"skills/stale/SKILL.md": "---\nname: stale\ndescription: removed upstream\ndisable-model-invocation: true\n---\n",
	"skills/poteto-mode/scripts/check-plan.test.mjs": "// pi owned test\n",
	"extensions/pstack/skill-catalog.test.ts":
		"assert.equal(skills.length, 1);\nassert.equal(skills.filter((skill) => skill.hidden).length, 0);\nassert.equal(hidden.length, 0);\n",
	"README.md": "**1 skills**, not all 1, 1 playbooks, 1 principle skills\n",
	"package.json": "{}\n",
};

function writeTree(root, files) {
	for (const [rel, text] of Object.entries(files)) {
		const path = join(root, rel);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, text);
	}
}

function makeFixture() {
	const root = mkdtempSync(join(tmpdir(), "reground-"));
	const from = join(root, "upstream");
	const to = join(root, "target");
	writeTree(from, FIXTURE_UPSTREAM);
	writeTree(to, FIXTURE_TARGET);
	return { from, to };
}

function hashTree(root) {
	const out = {};
	const walk = (dir) => {
		for (const ent of readdirSync(dir, { withFileTypes: true })) {
			const abs = join(dir, ent.name);
			if (ent.isDirectory()) walk(abs);
			else out[relative(root, abs)] = createHash("sha256").update(readFileSync(abs)).digest("hex");
		}
	};
	walk(root);
	return out;
}

test("asRelPath rejects traversal and absolute paths", () => {
	assert.throws(() => asRelPath(".."));
	assert.throws(() => asRelPath("foo/../bar"));
	assert.throws(() => asRelPath("foo\\bar"));
	assert.throws(() => asRelPath("/abs"));
	assert.equal(asRelPath("skills/how/SKILL.md"), "skills/how/SKILL.md");
});

test("classify assigns each path its owner", () => {
	const expected = {
		"skills/typescript-best-practices/references/patterns.md": "copy",
		"skills/how/SKILL.md": "adapt",
		"skills/setup-pstack/SKILL.md": "pi-only",
		"skills/poteto-help/SKILL.md": "pi-only",
		"skills/poteto-help/references/recipes.md": "adapt",
		"skills/make-bot-ui/SKILL.md": "never-copy",
		"skills/principle-explain-the-number/SKILL.md": "copy",
		"agents/poteto-agent.md": "never-copy",
		"skills/poteto-mode/scripts/check-plan.mjs": "adapt",
		"skills/poteto-mode/scripts/package.json": "adapt",
		"skills/poteto-mode/scripts/worktree-audit.sh": "adapt",
		"skills/poteto-mode/scripts/check-plan.test.mjs": "pi-only",
		"skills/poteto-mode/scripts/check-plan.test.ts": "never-copy",
		"skills/poteto-mode/scripts/bun.lock": "pi-only",
	};
	for (const [rel, owner] of Object.entries(expected)) assert.equal(classify(asRelPath(rel)), owner, rel);
});

test("plan writes copy and adapt files, skips Pi-owned and Cursor-only files, deletes stale files", () => {
	const { from, to } = makeFixture();
	const planned = plan({ from, to, dryRun: true });
	const byRel = new Map(planned.actions.filter((action) => action.rel).map((action) => [action.rel, action]));

	assert.equal(byRel.get("skills/how/SKILL.md").kind, "write");
	assert.equal(byRel.get("skills/how/SKILL.md").class, "adapt");
	assert.equal(byRel.get("skills/principle-demo/SKILL.md").class, "copy");
	for (const rel of [
		"skills/poteto-help/SKILL.md",
		"skills/make-bot-ui/SKILL.md",
		"skills/poteto-mode/scripts/check-plan.test.ts",
		"agents/poteto-agent.md",
	]) {
		assert.equal(byRel.get(rel).kind, "skip", rel);
	}
	assert.equal(byRel.get("skills/stale/SKILL.md").kind, "delete");
	assert.equal(byRel.has("skills/setup-pstack/SKILL.md"), false);
	assert.equal(byRel.has("skills/poteto-mode/scripts/check-plan.test.mjs"), false);

	assert.deepEqual(planned.counts, { total: 5, discoverable: 4, hidden: 1, principles: 1, playbooks: 1 });
	assert.deepEqual(
		planned.actions.filter((action) => action.derived).map((action) => action.derived),
		["catalog-counts", "readme-counts"],
	);
});

test("renderWrite binds delegation to the Agent tool and ask_user", () => {
	const { from, to } = makeFixture();
	const paths = { from, to };
	const out = renderWrite({ rel: "skills/how/SKILL.md", class: "adapt" }, paths);

	assert.match(out, /^---\nname: how\ndescription: "Explain code\."\n---\n/);
	assert.match(
		out,
		/Every spawn is an `Agent` call with `subagent_type: "general-purpose"` and a read-only prompt \(`Agent` has no readonly flag, so the prompt forbids edits\)\./,
	);
	assert.match(out, /`how explorer` line in the pstack role table \(`~\/\.pi\/agent\/pstack\/models\.json`\) \(default `inherit-parent`\)/);
	assert.match(out, /If the role table or that line is missing/);
	assert.match(out, /If the `Agent` tool rejects a slug, use `inherit-parent` \(omit `model`\) and say so\.\n/);
	assert.match(out, /About to `ask_user` here\? Run \/skill:deslop first\./);
	assert.match(out, /See \[`\/skill:how`\]\(\.\.\/how\/SKILL\.md\) and \[arena\]\(\.\.\/\.\.\/arena\/SKILL\.md\)\./);
	assert.match(out, /`subagent_type: "general-purpose"`, `isolation: "worktree"`, `run_in_background: true`/);
	assert.match(out, /Use `subagent_type: "poteto-agent"` for delegates\./);
	assert.match(out, /Arm an hourly recurring wake to audit\./);
	assert.match(out, /active workspace's session directory \(`~\/\.pi\/agent\/sessions\/--<cwd with \/ as ->--\/`\)\./);
	assert.match(out, /Pick each subagent's `thinking` level for the job\./);
	assert.match(out, /Use `inherit-parent` by default\./);
	assert.doesNotMatch(out, /ask_user_question|subagent\(|AskQuestion|generalPurpose|Task tool|grok-|claude-opus/);
});

test("worktree safety reaches poteto defaults, standalone swarm, chain rebases, owners, and verifiers", () => {
	const swarm = applyBodyTransforms("When a worker must start from a non-default pushed branch, pass `cloud_base_branch`.\n");
	const safety = swarm.split("\n\n")[1].trimEnd();
	assert.match(safety, /^\*\*Worktree safety\.\*\* `isolation: "worktree"` takes effect only when `pi-subagents` has worktrees enabled\./);
	assert.match(safety, /inspect the live `Agent` schema for an `isolation` input\. If it is absent, run `git worktree add <path> -b <branch>` per writer and pass that exact path in the prompt\./);
	assert.match(safety, /Before any edit, each writer must verify its assigned worktree with `pwd` and `git branch --show-current` and stop on a path or branch mismatch\./);
	assert.match(safety, /Use absolute file paths under that worktree and `git -C <path>` for Git commands\./);
	assert.match(safety, /If separate writer worktrees cannot be verified, do not fan out writers\./);
	assert.match(safety, /Topology operations \(chain rebases, force-pushes, base retargets\) run only in a verified separate worktree, even when serial, never in the coordinator's checkout\./);
	assert.match(safety, /Never change user settings or fall back to the shared checkout to make a fan-out fit\. Read-only fan-out needs no isolation\.$/);

	assert.equal(
		applyBodyTransforms("Chain rebases run in cloud. A local rebase at this scale takes the laptop down."),
		'Chain rebases run in a background `Agent` in its own verified worktree (`isolation: "worktree"`, per **Worktree safety** in the **poteto-mode** skill), even when the stacker is serial, never in the coordinator\'s checkout.',
	);
	assert.match(
		applyBodyTransforms("each a Cursor cloud agent, runs the change"),
		/^each a background `Agent` in its own verified worktree \(`isolation: "worktree"`, per \*\*Worktree safety\*\* in the \*\*poteto-mode\*\* skill\), runs the change$/,
	);
	assert.equal(patchPotetoModePi(POTETO_MODE).includes(`\n\n${safety}\n\n`), true);
});

test("model-slug rule leaves ordinary model names alone", () => {
	assert.equal(applyBodyTransforms("we renamed `gpt-4` to `gpt-4o`"), "we renamed `gpt-4` to `gpt-4o`");
	assert.equal(applyBodyTransforms("`claude-opus-5-5-xhigh`, `grok-4.7-xhigh-fast`"), "`inherit-parent`");
});

test("poteto-mode patch states the Pi model and thinking contract and fails loudly when upstream moves", () => {
	const out = patchPotetoModePi(POTETO_MODE);
	assert.match(out, /# Poteto mode\n\n`\/poteto-mode` enables this mode for the rest of the session\./);
	assert.match(out, /\*\*Defaults for every `Agent` call\.\*\* `run_in_background: true`/);
	assert.match(out, /Never pass `isolated: true`, because it strips MCP tools\./);
	assert.match(out, /pick the `thinking` level the job needs \(`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`\)/);
	assert.doesNotMatch(out, /fast mode only when|grok-|budget sets/);
	assert.throws(() => patchPotetoModePi("# Poteto mode\n\nnothing\n"), /patch target missing: defaults/);
});

test("file rules adapt scripts and reject an upstream edit that moves their target", () => {
	const { from, to } = makeFixture();
	const render = (rel) => renderWrite({ rel, class: "adapt" }, { from, to });

	const plan = render("skills/poteto-mode/scripts/check-plan.mjs");
	assert.match(plan, /const LANES = \/Ten lanes \(\?:on `\[\^`<>\]\+` \)\?at the PR head\/;/);
	assert.match(plan, /"hourly recurring wake"/);
	assert.match(plan, /lacks "Ten lanes at the PR head"/);

	const pkg = render("skills/poteto-mode/scripts/package.json");
	assert.match(pkg, /"name": "@zenspc\/pi-pstack-tools"/);
	assert.match(pkg, /"test": "bun test orch watch-pr"/);

	assert.match(
		render("skills/poteto-mode/scripts/worktree-audit.sh"),
		/transcripts="\$HOME\/\.pi\/agent\/sessions"/,
	);

	writeFileSync(join(from, "skills/poteto-mode/scripts/package.json"), "{}\n");
	assert.throws(() => render("skills/poteto-mode/scripts/package.json"), /found no match/);
});

test("sync converges: the second run changes no byte and Pi-owned files survive", () => {
	const { from, to } = makeFixture();
	const piOwned = ["skills/poteto-help/SKILL.md", "skills/setup-pstack/SKILL.md", "skills/poteto-mode/scripts/check-plan.test.mjs"];
	const before = hashTree(to);

	main(["--from", from, "--to", to]);
	const first = hashTree(to);
	for (const rel of piOwned) assert.equal(first[rel], before[rel], rel);
	assert.equal(existsSync(join(to, "skills/stale")), false);
	assert.equal(existsSync(join(to, "skills/make-bot-ui")), false);
	assert.equal(existsSync(join(to, "skills/poteto-mode/scripts/check-plan.test.ts")), false);
	assert.match(readFileSync(join(to, "extensions/pstack/skill-catalog.test.ts"), "utf8"), /skills\.length, 5\)/);
	assert.match(readFileSync(join(to, "README.md"), "utf8"), /\*\*5 skills\*\*, not all 5/);

	main(["--from", from, "--to", to]);
	assert.deepEqual(hashTree(to), first);
});

test("leftover Cursor constructs fail the sync", () => {
	const { from, to } = makeFixture();
	main(["--from", from, "--to", to]);
	for (const bad of [
		"Spawn with `subagent({ agent: \"worker\", task })`.",
		"Use ask_user_question.",
		"Run on `environment: \"cloud\"`.",
		"Read ~/.cursor/rules/pstack-models.mdc.",
		"Default `grok-4.7-xhigh-fast`.",
		"Arm /loop 1h.",
	]) {
		writeFileSync(join(to, "skills/poteto-help/SKILL.md"), `---\nname: poteto-help\ndescription: x\ndisable-model-invocation: true\n---\n\n${bad}\n`);
		assert.throws(() => assertNoCursorSeams(to), /cursor seams remain/, bad);
	}
});

test("pinned upstream checkout reproduces the packaged skills byte for byte", (t) => {
	const upstream = process.env.PSTACK_UPSTREAM;
	if (!upstream) return t.skip("set PSTACK_UPSTREAM to the pinned cursor/plugins pstack directory");
	assert.equal(JSON.parse(readFileSync(join(upstream, "plugin.json"), "utf8")).version, PIN.version);
	assert.equal(execFileSync("git", ["-C", upstream, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), PIN.commit);
	const copy = mkdtempSync(join(tmpdir(), "reground-live-"));
	cpSync(PACKAGE_ROOT, copy, { recursive: true, filter: (src) => !src.includes("node_modules") });
	const before = hashTree(copy);
	main(["--from", upstream, "--to", copy]);
	assert.deepEqual(hashTree(copy), before);
});
