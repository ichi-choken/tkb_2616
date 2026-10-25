import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderByCloseSkill, profileSkillFor, vcMatch } from '../src/live/match-order.ts';

const r = (id: string, skill: number | null, created_at: string) => ({ id, skill, created_at });

test('closest skill first; ties newest first; no skill last (server-52)', () => {
  const items = [
    r('far', 1, '2026-10-25T01:00:00Z'),
    r('none', null, '2026-10-25T05:00:00Z'),
    r('near-old', 6, '2026-10-25T02:00:00Z'),
    r('near-new', 4, '2026-10-25T03:00:00Z'),
    r('same', 5, '2026-10-25T00:00:00Z'),
  ];
  assert.deepEqual(orderByCloseSkill(items, 5).map(x => x.id), ['same', 'near-new', 'near-old', 'far', 'none']);
});

test('without my skill, newest first', () => {
  const items = [r('a', 3, '2026-10-25T01:00:00Z'), r('b', null, '2026-10-25T03:00:00Z'), r('c', 9, '2026-10-25T02:00:00Z')];
  assert.deepEqual(orderByCloseSkill(items, null).map(x => x.id), ['b', 'c', 'a']);
});

test('does not change the given list', () => {
  const items = [r('a', 9, '2026-10-25T01:00:00Z'), r('b', 1, '2026-10-25T02:00:00Z')];
  orderByCloseSkill(items, 1);
  assert.deepEqual(items.map(x => x.id), ['a', 'b']);
});

test('VC match only when both sides chose (list-8)', () => {
  assert.equal(vcMatch('あり', 'あり'), 'match');
  assert.equal(vcMatch('聞き専OK', 'あり'), 'mismatch');
  assert.equal(vcMatch('なし', null), null);
  assert.equal(vcMatch(null, 'あり'), null);
});

test('profile skill is found by game name (list-3 initial value)', () => {
  const names = { apex: { name: 'Apex Legends' }, splatoon3: { name: 'スプラトゥーン3' } };
  const games = [{ tag: 'apex', skill: 7 }, { tag: 'splatoon3', skill: 4 }];
  assert.equal(profileSkillFor({ name: 'apex legends' }, games, names), 7);
  assert.equal(profileSkillFor({ name: 'スプラトゥーン3' }, games, names), 4);
  assert.equal(profileSkillFor({ name: 'Fall Guys' }, games, names), null);
  assert.equal(profileSkillFor(null, games, names), null);
});

test('profile skill is also found by an IGDB alternative name', () => {
  const names = { splatoon3: { name: 'スプラトゥーン3' }, mk8dx: { name: 'マリオカート8 デラックス' } };
  const games = [{ tag: 'splatoon3', skill: 4 }, { tag: 'mk8dx', skill: 6 }];
  assert.equal(profileSkillFor({ name: 'Splatoon 3', alternative_names: ['스플래툰 3', 'スプラトゥーン3'] }, games, names), 4);
  // Full-width characters and spaces do not matter
  assert.equal(profileSkillFor({ name: 'Mario Kart 8 Deluxe', alternative_names: ['マリオカート８デラックス'] }, games, names), 6);
  assert.equal(profileSkillFor({ name: 'Splatoon 2', alternative_names: ['スプラトゥーン2'] }, games, names), null);
});
