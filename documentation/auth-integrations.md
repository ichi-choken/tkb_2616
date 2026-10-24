# ①②③のAIへの指示：認証・外部連携の接続

更新日：2026-10-24。製品リポジトリは `jphacks/tkb_2616`、仕様は `Umi-s-Atelie/hobby-platform`。この文書は3人の担当AIが並行作業するための接続指示です。

初回レビューの①②向け修正指示は [ai-review-followups.md](ai-review-followups.md) を読むこと。

## 全担当が最初に読むこと

- ①は画面、②はDB・募集・参加・成立の業務処理、③は認証・外部連携・通知配信・公開準備を担当する。他担当のファイルを一括移動・置換しない。
- **依頼者個人のSupabaseプロジェクトを使用しない。** MCPに見えても使用しない。DBの作成、マイグレーション適用、接続先の設定は②に任せる。接続にはチームで指定した環境を使う。
- 作業開始時にブランチ、未コミット差分、GitHubの最新差分を確認する。他AIの差分を消さない。初期状態とmainが変わっていたら自動マージせず報告する。
- 本ブランチは `feat/auth-integrations-expo`（PR #1）。最新の画面はmain `d391edc` の `app/`、DB担当は `backend/supabase-init` の `4cf5c69` を確認した。**未統合**なので、その2つのブランチの完成状態を本ブランチの検証結果に含めない。
- 本ブランチのルートExpoプロジェクトの `app/` は確認用のルート。mainの `app/` は別のExpoプロジェクト。この配置をそのまま統合すると競合する。①と配置を決めるまでは移動しない。
- 仕様の合意は仕様PR #17 `078c259` を参照する。仕様mainとPRでADR-80〜82の番号が重複しているため、参照はコミットとファイル名も確認する。
- 独自のアカウント統合・ログイン方式解除はQ-33、通知方式はQ-30、Discordの定期更新条件はQ-24で未決。実装の都合で決定しない。
- 新しいmdはAIへの作業指示として書く。製品READMEの説明と、実装済み・未接続・未決を混同しない。

## ① 画面担当AIへの指示

| 接続する機能 | 読むコード・使う関数 |
| --- | --- |
| ログイン | `src/auth/index.ts` の `signIn(provider)`。providerは `discord` / `google` / `steam` / `apple` |
| ログアウト | `src/auth/index.ts` の `signOut()` |
| ログイン状態 | `src/lib/supabase.ts` のクライアントの `onAuthStateChange`。サーバーでの権限判定に表示用状態を流用しない |
| 任意の情報連携 | `src/auth/links.ts` の `linkAccount` / `completeAccountLink` / `unlinkAccount` / `linkedAccounts` |
| 連携状態の表示 | `packages/integrations/src/link-status.ts` の `LinkStatus` / `linkStatusLabels` / `lastUpdatedLabel` |
| ゲーム検索 | `src/lib/games.ts`。選んだゲームの保存は②と接続する |
| 通知の有効化・タップ | `src/notifications/push.ts`。通知本文は最新の部屋情報の代わりに使わない |

1. `app/dev/auth.tsx` を呼び出し例として読む。本番の画面デザインは①のコードで実装する。
2. ログイン4方式と、Steam・Discordの任意連携を別の操作として表示する。Steamログインだけでライブラリを取得しない。Discordの任意連携ではIDと状態だけを表示し、名前・アイコンを表示しない。
3. `lastSuccessAt` は成功した時刻。取得を試した時刻ではない。最終更新日時と相対表示を出す。7日を超えたら「7日以上前」、取得前は「まだ取得できていません」。実測0分と未取得を区別する。
4. Googleの既知のアプリ内ブラウザでは `externalBrowserMessage` の案内を表示し、外部ブラウザへ進む導線を用意する。
5. Webの `/auth/callback` と `/auth/link-callback`、ネイティブの同名deep linkを③の処理へ接続する。戻り先のコード交換を独自に二重実装しない。
6. ①の最新 `app/` へ組み込む際は、③のルート確認用プロジェクトとルーターを混在させない。起動方法・配置の調整後、Web/iOS/Androidで確認する。

## ② DB・業務処理担当AIへの指示

本ブランチからクラウドDBへ適用したSQLはありません。以下は②が既存マイグレーションと調整する追加案です。

