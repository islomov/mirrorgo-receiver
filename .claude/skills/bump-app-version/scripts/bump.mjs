#!/usr/bin/env node
// Sets APP_VERSION in worker/wrangler.jsonc (what GET smrr.tv/version answers).
//
//   node .claude/skills/bump-app-version/scripts/bump.mjs 1.0.1           # must be newer
//   node .claude/skills/bump-app-version/scripts/bump.mjs 1.0.1 --allow-lower
//
// Prints "<old> -> <new>". Exits 1 on a bad version, an older/equal version (without
// --allow-lower), or if APP_VERSION isn't found exactly once.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(here, "../../../../worker/wrangler.jsonc");

const args = process.argv.slice(2);
const allowLower = args.includes("--allow-lower");
const next = args.find((a) => !a.startsWith("--"))?.replace(/^v/i, "");

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const fail = (msg) => {
  console.error(`bump: ${msg}`);
  process.exit(1);
};

if (!next || !SEMVER.test(next)) fail(`expected a version like 1.0.1, got ${JSON.stringify(next ?? "")}`);

const text = readFileSync(file, "utf8");
const KEY = /("APP_VERSION"\s*:\s*")([^"]*)(")/g;
const matches = [...text.matchAll(KEY)];
if (matches.length !== 1) fail(`found APP_VERSION ${matches.length} times in ${file}, expected 1`);
const current = matches[0][2];

const parts = (v) => v.split(".").map(Number);
const compare = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

if (SEMVER.test(current)) {
  const order = compare(next, current);
  if (order === 0) fail(`APP_VERSION is already ${current}`);
  if (order < 0 && !allowLower) fail(`${next} is older than the current ${current} (pass --allow-lower to roll back)`);
}

writeFileSync(file, text.replace(KEY, `$1${next}$3`));
console.log(`${current} -> ${next}`);
