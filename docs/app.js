// Shumitomo のフロント。画面は #/profile・#/recruit・#/connections の3つ。
// 仕様は spec/frontend-approved.md（承認済みの条件）にそろえる。

const STORAGE_KEY = 'shumitomo.profile';

const PLATFORMS = ['PC（Steam）', 'Switch', 'Switch 2', 'PlayStation', 'Xbox', 'スマホ'];
const HEAT_LABELS = ['ゆるい', 'ややゆるい', 'ふつう', 'やや本気', 'ガチ'];

// 見本のプロフィール。サーバーができたら置き換える
const SAMPLE_PROFILE = {
  nickname: 'ゆう',
  appId: 'yu',
  games: [
    { name: 'スプラトゥーン3', platform: 'Switch', heat: 4, skill: 6 },
    { name: 'Apex Legends', platform: 'PC（Steam）', heat: 2, skill: 4 },
  ],
  hobbies: [
    { name: 'ボードゲーム', heat: 3 },
  ],
  favorites: [
    { name: 'VTuber', locked: false },
    { name: 'ジブリ', locked: true },
  ],
  playTime: '平日の夜',
  region: '関東',
};

const state = {
  saved: loadProfile(),
  draft: null,      // 編集中だけ入る
  saving: false,
  saveError: false,
};

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 読めなければ見本を使う */ }
  return structuredClone(SAMPLE_PROFILE);
}

function storeProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2400);
}

// 空（ui-2）：見出しと、次に何をすればよいかの説明。ボタンは任意
function emptyBlock(title, text, button) {
  return `
    <div class="empty">
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      ${button ? `<a class="btn primary" href="${button.href}">${esc(button.label)}</a>` : ''}
    </div>`;
}

function heatSlider(value, name) {
  return `
    <div class="heat">
      <input type="range" min="0" max="${HEAT_LABELS.length - 1}" step="1" value="${value}"
             name="${name}" aria-label="熱量" aria-valuetext="${HEAT_LABELS[value]}">
      <div class="scale"><span>ゆるい</span><span>ガチ</span></div>
    </div>`;
}

/* ---------- プロフィール ---------- */

function renderProfile() {
  return state.draft ? renderProfileEdit(state.draft) : renderProfileView(state.saved);
}

function renderProfileView(p) {
  const games = p.games.length
    ? `<ul class="list">${p.games.map((g) => `
        <li>
          <a class="game-title" href="#/recruit?game=${encodeURIComponent(g.name)}">${esc(g.name)}</a>
          <div class="game-meta">${esc(g.platform)} ・ 熱量：${HEAT_LABELS[g.heat]} ・ 実力：${g.skill} / 9</div>
        </li>`).join('')}</ul>`
    : emptyBlock('ゲームがまだ入っていません', '「編集」からゲームを追加すると、合う相手が見つかりやすくなります。');

  const hobbies = p.hobbies.length
    ? `<ul class="list">${p.hobbies.map((h) => `
        <li><div class="game-title">${esc(h.name)}</div>
            <div class="game-meta">熱量：${HEAT_LABELS[h.heat]}</div></li>`).join('')}</ul>`
    : emptyBlock('趣味がまだ入っていません', '「編集」から趣味を追加できます。');

  const favorites = p.favorites.length
    ? `<div class="chips">${p.favorites.map((f) => `
        <span class="chip">${esc(f.name)}${f.locked ? '<span class="lock" aria-label="鍵つき">🔒</span>' : ''}</span>`).join('')}</div>`
    : emptyBlock('好きなものがまだ入っていません', '「編集」から好きなものを追加できます。');

  return `
    <section class="card profile-head">
      <h1>${esc(p.nickname)}</h1>
      <div class="appid">@${esc(p.appId)}</div>
      <div class="share">
        <button class="btn small" data-action="copy-link">リンクをコピー</button>
        <button class="btn small primary" data-action="edit">編集</button>
      </div>
    </section>

    <section class="card">
      <h2>ゲーム <span class="count">${p.games.length}</span></h2>
      ${games}
    </section>

    <section class="card">
      <h2>趣味</h2>
      ${hobbies}
    </section>

    <section class="card">
      <h2>好きなもの</h2>
      ${favorites}
    </section>

    <section class="card">
      <dl class="kv">
        <dt>いつも遊ぶ時間帯</dt><dd>${esc(p.playTime || '未設定')}</dd>
        <dt>住んでいる地方</dt><dd>${esc(p.region || '未設定')}</dd>
      </dl>
    </section>`;
}

