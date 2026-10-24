import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// Isolated PostgreSQL only. Never connects to a personal or team Supabase project.
// Models Supabase's Auth helper/default grants; does not simulate HTTP/Realtime delivery.
test('Main recruitment schema and integration proposals coexist without changing matches or RLS', async () => {
  const db = new PGlite();
  const owner = randomUUID(), applicant = randomUUID(), stranger = randomUUID();
  const asUser = async (id: string | null) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(id ? { sub: id, role: 'authenticated' } : { role: 'anon' })]);
    await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
  };
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
      $$;
      grant usage on schema auth to anon, authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      create publication supabase_realtime;`);
    const migrations = await import('node:fs/promises').then(fs => fs.readdir(new URL('../supabase/migrations/', import.meta.url)));
    for (const file of migrations.filter(f => f.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    for (const file of ['auth-integrations', 'steam-login', 'igdb-gateway', 'notification-delivery']) {
      await db.exec(await readFile(new URL(`../supabase/proposals/${file}.sql`, import.meta.url), 'utf8'));
    }
    await db.exec(await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8'));
    await db.query('insert into auth.users(id) values ($1),($2),($3)', [owner, applicant, stranger]);
    assert.equal((await db.query('select id from public.profiles')).rows.length, 3);
    await asUser(owner);
    const published = (await db.query<{ result: { ok: boolean; recruitment_id: string } }>(
      "select public.publish_recruitment($1, -1, true, p_capacity => 1, p_room_code => 'MERGE_ROOM') as result", [randomUUID()])).rows[0]!.result;
    assert.equal(published.ok, true);
    await asUser(applicant);
    assert.equal((await db.query('select * from public.recruitment_meetings')).rows.length, 0);
    await db.query("select public.apply_to_recruitment($1, $2, 'PLAYER1')", [randomUUID(), published.recruitment_id]);
    const application = (await db.query<{ id: string }>('select id from public.applications')).rows[0]!;
    await asUser(owner);
    const approved = (await db.query<{ result: { status: string } }>('select public.approve_application($1, $2) as result', [randomUUID(), application.id])).rows[0]!.result;
    assert.equal(approved.status, '満員で終了');
    await asUser(applicant);
    assert.equal((await db.query<{ room_code: string }>('select room_code from public.recruitment_meetings')).rows[0]?.room_code, 'MERGE_ROOM');
    assert.equal((await db.query('select * from public.notifications')).rows.length, 1);
    await assert.rejects(db.query('select * from public.integration_links'));
    await asUser(stranger);
    assert.equal((await db.query('select * from public.recruitment_meetings')).rows.length, 0);
    assert.equal((await db.query('select * from public.applications')).rows.length, 0);
    await db.exec('reset role; set role service_role');
    await db.query('select public.integration_unlink($1, $2)', [applicant, 'steam']);
    await asUser(applicant);
    assert.equal((await db.query<{ state: string }>('select public.state(a) as state from public.applications a')).rows[0]?.state, '成立');
    await asUser(owner);
    await db.query("select public.change_recruitment($1, $2, 'end_play')", [randomUUID(), published.recruitment_id]);
    assert.equal((await db.query('select * from public.recruitment_meetings')).rows.length, 0);
    await asUser(applicant);
    assert.equal((await db.query('select * from public.recruitment_meetings')).rows.length, 0);
    assert.equal((await db.query('select * from public.application_game_ids')).rows.length, 0);
  } finally { await db.close(); }
});
