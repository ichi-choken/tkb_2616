# ③ 認証・外部連携・公開の引き継ぎ

確認日：2026-10-24。仕様側は `Umi-s-Atelie/hobby-platform` の `589d126`、製品側は `0be246a` を基点に準備した。作業中に製品側へ `3a401b1`（`docs/` の画面デモ更新）が入り、差分を確認した。指示に従い、自動マージはしていない。今回の実装と同じファイルの変更はない。

このブランチはレビュー用。仕様の承認・優先度は変更していない。未決の配信方式は無効、更新間隔は未設定、共通DBのSQLは `supabase/proposals/` に置いた。クラウド環境へは適用していない。

## 起動する

Node.js 24.3 以上の 24、または 26 を使う。チームの基準は `.nvmrc` の 24。

```sh
npm run setup
cp .env.example .env
npm run setup:secrets
npm run web
```

`http://localhost:8081/dev/auth` が認証・連携の確認画面。Supabase未設定でも起動し、未設定の案内が出る。ログインを試すには `.env` に対象プロジェクトのURLと **publishable key** を設定する。秘密キーは入れない。

`npm run setup:secrets` は無視対象の `.env.edge.local` を一度だけ作り、暗号化キーとジョブ用キーを生成する。既存ファイルは上書きせず、秘密を表示しない。残りの項目を担当者が設定する。

```sh
npm run check          # TypeScript、テスト、Edgeの型検査、Web出力
npm run build:native   # iOS/AndroidのJS・Hermes出力。署名済みアプリではない
npm run doctor:config  # 公開用設定の不足を名前だけ表示。不足があれば終了コード1
```

Webは `web.output: server`。`dist/` はサーバーを含むため、GitHub Pagesなど静的配信だけの場所では動かない。既存の `docs/` は他担当の静的デモとして保持し、このExpoの入口とはまだ統合していない。

## 他担当が接続する場所

| 担当 | 接続先 | 境界 |
| --- | --- | --- |
| ① ログイン画面 | `src/auth/index.ts` の `signIn` / `signOut` | Discord・Google。Webの既知のアプリ内ブラウザではGoogle用の案内を返す。ネイティブはOSの認証ブラウザを使う |
| ① ログイン表示 | `src/lib/supabase.ts` | UIの表示更新にはAuthの状態通知を利用。権限の判定はサーバーで行う |
| ① 外部情報の連携 | `src/auth/links.ts` | Steam/Discordの開始・完了・解除・状態。本人のログインとは別の操作 |
| ① ゲーム検索 | `src/lib/games.ts` | IGDBの候補取得のみ。選択したゲームの保存は② |
| ① 通知設定・タップ | `src/notifications/push.ts` | 有効化ボタンから登録。タップ時は対象IDを受け取り、②から最新情報と閲覧権限を取り直す |
| ② 利用者の識別 | `packages/integrations/src/session.ts` | 検証済みAuth利用者IDとsession ID。リクエスト本文のuserIdは信用しない |
| ② 通知イベント | `packages/integrations/src/notifications.ts` | ②が対象者・種類・対象IDを確定し、③が配信する |
| ② APIで取った情報 | `_shared/store.ts` / `src/sync.ts` | 連携用スナップショットだけ更新。プロフィールの本人入力・修正値を上書きしない |

Supabase Authの利用者とアプリの利用者行を1対1にする共通DBの作成は②と統合する。未ログインで閲覧している人のAuthアカウントは作らない。募集・承認・成立・通知対象の判定やアプリ内の通知一覧は、このブランチでは実装していない。

`/dev/auth` は開発時だけ表示する。本番の確認が一時的に必要なら `EXPO_PUBLIC_ENABLE_AUTH_DIAGNOSTICS=true` で再ビルドし、確認後はfalseに戻す。本番向けログイン画面のデザインは①が実装する。

## 認証・連携の設定

1. チーム所有のSupabaseプロジェクトを決め、必要な権限で招待する。現在接続できる別用途のプロジェクトは使用していない。
2. SupabaseのAuthにDiscord・Googleを設定する。OAuth提供元に登録するログイン用の戻り先は **Supabaseが示すcallback URL**。アプリの戻り先と取り違えない。
3. Supabaseのリダイレクト許可に、公開先の `/auth/callback` と `shumitomo://auth/callback` を正確に登録する。開発時だけlocalhostのcallbackも追加する。
4. `.env` に公開用のURL・publishable key、Edge側に `supabase/.env.example` の項目を設定する。
5. Discordの**情報連携**用のOAuthアプリには、公開先の `/auth/link-callback` と `/auth/link-callback?native=1` の両方を登録する。`INTEGRATION_CALLBACK_URL` はクエリなしの前者。ログイン用callbackも同じDiscordアプリで使う場合は、両方の用途を登録する。
6. SteamはOpenIDでSteamIDを検証し、公開情報のAPI取得にはサーバー側のAPIキーを使う。OpenIDは、非公開データを読む許可ではない。

