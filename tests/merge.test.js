// Sync merge (collection and decks), tombstones, canonical form and cleaning of remote data.
// In-memory objects and made-up cards only (ZZ01-...): no localStorage, Firestore or real data.
var test = require('node:test');
var assert = require('node:assert/strict');
var L = require('../logic.js');

function card(code, updatedAt, extra){
  var c = { code: code, name: 'Carta ' + code, set: 'Set Finto', rarity: 'C', leader: false, owned: 0 };
  if(updatedAt !== undefined) c.updatedAt = updatedAt;
  Object.keys(extra || {}).forEach(function(k){ c[k] = extra[k]; });
  return c;
}
function snap(cards, deleted, history){ return { cards: cards, deleted: deleted || {}, history: history || {} }; }
function codes(s){ return s.cards.map(function(c){ return c.code; }).sort(); }
function byCode(s, code){ return s.cards.filter(function(c){ return c.code === code; })[0]; }

test('merge: a card only local or only remote is kept (no loss)', function(){
  var m = L.mergeSnapshots(snap([card('ZZ01-001', 5)]), snap([card('ZZ01-002', 5)]));
  assert.deepEqual(codes(m), ['ZZ01-001', 'ZZ01-002']);
});

test('merge: same code on both sides = a single card', function(){
  var m = L.mergeSnapshots(snap([card('ZZ01-001', 5)]), snap([card('ZZ01-001', 5)]));
  assert.equal(m.cards.length, 1);
});

test('merge: higher updatedAt wins; on a tie the remote wins; missing updatedAt counts as 0', function(){
  var loc = card('ZZ01-001', 20, { owned: 3 }), rem = card('ZZ01-001', 10, { owned: 1 });
  assert.equal(byCode(L.mergeSnapshots(snap([loc]), snap([rem])), 'ZZ01-001').owned, 3);
  assert.equal(byCode(L.mergeSnapshots(snap([rem]), snap([loc])), 'ZZ01-001').owned, 3);
  var a = card('ZZ01-001', 10, { owned: 2 }), b = card('ZZ01-001', 10, { owned: 4 });
  assert.equal(byCode(L.mergeSnapshots(snap([a]), snap([b])), 'ZZ01-001').owned, 4, 'parità: remota');
  var vecchia = card('ZZ01-001', undefined, { owned: 4 }), nuova = card('ZZ01-001', 1, { owned: 2 });
  assert.equal(byCode(L.mergeSnapshots(snap([vecchia]), snap([nuova])), 'ZZ01-001').owned, 2);
  assert.equal(byCode(L.mergeSnapshots(snap([nuova]), snap([vecchia])), 'ZZ01-001').owned, 2);
});

test('merge: remote tombstone newer than (or equal to) the local card deletes it', function(){
  var loc = snap([card('ZZ01-001', 10)]);
  assert.equal(L.mergeSnapshots(loc, snap([], { 'ZZ01-001': 11 })).cards.length, 0);
  assert.equal(L.mergeSnapshots(loc, snap([], { 'ZZ01-001': 10 })).cards.length, 0, 'uguale = eliminata');
});

test('merge: local tombstone against remote card (symmetric)', function(){
  var rem = snap([card('ZZ01-001', 10)]);
  assert.equal(L.mergeSnapshots(snap([], { 'ZZ01-001': 11 }), rem).cards.length, 0);
});

test('merge: card newer than the tombstone is kept and the tombstone is removed', function(){
  var m = L.mergeSnapshots(snap([card('ZZ01-001', 20)]), snap([], { 'ZZ01-001': 10 }));
  assert.deepEqual(codes(m), ['ZZ01-001']);
  assert.deepEqual(m.deleted, {});
});

test('merge: card without updatedAt does not beat a tombstone', function(){
  var m = L.mergeSnapshots(snap([card('ZZ01-001')]), snap([], { 'ZZ01-001': 1 }));
  assert.equal(m.cards.length, 0);
});

test('merge: two tombstones on the same code, the newer one is kept', function(){
  var m = L.mergeSnapshots(snap([], { 'ZZ01-001': 5 }), snap([], { 'ZZ01-001': 9 }));
  assert.deepEqual(m.deleted, { 'ZZ01-001': 9 });
});

test('merge: tombstone of a missing card is kept (other devices need it)', function(){
  var m = L.mergeSnapshots(snap([], { 'ZZ01-009': 7 }), snap([]));
  assert.deepEqual(m.deleted, { 'ZZ01-009': 7 });
});

test('merge: empty remote (new document) loses nothing', function(){
  var m = L.mergeSnapshots(snap([card('ZZ01-001', 5)], { 'ZZ01-002': 3 }, { '2026-01-05': { t: 1, owned: 1, target: 4 } }), L.cleanSnapshot({}));
  assert.deepEqual(codes(m), ['ZZ01-001']);
  assert.deepEqual(m.deleted, { 'ZZ01-002': 3 });
  assert.equal(Object.keys(m.history).length, 1);
});

