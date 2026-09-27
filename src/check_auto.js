// ===== 自動チェック =====
// 6時間ごとに自動で起動する（HTTP Shortcuts の繰り返し実行）。その日すでに成功していれば何もせず終わる。
// 画面は出さない。新商品・異常があったときだけ通知する。
try {
  // 自動で起動できた時刻を記録する。「他のアプリの上に重ねて表示」が許可されていないと、
  // 予約された実行が Android にブロックされて、ここまで来ない。この記録が古ければ、
  // 今すぐチェック・新商品を見る の画面で許可のしかたを案内する（owAutoCheckWarning）。
  const s = owLoadState();
  s.last_auto_at = Date.now();
  owSave('ow_state', s);

  const result = owRunCheck(false);
  logEvent('自動チェック', result);
} catch (e) {
  logEvent('自動チェック エラー', String(e));
}
