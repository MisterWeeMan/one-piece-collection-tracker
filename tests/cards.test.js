// Changes to cards (add, import, delete, squares, wishlist), history and bulk import.
// In-memory objects and made-up cards only (ZZ01-...): no localStorage, Firestore or real data.
var test = require('node:test');
var assert = require('node:assert/strict');
var L = require('../logic.js');

test('upsertCard: missing code or name = error and no change', function(){
  var cards = [];
  assert.deepEqual(L.upsertCard(cards, { code: '  ', name: 'X' }, 1), { ok: false, error: 'Codice mancante' });
  assert.deepEqual(L.upsertCard(cards, { code: 'ZZ01-001', name: '   ' }, 1), { ok: false, error: 'Nome mancante' });
  assert.deepEqual(L.upsertCard(cards, { code: 'ZZ01-001' }, 1), { ok: false, error: 'Nome mancante' });
  assert.equal(cards.length, 0);
});

test('upsertCard: new card, stored format unchanged', function(){
  var cards = [];
  var res = L.upsertCard(cards, { code: ' zz01-001 ', name: ' Prova ', set: '', rarity: ' sr ', leader: 1 }, 1000);
  assert.deepEqual(res, { ok: true, updated: false });
  // The exact keys of a saved card (op-collection-cards): they must not change without a migration.
  assert.deepEqual(cards, [{ code: 'ZZ01-001', name: 'Prova', set: 'Senza set', rarity: 'SR', leader: true, owned: 0, updatedAt: 1000 }]);
});

test('upsertCard: re-importing identical data does not change updatedAt', function(){
  var cards = [{ code: 'ZZ01-001', name: 'Prova', set: 'Set Finto', rarity: 'C', leader: false, owned: 2, updatedAt: 50 }];
  var res = L.upsertCard(cards, { code: 'zz01-001', name: 'Prova', set: 'Set Finto', rarity: 'c', leader: false }, 9999);
  assert.deepEqual(res, { ok: true, updated: true });
  assert.equal(cards.length, 1, 'niente doppioni');
  assert.equal(cards[0].updatedAt, 50);
  assert.equal(cards[0].owned, 2, 'le copie segnate restano');
});

test('upsertCard: a changed value updates updatedAt; empty set keeps the old one', function(){
  var cards = [{ code: 'ZZ01-001', name: 'Prova', set: 'Set Finto', rarity: 'C', leader: false, owned: 2, updatedAt: 50 }];
  L.upsertCard(cards, { code: 'ZZ01-001', name: 'Nuovo nome', set: '', rarity: 'C', leader: false }, 70);
  assert.equal(cards[0].name, 'Nuovo nome');
  assert.equal(cards[0].set, 'Set Finto');
  assert.equal(cards[0].updatedAt, 70);
});

test('upsertCard: becoming a Leader brings the copies down to 1', function(){
  var cards = [{ code: 'ZZ01-001', name: 'Prova', set: 'S', rarity: 'C', leader: false, owned: 3, updatedAt: 50 }];
  L.upsertCard(cards, { code: 'ZZ01-001', name: 'Prova', set: 'S', rarity: 'C', leader: true }, 70);
  assert.equal(cards[0].owned, 1);
  assert.equal(cards[0].updatedAt, 70);
});

test('target and clampOwned: 1 for Leaders, 4 for the others, never negative', function(){
  assert.equal(L.target({ leader: true }), 1);
  assert.equal(L.target({ leader: false }), 4);
  var a = { leader: false, owned: 9 }, b = { leader: true, owned: 3 }, c = { leader: false, owned: -2 };
  [a, b, c].forEach(L.clampOwned);
  assert.deepEqual([a.owned, b.owned, c.owned], [4, 1, 0]);
});

test('deleteCard: removes the card and writes the tombstone with the normalized code', function(){
  var cards = [{ code: 'ZZ01-001' }, { code: 'ZZ01-002' }], deleted = {};
  var rest = L.deleteCard(cards, deleted, ' zz01-001', 500);
  assert.deepEqual(rest, [{ code: 'ZZ01-002' }]);
  assert.deepEqual(deleted, { 'ZZ01-001': 500 });
  assert.equal(cards.length, 2, 'l\'array di partenza non cambia');
  L.deleteCard(rest, deleted, 'ZZ09-999', 600); // absent code: the tombstone is written anyway
  assert.equal(deleted['ZZ09-999'], 600);
});

test('tombstoneAll (clear collection): one tombstone per card', function(){
  var deleted = { 'ZZ01-009': 1 };
  L.tombstoneAll([{ code: 'ZZ01-001' }, { code: 'ZZ01-002' }], deleted, 700);
  assert.deepEqual(deleted, { 'ZZ01-009': 1, 'ZZ01-001': 700, 'ZZ01-002': 700 });
});