ネイティブの情報連携は、HTTPSのcallbackからアプリのschemeへ戻る。ログインした本人・同じsession・未使用stateに結びつけてサーバーで検証する。Webブラウザ内でネイティブの利用者セッションを作り直さない。

Discordの情報連携は初期状態で `identify` のみ。メールアドレス自体は保存せず、メール確認状態も権限がなければ不明のまま。アカウント年齢を利用した信用評価は、Q-32の確認が済むまでUIに出さない。

Steamの取得できなかったプレイ時間を0にしない。非公開・取得失敗・0分の実測値を区別する。連携解除後に戻ってきた認証結果や定期更新結果で、情報を復活させない。

Googleのアプリ内ブラウザ判定は既知のUser-Agentに対する補助。判別できないブラウザもあるため、公開確認では実際のSNSから開く。①は案内に従ってSafari/Chromeで元ページを開き直せる導線を用意する。

## DB案とサーバーの適用手順

`supabase/proposals/` のSQLは共通DBのレビュー用。アプリのprofiles・募集・成立のテーブルを変更しない。連携用の秘密・外部情報・配信記録はRLSを有効にし、クライアントから直接読ませない。SQLを承認した後、②が既存マイグレーションと調整して取り込む。

```sh
npx supabase@2.122.0 migration new auth_integrations
# 作成されたSQLへ、合意したproposalを順に取り込む
# auth-integrations.sql / igdb-gateway.sql / notification-delivery.sql
# ローカルまたは検証用DBで確認した後に、対象プロジェクトへ適用する
```

認証済みの対象プロジェクトが用意できた後のEdge公開コマンド：

```sh
npx supabase@2.122.0 secrets set --project-ref <PROJECT_REF> --env-file .env.edge.local
npx supabase@2.122.0 functions deploy integration-api integration-sync igdb-search notification-delivery --project-ref <PROJECT_REF> --use-api
```

`config.toml` の `verify_jwt=false` は、Modern API keyと利用者JWT/ジョブ用キーを各ハンドラーで検証するため。`integration-api` は本人認証が必須、`integration-sync` はジョブ用キーが必須。`igdb-search` は閲覧用の公開検索。`notification-delivery` は操作ごとに本人認証またはジョブ用キーを要求する。

`SUPABASE_URL` と `SUPABASE_SECRET_KEYS` はHosted Edgeの環境変数を使う。secret keyの名前がdefault以外なら `INTEGRATION_SECRET_KEY_NAME` を合わせる。ローカルのDocker環境で使う場合は、同じ形式の値をローカルだけに設定する。

## 自動更新と通知の運用

更新間隔・失敗時の間隔・古い値の表示期限はQ-24。承認後に `STEAM_SYNC_*` / `DISCORD_SYNC_*` を設定する。未設定のままジョブを呼ぶと設定エラーになる。APIの429では相手のRetry-Afterより早く再試行しない。

自動実行はSupabase Cronなどから、`integration-sync` にPOSTする。ヘッダー `x-integration-worker-key` はVaultなどで保管する。実行間隔とプロジェクトの分け方を決めた後に登録する。1回で最大4件を処理するため、利用者数と待ち行列を見て起動頻度・ワーカー数を調整する。アプリを開いていない間も呼ぶ仕組みが必要。

IGDBはサーバーでTwitchの認証情報を使い、DBで共有する上限を通して検索する。検索結果を全件保存せず、②が利用者の選んだゲームを保存する。候補を表示するときはIGDBの利用条件・帰属表示も確認する。

通知はQ-30の**候補として**Expo Push Serviceの接続を用意した。使うと決まった場合だけ、サーバーで `NOTIFICATION_TRANSPORT=expo`、アプリで `EXPO_PUBLIC_ENABLE_PUSH=true` にする。FCM/APNsの設定、EAS project ID、端末での許可が必要。初回起動時に勝手に許可を求めない。

配信側の呼び出し先は `notification-delivery`。②の信頼されたワーカーが `x-integration-worker-key` を付け、次のように呼ぶ：

```json
{
  "action": "send",
  "event": {
    "id": "00000000-0000-4000-8000-000000000001",
    "recipientId": "00000000-0000-4000-8000-000000000002",
    "kind": "matched",
    "target": { "type": "recruitment", "id": "00000000-0000-4000-8000-000000000003" }
  }
}
```

