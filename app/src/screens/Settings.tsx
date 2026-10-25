// 設定：アカウント（ログイン）と、Steam・Discordとの連携（account-1〜12、server-41・62〜64・75）
// デモの連携・表示設定はプロフィールと同じ状態を参照する
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { savedInfo } from '../saved';
import { useStore } from '../store';
import { demoSettings } from '../demo-settings';
import { freshLink, type Service, type Link, type SteamItem, type Settings } from '../demo-settings-state';
import { STEAM_ACCOUNT, STEAM_LIBRARY, clearSteam, importSteam, refreshSteam, type SteamImport } from '../steam-demo';
import { C, useLayout } from '../theme';
import {
  AppBar, Art, Badge, Block, Card, Check, Cols, DemoButton, Divider, MainButton, Note, PillButton, Row, Stack, SubButton,
  TextButton, Trust, Txt,
} from '../ui';

/* ---------- 状態 ---------- */

const set = demoSettings.update;
function useSettings() {
  return useSyncExternalStore(demoSettings.subscribe, demoSettings.getSnapshot, demoSettings.getSnapshot);
}
// デモの「最初から」で、プロフィールと設定を同時にリセットする
export function resetSettings() {
  demoSettings.reset();
}

const now = () => {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getMonth() + 1}/${t.getDate()} ${p(t.getHours())}:${p(t.getMinutes())}`;
};

// SNSのアプリ内ブラウザ（X、Instagram、LINE、Discordなど）で開いているか
const UA = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent : '';
const IN_APP_UA = /Line\/|FBAN|FBAV|Instagram|Twitter|Discord/i.test(UA);
const IS_LINE = /Line\//i.test(UA);

/* ---------- 連携で取れるもの（見本は steam-demo.ts） ---------- */

// 取り込み中に順に出す手順。取り込みはこの時間だけ待ってから終える
const IMPORT_STEPS = ['Steamのプロフィール（アカウントの年数・レベル）', '持っているゲーム', 'ゲームごとのプレイ時間', 'プロフィールへの反映'];
const IMPORT_STEP_MS = 550;
const SERVICE_NAME: Record<Service, string> = { steam: 'Steam', discord: 'Discord' };
const LOGIN_NAME = { discord: 'Discord', google: 'Google', steam: 'Steam', apple: 'Apple' } as const;
const LOGIN_ICON = { discord: 'logo-discord', google: 'logo-google', steam: 'logo-steam', apple: 'logo-apple' } as const;

/* ---------- 画面 ---------- */

export function SettingsScreen({ accountPanel, steamOnly = false }: { accountPanel?: ReactNode; steamOnly?: boolean }) {
  const { go, copy, open } = useStore();
  const st = useSettings();
  const inApp = st.inApp || IN_APP_UA;

  // ブラウザで開く（app-5、app-6）。LINEでは ?openExternalBrowser=1 を付けると普段のブラウザで開く
  const openInBrowser = () => {
    if (Platform.OS !== 'web') return;
    const url = new URL(window.location.href);
    if (IS_LINE) {
      url.searchParams.set('openExternalBrowser', '1');
      window.location.href = url.toString();
      return;
    }
    copy(url.toString(), 'リンクをコピーしました。普段のブラウザに貼って開いてください');
  };

  const trustParts = [
    st.steam.linked && st.steam.fetch !== 'private' ? `Steam連携${st.steamShow.age ? `・${STEAM_ACCOUNT.years}年` : ''}${st.steamShow.level ? `・Lv.${STEAM_ACCOUNT.level}` : ''}` : null,
    st.discord.linked ? 'Discord連携' : null,
  ].filter(Boolean);

  const left = (
    <>
      {inApp ? <BrowserCard onOpen={openInBrowser} /> : null}
      {accountPanel ?? <AccountBlock inApp={inApp} onOpenBrowser={openInBrowser} />}
      <Block title={accountPanel ? "あなたの信頼の目安（デモ）" : "あなたの信頼の目安"}>
        <Card pad>
          <Stack gap={6}>
            <Trust value={trustParts.join(' / ') || null} />
            <Note>連携すると、募集一覧や参加希望の画面で、相手にこの目安が出ます。連携は任意です。</Note>
          </Stack>
        </Card>
      </Block>
      <Card pad>
        <Stack gap={6}>
          <Check label="（デモ）アプリ内ブラウザとして見る" value={st.inApp} onChange={(v) => set((d) => { d.inApp = v; d.googleStep = false; })} />
          <Note>X・LINE・Discordなどのアプリの中で開いたときの表示を確かめられます。</Note>
        </Stack>
      </Card>
    </>
  );

  const right = (
    <>
      {!accountPanel ? <LinkBlock service="steam" inApp={inApp} onOpenBrowser={openInBrowser} /> : null}
      {!steamOnly ? <LinkBlock service="discord" inApp={inApp} onOpenBrowser={openInBrowser} /> : null}
      <DataBlock />
      <Card pad>
        <Stack gap={6}>
          <Txt size={13} weight="bold">このアプリについて</Txt>
          <Note>利用規約とプライバシーポリシーは、公開前に用意します。出会い目的の利用と、連絡先の交換は禁止です。</Note>
          <TextButton label="IGDB.com（ゲーム検索の提供元）" onPress={() => open('https://www.igdb.com/')} />
        </Stack>
      </Card>
    </>
  );

  return (
    <Stack>
      <AppBar title="設定" onBack={() => go('profile')} />
      <Note color={C.warn}>{accountPanel ? 'Steamは実際のログインと取得値です。DB未接続の機能はデモ表示です。' : '設定の画面デモです。ログイン・連携・取得値はすべて見本で、外部サービスには接続しません。'}</Note>
      <Cols even left={left} right={right} />
    </Stack>
  );
}

// この端末に残しているデータ。家計簿アプリのように、閉じて開き直しても前の続きから使える
function DataBlock() {
  const { s: st, reset, confirm } = useStore();
  // st が変わるたびに保存しているので、st を見て描き直すと最終保存時刻も新しくなる
  void st;
  const { lastSavedAt, canSave } = savedInfo();
  const at = lastSavedAt ? new Date(lastSavedAt) : null;
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    <Block title="この端末のデータ">
      <Card pad>
        <Stack gap={8}>
          <Row gap={8}>
            <Ionicons name={canSave ? 'save-outline' : 'alert-circle-outline'} size={18} color={canSave ? C.ok : C.danger} />
            <Txt size={14} weight="bold" style={{ flex: 1 }}>{canSave ? '自動で保存しています' : 'この端末には保存できません'}</Txt>
            {at ? <Note>最終保存 {at.getMonth() + 1}/{at.getDate()} {p(at.getHours())}:{p(at.getMinutes())}</Note> : null}
          </Row>
          <Note>{canSave
            ? 'プロフィール・募集・フレンド・連携の状態は、この端末（ブラウザ）に残ります。閉じて開き直しても、前の続きから使えます。別の端末とは同期しません。'
            : 'プライベートモードなどで、ブラウザが保存を許していません。閉じると入力が消えます。'}</Note>
          <View style={{ alignSelf: 'flex-start' }}>
            <SubButton danger label="この端末のデータを消す" onPress={async () => {
              if (!(await confirm('この端末に残したプロフィールや募集を消して、最初の状態に戻しますか？'))) return;
              resetSettings();
              reset();
            }} />
          </View>
        </Stack>
      </Card>
    </Block>
  );
}

// アプリ内ブラウザでは、普段のログイン状態が引き継がれないので、先にブラウザで開くよう勧める（app-4、app-5）
function BrowserCard({ onOpen }: { onOpen: () => void }) {
  return (
    <Card pad style={{ borderWidth: 2, borderColor: C.warn, backgroundColor: C.warnBg }}>
      <Stack gap={8}>
        <Row gap={8}><Ionicons name="open-outline" size={18} color={C.warn} /><Txt size={15} weight="bold">アプリの中のブラウザで開いています</Txt></Row>
        <Note color={C.ink}>このままでも見ることも参加することもできます。SteamやDiscordとの連携、Googleでのログインは、普段のブラウザで開いてからのほうが確実です。</Note>
        <MainButton label="ブラウザで開く" onPress={onOpen} />
      </Stack>
    </Card>
  );
}

/* ---------- アカウント（account-1、account-11、account-12） ---------- */

function AccountBlock({ inApp, onOpenBrowser }: { inApp: boolean; onOpenBrowser: () => void }) {
  const { toast, confirm } = useStore();
  const st = useSettings();
  const login = async (by: NonNullable<Settings['login']>) => {
    // アプリ内ブラウザでGoogleを選ぶと、先に「ブラウザで開く」ボタンが出る（account-12）
    if (by === 'google' && inApp && !st.googleStep) {
      set((d) => { d.googleStep = true; });
      return;
    }
    set((d) => { d.login = by; d.googleStep = false; });
    toast(`（デモ）${LOGIN_NAME[by]}でログインした表示にしました`);
  };

  return (
    <Block title="アカウント">
      <Card pad>
        {st.login ? (
          <Stack gap={8}>
            <Row gap={8}>
              <Ionicons name={LOGIN_ICON[st.login]} size={20} color={C.ink} />
              <Txt size={15} weight="bold" style={{ flex: 1 }}>（デモ）{LOGIN_NAME[st.login]}でログイン中</Txt>
              <Badge label="登録済み" tone="ok" />
            </Row>
            <Note>プロフィールとフレンドが残り、別の端末でも同じアカウントで使えます。アカウント名は誰にも見えません。</Note>
            <View style={{ alignSelf: 'flex-start' }}>
              <SubButton label="ログアウト" onPress={async () => {
                if (!(await confirm('ログアウトしますか？見ることはそのままできます。'))) return;
                set((d) => { d.login = null; });
              }} />
            </View>
          </Stack>
        ) : (
          <Stack gap={10}>
            <Txt size={15} weight="bold">ログインしていません</Txt>
            <Note>見るだけなら登録は要りません。「参加したい」を押すときと、募集を出すときにログインします。</Note>
            <Row gap={8} wrap>
              <LoginButton icon="logo-discord" label="Discordでログイン" onPress={() => login('discord')} />
              <LoginButton icon="logo-google" label="Googleでログイン" onPress={() => login('google')} />
              <LoginButton icon="logo-steam" label="Steamでログイン" onPress={() => login('steam')} />
              {/* Apple は画面に置くだけで、ログインは始めない（仕様の ADR-84、Q-31） */}
              <LoginButton icon="logo-apple" label="Appleでログイン" disabled onPress={() => {}} />
            </Row>
            {st.googleStep ? (
              <Card pad style={{ backgroundColor: C.warnBg }}>
                <Stack gap={8}>
                  <Note color={C.ink}>アプリの中のブラウザでは、Googleでログインできないことがあります。先に普段のブラウザで開いてください。</Note>
                  <Row gap={8} wrap>
                    <PillButton label="ブラウザで開く" onPress={onOpenBrowser} />
                    <TextButton label="このまま続ける" onPress={() => login('google')} />
                  </Row>
                </Stack>
              </Card>
            ) : null}
          </Stack>
        )}
      </Card>
    </Block>
  );
}

function LoginButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const { s } = useLayout();
  return (
    <View style={{ position: 'relative' }}>
      <SubButton label={`   ${label}`} onPress={onPress} disabled={disabled} />
      <View pointerEvents="none" style={{ position: 'absolute', left: s(12), top: 0, bottom: 0, justifyContent: 'center' }}>
        <Ionicons name={icon} size={s(16)} color={C.ink} />
      </View>
    </View>
  );
}

/* ---------- 連携（account-2〜10） ---------- */

function LinkBlock({ service, inApp, onOpenBrowser }: { service: Service; inApp: boolean; onOpenBrowser: () => void }) {
  const { toast, confirm, open, editProfile } = useStore();
  const st = useSettings();
  const l = st[service];
  const name = SERVICE_NAME[service];
  const upd = (fn: (x: Link) => void) => set((d) => { fn(d[service]); });

  // 連携の状態の表
  const start = () => upd((x) => { x.phase = 'authing'; });
  const succeed = () => {
    if (service === 'discord') {
      upd((x) => { x.linked = true; x.phase = 'idle'; x.fetch = 'auto'; x.lastOk = now(); });
      toast(`（デモ）${name}と連携した表示にしました`);
      return;
    }
    // Steamは、取り込みの手順を見せてから、見本の値をプロフィールに入れる
    upd((x) => { x.phase = 'importing'; });
    setTimeout(async () => {
      const at = now();
      const out: { r?: SteamImport } = {};
      const saved = await editProfile((p) => { out.r = importSteam(p, at); });
      set((d) => {
        Object.assign(d.steam, { linked: true, phase: 'idle', fetch: 'auto', lastOk: at });
        d.steamImport = saved && out.r ? out.r : null;
      });
      if (saved && out.r) toast(`（デモ）Steamから取り込み、ゲームを${out.r.added.length}件追加・${out.r.updated.length}件更新しました`);
    }, IMPORT_STEP_MS * IMPORT_STEPS.length);
  };
  const cancel = () => upd((x) => { x.phase = 'idle'; }); // 元の連携を維持
  const fail = () => upd((x) => { x.phase = 'failed'; }); // 元の連携を維持

  // 取得の失敗と再認証の表
  const fetchEvent = async (e: 'ok' | 'net' | 'limit' | 'auth' | 'private') => {
    // 取得できたときは、Steamのプレイ時間も新しくなる（自動更新の見本）
    const at = now();
    if (e === 'ok' && service === 'steam' && !(await editProfile((p) => refreshSteam(p, at)))) return;
    upd((x) => {
      if (e === 'ok') { x.fetch = 'auto'; x.lastOk = at; return; }
      if (e === 'net' || e === 'limit') { if (x.fetch === 'auto') x.fetch = 'retry'; return; }
      if (e === 'auth') { if (x.fetch !== 'relink') x.fetch = 'relink'; return; }
      if (x.fetch !== 'private') x.fetch = 'private';
    });
  };

  // 連携を解除（account-10）。自動取得を止め、連携由来の表示と信頼の目安を外す（server-64）
  const unlink = async () => {
    if (!(await confirm(`${name}との連携を解除しますか？自動取得を止め、${name}から入れた表示と信頼の目安を外します。`))) return;
    if (service === 'steam' && !(await editProfile(clearSteam))) return;
    set((d) => {
      Object.assign(d[service], freshLink());
      if (service === 'steam') d.steamImport = null;
    });
    toast(service === 'steam'
      ? 'Steamとの連携を解除しました。足したゲームは残し、プレイ時間の表示を外しました'
      : `${name}との連携を解除しました`);
  };

  const icon = service === 'steam' ? 'logo-steam' : 'logo-discord';
  const badge = l.phase === 'authing' ? <Badge label="認証中" tone="warn" />
    : l.phase === 'importing' ? <Badge label="取り込み中" tone="warn" />
    : l.phase === 'failed' ? <Badge label="失敗" tone="danger" />
    : l.linked ? <Badge label="連携済み" tone="ok" /> : <Badge label="未連携" tone="rest" />;

  return (
    <Block title={name}>
      <Card pad>
        <Stack gap={10}>
          <Row gap={8}>
            <Ionicons name={icon} size={22} color={C.ink} />
            <Txt size={16} weight="bold" style={{ flex: 1 }}>{name}</Txt>
            {badge}
          </Row>

          {l.phase === 'authing' ? (
            <Stack gap={8}>
              <Note color={C.ink}>{service === 'steam'
                ? 'Steamの公式ページで認証しています。パスワードはこのアプリに渡りません。'
                : 'Discordの公式ページで認証しています。'}</Note>
              <Row gap={6} wrap>
                <DemoButton label="（デモ）認証できた" onPress={succeed} />
                <DemoButton label="（デモ）キャンセルした" onPress={cancel} />
                <DemoButton label="（デモ）失敗した" onPress={fail} />
              </Row>
            </Stack>
          ) : l.phase === 'importing' ? (
            <ImportSteps />
          ) : l.phase === 'failed' ? (
            <Stack gap={8}>
              <Note color={C.danger}>連携できませんでした。{l.linked ? 'これまでの連携はそのまま使えます。' : ''}</Note>
              <Row gap={8}><PillButton label="やり直す" onPress={start} /><TextButton label="やめる" onPress={cancel} /></Row>
            </Stack>
          ) : !l.linked ? (
            <Stack gap={8}>
              <Note>{service === 'steam'
                ? '連携すると、持っているゲームとプレイ時間が自動で入り、その後も自動で更新されます。アカウントの年数やSteamレベルが信頼の目安になります。'
                : 'DiscordのアカウントをIDで確認します。名前・アイコン・メール・アカウントの作成時期は取得・表示しません。実名の本人確認ではありません。'}</Note>
              {/* ログインは左の「アカウント」で行う。ここは連携だけを扱う（account-2：連携は登録とは別で任意） */}
              <Note>連携は任意です。連携しなくても使えます。</Note>
              {inApp ? <Note color={C.warn}>アプリの中のブラウザでは連携に失敗しやすいので、先に「ブラウザで開く」を押してください。</Note> : null}
              <Row gap={8} wrap>
                {inApp ? <PillButton label="ブラウザで開く" onPress={onOpenBrowser} /> : null}
                <SubButton label={`${name}と連携`} onPress={start} />
              </Row>
            </Stack>
          ) : (
            <Linked service={service} l={l} />
          )}

          {l.linked && l.phase === 'idle' ? (
            <>
              <Divider />
              <Row gap={6} wrap>
                <DemoButton label="（デモ）取得できた" onPress={() => fetchEvent('ok')} />
                <DemoButton label="（デモ）通信に失敗" onPress={() => fetchEvent('net')} />
                <DemoButton label="（デモ）回数制限" onPress={() => fetchEvent('limit')} />
                <DemoButton label="（デモ）認証が切れた" onPress={() => fetchEvent('auth')} />
                {service === 'steam' ? <DemoButton label="（デモ）非公開になった" onPress={() => fetchEvent('private')} /> : null}
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                {service === 'steam' ? <TextButton label="Steamの公開設定を開く" onPress={() => open('https://steamcommunity.com/my/edit/settings')} /> : <View />}
                <TextButton danger label="連携を解除" onPress={unlink} />
              </Row>
            </>
          ) : null}
        </Stack>
      </Card>
    </Block>
  );
}

// 連携済みのときに出すもの：取得の状態と最終取得成功時刻（account-9）、取れた情報と出す範囲（account-4、account-5）
function Linked({ service, l }: { service: Service; l: Link }) {
  const st = useSettings();
  const { s } = useLayout();
  const { s: { me }, go } = useStore();

  const status = {
    auto: { tone: 'ok' as const, label: '自動で更新中', text: '更新ボタンを押さなくても、自動で新しい情報に変わります。' },
    retry: { tone: 'warn' as const, label: '再試行待ち', text: '取得できなかったので、間隔を空けて自動でやり直します。前に取れた情報を出しています。' },
    relink: { tone: 'danger' as const, label: '再連携が必要', text: '認証が切れて、自動で更新できません。もう一度連携してください。' },
    private: { tone: 'rest' as const, label: '非公開', text: 'Steamのプロフィールかゲームの詳細が非公開のため、取得できません。古い情報は出していません。' },
  }[l.fetch];

  const statusRow = (
    <Stack gap={4}>
      <Row gap={8}><Badge label={status.label} tone={status.tone} /><Note>最終取得 {l.lastOk ?? 'まだ取得できていません'}</Note></Row>
      <Note>{status.text}</Note>
      {l.fetch === 'relink' ? <View style={{ alignSelf: 'flex-start' }}><SubButton label="もう一度連携する" onPress={() => set((d) => { d[service].phase = 'authing'; })} /></View> : null}
    </Stack>
  );

  if (service === 'discord') {
    return (
      <Stack gap={10}>
        <Note>（デモ）アカウントのIDを確認した表示です。</Note>
        <Facts rows={[['Discord ID（見本）', '123456789012345678']]} />
        <Note>Discordから取った情報は、求められれば消します。</Note>
      </Stack>
    );
  }

  const hidden = l.fetch === 'private';
  const show = st.steamShow;
  const toggle = (k: SteamItem) => (v: boolean) => set((d) => { d.steamShow[k] = v; });
  const imported = st.steamImport;
  // プロフィールに入れたゲームは、自動更新で増えた時間を出す
  const rows = STEAM_LIBRARY.map((g) => {
    const mine = me.games.find((m) => m.tag === g.tag)?.steam;
    const hours = mine?.hours ?? g.hours;
    const recent = mine?.recent ?? g.recent;
    const result = imported?.added.includes(g.tag) ? { label: 'プロフィールに追加', tone: 'ok' as const }
      : imported?.updated.includes(g.tag) ? { label: '時間を反映', tone: 'ok' as const }
      : g.hours === 0 ? { label: '未プレイのため入れない', tone: 'rest' as const }
      : g.hours === null ? { label: '時間が取れない', tone: 'rest' as const }
      : null;
    return { ...g, hours, recent, result };
  });

  return (
    <Stack gap={10}>
      {statusRow}
      {imported && !hidden ? (
        <Card pad style={{ backgroundColor: C.okBg }}>
          <Stack gap={6}>
            <Row gap={6}><Ionicons name="checkmark-circle" size={s(16)} color={C.ok} /><Txt size={14} weight="bold" color={C.ok} style={{ flex: 1 }}>（デモ）Steamから取り込みました</Txt></Row>
            <Note color={C.ink}>持っているゲーム{STEAM_LIBRARY.length}本のうち、遊んだことのある{imported.added.length + imported.updated.length}本をプロフィールに反映しました（追加 {imported.added.length}・更新 {imported.updated.length}）。新しく足したゲームの熱量は、直近2週間のプレイ時間から推定しています。</Note>
            <View style={{ alignSelf: 'flex-start' }}><PillButton label="プロフィールで見る" onPress={() => go('profile')} /></View>
          </Stack>
        </Card>
      ) : null}
      <Facts rows={[
        ['アカウントの年数', hidden ? '非公開・取得不可' : `${STEAM_ACCOUNT.years}年`],
        ['Steamレベル', hidden ? '非公開・取得不可' : String(STEAM_ACCOUNT.level)],
        ['持っているゲーム', hidden ? '非公開・取得不可' : `${STEAM_LIBRARY.length}本`],
      ]} />
      <Stack gap={4}>
        <Txt size={13} weight="bold" color={C.muted}>取り込んだゲームとプレイ時間</Txt>
        {rows.map((g) => (
          <View key={g.tag} style={{ paddingVertical: s(6), borderBottomWidth: 1, borderColor: C.line }}>
            <Row gap={8}>
              <Art tag={g.tag} size={28} />
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Txt size={14} weight="bold" numberOfLines={1}>{g.name}</Txt>
                <Note>{hidden || g.hours === null ? '取得できていません'
                  : `合計 ${g.hours}時間${g.recent ? ` ・ 直近2週 ${g.recent}時間` : ''}`}</Note>
                {!hidden && g.result ? <View style={{ alignSelf: 'flex-start' }}><Badge label={g.result.label} tone={g.result.tone} /></View> : null}
              </Stack>
            </Row>
          </View>
        ))}
        <Note>0時間は「持っているが遊んでいない」、取得できていないものは「Steamが教えてくれない」です。</Note>
      </Stack>
      {/* Steamから入れたものを、どこまで出すかは本人が選べる（account-5）。自動更新でもこの選択は変わらない（server-63） */}
      <Stack gap={6}>
        <Txt size={13} weight="bold" color={C.muted}>プロフィールに出すもの</Txt>
        <Check label="アカウントの年数" value={show.age} onChange={toggle('age')} />
        <Check label="Steamレベル" value={show.level} onChange={toggle('level')} />
        <Check label="持っているゲームとプレイ時間" value={show.games} onChange={toggle('games')} />
        <Note>自動で更新されても、ここで選んだものは変わりません。</Note>
      </Stack>
      <Note>プレイ時間を出すには、Steamの公開設定で、プロフィールとゲームの詳細を「公開」にします。Steam上の誰からでも見えるようになります。</Note>
    </Stack>
  );
}

// 取り込みの手順を、1つずつ終わったように見せる（デモ）
function ImportSteps() {
  const { s } = useLayout();
  const [done, setDone] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setDone((n) => Math.min(n + 1, IMPORT_STEPS.length)), IMPORT_STEP_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <Stack gap={6}>
      <Note color={C.ink}>（デモ）認証できました。Steamから情報を取り込んでいます。</Note>
      {IMPORT_STEPS.map((label, i) => (
        <Row key={label} gap={8}>
          <View style={{ width: s(18), alignItems: 'center' }}>
            {i < done ? <Ionicons name="checkmark-circle" size={s(16)} color={C.ok} />
              : i === done ? <ActivityIndicator size="small" color={C.accent} />
              : <Ionicons name="ellipse-outline" size={s(14)} color={C.line} />}
          </View>
          <Txt size={13} color={i <= done ? C.ink : C.muted}>{label}</Txt>
        </Row>
      ))}
    </Stack>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  const { s } = useLayout();
  return (
    <Stack gap={0}>
      {rows.map(([k, v]) => (
        <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: s(4), borderBottomWidth: 1, borderColor: C.line }}>
          <Note>{k}</Note>
          <Txt size={14} weight="bold" color={v.includes('取得') ? C.muted : C.ink}>{v}</Txt>
        </Row>
      ))}
    </Stack>
  );
}