function renderProfileEdit(p) {
  const platformOptions = (selected) => PLATFORMS.map((pf) =>
    `<option${pf === selected ? ' selected' : ''}>${esc(pf)}</option>`).join('');

  return `
    <form id="profile-form" novalidate>
      <section class="card">
        <label class="field"><span>ニックネーム</span>
          <input type="text" name="nickname" value="${esc(p.nickname)}" maxlength="20" required>
        </label>
        <label class="field"><span>アプリID（プロフィールの短いURLになります）</span>
          <input type="text" name="appId" value="${esc(p.appId)}" maxlength="20"
                 pattern="[A-Za-z0-9_]+" autocapitalize="off" spellcheck="false">
        </label>
      </section>

      <section class="card">
        <h2>ゲーム</h2>
        <ul class="list">${p.games.map((g, i) => `
          <li>
            <div class="row">
              <input type="text" name="game-name-${i}" value="${esc(g.name)}" aria-label="ゲーム名">
              <button type="button" class="btn small danger" data-action="remove" data-kind="games" data-index="${i}">削除</button>
            </div>
            <label class="field"><span>機種</span>
              <select name="game-platform-${i}">${platformOptions(g.platform)}</select>
            </label>
            <label class="field"><span>実力（1〜9）</span>
              <select name="game-skill-${i}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
                `<option${n === g.skill ? ' selected' : ''}>${n}</option>`).join('')}</select>
            </label>
            <span class="game-meta">熱量</span>
            ${heatSlider(g.heat, `game-heat-${i}`)}
          </li>`).join('')}
        </ul>
        <button type="button" class="btn small" data-action="add" data-kind="games">＋ ゲームを追加</button>
      </section>

      <section class="card">
        <h2>趣味</h2>
        <ul class="list">${p.hobbies.map((h, i) => `
          <li>
            <div class="row">
              <input type="text" name="hobby-name-${i}" value="${esc(h.name)}" aria-label="趣味">
              <button type="button" class="btn small danger" data-action="remove" data-kind="hobbies" data-index="${i}">削除</button>
            </div>
            ${heatSlider(h.heat, `hobby-heat-${i}`)}
          </li>`).join('')}
        </ul>
        <button type="button" class="btn small" data-action="add" data-kind="hobbies">＋ 趣味を追加</button>
      </section>

      <section class="card">
        <h2>好きなもの</h2>
        <ul class="list">${p.favorites.map((f, i) => `
          <li class="row">
            <input type="text" name="fav-name-${i}" value="${esc(f.name)}" aria-label="好きなもの">
            <label class="row"><input type="checkbox" name="fav-locked-${i}"${f.locked ? ' checked' : ''}> 🔒</label>
            <button type="button" class="btn small danger" data-action="remove" data-kind="favorites" data-index="${i}">削除</button>
          </li>`).join('')}
        </ul>
        <button type="button" class="btn small" data-action="add" data-kind="favorites">＋ 好きなものを追加</button>
      </section>

      <section class="card">
        <label class="field"><span>いつも遊ぶ時間帯</span>
          <select name="playTime">${['', '平日の昼', '平日の夜', '休日の昼', '休日の夜', '深夜'].map((t) =>
            `<option value="${t}"${t === p.playTime ? ' selected' : ''}>${t || '未設定'}</option>`).join('')}</select>
        </label>
        <label class="field"><span>住んでいる地方</span>
          <select name="region">${['', '北海道', '東北', '関東', '中部', '近畿', '中国', '四国', '九州・沖縄', '海外'].map((r) =>
            `<option value="${r}"${r === p.region ? ' selected' : ''}>${r || '未設定'}</option>`).join('')}</select>
        </label>
      </section>

      ${state.saveError ? '<p class="error">プロフィールを保存できませんでした</p>' : ''}
      <div class="actions">
        <button type="button" class="btn" data-action="cancel">キャンセル</button>
        <button type="submit" class="btn primary"${state.saving ? ' disabled' : ''}>${state.saving ? '保存中…' : '保存'}</button>
      </div>
    </form>`;
}

