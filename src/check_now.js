// ===== 今すぐチェック =====
// 手動で確認したいとき用。その日すでに確認済みでも取り直し、結果を画面に出す。
let result;
try {
  result = owRunCheck(true);
} catch (e) {
  result = 'エラー: ' + e;
}
const state = owLoadState();
showDialog(
  (result || '結果なし').replace(/\n/g, '<br>') +
    '<br><br><small>最終確認: ' + (state.last_run_at ? owYmd(state.last_run_at) + ' ' + owHm(state.last_run_at) : '—') + '</small>',
  '今すぐチェック',
);