| SQL案 | 担当するデータ |
| --- | --- |
| `supabase/proposals/auth-integrations.sql` | 任意連携、認証試行、解除世代、取得スナップショット |
| `supabase/proposals/steam-login.sql` | Steamログイン時の短命なstate・code・userinfo用tokenのハッシュ |
| `supabase/proposals/igdb-gateway.sql` | IGDBの共有API呼び出し制限 |
| `supabase/proposals/notification-delivery.sql` | 端末・通知の配送記録 |

- 利用者IDは検証済みの `auth.users.id` を使う。`profiles.id` と1対1である現在の②の設計に合わせる。本文のuserId、ユーザーが編集できるmetadataを権限判定に使わない。
- 追加案のテーブル名は `integration_*`。現在の②の `profiles` / `games` / `recruitments` / `applications` / `notifications` を作り直さない。
- Steamの任意連携解除は `integration_unlink`。取得情報・暗号化トークン・認証試行を削除し、進行中の結果を無効化する。プロフィールの手入力や募集・成立の記録を削除しない。AuthのSteamログインidentityをこの関数で削除しない。
- 保存するDiscordのアカウント情報はIDのみ。名前・アイコン・メール・作成時期をスナップショットへ足さない。認証の維持に使う暗号化トークンと処理時刻は別扱い。
- ログイン用の一時テーブルはクライアントからアクセスさせない。codeはPKCE検証に成功した1回だけ消費する。無効な検証値で正しいcodeを消費させない。
- Steamは連携完了時に取得し、その後は `integration-sync` が永続化した `next_attempt_at` を読んで処理する。アプリを開いていなくても動くよう、チーム環境で1分ごとにワーカーを呼ぶジョブを設定する。ワーカーキーはVault等で保管する。秘密をSQLファイルやGitへ書かない。
- ワーカーは `POST /functions/v1/integration-sync`、ヘッダーは `x-integration-worker-key`。1回最大4件。利用者数が増えたら未処理件数と所要時間を見て起動数を調整する。外部APIのRetry-Afterを短縮しない。
- 募集・成立・通知対象者の判断は②の関数が行う。③はそのイベントを配送する。②のアプリ内通知をPushの成功・失敗で消さない。
- ローカルポートは②の553xxを正として統合する。本ブランチの543xx設定を無条件に上書き適用しない。
- PGliteのテストは追加案単体の検証。②の実マイグレーションとの結合後、②のローカルSupabaseでテストし、型を再生成する。その後、合意済みのチーム環境へ適用する。

## ③ 認証・外部連携担当AIへの指示

### 実装済みの処理を維持する

- `src/auth/flow.ts` はDiscord・Google・AppleをSupabase標準OAuthへ、Steamを `custom:steam` へ渡す。PKCE・ログインセッションの発行と更新はSupabase Authに任せる。
- `steam-auth` はSteam OpenID 2.0の公式応答をサーバーで検証し、Supabaseのcustom OAuth2に変換する。自作のAuth JWTや架空のメールアドレスを発行しない。ユーザー入力のSteamIDだけでログインを許可しない。
- Steamの署名・発行元・戻り先・nonce、OAuth client secret・PKCE・codeの期限と一度限りの交換を検証する。秘密の値をエラー・ログへ出さない。
- Steam更新の方針は `steamSyncPolicy` が正本。24時間周期、初回失敗から1分・5分・30分・2時間、その後5時間ごとの再試行。成功後は通常周期に戻す。最後の取得値は経過日数だけで削除しない。
- 連携解除・再連携と競合した古い結果は、DBのrevisionによる比較更新で棄却する。取得値で本人の手入力を上書きしない。
- Discordの定期更新条件が未設定でもSteamワーカーを止めない。Discordは連携時にIDと確認時刻を保存する。

### チーム環境の設定担当へ渡す情報

