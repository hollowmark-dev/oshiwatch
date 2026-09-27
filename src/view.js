// ===== 新商品を見る =====
// 最近見つかった新商品の一覧。タップで商品ページを開く。予約商品はカレンダーに登録できる。
// 通知をタップしてこの画面を開くと、Androidに「使われているアプリ」と判断され、止まりにくくなる。

function owAddToCalendar(item, dateYmd, kind) {
  const begin = Date.parse(dateYmd + 'T00:00:00+09:00');
  sendIntent({
    type: 'activity',
    action: 'android.intent.action.INSERT',
    dataUri: 'content://com.android.calendar/events',
    extras: [
      { name: 'title', type: 'string', value: '【' + kind + '】' + item.name.replace(/【[^】]*】/g, '').trim() },
      { name: 'description', type: 'string', value: item.name + '\n' + (item.price ? owYen(item.price) + '\n' : '') + (item.url || '') },
      { name: 'beginTime', type: 'long', value: begin },
      { name: 'endTime', type: 'long', value: begin + 86400000 },
      { name: 'allDay', type: 'boolean', value: true },
    ],
  });
}

function owStatusText() {
  const state = owLoadState();
  const selected = owLoadSelected();
  const lines = [];
  const warning = owAutoCheckWarning(state);
  if (warning) {
    lines.push(warning);
    lines.push('');
  }
  lines.push('最終確認: ' + (state.last_run_at ? owYmd(state.last_run_at) + ' ' + owHm(state.last_run_at) : 'まだ一度も確認していません'));
  lines.push('自動チェックが最後に動いた時刻: ' + (state.last_auto_at ? owYmd(state.last_auto_at) + ' ' + owHm(state.last_auto_at) : '—'));
  lines.push('最後に全部成功した日: ' + (state.last_success_date || '—'));
  lines.push('');
  lines.push('通知するキャラ: ' + (selected.length ? selected.map((c) => c.name).join('、') : '未選択'));
  lines.push('');
  (state.last_summary || []).forEach((s) => lines.push(s));
  lines.push('');
  lines.push('何日も「最終確認」が進まないときは、スマホの省電力設定でこのアプリが止められています。');
  lines.push('購入ページの「止まらないための設定」を見直してください。');
  return lines.join('\n');
}

owArmAutoCheck(); // 開くたびに自動実行の予約を作り直す（予約が消えていても、ここで直る）
const recent = owLoadRecent();
const autoWarning = owAutoCheckWarning(owLoadState());
const options = { status: autoWarning ? '⚠️ 自動チェックが止まっています（タップで直し方）' : '📋 動いているか確認する' };
recent.slice(0, 40).forEach((r, i) => {
  options[String(i)] = owMd(r.found) + ' ' + r.char + '｜' + r.name.slice(0, 40) + (r.deadline ? ' ⏰' : '');
});
if (!recent.length) options.none = '（まだ新商品は見つかっていません）';

const picked = showSelection(options, '最近見つかった新商品');
if (picked === 'status') {
  showWindow({ title: '動いているか確認する', text: owStatusText(), fontSize: 15 });
} else if (picked != null && picked !== 'none') {
  const item = recent[parseInt(picked, 10)];
  const actions = { open: '商品ページを開く' };
  if (item.deadline) actions.deadline = '📅 カレンダーに登録（予約締切 ' + owMd(item.deadline) + '）';
  if (item.ship) actions.ship = '📅 カレンダーに登録（発送予定 ' + owMd(item.ship) + ' ごろ）';
  const action = showSelection(actions, item.name.slice(0, 60));
  if (action === 'open' && item.url) openUrl(item.url);
  if (action === 'deadline') owAddToCalendar(item, item.deadline, '予約締切');
  if (action === 'ship') owAddToCalendar(item, item.ship, '発送予定');
}
