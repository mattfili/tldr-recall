#!/usr/bin/env node
/**
 * build_fixture.mjs — reproducible converter (Recall Issue #2, Stage 1B).
 *
 * Loads tldr-web/data.js (which assigns `window.RECALL = {...}` inside an IIFE)
 * and writes backend/tests/fixtures/recall_seed.json, preserving VERBATIM all of
 * CATS, ED, ED_META, CAT_ORDER, ITEMS (every field), and COLLECTIONS.
 *
 * data.js targets the browser, so it references `window`. We shim a bare global
 * `window` object, evaluate the file in this process, then serialize the captured
 * `window.RECALL`. No schema transformation happens here — that is the seed job's
 * job (a later stage). This converter only freezes the prototype data as JSON.
 *
 * Usage:  node backend/tests/fixtures/build_fixture.mjs
 *         (run from the repo root, or anywhere — paths resolve relative to this file)
 *
 * Reproducible: re-running overwrites recall_seed.json with byte-identical output
 * for the same data.js input.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runInThisContext } from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
// repo root is four levels up: fixtures -> tests -> backend -> <repo root>
const repoRoot = resolve(__dirname, '..', '..', '..');
const dataJsPath = resolve(repoRoot, 'tldr-web', 'data.js');
const outPath = resolve(__dirname, 'recall_seed.json');

// Shim the browser global the IIFE writes to.
globalThis.window = {};

// Evaluate data.js in this process. The IIFE sets globalThis.window.RECALL.
const source = readFileSync(dataJsPath, 'utf8');
runInThisContext(source, { filename: dataJsPath });

const recall = globalThis.window.RECALL;
if (!recall || typeof recall !== 'object') {
  throw new Error(`data.js did not populate window.RECALL (got ${typeof recall})`);
}

// Sanity: the keys we promised to preserve must all be present.
const required = ['CATS', 'ED', 'ED_META', 'CAT_ORDER', 'ITEMS', 'COLLECTIONS'];
for (const key of required) {
  if (!(key in recall)) {
    throw new Error(`window.RECALL is missing required key: ${key}`);
  }
}

// Pretty-print, verbatim. JSON.stringify preserves key order from the object
// literal, so CATS / ED / ED_META / ITEMS / COLLECTIONS keep data.js order.
const json = JSON.stringify(recall, null, 2) + '\n';
writeFileSync(outPath, json, 'utf8');

console.error(`wrote ${outPath}`);
console.error(`  CATS=${Object.keys(recall.CATS).length}` +
  ` ED=${Object.keys(recall.ED).length}` +
  ` ED_META=${Object.keys(recall.ED_META).length}` +
  ` CAT_ORDER=${recall.CAT_ORDER.length}` +
  ` ITEMS=${recall.ITEMS.length}` +
  ` COLLECTIONS=${recall.COLLECTIONS.length}`);
