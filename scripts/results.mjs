// GitHub Actions から定期実行: みんかぶFXの結果を日別データへ書き込む
import { fetchText, parseMinkabu, mergeResults, dayFromMinkabu, loadDay, saveDay, todayJST, addDays } from "./lib.mjs";

const mk = parseMinkabu(await fetchText("https://fx.minkabu.jp/indicators"));
console.log(`みんかぶ: ${mk.length}行`);
const today = todayJST();
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
