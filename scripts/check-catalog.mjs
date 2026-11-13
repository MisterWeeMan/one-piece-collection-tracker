// Sanity check for a freshly generated card-catalog.json, run by the daily workflow before it commits.
// Usage: node scripts/check-catalog.mjs <new-catalog.json> <old-catalog.json>
// Exits with 1 (and prints why) if the new file looks broken, so a bad run never reaches main.
import { readFileSync } from 'node:fs';

const [newPath, oldPath] = process.argv.slice(2);
if (!newPath || !oldPath) { console.error('usage: check-catalog.mjs <new> <old>'); process.exit(2); }

const load = path => JSON.parse(readFileSync(path, 'utf8')).cards;
const fail = msg => { console.error('CATALOG CHECK FAILED: ' + msg); process.exit(1); };

let neu, old;
try { neu = load(newPath); old = load(oldPath); } catch (e) { fail('cannot read/parse JSON: ' + e.message); }
if (!neu || typeof neu !== 'object' || !old || typeof old !== 'object') fail('"cards" object is missing');

const countVariants = cards => Object.values(cards).reduce((n, e) => n + ((e && e.variants) || []).length, 0);
const newCodes = Object.keys(neu), oldCodes = Object.keys(old);

if (newCodes.length < 1000) fail('only ' + newCodes.length + ' codes');
const lost = oldCodes.filter(c => !neu[c]);
if (lost.length) fail(lost.length + ' codes disappeared, e.g. ' + lost.slice(0, 5).join(', '));
if (countVariants(neu) < countVariants(old)) fail('fewer versions than before (' + countVariants(neu) + ' < ' + countVariants(old) + ')');

// Every version must be [positive integer product id, non-empty label].
for (const code of newCodes) {
  const variants = neu[code].variants;
  if (!Array.isArray(variants)) fail(code + ': "variants" is not a list');
  for (const v of variants) {
    if (!Array.isArray(v) || !Number.isInteger(v[0]) || v[0] <= 0 || typeof v[1] !== 'string' || !v[1]) fail(code + ': bad version ' + JSON.stringify(v));
  }
}

console.log('catalog OK: ' + newCodes.length + ' codes (was ' + oldCodes.length + '), ' + countVariants(neu) + ' versions (was ' + countVariants(old) + ')');
