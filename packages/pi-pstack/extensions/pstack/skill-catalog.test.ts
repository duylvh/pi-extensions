import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills");
const DISCOVERABLE = ["how", "typescript-best-practices", "unslop", "why"];

type SkillFrontmatter = {
	name: string;
	hidden: boolean;
	body: string;
};

function parseSkill(dir: string): SkillFrontmatter {
	const text = readFileSync(join(SKILLS_DIR, dir, "SKILL.md"), "utf8");
	assert.ok(text.startsWith("---\n"), `${dir}: missing opening frontmatter`);
	const close = text.indexOf("\n---\n", 4);
	assert.ok(close !== -1, `${dir}: missing closing frontmatter`);
	const frontmatter = text.slice(4, close);
	const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
	assert.ok(name, `${dir}: missing name`);
	return {
		name,
		hidden: /^disable-model-invocation:\s*true\s*$/m.test(frontmatter),
		body: text.slice(close + "\n---\n".length),
	};
}

function loadSkills(): SkillFrontmatter[] {
	return readdirSync(SKILLS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => parseSkill(entry.name));
}

describe("pstack skill catalog", () => {
	it("lists only how, why, unslop, and typescript-best-practices as Discoverable skills", () => {
		const skills = loadSkills();
		assert.equal(skills.length, 54);
		const discoverable = skills.filter((skill) => !skill.hidden).map((skill) => skill.name).sort();
		assert.deepEqual(discoverable, DISCOVERABLE);
		assert.equal(skills.filter((skill) => skill.hidden).length, 50);
	});

	it("keeps a Skill body for every Hidden skill so /skill:name can load it", () => {
		const hidden = loadSkills().filter((skill) => skill.hidden);
		assert.equal(hidden.length, 50);
		for (const skill of hidden) {
			assert.ok(skill.body.trim().length > 0, `${skill.name}: empty Skill body`);
		}
	});
});

const PACKAGE_ROOT = join(SKILLS_DIR, "..");
const ADDED_IN_0_15_25 = [
	"benchmark-checklist",
	"correct",
	"in-your-own-words",
	"ketchup",
	"poteto-help",
	"principle-explain-the-number",
	"sharpen",
];

function markdownFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === "node_modules" ? [] : markdownFiles(path);
		return entry.name.endsWith(".md") ? [path] : [];
	});
}

describe("pstack package contents", () => {
	it("ships the skills added in 0.15.25 as Hidden skills", () => {
		const byName = new Map(loadSkills().map((skill) => [skill.name, skill]));
		for (const name of ADDED_IN_0_15_25) {
			assert.equal(byName.get(name)?.hidden, true, name);
		}
	});

	it("resolves every relative Markdown link in the skills", () => {
		const broken: string[] = [];
		for (const file of markdownFiles(SKILLS_DIR)) {
			const text = readFileSync(file, "utf8");
			for (const match of text.matchAll(/\]\((\.{1,2}\/[^)#\s]*)(?:#[^)]*)?\)/g)) {
				if (!existsSync(join(dirname(file), match[1]))) broken.push(`${file.slice(SKILLS_DIR.length + 1)}: ${match[1]}`);
			}
		}
		assert.deepEqual(broken, []);
	});

	it("declares the packaged agents for pi-subagents", () => {
		const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
		assert.deepEqual(pkg.pi.subagents.agents, ["./agents"]);
		for (const name of ["poteto-agent", "comment-sicko"]) {
			const text = readFileSync(join(PACKAGE_ROOT, "agents", `${name}.md`), "utf8");
			assert.match(text, new RegExp(`^name: ${name}$`, "m"));
		}
		const pstack = readFileSync(join(PACKAGE_ROOT, "agents", "poteto-agent.md"), "utf8");
		const frontmatter = pstack.slice(4, pstack.indexOf("\n---\n", 4));
		assert.doesNotMatch(frontmatter, /^thinking:/m);
	});
});