1. `.env.example` は公開URL・publishable keyの雛形。接続先は②が指定したものだけを使う。`sb_secret_` はクライアントへ渡さない。
2. サーバー設定は `supabase/.env.example`。`npm run setup:secrets` は未作成の場合だけローカルの無視対象ファイルを作る。既存の秘密ファイルを上書きしない。環境変数の内容をチャットへ貼らない。
3. Discord・Google・AppleのSupabase Auth設定を準備する。提供元の戻り先はチームプロジェクトのAuth callback、アプリの戻り先は公開URLの `/auth/callback` と `shumitomo://auth/callback`。別用途のプロジェクトを流用しない。
4. Steamは次のcustom OAuth2設定を準備する。**この文書を読んだだけで個人プロジェクトへ設定しない。**

| 設定 | 値 |
| --- | --- |
| identifier | `custom:steam` |
| provider_type | `oauth2` |
| client_id / client_secret | サーバーの `STEAM_LOGIN_CLIENT_ID` / `STEAM_LOGIN_CLIENT_SECRET` と一致する値 |
| authorization_url | `<チームSUPABASE_URL>/functions/v1/steam-auth/authorize` |
| token_url | `<チームSUPABASE_URL>/functions/v1/steam-auth/token` |
| userinfo_url | `<チームSUPABASE_URL>/functions/v1/steam-auth/userinfo` |
| pkce_enabled | `true` |
| email_optional | `true`。Steamからメールは取れない |
| scopes | 空配列。userinfoは検証済みSteamIDだけ |

5. AppleのWeb OAuthにはServices ID・署名設定等が必要。生成したclient secretは6か月以内に更新する。`.p8`自体の定期交換とは区別する。今回のコードはOAuthブラウザ経由。iOSネイティブのApple専用UI・署名済み実機確認は未完了。
6. Discordの任意連携用callbackは `/auth/link-callback` と `?native=1` 付き。scopeは `identify` のみ。ログイン提供元が内部的に保存するAuth metadataと、アプリの任意連携スナップショットを混同しない。Auth metadataをプロフィールへ転記しない。
7. SteamのAPI取得には `STEAM_WEB_API_KEY`、ログインにはcustom OAuth2設定が必要。片方を設定しただけで両方を疎通済みとしない。
8. 複数ログイン方式を同じ利用者へ追加・統合するUIは作らない。Supabase標準の同一メール連結を含む実際の挙動はQ-33の決定と実環境確認に合わせる。

### 通知・公開

通知方式Q-30が決まるまで `NOTIFICATION_TRANSPORT=disabled` と `EXPO_PUBLIC_ENABLE_PUSH=false` を維持する。Expoを採用した場合だけ、FCM/APNs・EAS project ID等をチーム所有の設定で用意する。

②が確定した通知イベントを `notification-delivery` の `send` へ渡す。payload型は `packages/integrations/src/notifications.ts`。同じevent IDで再送し、`nextDeviceCursor` があれば続きを送る。定期的に `tick` を呼び、receipt確認・再試行を進める。`accepted` は配送サービスの受付であり、利用者への到達や既読ではない。部屋番号・招待URL・ゲーム内IDをロック画面のpayloadへ入れない。

Webは本ブランチではserver出力。mainの静的デモと同じ手順で公開できると断言しない。公開先・app identifiersは①②と合わせ、環境変数を指定してビルドする。開発用とデモ／本番用はチームが用意する別環境にする。

## 検証と未完了事項

```sh
npm run setup
npm run check
npm run build:native
npm run doctor:config
```

- `npm run check` は型・テスト・Edge型・Web出力を検証する。外部APIは差し替え、SQLはローカルのPGliteで検証する。個人Supabaseは使わない。
- 実アカウントの4方式ログイン、実API、実通知、クラウド公開は未確認。設定後にキャンセル、二重callback、無効なstate、解除中の更新、古い通知タップを含めて確認する。
- 本ブランチだけで、①の最新画面と②の最新DBまで動いたことにしない。配置調整・SQL取り込み・チーム接続先設定後に3担当の動線を結合検証する。
- 設定不足は `doctor:config` が項目名だけを表示する。プロバイダーの管理画面の設定完了は別に確認する。
- 既知のExpo CLIの依存警告（node-forge、zod）は前回から残る。SDKを無条件に下げたりmajor版を強制置換しない。公式の修正版が出たら範囲を確認して更新する。

公式の技術根拠：[Supabase custom providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)、[Apple login](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple)、[Steam authentication](https://partner.steamgames.com/doc/features/auth)、[Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)。
