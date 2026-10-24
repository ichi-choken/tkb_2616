# バックエンド（Supabase）

データと、状態を変える処理は Supabase に置く。作り方の決定は仕様のリポジトリ（[Umi-s-Atelie/hobby-platform](https://github.com/Umi-s-Atelie/hobby-platform)）の ADR-63〜67。表・関数・型の正本は `migrations/` の SQL と、そこから作った `database.types.ts`。この README には、コードから読み取りにくい約束だけを書く。

## 手元で動かす

Docker Desktop を起動してから、リポジトリの直下で流す。

```bash
npx supabase start
```

```bash
npx supabase test db
```

- ポートは 553xx（API は `http://127.0.0.1:55321`、Studio は `http://127.0.0.1:55323`）。初期の 543xx は、ほかのプロジェクトの Supabase とぶつかるのでずらした
- 表や関数を変えたら `npx supabase db reset` で作り直し、`npx supabase gen types typescript --local > supabase/database.types.ts` で型を作り直す
- `seed.sql` のゲームは手元だけの仮のもの。クラウドには入らない

## 画面からの使い方

画面に入れてよいのは、Supabase の URL と公開用の鍵（`sb_publishable_`）だけ。

### 読む

表をそのまま読む。行の権限で、読める行だけが返る。状態は列ではなく、計算した列で読む。

| 表 | 読める人 | 計算した列 |
| --- | --- | --- |
| `recruitments` 募集 | だれでも（ログインしていない人も） | `status`（募集の状態）、`matched_count`（成立人数） |
| `recruitment_meetings` 入る場所・招待URL | 募集する人と成立した相手。開催中止・遊び終了の後は誰も読めない | |
| `applications` 参加希望 | 参加する本人と、その募集の募集する人 | `state`（参加希望の状態） |
| `application_game_ids` 参加者のゲーム内ID | 本人と、成立した募集の募集する人。開催中止・遊び終了の後は誰も読めない | |
| `notifications` 知らせ | 宛先の本人 | |
| `profiles`・`games` | だれでも | |

状態の名前は、仕様の `spec/server.ts` の「募集」「参加希望と成立」の表の状態と同じ文字列（`出ている`、`満員で終了`、`待っている`、`成立` など）。

```ts
// 募集リンクを開いたとき：その募集を先頭に、同じゲームの募集を並べる
const { data } = await supabase
  .rpc('recruitments_for_game', { p_game_id: gameId, p_first: recruitmentId })
  .select('*, status, matched_count, games(*), profiles(nickname, region)');

// 自分の参加希望と、成立していれば入る場所
const { data: mine } = await supabase
  .from('applications')
  .select('*, state, recruitments(*, status, recruitment_meetings(*))')
  .eq('recruitment_id', recruitmentId);
```

### 変える

状態を変えるのは、関数（`supabase.rpc`）だけ。表には書けない。

| 関数 | すること |
| --- | --- |
| `publish_recruitment` | 募集を公開する |
| `apply_to_recruitment` | 参加希望を送る |
| `approve_application` | 参加希望を承認する（募集する人だけ） |
| `update_meeting` | 入る場所・招待URLを入れる・変える（募集する人だけ）。`null` は変えない、空文字は消す |
| `change_recruitment` | `p_action` が `close`（受付を終える）・`cancel`（開催を中止する）・`start_play`（遊び始める）・`end_play`（遊び終える） |

約束：

- どの関数も、第1引数に `p_op_id`（画面が操作ごとに作る UUID。`crypto.randomUUID()`）を渡す。通信が切れて送り直すときは、同じ `p_op_id` を使う。同じ ID には、最初の結果が返り、募集や成立が重ならない
- ログインしていないと、エラー（HTTP 401）になる
- 受け付けなかったときは、エラーではなく `{ ok: false, reason, status? }` が返る。`status` は、そのときの募集の状態。画面は理由と最新の状態を出す

| `reason` | 意味 |
| --- | --- |
| `not_found` | 募集・参加希望が無い |
| `not_owner` | 募集する人でない |
| `own_recruitment` | 自分の募集に参加しようとした |
| `not_accepting` | 受け付けていない状態（`status` を見る） |
| `unknown_game` | 用意していないゲーム |
| `game_account_id_required` | IDが要る募集で、ゲーム内IDが空 |
| `game_account_id_invalid` | ゲーム内IDが英数字だけでない |

### 画面の更新を受ける

`recruitments`・`recruitment_meetings`・`applications`・`notifications` の変更は、Realtime（Postgres Changes）で届く。届くのは、読める行の変更だけ。つながっていなかった間の分は、つなぎ直したときと画面に戻ったときに読み直す（ADR-66）。

```ts
supabase
  .channel('my-application')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'applications', filter: `id=eq.${applicationId}` }, reload)
  .subscribe();
```

## クラウドに当てる

プロジェクトは開発用とデモ用の2つ（ADR-81）。手元で `npx supabase db reset` と `npx supabase test db` が通ることを確かめてから、開発用に当てる。デモ用には、開発用で確かめた後に当てる。

```bash
npx supabase link --project-ref <開発用のプロジェクトのref>
```

```bash
npx supabase db push
```
