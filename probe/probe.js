// 推しキャラ新商品ウォッチ — HTTP Shortcuts 版 回線・機能テスト
//
// 確かめること:
//  1. スマホの回線から、正直なアプリ名のUser-Agentで両サイトが取れるか
//  2. parseHTML（CSSセレクタ）で、10万文字超のHTMLから商品カードを抜き出せるか
//     （NEWラベル・予約商品を含めて、件数表示と一致するか）
//  3. 変数への保存が、実行をまたいで残るか
//  4. 日付・時刻（タイムゾーン）が正しく取れるか
//  5. 通知が出せるか
//
// サイトへの負荷を考え、リクエストは1.5秒間隔の逐次実行で、1回のテストにつき3回だけ。

const UA = 'OshiWatch/0.1 (HTTP Shortcuts; +https://github.com/hollowmark-dev/oshiwatch)';
const lines = [];
const log = (s) => lines.push(s);
const results = [];

function fetchPage(url) {
  const started = Date.now();
  const r = sendHttpRequest(url, {
    method: 'GET',
    headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8' },
  });
  const ms = Date.now() - started;
  if (r.status === 'networkError') {
    return { ok: false, ms, note: '通信エラー: ' + r.networkError };
  }
  const code = r.response.statusCode;
  const body = r.response.body || '';
  if (code !== 200) {
    return { ok: false, ms, code, note: 'HTTP ' + code + ' / ' + summarize(body) };
  }
  return { ok: true, ms, code, body };
}

function summarize(html) {
  const title = (html.match(/<title>([^<]*)/i) || [])[1];
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return (title ? '[' + title.trim() + '] ' : '') + text;
}

// parseHTML の結果（{name, attributes, children, text}）の木から、条件に合う要素を探す
function findFirst(node, pred) {
  if (!node) return null;
  if (pred(node)) return node;
  for (const c of node.children || []) {
    const hit = findFirst(c, pred);
    if (hit) return hit;
  }
  return null;
}

function allText(node) {
  if (!node) return '';
  let t = node.text || '';
  for (const c of node.children || []) t += allText(c);
  return t;
}

function hasClass(node, cls) {
  const c = (node.attributes && node.attributes['class']) || '';
  return (' ' + c + ' ').indexOf(' ' + cls + ' ') >= 0;
}

function record(name, verdict, detail) {
  results.push({ name, verdict });
  const icon = verdict === 'OK' ? '✅' : verdict === 'SKIP' ? '⏭' : verdict === 'WARN' ? '⚠️' : '❌';
  log(icon + ' ' + name + ': ' + verdict);
  if (detail) log('    ' + detail);
}