test('toggleOwned: second tap on the last square goes back, limits respected', function(){
  var c = { code: 'ZZ01-001', leader: false, owned: 0 };
  L.toggleOwned(c, 2, 10);
  assert.equal(c.owned, 3);
  assert.equal(c.updatedAt, 10);
  L.toggleOwned(c, 2, 11);
  assert.equal(c.owned, 2);
  L.toggleOwned(c, 0, 12);
  assert.equal(c.owned, 1);
  L.toggleOwned(c, 0, 13);
  assert.equal(c.owned, 0);
  var l = { code: 'ZZ01-002', leader: true, owned: 0 };
  L.toggleOwned(l, 3, 14); // one square beyond a Leader's target
  assert.equal(l.owned, 1);
});

test('toggleWish: the wishlist key exists only when active, never false', function(){
  var c = { code: 'ZZ01-001', owned: 0 };
  L.toggleWish(c, 5);
  assert.equal(c.wishlist, true);
  assert.equal(c.updatedAt, 5);
  L.toggleWish(c, 6);
  assert.equal('wishlist' in c, false);
  assert.equal(c.updatedAt, 6);
});

// ---- history ----
var DAY = new Date(2026, 0, 5, 12, 0, 0).getTime(); // 5 January 2026, local time

test('recordSnapshot: no cards, no entry', function(){
  var h = {};
  L.recordSnapshot([], h, DAY);
  assert.deepEqual(h, {});
});

test('recordSnapshot: counts min(copies, target) and total target', function(){
  var h = {};
  L.recordSnapshot([{ leader: false, owned: 9 }, { leader: true, owned: 1 }, { leader: false, owned: 2 }, { leader: false }], h, DAY);
  assert.deepEqual(h, { '2026-01-05': { t: DAY, owned: 7, target: 13 } });
});

test('recordSnapshot: same numbers do not change t, different numbers do', function(){
  var cards = [{ leader: false, owned: 1 }], h = {};
  L.recordSnapshot(cards, h, DAY);
  L.recordSnapshot(cards, h, DAY + 5000);
  assert.equal(h['2026-01-05'].t, DAY);
  cards[0].owned = 2;
  L.recordSnapshot(cards, h, DAY + 6000);
  assert.deepEqual(h['2026-01-05'], { t: DAY + 6000, owned: 2, target: 4 });
});

test('recordSnapshot: beyond 400 days the oldest are dropped', function(){
  var h = {};
  for(var i = 0; i < 400; i++) h['2020-' + String(i).padStart(4, '0')] = { t: i, owned: 0, target: 4 };
  L.recordSnapshot([{ leader: false, owned: 1 }], h, DAY);
  var keys = Object.keys(h);
  assert.equal(keys.length, 400);
  assert.ok(!('2020-0000' in h));
  assert.ok('2026-01-05' in h);
});

// ---- bulk import ----
test('parseBulk: lines code | name | set | rarity | L', function(){
  var r = L.parseBulk('ZZ01-001 | Uno | Set Finto | SR | L\r\nZZ01-002|Due|Set Finto\n\n  ZZ01-003 | Tre | | | leader\nZZ01-004 | Quattro | S | L');
  assert.equal(r.error, undefined);
  assert.deepEqual(r.cards, [
    { code: 'ZZ01-001', name: 'Uno', set: 'Set Finto', rarity: 'SR', leader: true },
    { code: 'ZZ01-002', name: 'Due', set: 'Set Finto', rarity: '', leader: false },
    { code: 'ZZ01-003', name: 'Tre', set: '', rarity: '', leader: true },
    { code: 'ZZ01-004', name: 'Quattro', set: 'S', rarity: '', leader: true }
  ]);
});

test('parseBulk: single-column line = error with the line number and no cards', function(){
  var r = L.parseBulk('ZZ01-001 | Uno\nsolo testo');
  assert.deepEqual(r, { cards: [], error: 'Riga 2 non valida: serve almeno codice | nome' });
});

test('parseBulk: JSON (array, single object, Italian keys) and invalid JSON', function(){
  var a = L.parseBulk('[{"code":"ZZ01-001","name":"Uno","set":"S","rarity":"C","isLeader":true},{"codice":"ZZ01-002","nome":"Due","rarita":"R"}]');
  assert.deepEqual(a.cards, [
    { code: 'ZZ01-001', name: 'Uno', set: 'S', rarity: 'C', leader: true },
    { code: 'ZZ01-002', name: 'Due', set: undefined, rarity: 'R', leader: false }
  ]);
  assert.equal(L.parseBulk('{"code":"ZZ01-003","name":"Tre"}').cards.length, 1);
  assert.equal(L.parseBulk('[{"code":').error, 'JSON non valido.');
});

test('parseBulk: empty text = error', function(){
  assert.equal(L.parseBulk('  \n ').error, 'Incolla almeno una riga.');
});

test('parseBulk + upsertCard: importing the same text twice neither duplicates nor refreshes', function(){
  var cards = [], text = 'ZZ01-001 | Uno | Set Finto | C\nZZ01-002 | Due | Set Finto | R';
  L.parseBulk(text).cards.forEach(function(c){ L.upsertCard(cards, c, 100); });
  L.parseBulk(text).cards.forEach(function(c){ L.upsertCard(cards, c, 200); });
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map(function(c){ return c.updatedAt; }), [100, 100]);
});
