// ===== oshiwatch 共通ライブラリ =====
// HTTP Shortcuts（QuickJS）上で動く。配布ファイルを作るときに各ショートカットの先頭へ埋め込まれる。
// アプリの「グローバルコード」は使わない（購入者が他の用途で使っていた場合に上書きしてしまうため）。

const OW = {
  VERSION: 1,
  CONFIG_URL: 'https://raw.githubusercontent.com/hollowmark-dev/oshiwatch/main/config/config.json',
  // 接続してよいホストはコードに固定する。設定ファイルが乗っ取られても、よそを叩かせない。
  ALLOWED_HOSTS: ['shop.sanrio.co.jp', 'munyugurumi.jp', 'raw.githubusercontent.com'],
  // 礼儀の上限もコード側に持つ。設定ファイルで緩めることはできない。
  MIN_INTERVAL_MS: 1000,
  MAX_REQUESTS_PER_RUN: 30,
  MAX_CHARACTERS: 8,
  MAX_RECENT: 60,
  SEEN_RETENTION_DAYS: 90,
  FAIL_NOTIFY_DAYS: 3,
  RETRY_COOLDOWN_MIN: 60,
};
OW.UA = 'OshiWatch/' + OW.VERSION + ' (HTTP Shortcuts; +https://github.com/hollowmark-dev/oshiwatch)';

// ---------- 日付（端末のタイムゾーン設定に依存しないよう、日本時間を明示的に計算する） ----------

