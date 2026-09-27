// 開発用（配布しない）: 既知の商品を忘れさせて、次の確認で「新商品」として通知させる。
// むにゅぐるみは全部、サンリオは1件だけ忘れる。その日の成功記録も消す。
const s = JSON.parse(getVariable('ow_state'));
Object.keys(s.targets).forEach((k) => {
  const t = s.targets[k];
  const ids = Object.keys(t.seen);
  (k.indexOf('munyugurumi') >= 0 ? ids : ids.slice(0, 1)).forEach((id) => delete t.seen[id]);
  t.last_ok_date = null;
});
s.last_success_date = null;
s.last_attempt_at = null;
setVariable('ow_state', JSON.stringify(s));
showToast('既知の商品を忘れさせました');
