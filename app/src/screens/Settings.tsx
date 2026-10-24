// 設定：アカウント（ログイン）と、Steam・Discordとの連携（account-1〜12、server-41・62〜64・75）
// デモの連携・表示設定はプロフィールと同じ状態を参照する
import { useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useStore } from '../store';
import { demoSettings, freshLink, type Service, type Link, type SteamItem, type Settings } from '../demo-settings-state';
import { C, useLayout } from '../theme';
import {
  AppBar, Badge, Block, Card, Check, Cols, DemoButton, Divider, MainButton, Note, PillButton, Row, Stack, SubButton,
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

/* ---------- 連携で取れるもの（見本） ---------- */

// 取得できないプレイ時間は、0時間と区別する（server-62）
const STEAM_GAMES: { name: string; hours: number | null }[] = [
  { name: 'Apex Legends', hours: 312 },
  { name: 'Among Us', hours: 0 },
  { name: 'Fall Guys', hours: null },
];
const SERVICE_NAME: Record<Service, string> = { steam: 'Steam', discord: 'Discord' };
const LOGIN_NAME = { discord: 'Discord', google: 'Google', steam: 'Steam', apple: 'Apple' } as const;
const LOGIN_ICON = { discord: 'logo-discord', google: 'logo-google', steam: 'logo-steam', apple: 'logo-apple' } as const;

/* ---------- 画面 ---------- */

export function SettingsScreen() {
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
    st.steam.linked && st.steam.fetch !== 'private' ? `Steam連携${st.steamShow.age ? '・5年' : ''}` : null,
    st.discord.linked ? 'Discord連携' : null,
  ].filter(Boolean);

  const left = (
    <>
      {inApp ? <BrowserCard onOpen={openInBrowser} /> : null}
      <AccountBlock inApp={inApp} onOpenBrowser={openInBrowser} />
      <Block title="あなたの信頼の目安">
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
      <LinkBlock service="steam" inApp={inApp} onOpenBrowser={openInBrowser} />
      <LinkBlock service="discord" inApp={inApp} onOpenBrowser={openInBrowser} />
      <Card pad>
        <Stack gap={6}>
          <Txt size={13} weight="bold">このアプリについて</Txt>
          <Note>Steamのデータを利用しています。</Note>
          <Note>利用規約とプライバシーポリシーは、公開前に用意します。出会い目的の利用と、連絡先の交換は禁止です。</Note>
          <TextButton label="IGDB.com（ゲームの名前と画像の出どころ）" onPress={() => open('https://www.igdb.com/')} />
        </Stack>
      </Card>
    </>
  );

  return (
    <Stack>
      <AppBar title="設定" onBack={() => go('profile')} />
      <Note color={C.warn}>設定の画面デモです。ログイン・連携・取得値はすべて見本で、外部サービスには接続しません。</Note>
      <Cols even left={left} right={right} />
    </Stack>
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
  const { toast, confirm, open } = useStore();
  const st = useSettings();
  const l = st[service];
  const name = SERVICE_NAME[service];
  const upd = (fn: (x: Link) => void) => set((d) => { fn(d[service]); });

  // 連携の状態の表
  const start = () => upd((x) => { x.phase = 'authing'; });
  const succeed = () => {
    upd((x) => { x.linked = true; x.phase = 'idle'; x.fetch = 'auto'; x.lastOk = now(); });
    toast(`（デモ）${name}と連携した表示にしました`);
  };
  const cancel = () => upd((x) => { x.phase = 'idle'; }); // 元の連携を維持
  const fail = () => upd((x) => { x.phase = 'failed'; }); // 元の連携を維持

  // 取得の失敗と再認証の表
  const fetchEvent = (e: 'ok' | 'net' | 'limit' | 'auth' | 'private') => upd((x) => {
    if (e === 'ok') { x.fetch = 'auto'; x.lastOk = now(); return; }
    if (e === 'net' || e === 'limit') { if (x.fetch === 'auto') x.fetch = 'retry'; return; }
    if (e === 'auth') { if (x.fetch !== 'relink') x.fetch = 'relink'; return; }
    if (x.fetch !== 'private') x.fetch = 'private';
  });

  // 連携を解除（account-10）。自動取得を止め、連携由来の表示と信頼の目安を外す（server-64）
  const unlink = async () => {
    if (!(await confirm(`${name}との連携を解除しますか？自動取得を止め、${name}から入れた表示と信頼の目安を外します。`))) return;
    upd((x) => { Object.assign(x, freshLink()); });
    toast(`${name}との連携を解除しました`);
  };

  const icon = service === 'steam' ? 'logo-steam' : 'logo-discord';
  const badge = l.phase === 'authing' ? <Badge label="認証中" tone="warn" />
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
              <Note>ログインとは別で、連携しなくても使えます。</Note>
              {inApp ? <Note color={C.warn}>アプリの中のブラウザでは連携に失敗しやすいので、先に「ブラウザで開く」を押してください。</Note> : null}
              <Row gap={8} wrap>
                {inApp ? <PillButton label="ブラウザで開く" onPress={onOpenBrowser} /> : null}
                <SubButton label={service === 'steam' ? 'Steamでログインして連携' : 'Discordと連携'} onPress={start} />
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
  const hours = (h: number | null) => (hidden || h === null ? '取得できていません' : `${h}時間`);

  return (
    <Stack gap={10}>
      {statusRow}
      <Facts rows={[
        ['アカウントの年数', hidden ? '非公開・取得不可' : '5年'],
        ['Steamレベル', hidden ? '非公開・取得不可' : '23'],
      ]} />
      <Stack gap={4}>
        <Txt size={13} weight="bold" color={C.muted}>持っているゲームとプレイ時間</Txt>
        {STEAM_GAMES.map((g) => (
          <Row key={g.name} style={{ justifyContent: 'space-between', paddingVertical: s(2) }}>
            <Txt size={14}>{g.name}</Txt>
            <Txt size={14} weight="bold" color={hidden || g.hours === null ? C.muted : C.ink}>{hours(g.hours)}</Txt>
          </Row>
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
