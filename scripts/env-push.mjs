/**
 * Reads .env.local and pushes non-VITE_ variables to Convex.
 * Usage: node scripts/env-push.mjs
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SKIP_PREFIXES = ["VITE_"];
const SKIP_EXACT = new Set(["CONVEX_DEPLOYMENT"]);

let envFile;
try {
  envFile = readFileSync(".env.local", "utf-8");
} catch {
  console.error("No .env.local found in current directory.");
  process.exit(1);
}

const vars = [];
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) continue;
  const key = trimmed.slice(0, eqIndex);
  const value = trimmed.slice(eqIndex + 1);
  if (SKIP_PREFIXES.some((p) => key.startsWith(p))) continue;
  if (SKIP_EXACT.has(key)) continue;
  vars.push({ key, value });
}

if (vars.length === 0) {
  console.log("No Convex env vars found in .env.local");
  process.exit(0);
}

console.log(`Pushing ${vars.length} env var(s) to Convex:\n`);
for (const { key } of vars) {
  console.log(`  ${key}`);
}
console.log();

for (const { key, value } of vars) {
  try {
    execFileSync("npx", ["convex", "env", "set", key, value], {
      stdio: "inherit",
    });
  } catch {
    console.error(`Failed to set ${key}`);
    process.exit(1);
  }
}
console.log("Done.");
