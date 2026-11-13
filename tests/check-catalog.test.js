'use strict';
// Tests for scripts/check-catalog.mjs, the guard that stops a broken card-catalog.json from being committed.
// Made-up catalogs in a temp folder only: never the real card-catalog.json.
var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');
var spawnSync = require('node:child_process').spawnSync;

var SCRIPT = path.join(__dirname, '..', 'scripts', 'check-catalog.mjs');
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-catalog-'));
test.after(function(){ fs.rmSync(dir, { recursive: true, force: true }); });

// 1000 made-up codes (the script requires at least that many), each with a base version and an alternate one.
function fakeCatalog(){
  var cards = {};
  for(var i = 1; i <= 1000; i++){
    var code = 'XX01-' + String(i).padStart(3, '0');
    cards[code] = { variants: [[100000 + i, 'Base'], [200000 + i, 'Alternate Art']] };
  }
  return { generatedAt: '2026-01-01', cards: cards };
}

var n = 0;
function run(neu, old){
  var write = function(content){
    var p = path.join(dir, 'c' + (n++) + '.json');
    fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
    return p;
  };
  var res = spawnSync(process.execPath, [SCRIPT, write(neu), write(old)], { encoding: 'utf8' });
  return { code: res.status, out: res.stdout + res.stderr };
}

test('check-catalog: accepts an unchanged catalog and one that gained cards', function(){
  assert.strictEqual(run(fakeCatalog(), fakeCatalog()).code, 0);
  var bigger = fakeCatalog();
  bigger.cards['XX02-001'] = { variants: [[300001, 'Base']] };
  assert.strictEqual(run(bigger, fakeCatalog()).code, 0);
});

test('check-catalog: rejects a catalog that lost a code', function(){
  var neu = fakeCatalog();
  delete neu.cards['XX01-001'];
  neu.cards['XX02-001'] = { variants: [[300001, 'Base'], [300002, 'Alternate Art']] }; // total versions unchanged
  var res = run(neu, fakeCatalog());
  assert.strictEqual(res.code, 1);
  assert.match(res.out, /disappeared/);
});

test('check-catalog: rejects a catalog with fewer versions', function(){
  var neu = fakeCatalog();
  neu.cards['XX01-001'].variants.pop();
  var res = run(neu, fakeCatalog());
  assert.strictEqual(res.code, 1);
  assert.match(res.out, /fewer versions/);
});

test('check-catalog: rejects a bad version (non-numeric id or empty label)', function(){
  var badId = fakeCatalog();
  badId.cards['XX01-001'].variants[0] = ['abc', 'Base'];
  assert.strictEqual(run(badId, fakeCatalog()).code, 1);
  var noLabel = fakeCatalog();
  noLabel.cards['XX01-001'].variants[0] = [100001, ''];
  assert.strictEqual(run(noLabel, fakeCatalog()).code, 1);
});

test('check-catalog: rejects a tiny catalog, a missing cards object and non-JSON', function(){
  var tiny = { cards: { 'XX01-001': { variants: [] } } };
  assert.strictEqual(run(tiny, { cards: {} }).code, 1);
  assert.strictEqual(run({ generatedAt: 'x' }, fakeCatalog()).code, 1);
  assert.strictEqual(run('<html>502 Bad Gateway', fakeCatalog()).code, 1);
});
