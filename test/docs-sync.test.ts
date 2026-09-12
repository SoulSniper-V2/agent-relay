import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const skill = read("skills/agent-relay/SKILL.md");
const references = ["auth", "triage"];

test("skill and reference mirrors match the canonical docs", () => {
  for (const mirror of [
    "www/skill.md",
    ".agents/skills/agent-relay/SKILL.md",
    ".cursor/skills/agent-relay/SKILL.md",
  ]) {
    assert.equal(read(mirror), skill, mirror);
  }

  for (const name of references) {
    const source = read(`skills/agent-relay/references/${name}.md`);
    for (const mirror of [
      `www/references/${name}.md`,
      `.agents/skills/agent-relay/references/${name}.md`,
      `.cursor/skills/agent-relay/references/${name}.md`,
    ]) {
      assert.equal(read(mirror), source, mirror);
    }
  }
});

test("llms-full is the deterministic concatenation produced by the sync script", () => {
  const section = (name: string, body: string, separator = true) =>
    `----- ${name} -----\n\n${body}${separator ? "\n" : ""}`;
  const expected =
    "# Agent Relay (full)\n\n" +
    "Generated from skill.md, llms.txt, and docs.md. Prefer the smaller files when you can.\n\n" +
    section("skill.md", skill) +
    section("llms.txt", read("www/llms.txt")) +
    section("docs.md", read("www/docs.md"), false);

  assert.equal(read("www/llms-full.txt"), expected);
});
