// フレンド：届いた申請、相手の知らせ、フレンド
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GAMES, PEOPLE } from '../data';
import { useStore } from '../store';
import { C, useLayout } from '../theme';
import {
  AppBar, Art, Avatar, Block, Card, Chip, Cols, Divider, Empty, HeatTag, Note, PillButton, Reasons, Row, Stack,
  TextButton, Trust, Txt,
} from '../ui';

export function ConnectionsScreen() {
  const { s: st, update, go, toast, confirm } = useStore();
  const { s } = useLayout();
  const c = st.conn;
  const me = st.me;

  const incoming = (
    <Block title="届いた申請" count={c.incoming.length}>
      <Card>
        {c.incoming.length ? c.incoming.map((q, i) => {
          const p = PEOPLE[q.from];
          return (
            <View key={q.from}>
              {i > 0 ? <Divider /> : null}
              <Stack gap={8} style={{ padding: s(12) }}>
                {/* IDやリンクから来た申請には、ニックネームとプロフィールも出る（connections-3） */}
                <Row gap={10}><Avatar p={p} small /><TextButton label={p.nickname} onPress={() => go('person', { id: q.from })} /><Note>{q.via}</Note></Row>
                <Reasons items={q.reasons} />
                {/* 断るボタンは無い（connections-4） */}
                <Row style={{ justifyContent: 'space-between' }}>
                  <Trust value={p.trust} />
                  <PillButton ok label="フレンドになる" onPress={() => {
                    update((d) => {
                      d.conn.incoming = d.conn.incoming.filter((x) => x.from !== q.from);
                      if (!d.conn.friends.includes(q.from)) d.conn.friends.push(q.from);
                    });
                    toast(`${p.nickname}さんとフレンドになりました`);
                  }} />
                </Row>
              </Stack>
            </View>
          );
        }) : <Empty title="届いた申請はありません" text="一緒に遊んだ人や、プロフィールを見た人から届きます。" />}
      </Card>
    </Block>
  );

  const notices = (
    <Block title="知らせ">
      <Card>
        {c.notices.length ? c.notices.map((n, i) => {
          const p = PEOPLE[n.from];
          const recruit = n.kind === 'recruit';
          return (
            <View key={i}>
              {i > 0 ? <Divider /> : null}
              <Row gap={10} style={{ padding: s(12) }}>
                <Art tag={n.game} size={40} />
                <Stack gap={2} style={{ flex: 1 }}>
                  <Txt size={14} weight="bold">{recruit ? `${p.nickname}が募集を出しました` : `${p.nickname}の${GAMES[n.game].name}`}</Txt>
                  <Note>{recruit ? `${GAMES[n.game].name} ・ ${n.text}` : n.text}</Note>
                  {recruit ? (
                    // 参加する人の画面（募集一覧 → 成立）への入口
                    <TextButton label="募集一覧を見る" onPress={() => { update((d) => { d.role = 'par'; }); go('list'); }} />
                  ) : null}
                </Stack>
                {/* 相手の募集の知らせから参加希望を送れる（app-19）、熱量の知らせからそのゲームで誘える（app-21） */}
                <PillButton
                  label={n.done ? (recruit ? '参加リクエスト済み' : '誘いました') : (recruit ? '参加希望を送る' : 'このゲームで誘う')}
                  disabled={n.done}
                  onPress={() => { update((d) => { d.conn.notices[i].done = true; }); toast(recruit ? '参加希望を送りました' : '誘いました'); }} />
              </Row>
            </View>
          );
        }) : <Empty title="知らせはまだありません" text="フレンドが募集を出すと、ここに届きます。" />}
      </Card>
    </Block>
  );

  const friends = (
    <Block title="フレンド" count={c.friends.length}>
      {c.friends.length ? c.friends.map((id) => {
        const p = PEOPLE[id];
        const common = p.games.filter((g) => me.games.some((m) => m.tag === g.tag));
        return (
          <Card pad key={id}>
            <Stack gap={8}>
              <Row gap={10}>
                <Avatar p={p} small />
                <TextButton label={p.nickname} onPress={() => go('person', { id })} />
                <View style={{ flex: 1 }} />
                <Ionicons name="time-outline" size={s(14)} color={C.muted} />
                <Note>{p.times.start}〜{p.times.end}</Note>
              </Row>
              {/* 自分にもあるものに印が付く（connections-5） */}
              <Row gap={6} wrap>
                {p.games.map((g) => (
                  <Chip key={g.tag} label={GAMES[g.tag].name} common={me.games.some((m) => m.tag === g.tag)}><HeatTag value={g.heat} /></Chip>
                ))}
                {p.hobbies.filter((h) => me.hobbies.some((m) => m.name === h.name)).map((h) => <Chip key={h.name} common label={h.name} />)}
                {p.likes.filter((l) => !l.locked && me.likes.some((m) => m.name === l.name)).map((l) => <Chip key={l.name} common label={l.name} />)}
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                {/* フレンドは、いつでも外せる（connections-7） */}
                <TextButton danger label="フレンドを外す" onPress={async () => {
                  if (!(await confirm(`${p.nickname}さんをフレンドから外しますか？`))) return;
                  update((d) => { d.conn.friends = d.conn.friends.filter((x) => x !== id); });
                }} />
                {/* 両方が持っているゲームで誘う（connections-8） */}
                {common.length ? <PillButton label={`${GAMES[common[0].tag].name}で誘う`}
                  onPress={() => toast(`${p.nickname}さんを${GAMES[common[0].tag].name}に誘いました`)} /> : null}
              </Row>
            </Stack>
          </Card>
        );
      }) : <Card><Empty title="フレンドはまだいません" text="一緒に遊んだあと「残す」を選ぶと、ここに並びます。" /></Card>}
    </Block>
  );

  return (
    <Stack>
      <AppBar title="フレンド" />
      <Cols even left={<>{incoming}{notices}</>} right={friends} />
    </Stack>
  );
}
