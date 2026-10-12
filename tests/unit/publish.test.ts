// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

describe("public repository boundary", () => {
  it("scans staged bytes rather than a cleaned working copy", () => {
    const directory = mkdtempSync(join(tmpdir(), "openpage-publish-"));
    try {
      execFileSync("git", ["init", "-b", "main"], {
        cwd: directory,
        stdio: "ignore",
      });
      const file = join(directory, "README.md");
      writeFileSync(file, "ghp_" + "X".repeat(30));
      execFileSync("git", ["add", "README.md"], { cwd: directory });
      writeFileSync(file, "clean working copy");
      const check = spawnSync(
        process.execPath,
        [resolve("scripts/check-publish.mjs"), "--staged"],
        { cwd: directory, encoding: "utf8" },
      );
      expect(check.status).toBe(1);
      expect(check.stderr).toContain("possible credential");
      execFileSync("git", ["add", "README.md"], { cwd: directory });
      const safe = spawnSync(
        process.execPath,
        [resolve("scripts/check-publish.mjs"), "--staged"],
        { cwd: directory, encoding: "utf8" },
      );
      expect(safe.status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("rejects internal work files even when someone force-stages them", () => {
    const directory = mkdtempSync(join(tmpdir(), "openpage-publish-"));
    try {
      execFileSync("git", ["init", "-b", "main"], {
        cwd: directory,
        stdio: "ignore",
      });
      writeFileSync(join(directory, "findings.md"), "internal");
      execFileSync("git", ["add", "findings.md"], { cwd: directory });
      const check = spawnSync(
        process.execPath,
        [resolve("scripts/check-publish.mjs")],
        { cwd: directory, encoding: "utf8" },
      );
      expect(check.status).toBe(1);
      expect(check.stderr).toContain("allowlist");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