// ---- 1. サンリオ公式（けろっぴ・直近30日の新商品） ----
function testSanrio() {
  const url = 'https://shop.sanrio.co.jp/item?new=30&character_id%5B%5D=7&page=1';
  const p = fetchPage(url);
  if (!p.ok) {
    record('サンリオ公式 一覧', 'NG', p.note + ' / ' + p.ms + 'ms');
    return;
  }
  const html = p.body;
  const total = (html.match(/search-result"><span>([\d,]+)件/) || [])[1];
  const zero = html.indexOf('該当する商品') >= 0;

  const started = Date.now();
  let cards = [];
  let parseError = null;
  try {
    cards = parseHTML(html, 'li.c-goods-item');
  } catch (e) {
    parseError = String(e);
  }
  const parseMs = Date.now() - started;

  const items = [];
  for (const card of cards) {
    const params = (card.attributes || {})['data-goods_params'];
    let code = null;
    try {
      code = params ? JSON.parse(params).common_goods_code : null;
    } catch (e) {
      code = null;
    }
    const name = (card.attributes || {})['data-ga_ec_goods_name'];
    if (code) items.push({ code, name });
  }

  const detail =
    '件数表示 ' + (total || (zero ? '0' : '?')) + '件 / カード ' + cards.length + '枚 / 抽出 ' + items.length + '件' +
    ' / ' + html.length + '文字 / 取得' + p.ms + 'ms・解析' + parseMs + 'ms' +
    (parseError ? ' / 解析エラー: ' + parseError : '') +
    (items[0] ? '\n    例: ' + items[0].code + ' ' + items[0].name : '');
  const ok = (total != null || zero) && !parseError && items.length > 0 === (total !== '0' && !zero);
  record('サンリオ公式 一覧', ok ? 'OK' : 'WARN', detail);
  return items;
}

// ---- 2. むにゅぐるみパティオ（けろっぴ） ----
// robots.txt が sort / order / limit を含むURLを全ボットに禁止しているので付けない
function testMunyu() {
  const url = 'https://munyugurumi.jp/itemlist?character=KR&page=1';
  const p = fetchPage(url);
  if (!p.ok) {
    record('むにゅぐるみ 一覧', 'NG', p.note + ' / ' + p.ms + 'ms');
    return;
  }
  const html = p.body;
  const total = (html.match(/class="count">全([\d,]+)件/) || [])[1];

  const started = Date.now();
  let cards = [];
  let parseError = null;
  try {
    cards = parseHTML(html, 'div.mod-goods');
  } catch (e) {
    parseError = String(e);
  }
  const parseMs = Date.now() - started;

  const items = [];
  let preorders = 0;
  let news = 0;
  for (const card of cards) {
    const a = findFirst(card, (n) => n.name === 'a' && /ItemID=\d+/.test((n.attributes || {}).href || ''));
    const nameEl = findFirst(card, (n) => n.name === 'p' && hasClass(n, 'name'));
    const newEl = findFirst(card, (n) => hasClass(n, 'status') && hasClass(n, 'new'));
    if (!a || !nameEl) continue;
    const id = a.attributes.href.match(/ItemID=(\d+)/)[1];
    const name = allText(nameEl).trim();
    if (name.indexOf('予約') >= 0) preorders++;
    if (newEl) news++;
    items.push({ id, name });
  }

  const detail =
    '件数表示 ' + (total || '?') + '件 / カード ' + cards.length + '枚 / 抽出 ' + items.length + '件' +
    '（うちNEW ' + news + '件・予約 ' + preorders + '件）' +
    ' / ' + html.length + '文字 / 取得' + p.ms + 'ms・解析' + parseMs + 'ms' +
    (parseError ? ' / 解析エラー: ' + parseError : '');
  const ok = total != null && !parseError && String(items.length) === total;
  record('むにゅぐるみ 一覧', ok ? 'OK' : 'WARN', detail);
  return items;
}

// ---- 3. 変数の保存 ----
function testVariable() {
  let runs = 0;
  try {
    runs = parseInt(getVariable('ow_probe_runs') || '0', 10) || 0;
    setVariable('ow_probe_runs', String(runs + 1));
    record('変数の保存', 'OK', 'このテストの実行回数: ' + (runs + 1) + '回目（2回目以降に数字が増えていれば、保存が残っている）');
  } catch (e) {
    record('変数の保存', 'NG', String(e));
  }
}

// ---- 4. 日付・時刻 ----
function testDate() {
  const d = new Date();
  const offsetHours = -d.getTimezoneOffset() / 60;
  const local =
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
    ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') +
    '（曜日番号 ' + d.getDay() + '）';
  record('日付・時刻', offsetHours === 9 ? 'OK' : 'WARN', local + ' / UTC' + (offsetHours >= 0 ? '+' : '') + offsetHours);
}

// ---- 実行 ----
log('===== 回線・機能テスト =====');
testDate();
testVariable();
log('');
testSanrio();
wait(1500);
testMunyu();

log('');
log('===== まとめ =====');
const ng = results.filter((r) => r.verdict !== 'OK').length;
log(ng === 0 ? '✅ すべてOK' : '⚠️ OK以外が ' + ng + ' 件あります');

const report = lines.join('\n');
showNotification('回線テスト完了', ng === 0 ? 'すべてOK' : 'OK以外が ' + ng + ' 件');
try {
  copyToClipboard(report);
  showToast('結果をコピーしました。そのまま貼り付けて送ってください');
} catch (e) {
  // 画面が出ていない状態では使えないので無視する
}
showWindow({ title: '回線・機能テスト', text: report, monospace: true, fontSize: 13 });
