# ①②③のAIへの指示：認証・外部連携の接続

更新日：2026-10-24。製品リポジトリは `jphacks/tkb_2616`、仕様は `Umi-s-Atelie/hobby-platform`。この文書は3人の担当AIが並行作業するための接続指示です。

**最新の担当変更：①のAIが不在となったため、次のAIが①フロントエンドと③認証・外部連携を兼任する。②DBは別担当。まず [次のAIへの引き継ぎ](next-ai-handoff.md) を読むこと。**

初回レビューの①②向け修正指示は [ai-review-followups.md](ai-review-followups.md) を読むこと。

## 全担当が最初に読むこと

- ①は画面、②はDB・募集・参加・成立の業務処理、③は認証・外部連携・通知配信・公開準備を担当する。他担当のファイルを一括移動・置換しない。
- **依頼者個人のSupabaseプロジェクトを使用しない。** MCPに見えても使用しない。DBの作成、マイグレーション適用、接続先の設定は②に任せる。接続にはチームで指定した環境を使う。
- 作業開始時にブランチ、未コミット差分、GitHubの最新差分を確認する。他AIの差分を消さない。初期状態とmainが変わっていたら自動マージせず報告する。
- ユーザーの統合依頼により、main a73ef33の画面・DBをPR #1へ取り込んだ。画面、DBマイグレーション・型・seed・DBテスト、既存Pages出力はmainと同一。
- 統合版はrootで npm run setup → npm run web。Routerはsrc/app/、トップ画面は既存app/App.tsxを読み込む。app/は移動せず、単独デモとPagesの起動・出力方法も維持する。
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
| ゲーム検索 | `src/lib/games.ts` の `searchGames`。候補を選んだら `saveGame(id)` で `games` に保存してから、その `id` で募集を出す（保存はログインが要る。IGDBに届かないときは、保存済みのゲームならそのまま返る） |
| 募集・一覧・参加希望・承認・成立 | `src/live/screens.tsx`（DBとのやり取りは `src/live/api.ts`）。接続先（`EXPO_PUBLIC_SUPABASE_URL` と公開用の鍵）があるときだけ、`src/app/index.tsx` が `app/` の見本の画面と差し替える。無いとき（`app/` 単独・Pages）は見本のまま。募集のリンクは `#/list?r=<募集のID>`。アプリ版から共有するリンクの公開先は `EXPO_PUBLIC_APP_URL` |
| Steamの信頼の目安 | `src/lib/trust.ts` の `steamTrustOf(userIds, gameIds)`。ログインなしで読める。アカウントの年数・Steamレベル・そのゲームを持っているか・プレイ時間（server-41）と最終取得成功時刻を返す。Steam連携の無い人は結果に入らない。`owned` は「持っている」か「分からない」だけで、「持っていない」とは返さない（EXT-Steam-2） |
| 通知の有効化・タップ | `src/notifications/push.ts`。通知本文は最新の部屋情報の代わりに使わない |

1. `src/app/dev/auth.tsx` を呼び出し例として読む。本番の画面デザインは①のコードで実装する。
2. ログイン4方式と、Steam・Discordの任意連携を別の操作として表示する。Steamログインだけでライブラリを取得しない。Discordの任意連携ではIDと状態だけを表示し、名前・アイコンを表示しない。
3. `lastSuccessAt` は成功した時刻。取得を試した時刻ではない。最終更新日時と相対表示を出す。7日を超えたら「7日以上前」、取得前は「まだ取得できていません」。実測0分と未取得を区別する。
4. Googleの既知のアプリ内ブラウザでは `externalBrowserMessage` の案内を表示し、外部ブラウザへ進む導線を用意する。
5. Webの `/auth/callback` と `/auth/link-callback`、ネイティブの同名deep linkを③の処理へ接続する。戻り先のコード交換を独自に二重実装しない。
6. app/の既存ナビゲーションを維持する。認証callbackはsrc/app/。公開先は/auth/callbackと/auth/link-callbackをindex.htmlへ戻すSPA設定が必要。root起動の設定画面は認証・連携処理へ接続済み。チーム環境での実認証・実DBの疎通は未確認。app/単独起動は明示した画面デモであり、接続済みの画面と混同しない。現在の検証結果と残作業は [引き継ぎの最新追記](next-ai-handoff.md) を読む。

## ② DB・業務処理担当AIへの指示

③の表と関数は、②がマイグレーションに取り込んだ（中身は追加案のまま）。クラウドDBへの適用は、②のチーム環境の手順（`supabase/README.md`）に従う。

| マイグレーション | 担当するデータ |
| --- | --- |
| `supabase/migrations/20261024063000_integration_links.sql` | 任意連携、認証試行、解除世代、取得スナップショット |
| `supabase/migrations/20261024063100_steam_login.sql` | Steamログイン時の短命なstate・code・userinfo用tokenのハッシュ |
| `supabase/migrations/20261024063200_igdb_gateway.sql` | IGDBの共有API呼び出し制限 |
| `supabase/migrations/20261024063300_push_delivery.sql` | 端末・通知の配送記録 |

