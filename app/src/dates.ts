// 募集の日付の扱い。日付は YYYY-MM-DD、決めていないときは「未定」
export const UNDECIDED = '未定';

const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return toISO(d);
};
export const isISODate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
// 10/25(土) のように出す。今日と明日はそう書く
export function formatDate(v: string) {
  if (!isISODate(v)) return v;
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const label = `${m}/${d}(${WEEK[date.getDay()]})`;
  if (v === todayISO()) return `今日 ${label}`;
  if (v === todayISO(1)) return `明日 ${label}`;
  return label;
}

// 募集の日時の書き方。決めていなければ「日時は相談」
export function formatWhen(date: string, time: string) {
  if (!date || date === UNDECIDED) return '日時は相談';
  return `${formatDate(date)} ${time}〜`;
}
