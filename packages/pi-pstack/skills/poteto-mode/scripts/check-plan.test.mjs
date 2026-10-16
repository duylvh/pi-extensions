import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

test("bundled multi-phase-plan skeleton passes check-plan.mjs", () => {
	const playbook = readFileSync(join(here, "../playbooks/multi-phase-plan.md"), "utf8");
	const open = playbook.indexOf("````markdown\n");
	assert.notEqual(open, -1, "playbook is missing the skeleton fence");
	const start = open + "````markdown\n".length;
	const close = playbook.indexOf("````", start);
	assert.notEqual(close, -1, "playbook skeleton fence is unclosed");
	const dir = mkdtempSync(join(tmpdir(), "check-plan-"));
	const file = join(dir, "plan.md");
	writeFileSync(file, playbook.slice(start, close));
	const result = spawnSync(process.execPath, [join(here, "check-plan.mjs"), file], {
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr + result.stdout);
});

const RULE =
	"Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.";

const VALID_PLAN = `# Demo

## How to read this
One box is one unit of work and names the evidence. Check a box only when its evidence exists. See playbooks/.
${RULE}

## Program checklist
### Arm the program
### Spawn owners
### PR mechanics
### Verdict and merge
### Boot recipe
\`git show origin/main:\` hourly recurring wake status message

## PR 1
**Depends on.** None.
**Files.**
- [ ] Do the thing.
**Build.**
- [ ] Do the thing.
**You see.**
- [ ] Do the thing.
**Verify, unit.** ${RULE}
- [ ] Check the thing.
**Verify, live.** ${RULE} Ten lanes at the PR head
${Array.from({ length: 10 }, (_, i) => `- [ ] Lane ${i + 1}. Save \`lane-${i + 1}.png\`. Pass when evidence exists.`).join("\n")}
**Verify, perf.** ${RULE}
- [ ] Metric. Recorded.
- [ ] Probe. Recorded.
- [ ] Baseline. Recorded.
- [ ] Rule. Recorded.
**Review gate.** None.
**Merge.**
- [ ] Merge when approved.

## Close the program
Close.

## Appendix Prototype evidence
Recorded.
`;

function checkPlan(plan) {
	const dir = mkdtempSync(join(tmpdir(), "check-plan-"));
	const file = join(dir, "plan.md");
	writeFileSync(file, plan);
	return spawnSync(process.execPath, [join(here, "check-plan.mjs"), file], { encoding: "utf8" });
}

test("accepts the minimal valid plan", () => {
	const result = checkPlan(VALID_PLAN);
	assert.equal(result.status, 0, result.stderr);
});

test("accepts a lanes line that names the swarm model", () => {
	const result = checkPlan(VALID_PLAN.replace("Ten lanes at the PR head", "Ten lanes on `inherit-parent` at the PR head"));
	assert.equal(result.status, 0, result.stderr);
});

test("rejects a live block without the lanes line", () => {
	const result = checkPlan(VALID_PLAN.replace("Ten lanes at the PR head", "Some lanes"));
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Verify, live lacks "Ten lanes at the PR head"/);
});

test("rejects a program checklist without the hourly wake", () => {
	const result = checkPlan(VALID_PLAN.replace("hourly recurring wake", ""));
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Program checklist lacks "hourly recurring wake"/);
});

test("accepts ordinary, indented, and longer closing fences", () => {
	for (const indent of ["", " ", "  ", "   "]) {
		const result = checkPlan(`${VALID_PLAN}${indent}\`\`\`markdown\n## Example only\n${indent}\`\`\`\n`);
		assert.equal(result.status, 0, result.stderr);
	}
	assert.equal(checkPlan(`${VALID_PLAN}\`\`\`markdown\n## Example only\n\`\`\`\`\n`).status, 0);
});

test("accepts nested backticks and tilde info strings", () => {
	assert.equal(
		checkPlan(`${VALID_PLAN}\`\`\`\`markdown\n\`\`\`markdown\n## Example only\n\`\`\`\n\`\`\`\`\n`).status,
		0,
	);
	assert.equal(checkPlan(`${VALID_PLAN}~~~markdown \`info\`\n## Example only\n ~~~\n`).status, 0);
});

test("keeps mismatched, shorter, and suffixed closers inside the fence", () => {
	for (const closer of ["~~~", "```", "``` info"]) {
		const result = checkPlan(`${VALID_PLAN}\`\`\`\`markdown\n${closer}\n## Example only\n\`\`\`\`\n`);
		assert.equal(result.status, 0, `${closer}: ${result.stderr}`);
	}
});

test("rejects headings and prose outside a proper close", () => {
	for (const suffix of ["  ", "\t"]) {
		const heading = checkPlan(`${VALID_PLAN}\`\`\`markdown\n## Example only\n\`\`\`${suffix}\n## Example only\n`);
		assert.equal(heading.status, 1);
		assert.match(heading.stderr, /"## Example only" after Close the program is not an appendix/);
	}
	const prose = checkPlan(
		`${VALID_PLAN}\`\`\`markdown\nThis prose has a mid-sentence colon: inside code\n\`\`\`\nThis prose has a mid-sentence colon: bad.\n`,
	);
	assert.equal(prose.status, 1);
	assert.match(prose.stderr, /mid-sentence colon/);
});

test("rejects backtick info strings containing a backtick", () => {
	const result = checkPlan(`${VALID_PLAN}\`\`\`markdown \`invalid\`\n## Example only\n\`\`\`\n`);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /"## Example only" after Close the program is not an appendix/);
});
