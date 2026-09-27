// ===== キャラを選ぶ =====
// 通知してほしいキャラを選ぶ。対応キャラの一覧は設定ファイルから取るので、キャラの追加に更新は要らない。

const session = owCreateSession();
session.intervalMs = OW.MIN_INTERVAL_MS;
const loaded = owLoadConfig(session);
if (!loaded.ok || loaded.fromCache || !loaded.config.characters) {
  showDialog('対応キャラの一覧を取得できませんでした。電波の良いところでもう一度お試しください。', 'キャラを選ぶ');
  abort();
}
const all = loaded.config.characters;
let selected = owLoadSelected();

const current = selected.length ? selected.map((c) => '・' + c.name).join('<br>') : '（まだ選ばれていません）';
const first = showDialog('いま通知するキャラ:<br>' + current + '<br><br>最大 ' + OW.MAX_CHARACTERS + ' キャラまで選べます。', 'キャラを選ぶ', {
  buttons: ['追加する', '選び直す'],
});
if (first.result === 'button2') selected = [];
if (first.result === 'button1' || first.result === 'button2') {
  const q = prompt('キャラ名の一部を入れてください（空欄のままで全キャラを表示）', '');
  if (q !== null) {
    const norm = (s) => String(s).normalize('NFKC').replace(/[\s・･]/g, '').toLowerCase();
    const hits = all.filter((c) => !q || norm(c.name).indexOf(norm(q)) >= 0);
    if (!hits.length) {
      showDialog('「' + q + '」に当てはまるキャラが見つかりませんでした。', 'キャラを選ぶ');
    } else {
      const opts = {};
      hits.forEach((c) => {
        const sites = Object.keys(c.sources).map((s) => (OW_SITES[s] ? OW_SITES[s].label : s)).join('・');
        opts[c.key] = c.name + '（' + sites + '）';
      });
      const chosen = showMultiSelection(opts, 'キャラを選ぶ（' + hits.length + '件）');
      if (chosen && chosen.length) {
        chosen.forEach((key) => {
          if (selected.some((c) => c.key === key)) return;
          const c = all.filter((x) => x.key === key)[0];
          if (c) selected.push({ key: c.key, name: c.name, sources: c.sources });
        });
      }
    }
  }
  if (selected.length > OW.MAX_CHARACTERS) {
    showDialog('選べるのは ' + OW.MAX_CHARACTERS + ' キャラまでです。最初の ' + OW.MAX_CHARACTERS + ' キャラだけを残しました。', 'キャラを選ぶ');
    selected = selected.slice(0, OW.MAX_CHARACTERS);
  }
  owSave('ow_selected', selected);
  showDialog(
    '通知するキャラ:<br>' + (selected.length ? selected.map((c) => '・' + c.name).join('<br>') : '（なし）') +
      '<br><br>新しく選んだキャラは、次の確認で「いまある商品」を登録します（このときは通知しません）。そのあと新しく出た商品から通知します。',
    '保存しました',
  );
}
