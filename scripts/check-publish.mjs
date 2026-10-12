import { execFileSync } from "node:child_process";

const mode = process.argv.includes("--staged")
  ? ["diff", "--cached", "--diff-filter=ACMR", "--name-only", "-z"]
  : ["ls-files", "-z"];
const files = execFileSync("git", mode, { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const denied =
  /(^|\/)(?:\.codex|\.agents|\.local|node_modules|dist|coverage|test-results|playwright-report|[^/]*browser-profile[^/]*)(\/|$)|(^|\/)(?:find|findings|task_plan|progress|implementation-plan)\.md$|开发计划\.md$|(^|\/)\.env|\.log$/;
const allowedRoot =
  /^(?:README(?:\.en)?\.md|LICENSE|THIRD_PARTY_NOTICES\.md|CONTRIBUTING\.md|SECURITY\.md|CODE_OF_CONDUCT\.md|CHANGELOG\.md|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json|vitest\.config\.ts|playwright\.config\.ts|eslint\.config\.mjs|\.gitignore|\.editorconfig)$/;
const failures = [];
for (const file of files) {
  if (
    denied.test(file) ||
    !(
      allowedRoot.test(file) ||
      /^(src|tests|scripts|docs|\.github)\//.test(file)
    )
  ) {
    failures.push(`${file}: not in public file allowlist`);
    continue;
  }
  const content = execFileSync("git", ["show", `:${file}`], {
    encoding: "utf8",
    maxBuffer: 10000000,
  });
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_|github_pat_|sk-)[A-Za-z0-9_]{20,}/.test(
      content,
    )
  ) {
    failures.push(`${file}: possible credential`);
  }
}
if (!files.length) failures.push("No public files found");
const branches = execFileSync(
  "git",
  ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
const unbornMain =
  branches.length === 0 &&
  execFileSync("git", ["symbolic-ref", "--short", "HEAD"], {
    encoding: "utf8",
  }).trim() === "main";
if (!unbornMain && (branches.length !== 1 || branches[0] !== "main"))
  failures.push("Repository must have only main");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Public file and credential checks passed (${files.length} files, main only)`,
);