test('merge: history, days are united and the higher t wins', function(){
  var loc = snap([], {}, { '2026-01-05': { t: 20, owned: 9, target: 40 }, '2026-01-06': { t: 5, owned: 1, target: 4 } });
  var rem = snap([], {}, { '2026-01-05': { t: 10, owned: 8, target: 40 }, '2026-01-04': { t: 1, owned: 0, target: 4 } });
  var m = L.mergeSnapshots(loc, rem);
  assert.deepEqual(Object.keys(m.history).sort(), ['2026-01-04', '2026-01-05', '2026-01-06']);
  assert.equal(m.history['2026-01-05'].owned, 9);
});

test('merge: does not modify the inputs', function(){
  var loc = snap([card('ZZ01-001', 20)], { 'ZZ01-002': 3 });
  var rem = snap([card('ZZ01-001', 10), card('ZZ01-002', 1)], { 'ZZ01-003': 4 });
  var l0 = JSON.stringify(loc), r0 = JSON.stringify(rem);
  L.mergeSnapshots(loc, rem);
  assert.equal(JSON.stringify(loc), l0);
  assert.equal(JSON.stringify(rem), r0);
});

test('merge: repeating it does not change the result (sync does read, merge, merge again)', function(){
  var a = snap([card('ZZ01-001', 20, { owned: 2 }), card('ZZ01-002', 5)], { 'ZZ01-003': 9 });
  var b = snap([card('ZZ01-001', 10, { owned: 1 }), card('ZZ01-003', 4)], { 'ZZ01-002': 6 });
  var ab = L.mergeSnapshots(a, b);
  assert.equal(L.canonSnapshot(L.mergeSnapshots(ab, b)), L.canonSnapshot(ab));
  assert.equal(L.canonSnapshot(L.mergeSnapshots(a, ab)), L.canonSnapshot(ab));
  assert.equal(L.canonSnapshot(L.mergeSnapshots(a, a)), L.canonSnapshot(a));
});

test('merge: the order of the two sides does not matter (no ties)', function(){
  var a = snap([card('ZZ01-001', 20, { owned: 2 })], { 'ZZ01-003': 9 });
  var b = snap([card('ZZ01-001', 10, { owned: 1 }), card('ZZ01-003', 4)], {});
  assert.equal(L.canonSnapshot(L.mergeSnapshots(a, b)), L.canonSnapshot(L.mergeSnapshots(b, a)));
});

test('merge: two-device scenario, code rename', function(){
  // Device A renames ZZ01-001 to ZZ01-010: new card + tombstone of the old one.
  var cards = [card('ZZ01-001', 10, { owned: 2 })], deleted = {};
  L.upsertCard(cards, { code: 'ZZ01-010', name: 'Carta ZZ01-001', set: 'Set Finto' }, 100);
  cards = L.deleteCard(cards, deleted, 'ZZ01-001', 100);
  var a = snap(cards, deleted);
  // Device B still has the old one (updated before the rename).
  var b = snap([card('ZZ01-001', 10, { owned: 2 })]);
  assert.deepEqual(codes(L.mergeSnapshots(a, b)), ['ZZ01-010']);
  assert.deepEqual(codes(L.mergeSnapshots(b, a)), ['ZZ01-010']);
});

test('merge: scenario delete on A, later edit on B = the edit wins', function(){
  var a = snap([], { 'ZZ01-001': 50 });
  var b = snap([card('ZZ01-001', 60, { owned: 4 })]);
  assert.equal(byCode(L.mergeSnapshots(a, b), 'ZZ01-001').owned, 4);
});

test('merge: the whole card wins, fields from different versions are not mixed', function(){
  // Known limit: owned marked on one device and wishlist on another, one of the two changes is lost.
  var a = card('ZZ01-001', 20, { owned: 3 }), b = card('ZZ01-001', 10, { wishlist: true });
  var c = byCode(L.mergeSnapshots(snap([a]), snap([b])), 'ZZ01-001');
  assert.equal(c.owned, 3);
  assert.equal(c.wishlist, undefined);
});

test('canonSnapshot: order does not matter, different content changes the string', function(){
  var x = snap([card('ZZ01-001', 1), card('ZZ01-002', 2)], { b: 2, a: 1 });
  var y = snap([card('ZZ01-002', 2), card('ZZ01-001', 1)], { a: 1, b: 2 });
  assert.equal(L.canonSnapshot(x), L.canonSnapshot(y));
  var z = snap([card('ZZ01-002', 2), card('ZZ01-001', 1, { owned: 1 })], { a: 1, b: 2 });
  assert.notEqual(L.canonSnapshot(x), L.canonSnapshot(z));
  assert.notEqual(L.canonSnapshot(x), L.canonSnapshot(snap(x.cards, { a: 1 })));
});

