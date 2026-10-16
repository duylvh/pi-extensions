import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).pi;

test("root Git manifest declares only pstack resources", () => {
  assert.deepEqual(manifest, {
    extensions: ["./packages/pi-pstack/extensions/pstack/index.ts"],
    skills: ["./packages/pi-pstack/skills"],
    subagents: { agents: ["./packages/pi-pstack/agents"] },
  });
});

test("root manifest paths exist", () => {
  const paths = [...manifest.extensions, ...manifest.skills, ...manifest.subagents.agents];
  for (const path of paths) assert.ok(existsSync(join(root, path)), path);
});
