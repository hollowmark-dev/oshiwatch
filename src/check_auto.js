// ===== 自動チェック =====
// 6時間ごとに自動で起動する（HTTP Shortcuts の繰り返し実行）。その日すでに成功していれば何もせず終わる。
// 画面は出さない。新商品・異常があったときだけ通知する。
try {
  const result = owRunCheck(false);
  logEvent('自動チェック', result);
} catch (e) {
  logEvent('自動チェック エラー', String(e));
}