test('cleanMeta and cleanSnapshot: malformed data gives empty values', function(){
  [null, undefined, 'testo', 5, [], { deleted: 'x', history: 3 }].forEach(function(bad){
    assert.deepEqual(L.cleanMeta(bad), { deleted: {}, history: {} });
  });
  var s = L.cleanSnapshot({ cards: [null, { name: 'senza codice' }, { code: 5 }, card('ZZ01-001', 1)], deleted: { 'ZZ01-002': 3 } });
  assert.deepEqual(codes(s), ['ZZ01-001']);
  assert.deepEqual(s.deleted, { 'ZZ01-002': 3 });
  assert.deepEqual(s.history, {});
  assert.deepEqual(L.cleanSnapshot({ cards: 'no' }).cards, []);
});

// ---- decks ----
function deck(id, updatedAt, extra){
  var d = { id: id, name: 'Mazzo ' + id, leader: 'ZZ01-001', cards: [['ZZ01-001', 1], ['ZZ01-002', 4]], createdAt: 1 };
  if(updatedAt !== undefined) d.updatedAt = updatedAt;
  Object.keys(extra || {}).forEach(function(k){ d[k] = extra[k]; });
  return d;
}
function ids(s){ return s.list.map(function(d){ return d.id; }).sort(); }

test('decks: union, higher updatedAt wins, on a tie the remote wins', function(){
  var m = L.mergeDecks({ list: [deck('a', 20, { name: 'locale' }), deck('b', 1)], deleted: {} },
    { list: [deck('a', 10, { name: 'remoto' }), deck('c', 1)], deleted: {} });
  assert.deepEqual(ids(m), ['a', 'b', 'c']);
  assert.equal(m.list.filter(function(d){ return d.id === 'a'; })[0].name, 'locale');
  var p = L.mergeDecks({ list: [deck('a', 10, { name: 'locale' })], deleted: {} }, { list: [deck('a', 10, { name: 'remoto' })], deleted: {} });
  assert.equal(p.list[0].name, 'remoto');
});

test('decks: the tombstone stops a deleted deck from reappearing', function(){
  var rem = { list: [deck('a', 10)], deleted: {} };
  assert.equal(L.mergeDecks({ list: [], deleted: { a: 10 } }, rem).list.length, 0, 'uguale = eliminato');
  assert.equal(L.mergeDecks({ list: [], deleted: { a: 11 } }, rem).list.length, 0);
  var back = L.mergeDecks({ list: [], deleted: { a: 5 } }, rem);
  assert.deepEqual(ids(back), ['a']);
  assert.deepEqual(back.deleted, {});
});

test('decks: two tombstones, the newer one is kept; inputs not modified', function(){
  var loc = { list: [deck('a', 1)], deleted: { x: 5 } }, rem = { list: [], deleted: { x: 9, a: 3 } };
  var l0 = JSON.stringify(loc), r0 = JSON.stringify(rem);
  var m = L.mergeDecks(loc, rem);
  assert.equal(m.deleted.x, 9);
  assert.equal(JSON.stringify(loc), l0);
  assert.equal(JSON.stringify(rem), r0);
});

test('decks: repeated merge is stable and canonical form does not depend on order', function(){
  var a = { list: [deck('a', 20), deck('b', 5)], deleted: { z: 3 } };
  var b = { list: [deck('a', 10), deck('c', 4)], deleted: { b: 6 } };
  var ab = L.mergeDecks(a, b);
  assert.equal(L.canonDecks(L.mergeDecks(ab, b)), L.canonDecks(ab));
  assert.equal(L.canonDecks({ list: [deck('b', 1), deck('a', 1)], deleted: { y: 1, x: 2 } }),
    L.canonDecks({ list: [deck('a', 1), deck('b', 1)], deleted: { x: 2, y: 1 } }));
  assert.notEqual(L.canonDecks({ list: [deck('a', 1)], deleted: {} }), L.canonDecks({ list: [deck('a', 2)], deleted: {} }));
});

test('cleanDecks: drops invalid decks and rows', function(){
  assert.deepEqual(L.cleanDecks(null), { list: [], deleted: {} });
  assert.deepEqual(L.cleanDecks('x'), { list: [], deleted: {} });
  assert.deepEqual(L.cleanDecks({ list: 'no', deleted: 4 }), { list: [], deleted: {} });
  var c = L.cleanDecks({ list: [null, { id: 5, cards: [] }, { id: 'senza-carte' },
    { id: 'ok', cards: [['ZZ01-001', 1], ['ZZ01-002', 0], ['ZZ01-003', -2], [7, 1], 'x', ['ZZ01-004', 3]] }], deleted: { q: 1 } });
  assert.deepEqual(ids(c), ['ok']);
  assert.deepEqual(c.list[0].cards, [['ZZ01-001', 1], ['ZZ01-004', 3]]);
  assert.deepEqual(c.deleted, { q: 1 });
});
