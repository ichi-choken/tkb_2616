import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const repair = '20261025000000_preserve_recruitment_data_and_fix_review.sql';
const migrationDir = new URL('../supabase/migrations/', import.meta.url);
type OperationResult = {
  ok: boolean; already?: boolean; recruitment_id?: string; application_id?: string; state?: string;
  reason?: string; status?: string; room_code?: string; invite_url?: string; matched_count?: number;
};

// Models Supabase Auth/default grants in an isolated PostgreSQL. No remote DB or credentials.
// Realtime transport is not simulated; the public row change that triggers a reload is checked below.
async function previousDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create publication supabase_realtime;`);
  for (const file of (await readdir(migrationDir)).filter(f => f.endsWith('.sql') && f !== repair).sort()) {
    await db.exec(await readFile(new URL(file, migrationDir), 'utf8'));
  }
  await db.exec(await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8'));
  const owner = randomUUID(), a = randomUUID(), b = randomUUID(), c = randomUUID(), stranger = randomUUID();
  await db.query('insert into auth.users(id) values ($1),($2),($3),($4),($5)', [owner, a, b, c, stranger]);
  await db.query(`insert into public.integration_links(user_id, provider, external_id, snapshot)
    values ($1, 'steam', 'KEEP_STEAM', '{"status":"available"}')`, [owner]);
  const asUser = async (id: string | null) => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(id ? { sub: id, role: 'authenticated' } : { role: 'anon' })]);
    await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
  };
  const operation = async (sql: string, args: unknown[] = []) => {
    const result = (await db.query<{ result: OperationResult }>(`select ${sql} as result`, args)).rows[0]?.result;
    assert.ok(result);
    return result;
  };
  const publish = async (capacity: number | null = 2) => {
    await asUser(owner);
    const result = await operation(`public.publish_recruitment($1, -1, true, p_capacity => $2,
      p_starts_at => now() + interval '1 day', p_room_code => 'KEEP_ROOM', p_invite_url => 'https://example.test/keep')`, [randomUUID(), capacity]);
    assert.equal(result.ok, true);
    assert.ok(result.recruitment_id);
    return result.recruitment_id;
  };
  const apply = async (user: string, recruitment: string, gameId: string) => {
    await asUser(user);
    const result = await operation('public.apply_to_recruitment($1, $2, $3)', [randomUUID(), recruitment, gameId]);
    assert.equal(result.ok, true);
    assert.ok(result.application_id);
    return result.application_id;
  };
  const migrate = async () => {
    await db.exec('reset role');
    await db.exec(await readFile(new URL(repair, migrationDir), 'utf8'));
  };
  return { db, owner, a, b, c, stranger, asUser, operation, publish, apply, migrate };
}

async function preservedState(db: PGlite) {
  await db.exec('reset role');
  const tables = ['auth.users', 'public.profiles', 'public.games', 'public.recruitments', 'public.applications',
    'public.application_game_ids', 'public.recruitment_meetings', 'public.notifications', 'private.operations', 'public.integration_links'];
  const data: Record<string, unknown[]> = {};
  for (const table of tables) {
    data[table] = (await db.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows;
  }
  const columns = (await db.query(`select n.nspname, c.relname, c.oid, c.relrowsecurity, c.relacl::text,
      a.attnum, a.attname, a.atttypid, a.attnotnull
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
    where n.nspname in ('public', 'private') and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
    order by n.nspname, c.relname, a.attnum`)).rows;
  const signatures = (await db.query(`select p.oid, n.nspname, p.proname, p.proargtypes::text, p.prorettype, p.proacl::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in ('approve_application', 'update_meeting'))
       or (n.nspname = 'private' and p.proname = 'can_see_game_id') order by n.nspname, p.proname`)).rows;
  return { data, columns, signatures };
}

test('DB repair preserves existing rows/schema/grants and publishes one public change per new approval', async () => {
  const f = await previousDatabase();
  const { db, owner, a, b, c, stranger, asUser, operation, publish, apply, migrate } = f;
  try {
    await asUser(owner);
    await operation("public.update_profile($1, 'Keep Nickname', '関東', '21:00', '23:00')", [randomUUID()]);
    const r = await publish();
    const first = await apply(a, r, 'PLAYERA');
    const second = await apply(b, r, 'PLAYERB');
    const last = await apply(c, r, 'PLAYERC');
    await asUser(owner);
    await operation('public.approve_application($1, $2)', [randomUUID(), first]);
    const before = await preservedState(db);
    await migrate();
    assert.deepEqual(await preservedState(db), before, 'Upgrade keeps all fixture data, table identities and function grants/signatures');
    await db.exec(`create table private.review_public_changes(recruitment_id uuid);
      create function private.review_capture_change() returns trigger language plpgsql as $$
        begin insert into private.review_public_changes values (new.id); return new; end $$;
      create trigger review_capture_change after update on public.recruitments
        for each row execute function private.review_capture_change();`);
    await asUser(owner);
    const op = randomUUID();
    const approved = await operation('public.approve_application($1, $2)', [op, second]);
    assert.equal(approved.status, '満員で終了');
    assert.equal(approved.matched_count, 2);
    assert.deepEqual(await operation('public.approve_application($1, $2)', [op, second]), approved);
    assert.equal((await operation('public.approve_application($1, $2)', [randomUUID(), second])).already, true);
    const rejected = await operation('public.approve_application($1, $2)', [randomUUID(), last]);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'not_accepting');
    assert.deepEqual((await db.query<{ state: string }>('select public.state(a) as state from public.applications a where id=$1', [last])).rows, [{ state: '終了' }]);
    assert.equal((await db.query('select * from public.application_game_ids')).rows.length, 2);
    await db.exec('reset role');
    assert.equal((await db.query('select * from private.review_public_changes')).rows.length, 1, 'Successful approval updates the public row; retries/no-ops/rejections do not');
    assert.equal((await db.query("select * from public.notifications where kind='承認された'")).rows.length, 2, 'A retry does not duplicate approval notifications');
    assert.equal((await db.query("select * from pg_publication_tables where pubname='supabase_realtime' and tablename='recruitments'")).rows.length, 1);
    await asUser(stranger);
    assert.equal((await db.query('select * from public.applications')).rows.length, 0);
    assert.equal((await db.query('select * from public.application_game_ids')).rows.length, 0);
    assert.equal((await operation('public.approve_application($1, $2)', [randomUUID(), second])).reason, 'not_owner');
    await asUser(null);
    assert.deepEqual((await db.query<{ status: string; matched_count: number }>('select public.status(r) as status, public.matched_count(r) as matched_count from public.recruitments r where id=$1', [r])).rows, [{ status: '満員で終了', matched_count: 2 }]);
    await assert.rejects(operation('public.approve_application($1, $2)', [randomUUID(), second]));
  } finally { await db.close(); }
});

test('DB repair checks present ownership/end state before returning legacy meeting operation responses', async () => {
  const f = await previousDatabase();
  const { db, owner, stranger, asUser, operation, publish, migrate } = f;
  try {
    const fixtures: { id: string; op: string; response: OperationResult; action: string; status: string }[] = [];
    for (const [action, status] of [['end_play', '遊び終了'], ['cancel', '開催中止']]) {
      const id = await publish();
      const op = randomUUID();
      const response = await operation("public.update_meeting($1, $2, 'LEGACY_ROOM', 'https://example.test/legacy')", [op, id]);
      fixtures.push({ id, op, response, action: action!, status: status! });
    }
    const before = await preservedState(db);
    await migrate();
    assert.deepEqual(await preservedState(db), before, 'Legacy meeting rows and cached operations survive the upgrade');
    for (const f of fixtures) {
      await asUser(owner);
      assert.deepEqual(await operation("public.update_meeting($1, $2, 'LEGACY_ROOM', 'https://example.test/legacy')", [f.op, f.id]), f.response, 'Active retry keeps its original response');
      await operation('public.change_recruitment($1, $2, $3)', [randomUUID(), f.id, f.action]);
      assert.equal((await db.query('select * from public.recruitment_meetings where recruitment_id=$1', [f.id])).rows.length, 0);
      for (let retry = 0; retry < 2; retry++) {
        const result = await operation("public.update_meeting($1, $2, 'SHOULD_NOT_WRITE', 'https://example.test/new')", [f.op, f.id]);
        assert.deepEqual(result, { ok: false, reason: 'not_accepting', status: f.status }, 'Ended replay has neither secret fields nor a successful result');
      }
      assert.equal((await operation("public.update_meeting($1, $2, 'SHOULD_NOT_WRITE')", [randomUUID(), f.id])).reason, 'not_accepting');
      await asUser(stranger);
      assert.equal((await operation("public.update_meeting($1, $2, 'SHOULD_NOT_WRITE')", [f.op, f.id])).reason, 'not_owner');
      await asUser(null);
      await assert.rejects(operation("public.update_meeting($1, $2, 'SHOULD_NOT_WRITE')", [randomUUID(), f.id]));
      await db.exec('reset role');
      assert.deepEqual((await db.query<{ room_code: string; invite_url: string }>('select room_code,invite_url from public.recruitment_meetings where recruitment_id=$1', [f.id])).rows, [{ room_code: 'LEGACY_ROOM', invite_url: 'https://example.test/legacy' }], 'Rejected retries never repeat or change the meeting write');
    }
  } finally { await db.close(); }
});

test('DB repair hides deadline-ended pending game IDs while retaining matched IDs and the applicant access', async () => {
  const f = await previousDatabase();
  const { db, owner, a, b, stranger, asUser, operation, publish, apply, migrate } = f;
  try {
    const r = await publish();
    const matched = await apply(a, r, 'MATCHED1');
    await apply(b, r, 'WAITING1');
    await asUser(owner);
    await operation('public.approve_application($1, $2)', [randomUUID(), matched]);
    await db.exec('reset role');
    await db.query("update public.recruitments set starts_at=now()-interval '1 minute' where id=$1", [r]);
    await asUser(owner);
    assert.equal((await db.query('select * from public.application_game_ids')).rows.length, 2, 'Old schema exhibits the reported deadline defect');
    const before = await preservedState(db);
    await migrate();
    assert.deepEqual(await preservedState(db), before);
    await asUser(owner);
    assert.deepEqual((await db.query<{ game_account_id: string }>('select game_account_id from public.application_game_ids')).rows, [{ game_account_id: 'MATCHED1' }]);
    await asUser(b);
    assert.deepEqual((await db.query<{ state: string }>('select public.state(a) as state from public.applications a')).rows, [{ state: '終了' }]);
    assert.deepEqual((await db.query<{ game_account_id: string }>('select game_account_id from public.application_game_ids')).rows, [{ game_account_id: 'WAITING1' }], 'Applicant keeps existing access to their submitted ID');
    await asUser(stranger);
    assert.equal((await db.query('select * from public.application_game_ids')).rows.length, 0);
    await asUser(null);
    assert.equal((await db.query('select * from public.application_game_ids')).rows.length, 0);
    await asUser(owner);
    assert.equal((await operation('public.reopen_with_more_capacity($1, $2, 3)', [randomUUID(), r])).status, '追加受付中');
    assert.equal((await db.query('select * from public.application_game_ids')).rows.length, 2, 'Truly waiting applications become visible after the existing reopen operation');
    await operation("public.change_recruitment($1, $2, 'close')", [randomUUID(), r]);
    assert.equal((await db.query('select * from public.application_game_ids')).rows.length, 1, 'Manual close hides the pending applicant too');
    await operation("public.change_recruitment($1, $2, 'cancel')", [randomUUID(), r]);
    assert.equal((await db.query('select * from public.application_game_ids')).rows.length, 0);
    await asUser(a);
    assert.equal((await db.query('select * from public.application_game_ids')).rows.length, 0, 'Cancellation still hides IDs from both sides');
  } finally { await db.close(); }
});
