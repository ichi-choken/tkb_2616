import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, ME, type Profile } from '../app/src/data.ts';
import { importSteamGames } from '../app/src/steam-profile-import.ts';
import { createProfileRepository, type ProfileStorage } from '../app/src/profile-storage.ts';
import type { SteamLibrary } from '../packages/integrations/src/steam.ts';
import { isSteamLibrary } from '../src/local/steam-library.ts';

const fresh = (): Profile => structuredClone(ME);
const library = (games = [
  { appId: 1172470, name: 'Apex Legends', playtimeMinutes: 630, recentPlaytimeMinutes: 0 },
  { appId: 646570, name: 'Slay the Spire', playtimeMinutes: 0, recentPlaytimeMinutes: null },
  { appId: 1097150, name: 'Fall Guys', playtimeMinutes: null, recentPlaytimeMinutes: null },
]): SteamLibrary => ({ status: 'available', source: 'steam', fetchedAt: '2026-10-25T03:00:00Z', games });

test('successful Steam import replaces initial demo games with real library cards', () => {
  const profile = fresh();
  importSteamGames(profile, library());
  assert.equal(profile.games.length, 3);
  assert.equal(profile.games.some(game => game.demo || ME.games.some(seed => seed.tag === game.tag)), false);
  assert.equal(profile.games.find(game => game.steam?.appId === 1172470)?.steam?.hours, 10.5);
  const added = profile.games.find(game => game.steam?.appId === 646570)!;
  assert.deepEqual([added.platform, added.skill, added.heat, added.steam?.hours], ['PC（Steam）', 5, 2, 0]);
  assert.equal(profile.games.find(game => game.steam?.appId === 1097150)?.steam?.hours, null);
  assert.equal(GAMES[added.tag]?.name, 'Slay the Spire');
});

test('manual games remain and a matching manual PC entry keeps its settings', () => {
  const profile = fresh();
  profile.games = [
    { demo: false, tag: 'apex', platform: 'PC（Steam）', heat: 1, skill: 8 },
    { demo: false, tag: 'fallguys', platform: 'PlayStation', heat: 1, skill: 3 },
  ];
  importSteamGames(profile, library());
  assert.equal(profile.games.length, 4);
  assert.equal(profile.games.find(game => game.tag === 'apex')?.steam?.hours, 10.5);
  assert.equal(profile.games.find(game => game.tag === 'apex')?.skill, 8);
  assert.equal(profile.games.find(game => game.tag === 'fallguys')?.platform, 'PlayStation');
});

test('previously imported profiles drop legacy demo cards but preserve real Steam choices', () => {
  const profile = fresh();
  profile.games.forEach(game => { delete game.demo; });
  const apex = profile.games.find(game => game.tag === 'apex')!;
  apex.steam = { appId: 1172470, name: 'Apex Legends', hours: 10, updated: '2026-10-24' };
  apex.skill = 9; apex.heat = 0;
  profile.steamImportedAppIds = [1172470];
  importSteamGames(profile, library());
  assert.equal(profile.games.length, 3);
  assert.equal(profile.games.some(game => game.tag === 'splatoon3' || game.tag === 'fallguys'), false);
  assert.deepEqual([apex.skill, apex.heat, apex.steam.hours], [9, 0, 10.5]);
});

test('legacy cleanup happens once, survives reload, and keeps later manual additions', async () => {
  const values = new Map<string, string>();
  const storage: ProfileStorage = { getItem: async k => values.get(k) ?? null, setItem: async (k,v) => { values.set(k,v); }, removeItem: async k => { values.delete(k); } };
  const repository = createProfileRepository(storage);
  await repository.load();
  await repository.edit(profile => {
    profile.games.forEach(game => { delete game.demo; });
    importSteamGames(profile, library([]));
  });
  const restored = await createProfileRepository(storage).load();
  assert.equal(restored.games.length, 0);
  assert.equal(restored.steamDemoGamesCleared, true);
  const manual = structuredClone(ME.games[1]!);
  delete manual.demo;
  restored.games.push(manual);
  importSteamGames(restored, library([]));
  assert.deepEqual(restored.games, [manual]);
});

test('refresh updates time and renamed titles without duplicates, overwriting personal choices, or resurrecting deleted games', () => {
  const profile = fresh();
  importSteamGames(profile, library());
  const imported = profile.games.find(game => game.steam?.appId === 646570)!;
  imported.heat = 1; imported.skill = 8;
  profile.games = profile.games.filter(game => game.steam?.appId !== 1097150);
  importSteamGames(profile, library([
    { appId: 646570, name: 'Slay the Spire — new title', playtimeMinutes: 1234, recentPlaytimeMinutes: 4 },
    { appId: 1097150, name: 'Fall Guys', playtimeMinutes: 20, recentPlaytimeMinutes: 0 },
  ]));
  assert.deepEqual([imported.heat, imported.skill, imported.steam?.hours], [1, 8, 1234 / 60]);
  assert.equal(profile.games.filter(game => game.steam?.appId === 646570).length, 1);
  assert.equal(profile.games.some(game => game.steam?.appId === 1097150), false);
  assert.equal(GAMES[imported.tag]?.name, 'Slay the Spire — new title');
});

test('Steam imports, removed-game memory, and choices survive profile reload with an empty dynamic catalog', async () => {
  const values = new Map<string, string>();
  const storage: ProfileStorage = { getItem: async k => values.get(k) ?? null, setItem: async (k,v) => { values.set(k,v); }, removeItem: async k => { values.delete(k); } };
  const repository = createProfileRepository(storage);
  await repository.load();
  await repository.edit(profile => importSteamGames(profile, library()));
  await repository.edit(profile => {
    profile.games.find(game => game.steam?.appId === 646570)!.skill = 9;
    profile.games = profile.games.filter(game => game.steam?.appId !== 1097150);
  });
  delete GAMES['steam:646570'];
  const restored = await createProfileRepository(storage).load();
  assert.equal(GAMES['steam:646570']?.name, 'Slay the Spire');
  assert.equal(restored.games.find(game => game.steam?.appId === 646570)?.skill, 9);
  importSteamGames(restored, library());
  assert.equal(restored.games.some(game => game.steam?.appId === 1097150), false);
});

test('private or unavailable Steam data keeps existing games and preferences intact', () => {
  const profile = fresh(); const before = structuredClone(profile);
  importSteamGames(profile, { status: 'unavailable', source: 'steam', reason: 'not_visible_or_missing' });
  assert.deepEqual(profile, before);
});

test('malformed Steam responses cannot become persistent profile data', () => {
  assert.equal(isSteamLibrary(library()), true);
  assert.equal(isSteamLibrary({ ...library(), fetchedAt: 'bad' }), false);
  assert.equal(isSteamLibrary(library([{ appId: 1, name: 'bad', playtimeMinutes: -1, recentPlaytimeMinutes: 0 }])), false);
  assert.equal(isSteamLibrary({ source: 'steam', status: 'available', games: [{}] }), false);
});