- イベントIDは再試行でも同じにする。すでに受け付けた送信を記録で重複抑止する。`nextDeviceCursor` が返ったら、同じイベントに `deviceCursor` を付けて続きを呼ぶ。再試行時は先頭から確認してよい。
- `retry` は返った `retryAfterMs` 後に再試行。`accepted` はExpoが受け付けた状態で、利用者への到達や既読ではない。送信直後に通信が切れた場合の完全な一度限りの配送は保証できない。
- 別の定期ジョブから `{"action":"receipts"}` を呼び、受付から15分以上経った結果を確認する。`retryEvents` は②の待ち行列へ戻す。`provider_received` もFCM/APNsの受付までで、既読ではない。期限内にreceiptを得られなければ `unknown` とする。
- `disabled` の端末には送らず、登録を削除する。`blocked` は設定の修正が必要。②は一部端末の失敗や端末なしでも、アプリ内通知を消さない。Pushだけを通知の正本にしない。
- ロック画面には一般的なお知らせ文と対象IDだけを送る。部屋番号・招待URL・ゲーム内IDは送らない。タップ後の画面で最新状態を取り直し、開催中止・遊び終了・参加権限を②の処理で確認する。
- Web Pushは実装していない。Webの通知一覧は②のDBから①が表示する。

## EAS Hosting・ネイティブへの公開

チームのExpoアカウントで対象プロジェクトを用意し、`app.json` のowner・EAS project ID・iOS bundleIdentifier・Android packageを決める。未設定の値を既存の別アプリから流用しない。

```sh
npm run check
npx eas-cli@25.3.0 env:exec preview "npx expo export --platform web"
npx eas-cli@25.3.0 deploy --environment preview
# 動作確認後、本番へ置く場合
npx eas-cli@25.3.0 env:exec production "npx expo export --platform web"
npx eas-cli@25.3.0 deploy --environment production --prod
```

公開用の環境変数を使って**ビルドしてから**deployする。`EXPO_PUBLIC_` はビルド時に埋め込まれるため、公開後に環境変数だけ変えてもクライアントは切り替わらない。プレビューURLと本番URLはAuthの許可URL・CORSの許可originにもそれぞれ登録する。

ネイティブはdevelopment buildで確認する。`eas.json` にdevelopment/preview/productionを用意した。実機用の署名や通知資格情報はチーム所有のものを使う。Q-31（App StoreでのAppleログインの扱い）が決まるまでは、App Store提出完了として扱わない。

## 公開環境で残る確認

実際の設定が揃ったら①②③で、未ログイン閲覧→Discord/Googleログイン→プロフィール→募集→参加希望→承認→通知→最新の合流情報、を通す。次も確認する：

- 外部認証を途中で閉じる、戻り先を二重に開く、別アカウントで戻る。
- Steamの公開・非公開・実測0分、Discordの権限不足・期限切れ・更新失敗。
- 更新中に連携解除、解除後の再連携、他人の利用者IDを送る操作。
- 部屋番号/URLの変更、開催中止・遊び終了後の古い通知タップ。
- iOS/Androidの通知許可拒否・端末登録解除、アプリの再起動とバックグラウンド復帰。
- 実際のSNS内ブラウザからのGoogleログイン、Webとネイティブそれぞれのcallback。

現時点で実接続・実通知・クラウド公開を確認したとは扱わない。APIキー・対象プロジェクト・OAuth/配信設定が未提供である。

## 検証記録と残る警告

ローカルの型検査、外部サービスを差し替えたテストとPGliteでのSQL検証（計32件）、Web/iOS/Androidのバンドル出力を確認。ブラウザで未設定時の認証画面が表示され、操作が無効になることも確認した。署名済みアプリの実機検証やSupabase本番DBの検証とは別である。

Supabase CLIは設定を読み込めたが、この端末にはDocker/Podmanがないためローカルスタックの稼働確認はできていない。SQLはPGliteで検証した。設定確認スクリプトは、現状の外部アカウント・更新間隔など18項目の未設定を報告する。

2026-10-24のnpm auditは、Expo CLIの依存にhighを5件報告した（重複する経路を含む）。主な原因はnode-forgeとzod。node-forgeの公開修正版はなく、zodの修正版はExpo CLIが使うv3からのmajor変更になる。Expo SDKを旧版へ強制的に落とす修正は行っていない。依存の更新が出たら再検証する。

- [node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
- [zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)

## 確認した公式資料

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)、[Discord login](https://supabase.com/docs/guides/auth/social-login/auth-discord)
- [Steam authentication](https://partner.steamgames.com/doc/features/auth)、[IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService)、[API terms](https://steamcommunity.com/dev/apiterms)
- [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)、[User](https://docs.discord.com/developers/resources/user)、[Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy)
- [IGDB API](https://api-docs.igdb.com/)
- [Expo SDK 58](https://expo.dev/changelog/sdk-58)、[EAS Hosting](https://docs.expo.dev/eas/hosting/get-started/)、[push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)、[push tickets/receipts](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions)
