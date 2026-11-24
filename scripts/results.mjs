// GitHub Actions から定期実行: みんかぶFXの結果を日別データへ書き込む
import { fetchText, parseMinkabu, mergeResults, dayFromMinkabu, loadDay, saveDay, todayJST, addDays } from "./lib.mjs";

const today = todayJST();
// 今日以降のページ + 前日から2日分のページ(発表済みの結果を取りこぼさないため)
const pages = await Promise.all([
  fetchText("https://fx.minkabu.jp/indicators"),
  fetchText(`https://fx.minkabu.jp/indicators?date=${addDays(today, -1)}&days=2`).catch(() => ""),
]);
const seen = new Set();
const mk = pages.flatMap(parseMinkabu).filter((m) => { const k = m.at + m.name; if (seen.has(k)) return false; seen.add(k); return true; });
console.log(`みんかぶ: ${mk.length}行`);
for (const ymd of [addDays(today, -1), today, addDays(today, 1), addDays(today, 2), addDays(today, 3), addDays(today, 4)]) {
  let day = loadDay(ymd);
  if (!day) {
    if (ymd < today) continue;
    day = dayFromMinkabu(ymd, mk);
    if (!day.events.length) continue;
    saveDay(day);
    console.log(`${ymd}: みんかぶのみで作成 ${day.events.length}件`);
    continue;
  }
  if (day.source === "minkabu") {
    const fresh = dayFromMinkabu(ymd, mk);
    if (fresh.events.length) { day.events = fresh.events; saveDay(day); }
    continue;
  }
  if (mergeResults(day, mk)) { saveDay(day); console.log(`${ymd}: 結果を更新`); }
}
