import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
const session = '00000000-0000-4000-8000-000000000003';

test('Draft SQL: secrets are inaccessible to app roles, attempts are one-time and unlink wins against stale writes', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${userA}'), ('${userB}');
      create table public.profiles (id uuid primary key, nickname text);
      insert into public.profiles values ('${userA}', 'untouched');
    `);
    await db.exec(await readFile(new URL('../supabase/proposals/auth-integrations.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query<{ nickname: string }>('select nickname from public.profiles')).rows[0]?.nickname, 'untouched');

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from public.integration_links'));
      await assert.rejects(db.query('select * from public.integration_attempts'));
      await db.exec('reset role');
    }
    // RLS remains closed even if someone later grants table SELECT by mistake.
    await db.exec('grant select on public.integration_links to authenticated; set role authenticated');
    assert.deepEqual((await db.query('select * from public.integration_links')).rows, []);
    await db.exec('reset role; revoke select on public.integration_links from authenticated; set role service_role');

    await db.query(`select public.integration_begin_link($1, 'steam', $2, 'test-hash', 'https://example.test/callback', now(), now() + interval '5 minutes')`, [userA, session]);
    const consume = (user: string) => db.query('update public.integration_attempts set consumed_at=now() where state_hash=$1 and user_id=$2 and session_id=$3 and expires_at>now() and consumed_at is null returning state_hash', ['test-hash', user, session]);
    assert.equal((await consume(userB)).rows.length, 0);
    assert.equal((await consume(userA)).rows.length, 1);
    assert.equal((await consume(userA)).rows.length, 0);
    await db.query('select public.integration_unlink($1, $2)', [userA, 'steam']);
    // The remote authentication answer arrives after unlink: it must not recreate the link.
    assert.equal((await db.query<{ ok: boolean }>(`select public.integration_finish_link($1,'steam',$2,'test-hash','steam-user',null) as ok`, [userA, session])).rows[0]?.ok, false);
    await db.query(`select public.integration_begin_link($1,'steam',$2,'new-hash','https://example.test/callback',now(),now()+interval '5 minutes')`, [userA, session]);
    await db.query(`update public.integration_attempts set consumed_at=now() where state_hash='new-hash'`);
    assert.equal((await db.query<{ ok: boolean }>(`select public.integration_finish_link($1,'steam',$2,'new-hash','steam-user',null) as ok`, [userA, session])).rows[0]?.ok, true);
    assert.equal((await db.query<{ ok: boolean }>(`select public.integration_finish_link($1,'steam',$2,'new-hash','steam-user',null) as ok`, [userA, session])).rows[0]?.ok, false);

    const inserted = await db.query<{ id: string; revision: string }>(`insert into public.integration_links(user_id, provider, external_id, token_ciphertext, next_attempt_at)
      values ($1, 'discord', 'external-user', 'v1.encrypted.test', now()) returning id, revision`, [userA]);
    const link = inserted.rows[0]!;
    const lease = await db.query<{ revision: string }>('update public.integration_links set revision=gen_random_uuid(), lease_until=now()+interval \'2 minutes\' where id=$1 and revision=$2 returning revision', [link.id, link.revision]);
    assert.equal(lease.rows.length, 1);
    assert.equal((await db.query('update public.integration_links set lease_until=now() where id=$1 and revision=$2 returning id', [link.id, link.revision])).rows.length, 0);
    assert.equal((await db.query('delete from public.integration_links where user_id=$1 returning id', [userB])).rows.length, 0);
    await db.query('delete from public.integration_links where user_id=$1', [userA]);
    const late = await db.query('update public.integration_links set snapshot=$1 where id=$2 and revision=$3 returning id', [JSON.stringify({ value: 'late-response' }), link.id, lease.rows[0]!.revision]);
    assert.equal(late.rows.length, 0);
    assert.equal((await db.query('select * from public.integration_links')).rows.length, 0);
  } finally { await db.close(); }
});

test('Draft SQL: IGDB shared rate budget and push delivery deduplication are server-only', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${userA}'),('${userB}');`);
    await db.exec(await readFile(new URL('../supabase/proposals/igdb-gateway.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/proposals/notification-delivery.sql', import.meta.url), 'utf8'));
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select public.integration_claim_igdb()'));
      await assert.rejects(db.query('select * from public.integration_push_devices'));
      await assert.rejects(db.query('select * from public.integration_push_deliveries'));
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const claim = () => db.query<{ result: { lease_id?: string; retry_after_ms?: number } }>('select public.integration_claim_igdb() as result');
    assert.ok((await claim()).rows[0]?.result.lease_id);
    assert.ok((await claim()).rows[0]?.result.retry_after_ms);
    await db.exec(`update public.integration_api_budgets set next_at='infinity'`);
    // Reset the budget, then fill all concurrency slots without waiting on the test clock.
    await db.exec(`update public.integration_api_budgets set next_at='-infinity';
      insert into public.integration_api_leases(service, expires_at) select 'igdb', now()+interval '10 seconds' from generate_series(1,7)`);
    assert.equal((await claim()).rows[0]?.result.retry_after_ms, 1000);
    await db.exec(`update public.integration_api_leases set expires_at=now()-interval '1 second'`);
    assert.ok((await claim()).rows[0]?.result.lease_id);

    const device = (await db.query<{ id: string }>(`insert into public.integration_push_devices(user_id,session_id,token_hash,token_ciphertext)
      values($1,$2,'token-hash','ciphertext') returning id`, [userA, session])).rows[0]!.id;
    const insert = () => db.query(`insert into public.integration_push_deliveries(event_id,device_id,event) values($1,$2,'{}')
      on conflict(event_id,device_id) do nothing returning event_id`, [session, device]);
    assert.equal((await insert()).rows.length, 1);
    assert.equal((await insert()).rows.length, 0);
    assert.equal((await db.query('delete from public.integration_push_devices where id=$1 and user_id=$2 returning id', [device, userB])).rows.length, 0);
    await db.query('delete from public.integration_push_devices where id=$1 and user_id=$2', [device, userA]);
    assert.equal((await db.query('select * from public.integration_push_deliveries')).rows.length, 0);
  } finally { await db.close(); }
});