- 利用者IDは検証済みの `auth.users.id` を使う。`profiles.id` と1対1である現在の②の設計に合わせる。本文のuserId、ユーザーが編集できるmetadataを権限判定に使わない。
- ③のテーブル名は `integration_*`。現在の②の `profiles` / `games` / `recruitments` / `applications` / `notifications` を作り直さない。
- Steamの任意連携解除は `integration_unlink`。取得情報・暗号化トークン・認証試行を削除し、進行中の結果を無効化する。プロフィールの手入力や募集・成立の記録を削除しない。AuthのSteamログインidentityをこの関数で削除しない。
- 保存するDiscordのアカウント情報はIDのみ。名前・アイコン・メール・作成時期をスナップショットへ足さない。認証の維持に使う暗号化トークンと処理時刻は別扱い。
- ログイン用の一時テーブルはクライアントからアクセスさせない。codeはPKCE検証に成功した1回だけ消費する。無効な検証値で正しいcodeを消費させない。
- Steamは連携完了時に取得し、その後は `integration-sync` が永続化した `next_attempt_at` を読んで処理する。アプリを開いていなくても動くよう、チーム環境で1分ごとにワーカーを呼ぶジョブを設定する。ワーカーキーはVault等で保管する。秘密をSQLファイルやGitへ書かない。
- ワーカーは `POST /functions/v1/integration-sync`、ヘッダーは `x-integration-worker-key`。1回最大4件。利用者数が増えたら未処理件数と所要時間を見て起動数を調整する。外部APIのRetry-Afterを短縮しない。
- 募集・成立・通知対象者の判断は②の関数が行う。③はそのイベントを配送する。②のアプリ内通知をPushの成功・失敗で消さない。
- ローカルポートは②の553xxを正として統合する。旧543xx設定へ戻さない。
- PGliteで③のマイグレーション単体（tests/integration-schema.test.ts）と、tests/merged-database.test.tsによる全マイグレーションの共存・基本動線を検証する。Supabase全体やRealtimeの実行確認ではない。実スキーマ変更時は②のローカルSupabaseで既存47件のDBテストと型生成を行う。

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

統合版のWebはSPA（single）出力。公開先には認証callbackなどをindex.htmlへ戻す設定が必要。既存Pagesのデモ出力とは起動・ビルド手順を区別する。公開先・app identifiersは①②と合わせ、環境変数を指定してビルドする。開発用とデモ／本番用はチームが用意する別環境にする。

## 検証と未完了事項

```sh
npm run setup
npm run check
npm run build:native
npm run doctor:config
```

- `npm run check` は型・テスト・Edge型・Web出力を検証する。外部APIは差し替え、SQLはローカルのPGliteで検証する。個人Supabaseは使わない。
- 実アカウントの4方式ログイン、実API、実通知、クラウド公開は未確認。設定後にキャンセル、二重callback、無効なstate、解除中の更新、古い通知タップを含めて確認する。
- 画面・DBコードの配置統合は完了済みだが、画面はデモ状態管理のまま。チーム接続先設定後に、①③を兼任するAIと②で実環境の動線を結合検証する。
- 設定不足は `doctor:config` が項目名だけを表示する。プロバイダーの管理画面の設定完了は別に確認する。
- 既知のExpo CLIの依存警告（node-forge、zod）は前回から残る。SDKを無条件に下げたりmajor版を強制置換しない。公式の修正版が出たら範囲を確認して更新する。

公式の技術根拠：[Supabase custom providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)、[Apple login](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple)、[Steam authentication](https://partner.steamgames.com/doc/features/auth)、[Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)。

## 統合後の確認（2026-10-24）

- npm run check：画面と認証それぞれの型検査、49テスト、Edge型検査、Web出力。npm run build:native：iOS/Androidバンドル出力。署名済み実機確認は別。
- Webは既存画面と同じSPA。SSRへ戻す場合はフォント・hash初期状態・外部ストアのhydration対応を先に行う。
- rootのMetroはrootのnode_modulesへ解決を統一する。app/に単独デモの依存を入れてもReactを二重ロードしない。サーバー用.envとsupabaseの実装・SQLは配信対象外。
- ローカルブラウザで公開→承認→編集、プロフィールへの同時保存、別ゲームからの再公開防止、設定画面、認証診断、設定未入力時のcallbackを確認した。募集画面はデモ状態管理のまま。
- 実OAuth、実API、Push、チームDB、デプロイは未接続・未検証。個人Supabaseは使用しない。③の表を変えるときは、既存のマイグレーションを書き換えず、②と合わせて新しいマイグレーションを足す。
