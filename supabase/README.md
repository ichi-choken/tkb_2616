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
| `application_game_ids` 参加者のゲーム内ID | 本人と、募集する人。募集する人に見えるのは、成立した人の分と、承認待ちでニックネームの無い人の分（届いた参加希望で名前として出す。requests-3）。開催中止・遊び終了の後は誰も読めない | |
| `notifications` 知らせ | 宛先の本人 | |
| `profiles`・`games` | だれでも。`games` の `modes`（そのゲームでよく使う条件）と `needs_participant_id_default`（参加する人のIDが要るかの初期値）は、中身を作ったゲームだけが持つ（server-10）。null なら、モードの欄を出さない（recruit-15） | |

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
| `reopen_with_more_capacity` | 受付が終わった募集を、人数を増やして再開する（募集する人だけ。recruit-23）。開始時刻を過ぎていれば `追加受付中` になる（requests-26） |
| `update_profile` | 自分のニックネーム・住んでいる地方・いつも遊ぶ時間帯を保存する。渡した値でそのまま置き換え、`null` は消す。アプリIDは Q-25 が決まるまで変えない |

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
| `unknown_game` | 用意していないゲーム（選んだゲームは、先に Edge Function `igdb-search` の保存で `games` に入れる。`src/lib/games.ts` の `saveGame`） |
| `game_account_id_required` | IDが要る募集で、ゲーム内IDが空 |
| `game_account_id_invalid` | ゲーム内IDが英数字だけでない |
| `unknown_mode` | そのゲームの選択肢に無いモード（中身の無いゲームでは、モードを入れられない） |
| `not_reopenable` | 再開できない（受付中、人数指定が無い、人数が増えていない、成立人数以下、開催中止・遊び終了の後） |
| `usual_time_incomplete` | いつも遊ぶ時間帯の、始まりか終わりの片方だけ |
| `nickname_invalid` | ニックネームに改行が入っている |

### 画面の更新を受ける

`recruitments`・`recruitment_meetings`・`applications`・`notifications` の変更は、Realtime（Postgres Changes）で届く。届くのは、読める行の変更だけ。つながっていなかった間の分は、つなぎ直したときと画面に戻ったときに読み直す（ADR-66）。

```ts
supabase
  .channel('my-application')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'applications', filter: `id=eq.${applicationId}` }, reload)
  .subscribe();
```

## 未承認のサーバーの条件に頼った所

仕様の `spec/server.ts` の条件は、ほとんどが未承認（2026-10-24 の時点で 69件のうち10件が承認済み）。画面の条件は承認済みだが、データベースで守る中身が未承認のサーバーの条件から来ている所を並べる。承認で中身が変われば、ここを直す。

| 作った所 | 頼った条件（未承認） | 承認済みの画面の条件 |
| --- | --- | --- |
| 状態の名前と、満員・締め切り・手動終了のどれが先に効くか | サーバーの「募集」「参加希望と成立」の表 | requests-16、list-11 |
| 合流情報とゲーム内IDを、募集する人と成立した相手との間だけに渡す | server-28 | matched-1、matched-17 |
| 開催中止・遊び終了の後は、合流情報とゲーム内IDを双方に渡さない | server-88、server-95 | requests-17、requests-24、matched-14、matched-21 |
| 入る場所と招待URLは、開催中止・遊び終了まで変えられ、受付の状態は変えない | server-55、server-97 | requests-25 |
| 成立した人（辞退した人を除く）だけを枠に数え、同時に承認しても超えない | server-67 | requests-4 |
| 承認・受付終了・中止・進行・再開の操作は、募集する人だけ | server-68 | requests-12 |
| 同じ操作の送り直しと、同じ募集への2回目の参加希望を重ねない | server-69 | recruit-18（2回目の参加希望を言う list-22 は未承認） |
| 受付の判定は、操作を受け付けた時点の状態とデータベースの時刻で決める。開始時刻と同時か後は締め切りで終了 | server-70、server-93 | requests-4 |
| 満員・受付終了で、承認待ちの参加希望は知らせずに終わる | server-25 | なし（list-22 も未承認） |
| 増員して再開できる条件と、開始後の追加受付中 | server-98、server-99 | recruit-23、recruit-24、requests-26 |
| 開催中止・遊び終了の後は、受付終了・進行の操作で何も変えない | server-96 | requests-12 |
| 募集は、ログインしていない人も読める | server-19、server-54 | list-1、list-9 |
| 募集人数は、空欄か1以上の整数 | server-66 | recruit-13 |
| ゲーム内IDは成立した相手との間だけ（server-28）だが、承認待ちでニックネームの無い人の分は、名前として募集する人に渡す | server-28 と食い違う | requests-3 |

## クラウドに当てる

プロジェクトは開発用とデモ用の2つ（ADR-81）。手元で `npx supabase db reset` と `npx supabase test db` が通ることを確かめてから、開発用に当てる。デモ用には、開発用で確かめた後に当てる。

```bash
npx supabase link --project-ref <開発用のプロジェクトのref>
```

```bash
npx supabase db push
```
