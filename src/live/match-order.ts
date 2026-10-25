// 募集一覧の合う順と、VC が合うか（仕様の server-52・list-3・list-8、ADR-91）。
// 使うのは、自分で選んだ実力と VC と、募集に書かれた実力と VC だけ。相手から見えないデータは使わない。

type Orderable = { skill: number | null; created_at: string };

const newestFirst = (a: Orderable, b: Orderable) => b.created_at.localeCompare(a.created_at);

// 自分の実力との差が小さい順。差が同じなら新しい順。実力が書かれていない募集は後ろ。自分の実力が無ければ新しい順
export function orderByCloseSkill<T extends Orderable>(items: readonly T[], mySkill: number | null): T[] {
  if (mySkill == null) return [...items].sort(newestFirst);
  const distance = (r: Orderable) => (r.skill == null ? Number.POSITIVE_INFINITY : Math.abs(r.skill - mySkill));
  return [...items].sort((a, b) => {
    const da = distance(a);
    const db = distance(b);
    return da === db ? newestFirst(a, b) : da - db;
  });
}

// 自分が VC を選び、募集も VC を指定しているときだけ、合うかを返す
export function vcMatch(recruitmentVc: string | null, myVc: string | null): 'match' | 'mismatch' | null {
  if (!myVc || !recruitmentVc) return null;
  return recruitmentVc === myVc ? 'match' : 'mismatch';
}

// 全角と半角、大文字と小文字、空白の違いは同じ名前として見る
const nameKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

// プロフィールで、同じ名前のゲームに入れた実力。プロフィールのゲームは名札（apex など）なので、名前で突き合わせる。
// IGDB の名前は英語が多いので、別名（スプラトゥーン3 など）でも突き合わせる
export function profileSkillFor(
  game: { name: string; alternative_names?: readonly string[] } | null | undefined,
  myGames: readonly { tag: string; skill: number }[],
  names: Readonly<Record<string, { name: string }>>,
): number | null {
  if (!game) return null;
  const keys = new Set([game.name, ...(game.alternative_names ?? [])].map(nameKey));
  const hit = myGames.find(g => keys.has(nameKey(names[g.tag]?.name ?? g.tag)));
  return hit ? hit.skill : null;
}