function owJst(ms) {
  return new Date((ms == null ? Date.now() : ms) + 9 * 3600 * 1000);
}
function owYmd(ms) {
  const d = owJst(ms);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
function owHm(ms) {
  const d = owJst(ms);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
function owWeekday(ms) {
  return owJst(ms).getUTCDay(); // 0=日 1=月
}
function owDaysBetween(ymdA, ymdB) {
  return Math.round((Date.parse(ymdB + 'T00:00:00Z') - Date.parse(ymdA + 'T00:00:00Z')) / 86400000);
}
// 「10/6」のように年が無い日付に年を補う。今月より前の月なら来年とみなす（年またぎの予約表記）。
function owInferYear(month) {
  const d = owJst();
  return month < d.getUTCMonth() + 1 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}
function owYmdOf(y, m, d) {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
// 画面・通知に出す短い日付（2026-10-06 → 10/6）
function owMd(ymd) {
  const p = String(ymd).split('-');
  return parseInt(p[1], 10) + '/' + parseInt(p[2], 10);
}

// ---------- 変数（HTTP Shortcuts のグローバル変数。1つ3万文字まで） ----------

function owLoad(key, fallback) {
  try {
    const raw = getVariable(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function owSave(key, value) {
  const raw = JSON.stringify(value);
  if (raw.length > 29000) {
    // 3万文字を超えると保存時に切り詰められ、次回JSONとして読めなくなる。超える前に止める。
    throw new Error('保存データが大きすぎます（' + key + ': ' + raw.length + '文字）');
  }
  setVariable(key, raw);
}
function owLoadState() {
  const s = owLoad('ow_state', null) || {};
  s.v = 1;
  s.targets = s.targets || {};
  s.robots = s.robots || {};
  s.notices = s.notices || {};
  return s;
}
function owLoadRecent() {
  return owLoad('ow_recent', []) || [];
}
function owLoadSelected() {
  return owLoad('ow_selected', []) || [];
}

// ---------- 通信 ----------

function owHostOf(url) {
  const m = String(url).match(/^https:\/\/([^/?#]+)/);
  return m ? m[1].toLowerCase() : null;
}

function owCreateSession() {
  return { requests: 0, lastAt: 0 };
}

// 1リクエスト取得する。戻り値: {ok, status, body, error}
function owGet(session, url) {
  const host = owHostOf(url);
  if (!host || OW.ALLOWED_HOSTS.indexOf(host) < 0) {
    return { ok: false, error: '許可されていない接続先: ' + url };
  }
  if (session.requests >= OW.MAX_REQUESTS_PER_RUN) {
    return { ok: false, error: '1回あたりのリクエスト上限に達しました' };
  }
  const gap = Date.now() - session.lastAt;
  if (session.lastAt && gap < session.intervalMs) wait(session.intervalMs - gap);
  session.requests++;
  session.lastAt = Date.now();

  const r = sendHttpRequest(url, {
    method: 'GET',
    headers: { 'User-Agent': OW.UA, 'Accept-Language': 'ja,en;q=0.8' },
  });
  if (r.status === 'networkError') return { ok: false, error: '通信エラー: ' + r.networkError };
  const code = r.response.statusCode;
  const body = r.response.body || '';
  if (code !== 200) return { ok: false, status: code, error: 'HTTP ' + code, body };
  return { ok: true, status: code, body };
}

// ---------- robots.txt（RFC 9309 の最小実装。* と $ のワイルドカードに対応） ----------

function owParseRobots(text) {
  // User-agent グループのうち、oshiwatch を名指しするものがあればそれを、無ければ * を使う
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  String(text).split(/\r?\n/).forEach((line) => {
    const l = line.replace(/#.*/, '').trim();
    const m = l.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) return;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === 'user-agent') {
      if (!lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (field === 'allow' || field === 'disallow')) cur.rules.push({ allow: field === 'allow', path: value });
    }
  });
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && 'oshiwatch'.indexOf(a) === 0));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.indexOf('*') >= 0);
  return chosen.reduce((acc, g) => acc.concat(g.rules), []);
}

function owRobotsAllows(rules, pathAndQuery) {
  let best = null;
  rules.forEach((r) => {
    if (!r.path) return; // 空の Disallow は「全部許可」
    // 規則はパスの前方一致。* は任意の文字列、末尾の $ は「ここで終わる」。それ以外の記号は文字どおりに扱う。
    const endAnchored = /\$$/.test(r.path);
    const body = (endAnchored ? r.path.slice(0, -1) : r.path).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp('^' + body + (endAnchored ? '$' : ''));
    if (re.test(pathAndQuery) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) {
      best = r;
    }
  });
  return !best || best.allow;
}

// サイトの robots.txt を週1回だけ取り直し、使うURLが禁止されていないか確かめる
function owCheckRobots(session, state, siteKey, sampleUrl) {
  const host = owHostOf(sampleUrl);
  const today = owYmd();
  const cached = state.robots[siteKey];
  let rules;
  if (cached && owDaysBetween(cached.checked, today) < 7) {
    rules = cached.rules;
  } else {
    const r = owGet(session, 'https://' + host + '/robots.txt');
    if (r.ok) rules = owParseRobots(r.body);
    else if (r.status && r.status >= 400 && r.status < 500) rules = []; // 4xx は「制限なし」（RFC 9309）
    else return { ok: false, error: 'robots.txt を確認できません: ' + r.error };
    state.robots[siteKey] = { checked: today, rules };
  }
  const path = sampleUrl.replace(/^https:\/\/[^/]+/, '');
  return owRobotsAllows(rules, path) ? { ok: true } : { ok: false, blocked: true, error: 'robots.txt で禁止されたURLです: ' + path };
}

// ---------- HTML の読み取り（parseHTML の結果の木をたどる） ----------

function owFind(node, pred) {
  if (!node) return null;
  if (pred(node)) return node;
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) {
    const hit = owFind(kids[i], pred);
    if (hit) return hit;
  }
  return null;
}
function owText(node) {
  if (!node) return '';
  let t = node.text || '';
  (node.children || []).forEach((c) => {
    t += owText(c);
  });
  return t.replace(/\s+/g, ' ').trim();
}
function owHasClass(node, cls) {
  const c = (node.attributes && node.attributes['class']) || '';
  return (' ' + c + ' ').indexOf(' ' + cls + ' ') >= 0;
}
function owPrice(text) {
  const m = String(text || '').replace(/,/g, '').match(/(\d+)\s*円/);
  return m ? parseInt(m[1], 10) : null;
}

// 予約の締切（「【予約販売~10/6(火)まで】」）
function owDeadlineFromName(name) {
  const m = String(name).match(/予約販売\s*[~〜～]\s*(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const mo = parseInt(m[1], 10);
  return owYmdOf(owInferYear(mo), mo, parseInt(m[2], 10));
}
// 発送・発売の予定（「2026年12月5日」「12月上旬/中旬/下旬/末」）。あいまいな表記は1日/11日/21日に丸める。
function owShipFromText(text) {
  const s = String(text);
  let m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) return owYmdOf(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  m = s.match(/(\d{1,2})月(上旬|中旬|下旬|末)/);
  if (m) {
    const mo = parseInt(m[1], 10);
    return owYmdOf(owInferYear(mo), mo, { 上旬: 1, 中旬: 11, 下旬: 21, 末: 21 }[m[2]]);
  }
  return null;
}

// ---------- サイトごとの一覧の読み取り ----------
// 戻り値: {ok, items:[{id,name,price,url,isPreorder,deadline,ship}], total, error}
// 原則: カードに切り出してから、カードの中で項目を探す。タグの並び・隣接に依存しない。
// 件数表示と抽出数が合わなければ「読み取り失敗」として扱う（黙って正常扱いしない）。

const OW_SITES = {
  sanrio_shop: {
    label: 'サンリオ公式',
    parse(html, site) {
      const totalM = html.match(/search-result"><span>([\d,]+)件/);
      const zero = html.indexOf('該当する商品') >= 0;
      if (!totalM && !zero) return { ok: false, error: '件数表示が見つかりません（ページの形が変わった可能性）' };
      const total = totalM ? parseInt(totalM[1].replace(/,/g, ''), 10) : 0;

      const items = [];
      parseHTML(html, site.card_selector || 'li.c-goods-item').forEach((card) => {
        const a = card.attributes || {};
        let code = null;
        try {
          code = a['data-goods_params'] ? JSON.parse(a['data-goods_params']).common_goods_code : null;
        } catch (e) {
          code = null;
        }
        if (!code) return; // おすすめ枠など、商品一覧以外のカード
        const link = owFind(card, (n) => n.name === 'a' && /^\/item\/detail\//.test((n.attributes || {}).href || ''));
        const priceEl = owFind(card, (n) => owHasClass(n, 'price'));
        const name = (a['data-ga_ec_goods_name'] || '').replace(/^サンリオキャラクターズ\s+/, '');
        items.push({
          id: code,
          name: name || code,
          price: owPrice(owText(priceEl)),
          url: link ? 'https://shop.sanrio.co.jp' + link.attributes.href : null,
        });
      });
      return { ok: true, items, total };
    },
    // 一覧に発売日が無いので、新商品のときだけ詳細ページを1回見る
    enrich(session, item, site) {
      if (!item.url) return;
      const r = owGet(session, item.url);
      if (!r.ok) return;
      const keywords = site.preorder_keywords || ['発売予定日', '先行予約', '予約受付', '発売日'];
      for (let i = 0; i < keywords.length; i++) {
        const idx = r.body.indexOf(keywords[i]);
        if (idx < 0) continue;
        const ship = owShipFromText(r.body.slice(idx, idx + 200));
        if (ship) {
          item.isPreorder = true;
          item.ship = ship;
          return;
        }
      }
    },
  },

  munyugurumi: {
    label: 'むにゅぐるみパティオ',
    parse(html, site) {
      const totalM = html.match(/class="count">全([\d,]+)件（(?:\d+〜)?(\d+)件表示）/) || html.match(/class="count">全([\d,]+)件/);
      if (!totalM) return { ok: false, error: '件数表示が見つかりません（ページの形が変わった可能性）' };
      const total = parseInt(totalM[1].replace(/,/g, ''), 10);
      // 「全35件（1〜35件表示）」なら、このページで最後。読み取りに失敗しても次のページを取りに行かない。
      const shownEnd = totalM[2] ? parseInt(totalM[2], 10) : null;
      const lastPage = shownEnd != null && shownEnd >= total;

      const items = [];
      parseHTML(html, site.card_selector || 'div.mod-goods').forEach((card) => {
        const link = owFind(card, (n) => n.name === 'a' && /ItemID=\d+/.test((n.attributes || {}).href || ''));
        const nameEl = owFind(card, (n) => n.name === 'p' && owHasClass(n, 'name'));
        if (!link || !nameEl) return;
        const name = owText(nameEl);
        const isPreorder = name.indexOf('予約') >= 0;
        items.push({
          id: link.attributes.href.match(/ItemID=(\d+)/)[1],
          name,
          price: owPrice(owText(owFind(card, (n) => n.name === 'p' && owHasClass(n, 'price')))),
          url: 'https://munyugurumi.jp' + link.attributes.href.replace(/&amp;/g, '&'),
          isPreorder,
          deadline: isPreorder ? owDeadlineFromName(name) : null,
          ship: isPreorder ? owShipFromText(name) : null,
        });
      });
      return { ok: true, items, total, lastPage };
    },
    enrich() {
      // 予約情報は商品名から読み取り済み
    },
  },
};

// あるキャラ×サイトの一覧を、全ページ取得して読み取る
function owFetchListing(session, siteKey, site, sourceId) {
  const impl = OW_SITES[siteKey];
  if (!impl) return { ok: false, error: '未対応のサイト: ' + siteKey };
  const maxPages = Math.min(site.max_pages || 3, 5);
  const all = {};
  let total = null;
  for (let page = 1; page <= maxPages; page++) {
    const url = site.list_url.replace('{id}', encodeURIComponent(sourceId)).replace('{page}', String(page));
    const r = owGet(session, url);
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    let parsed;
    try {
      parsed = impl.parse(r.body, site);
    } catch (e) {
      return { ok: false, error: '読み取りエラー: ' + e };
    }
    if (!parsed.ok) return parsed;
    if (total == null) total = parsed.total;
    const before = Object.keys(all).length;
    parsed.items.forEach((it) => {
      if (!all[it.id]) all[it.id] = it;
    });
    const count = Object.keys(all).length;
    if (parsed.lastPage || count >= total || parsed.items.length === 0 || count === before) break;
  }
  const items = Object.keys(all).map((k) => all[k]);
  if (items.length < total) {
    // 一部の商品カードだけ形が違って読めていない合図。新商品だけ取りこぼす不具合（2026-09-27）の再発防止。
    return { ok: false, error: '件数表示 ' + total + ' 件のうち ' + items.length + ' 件しか読み取れません（読み取りルールの更新が必要）' };
  }
  return { ok: true, items, total };
}

// ---------- 設定ファイル ----------

function owLoadConfig(session) {
  const r = owGet(session, OW.CONFIG_URL);
  if (r.ok) {
    try {
      const cfg = JSON.parse(r.body);
      if (cfg.schema_version === 1 && cfg.sites) {
        const slim = { status: cfg.status, message: cfg.message, min_version: cfg.min_version, latest_version: cfg.latest_version, update_url: cfg.update_url, limits: cfg.limits, sites: cfg.sites };
        try {
          owSave('ow_config', slim);
        } catch (e) {
          // キャッシュできなくても今回は使える
        }
        return { ok: true, config: cfg };
      }
    } catch (e) {
      // 壊れた設定は使わず、前回の設定に戻る
    }
  }
  const cached = owLoad('ow_config', null);
  if (cached && cached.sites) return { ok: true, config: cached, fromCache: true };
  return { ok: false, error: '設定ファイルを取得できません' };
}

// ---------- 通知（同じ内容を何度も出さない） ----------

function owNotifyOnce(state, key, everyDays, title, message) {
  const today = owYmd();
  const last = state.notices[key];
  if (last && owDaysBetween(last, today) < everyDays) return;
  state.notices[key] = today;
  showNotification(title, message);
}

// ---------- チェック本体 ----------
// force=false: 自動実行。その日すでに成功していれば何もしない。
// force=true : 「今すぐチェック」。成功済みでも取り直す。
// 戻り値: 画面に出すための結果の要約（文字列）

function owRunCheck(force) {
  const now = Date.now();
  const today = owYmd(now);
  const state = owLoadState();
  const recent = owLoadRecent();
  const selected = owLoadSelected();

  if (!force && state.last_success_date === today) return 'きょうは確認済みです';
  if (!force && state.last_attempt_at && now - state.last_attempt_at < OW.RETRY_COOLDOWN_MIN * 60000) return '前回の確認から時間が経っていません';
  state.last_attempt_at = now;

  if (!selected.length) {
    owNotifyOnce(state, 'no_selection', 3, '推しキャラが選ばれていません', '「キャラを選ぶ」から通知してほしいキャラを選んでください');
    owSave('ow_state', state);
    return 'キャラが選ばれていません';
  }

  const session = owCreateSession();
  session.intervalMs = OW.MIN_INTERVAL_MS;
  const loaded = owLoadConfig(session);
  if (!loaded.ok) {
    owSave('ow_state', state);
    return '設定ファイルを取得できませんでした（あとで再挑戦します）';
  }
  const cfg = loaded.config;
  session.intervalMs = Math.max(OW.MIN_INTERVAL_MS, (cfg.limits && cfg.limits.request_interval_ms) || 1500);
  const maxNew = Math.min((cfg.limits && cfg.limits.max_new_per_run) || 5, 10);

  if (cfg.status === 'suspended') {
    owNotifyOnce(state, 'suspended', 7, '推しキャラ新商品ウォッチは停止中です', cfg.message || '詳しくは購入ページのお知らせをご覧ください');
    owSave('ow_state', state);
    return '停止中: ' + (cfg.message || '');
  }
  if (cfg.min_version && OW.VERSION < cfg.min_version) {
    owNotifyOnce(state, 'too_old', 3, '更新が必要です', '購入ページの「更新用リンク」から取り込み直してください');
    owSave('ow_state', state);
    return '更新が必要です';
  }
  if (cfg.latest_version && OW.VERSION < cfg.latest_version) {
    owNotifyOnce(state, 'update', 14, '新しい版があります', '購入ページの「更新用リンク」から取り込み直せます（設定や記録はそのまま残ります）');
  }

  const summary = [];
  let allOk = true;
  let newCount = 0;
  let checkedEstablished = false; // 初回登録ではない（以前から監視していた）組み合わせを確認できたか
  const siteBlocked = {};

  selected.slice(0, OW.MAX_CHARACTERS).forEach((ch) => {
    Object.keys(ch.sources || {}).forEach((siteKey) => {
      const site = cfg.sites[siteKey];
      if (!site || site.enabled === false) return;
      const tkey = ch.key + '@' + siteKey;
      const t = state.targets[tkey] || (state.targets[tkey] = { seen: {}, fail_days: 0 });
      if (t.last_ok_date === today && !force) return; // この組み合わせは今日すでに成功している
      const label = ch.name + '（' + OW_SITES[siteKey].label + '）';

      if (siteBlocked[siteKey]) {
        allOk = false;
        return;
      }
      const sampleUrl = site.list_url.replace('{id}', encodeURIComponent(ch.sources[siteKey])).replace('{page}', '1');
      const robots = owCheckRobots(session, state, siteKey, sampleUrl);
      if (!robots.ok) {
        siteBlocked[siteKey] = true;
        allOk = false;
        if (robots.blocked) {
          owNotifyOnce(state, 'robots_' + siteKey, 7, OW_SITES[siteKey].label + ' の確認を止めています', 'サイト側の robots.txt で禁止されたため。更新をお待ちください');
        }
        summary.push('⚠️ ' + label + ': ' + robots.error);
        return;
      }

      const res = owFetchListing(session, siteKey, site, ch.sources[siteKey]);
      if (!res.ok) {
        allOk = false;
        if (res.status === 403 || res.status === 429) siteBlocked[siteKey] = true; // 今日はこのサイトを叩かない
        if (t.fail_last !== today) {
          t.fail_days = (t.fail_days || 0) + 1;
          t.fail_last = today;
        }
        if (t.fail_days >= OW.FAIL_NOTIFY_DAYS) {
          owNotifyOnce(state, 'fail_' + tkey, 7, '⚠️ ' + label + ' を確認できていません', t.fail_days + '日連続: ' + res.error);
        }
        summary.push('❌ ' + label + ': ' + res.error);
        return;
      }

      const listedIds = {};
      res.items.forEach((it) => {
        listedIds[it.id] = true;
      });

      if (!t.baseline) {
        // 初回は今ある商品を「既知」として登録するだけ。通知しない（大量の誤通知を防ぐ）。
        res.items.forEach((it) => {
          t.seen[it.id] = today;
        });
        t.baseline = true;
        summary.push('📝 ' + label + ': 監視を開始（いまある ' + res.items.length + ' 件を登録）');
      } else {
        checkedEstablished = true;
        const fresh = res.items.filter((it) => !t.seen[it.id]);
        if (fresh.length > maxNew) {
          // 一度に大量＝サイトの模様替えや読み取りの異常の可能性が高い。個別通知せず1通だけ。
          fresh.forEach((it) => {
            t.seen[it.id] = today;
          });
          showNotification('⚠️ ' + label + ': 新商品が ' + fresh.length + ' 件', 'いつもと違うので個別の通知は控えました。サイトで直接確認してください');
          summary.push('⚠️ ' + label + ': 一度に ' + fresh.length + ' 件（要確認）');
        } else {
          fresh.forEach((it) => {
            try {
              OW_SITES[siteKey].enrich(session, it, site);
            } catch (e) {
              // 予約情報が取れなくても通知はする
            }
            t.seen[it.id] = today;
            newCount++;
            let msg = it.name + (it.price ? ' ¥' + it.price.toLocaleString() : '');
            if (it.deadline) msg += '\n⏰ 予約締切 ' + owMd(it.deadline);
            else if (it.isPreorder) msg += '\n予約商品';
            showNotification('🎀 新商品: ' + ch.name, msg + '\nタップして「新商品を見る」から開けます');
            recent.unshift({
              found: today,
              char: ch.name,
              site: siteKey,
              id: it.id,
              name: it.name,
              price: it.price,
              url: it.url,
              deadline: it.deadline || null,
              ship: it.ship || null,
            });
          });
          summary.push('✅ ' + label + ': ' + (fresh.length ? '新商品 ' + fresh.length + ' 件' : '新商品なし'));
        }
      }

      // 古い既知IDを整理する（いま一覧に載っているものは残す）
      Object.keys(t.seen).forEach((id) => {
        if (!listedIds[id] && owDaysBetween(t.seen[id], today) > OW.SEEN_RETENTION_DAYS) delete t.seen[id];
      });
      t.fail_days = 0;
      t.last_ok_date = today;
    });
  });

  // 選ばれなくなったキャラの記録は消す
  const selectedKeys = {};
  selected.forEach((ch) => Object.keys(ch.sources || {}).forEach((s) => (selectedKeys[ch.key + '@' + s] = true)));
  Object.keys(state.targets).forEach((k) => {
    if (!selectedKeys[k]) delete state.targets[k];
  });

  if (allOk) state.last_success_date = today;
  state.last_run_at = now;
  state.last_summary = summary;

  // 月曜は週次サマリ。新商品が無い週も送る（「通知が来ない」が正常か故障かを見分けるため）。
  // ただし導入直後（初回登録だけの回）は送らない。「今週は0件」と届いても意味がないため。
  if (owWeekday(now) === 1 && state.last_weekly !== today && allOk && checkedEstablished) {
    const weekAgo = recent.filter((r) => owDaysBetween(r.found, today) <= 7).length;
    showNotification(
      '📋 今週の推しキャラ新商品: ' + weekAgo + ' 件',
      (weekAgo ? '「新商品を見る」から一覧を開けます。' : '今週は新商品がありませんでした。') + 'この通知をタップすると、止まりにくくなります',
    );
    state.last_weekly = today;
  }

  owSave('ow_recent', recent.slice(0, OW.MAX_RECENT));
  owSave('ow_state', state);
  return (newCount ? '新商品 ' + newCount + ' 件\n' : '') + summary.join('\n');
}
