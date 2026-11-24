// 使い方: node scripts/hitsujikai.mjs [YYYY-MM-DD ...]
// 引数なし → 今日から5日分(公開済みの日だけ)を羊飼いのFXブログから取り込む
import { fetchSbi, fetchText, parseHitsujikai, parseMinkabu, mergeResults, hitsujikaiUrl, loadDay, saveDay, todayJST, addDays } from "./lib.mjs";

const dates = process.argv.slice(2).length ? process.argv.slice(2) : [0, 1, 2, 3, 4].map((n) => addDays(todayJST(), n));
let mk = [];
try { mk = parseMinkabu(await fetchText(`https://fx.minkabu.jp/indicators?date=${addDays(dates[0], -1)}&days=7`)); } catch (e) { console.warn("みんかぶ取得失敗:", e.message); }
let sbi = [];
try { sbi = await fetchSbi(addDays(dates[0], -1), addDays(dates.at(-1), 1)); } catch (e) { console.warn("SBI取得失敗:", e.message); }

for (const ymd of dates) {
  const url = hitsujikaiUrl(ymd);
  let html;
  try { html = await fetchText(url); } catch (e) { console.log(`${ymd}: 未公開 (${e.message})`); continue; }
  const { notes, events } = parseHitsujikai(html, ymd);
  const old = loadDay(ymd);
  const day = { date: ymd, source: "hitsujikai", sourceUrl: url, fetched: new Date().toISOString(), notes, events };
  // 以前に入っていた結果を引き継ぐ
  if (old) for (const ev of day.events) {
    const o = old.events.find((x) => x.at === ev.at && x.title === ev.title);
    if (o) ev.values.forEach((v, i) => { if (o.values?.[i]?.actual) v.actual = o.values[i].actual; });
  }
  mergeResults(day, mk, sbi);
  saveDay(day);
  const ranked = events.filter((e) => e.rank).length;
  console.log(`${ymd}: ${events.length}件 (ランク付き ${ranked}件)`);
}