// 編集の欄の値を draft に写す（追加・削除の前と保存の前に呼ぶ）
function readForm() {
  const form = document.getElementById('profile-form');
  if (!form) return;
  const v = (name) => form.elements[name]?.value ?? '';
  const d = state.draft;
  d.nickname = v('nickname').trim();
  d.appId = v('appId').trim();
  d.games = d.games.map((g, i) => ({
    name: v(`game-name-${i}`).trim(),
    platform: v(`game-platform-${i}`),
    skill: Number(v(`game-skill-${i}`)),
    heat: Number(v(`game-heat-${i}`)),
  }));
  d.hobbies = d.hobbies.map((h, i) => ({
    name: v(`hobby-name-${i}`).trim(),
    heat: Number(v(`hobby-heat-${i}`)),
  }));
  d.favorites = d.favorites.map((f, i) => ({
    name: v(`fav-name-${i}`).trim(),
    locked: form.elements[`fav-locked-${i}`]?.checked ?? false,
  }));
  d.playTime = v('playTime');
  d.region = v('region');
}

const BLANK = {
  games: () => ({ name: '', platform: PLATFORMS[0], heat: 2, skill: 5 }),
  hobbies: () => ({ name: '', heat: 2 }),
  favorites: () => ({ name: '', locked: false }),
};

async function saveProfile() {
  readForm();
  const d = state.draft;
  d.games = d.games.filter((g) => g.name);
  d.hobbies = d.hobbies.filter((h) => h.name);
  d.favorites = d.favorites.filter((f) => f.name);
  if (!d.nickname) {
    toast('ニックネームを入れてください');
    return;
  }
  state.saving = true;
  state.saveError = false;
  render();
  try {
    storeProfile(d);
    state.saved = structuredClone(d);
    state.draft = null;
    toast('保存しました');
  } catch (e) {
    state.saveError = true;
  } finally {
    state.saving = false;
    render();
  }
}

/* ---------- 募集・つながり（中身はこれから） ---------- */

function renderRecruit(params) {
  const game = params.get('game');
  return `
    <section class="card">
      <h2>募集を出す</h2>
      ${game ? `<p>ゲーム：<strong>${esc(game)}</strong></p>` : ''}
      ${emptyBlock('この画面は準備中です', 'ゲームと条件を選んで、SNSに貼れる募集を作れるようになります。')}
    </section>`;
}

function renderConnections() {
  return `
    <section class="card">
      <h2>つながり</h2>
      ${emptyBlock('つながりはまだありません', '一緒に遊んだ人や、プロフィールから申請した人がここに並びます。',
        { href: '#/profile', label: 'プロフィールを見る' })}
    </section>`;
}

/* ---------- 画面の切り替え ---------- */

const ROUTES = {
  profile: renderProfile,
  recruit: renderRecruit,
  connections: renderConnections,
};

function currentRoute() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const name = ROUTES[path] ? path : 'profile';
  return { name, params: new URLSearchParams(query) };
}

function render() {
  const { name, params } = currentRoute();
  document.getElementById('view').innerHTML = ROUTES[name](params);
  document.querySelectorAll('.tab').forEach((tab) => {
    if (tab.dataset.tab === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, kind, index } = el.dataset;

  if (action === 'edit') {
    state.draft = structuredClone(state.saved);
    state.saveError = false;
    render();
  } else if (action === 'cancel') {
    // 編集での追加・変更・削除を取り消して、保存済みの表示に戻す（profile-22）
    state.draft = null;
    state.saveError = false;
    render();
  } else if (action === 'add') {
    readForm();
    state.draft[kind].push(BLANK[kind]());
    render();
  } else if (action === 'remove') {
    readForm();
    state.draft[kind].splice(Number(index), 1);
    render();
  } else if (action === 'copy-link') {
    const url = `${location.origin}${location.pathname}#/profile`;
    try {
      await navigator.clipboard.writeText(url);
      toast('リンクをコピーしました');
    } catch (err) {
      toast(url);
    }
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'profile-form') return;
  e.preventDefault();
  saveProfile();
});

document.addEventListener('input', (e) => {
  if (e.target.type === 'range') {
    e.target.setAttribute('aria-valuetext', HEAT_LABELS[e.target.value]);
  }
});

window.addEventListener('hashchange', render);
render();
