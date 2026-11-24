// 共通処理: 羊飼いのFXブログ / みんかぶFX の読み取りと、日別データへのマージ
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
export const DAYS_DIR = path.join(ROOT, "data", "days");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

export async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return await r.text();
}

const decode = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/＆/g, "＆");
export const strip = (s) => decode(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t\r]+/g, " ").trim();

// ---------- 日付ユーティリティ (すべてJST) ----------
export function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function todayJST() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}
// 羊飼い式の "27:00" (当日基準) を実際のJST日時へ
export function toJstIso(ymd, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const day = addDays(ymd, Math.floor(h / 24));
  return `${day}T${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+09:00`;
}

// ---------- 国 ----------
// 羊飼いの表記 → 通貨・みんかぶの国コード
export const COUNTRY = {
  "米": { cur: "USD", mk: "US", name: "米国" },
  "欧": { cur: "EUR", mk: "EU", name: "ユーロ圏" },
  "独": { cur: "EUR", mk: "DE", name: "ドイツ" },
  "仏": { cur: "EUR", mk: "FR", name: "フランス" },
  "伊": { cur: "EUR", mk: "IT", name: "イタリア" },
  "英": { cur: "GBP", mk: "GB", name: "英国" },
  "日": { cur: "JPY", mk: "JP", name: "日本" },
  "豪": { cur: "AUD", mk: "AU", name: "豪州" },
  "NZ": { cur: "NZD", mk: "NZ", name: "NZ" },
  "加": { cur: "CAD", mk: "CA", name: "カナダ" },
  "スイス": { cur: "CHF", mk: "CH", name: "スイス" },
  "瑞": { cur: "CHF", mk: "CH", name: "スイス" },
  "中": { cur: "CNY", mk: "CN", name: "中国" },
  "南ア": { cur: "ZAR", mk: "ZA", name: "南ア" },
  "トルコ": { cur: "TRY", mk: "TR", name: "トルコ" },
  "メキシコ": { cur: "MXN", mk: "MX", name: "メキシコ" },
};
const MK2C = Object.fromEntries(Object.entries(COUNTRY).map(([k, v]) => [v.mk, k]));
MK2C.UK = "英";

// ---------- 羊飼いのFXブログ ----------
const RANK = {
  "icon-ss": "SS", "icon-s": "S", "icon-aa": "AA", "icon-a": "A", "icon-bb": "BB", "icon-b": "B", "icon-c": "C",
  "icon-maru2": "◎", "icon-maru": "○", "icon-san": "△", "icon-batu": "×",
};

export function hitsujikaiUrl(ymd) {
  return `https://kissfx.com/article/fxdays${ymd.replace(/-/g, "")}.html`;
}

function tds(tr) {
  const out = [];
  const re = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(tr))) {
    const attrs = m[1];
    out.push({
      cls: (attrs.match(/class="([^"]*)"/) || [, ""])[1],
      colspan: +((attrs.match(/colspan="(\d+)"/) || [, 1])[1]),
      html: m[2],
    });
  }
  return out;
}

export function parseHitsujikai(html, ymd) {
  const start = html.indexOf('class="c-shihyo-calendar"');
  if (start < 0) throw new Error("羊飼いの表が見つかりません");
  const tbody = html.slice(start, html.indexOf("</table>", start));
  const notes = [];
  const events = [];
  let curTime = null;
  let last = null;
  const trs = tbody.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trs) {
    if (/<th/i.test(tr)) continue;
    const cells = tds(tr);
    if (!cells.length) continue;
    if (cells.length === 1 && cells[0].colspan >= 5) {
      strip(cells[0].html).split("\n").map((s) => s.replace(/^[・※\s]+/, "").trim()).filter(Boolean).forEach((s) => notes.push(s));
      continue;
    }
    let i = 0;
    const t = strip(cells[0].html).replace(/\s/g, "");
    const tm = t.match(/^(翌)?(\d{1,2}):(\d{2})$/);
    if (tm) {
      const h = +tm[2] + (tm[1] ? 24 : 0);
      curTime = `${String(h).padStart(2, "0")}:${tm[3]}`;
      i++;
    }
    let flag = null;
    if (cells[i] && /<img/i.test(cells[i].html)) {
      flag = (cells[i].html.match(/alt="([^"]*)"/) || [, null])[1];
      i++;
    }
    const titleCell = cells.slice(i).find((c) => /\btitle\b/.test(c.cls));
    const rankCell = cells.find((c) => /\brank\b/.test(c.cls));
    const dataCells = cells.slice(i).filter((c) => c !== titleCell && c !== rankCell);
    const vals = dataCells.map((c) => strip(c.html).replace(/\n/g, " "));

    if (!titleCell) {
      // 同じ指標の2行目 (例: 前月比/前年比)
      if (last && vals.length) last.values.push({ forecast: vals[0] ?? "", previous: vals[1] ?? "" });
      continue;
    }
    const th = titleCell.html;
    const links = [...th.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi)]
      .filter((m) => /fxrec\.com/.test(m[1])).map((m) => ({ pair: strip(m[2]), url: m[1] }));
    const lines = strip(th).split("\n").map((s) => s.trim()).filter(Boolean).filter((s) => !/^→過去発表時/.test(s));
    let title = lines[0] || "";
    const sub = lines.slice(1).join(" ");
    const isChild = /^↑/.test(title);
    if (isChild && last) {
      last.children.push({ title: title.replace(/^↑・?/, ""), forecast: vals[0] ?? "", previous: vals[1] ?? "" });
      continue;
    }
    const cm = title.match(/^([^)）]{1,4})[)）]/);
    const ckey = cm ? cm[1] : null;
    const speech = /bg-yellow/.test(titleCell.cls) || /発言|講演|会見/.test(title) && vals.length === 1;
    const labels = (sub.match(/^\[(.+)\]$/) || [, ""])[1].split("/").filter(Boolean);
    const ev = {
      id: `${ymd}-${curTime}-${events.length}`,
      time: curTime,
      at: toJstIso(ymd, curTime || "00:00"),
      country: ckey,
      currency: COUNTRY[ckey]?.cur || null,
      flag,
      title,
      rank: rankCell ? (RANK[(rankCell.html.match(/class="(icon-[a-z0-9]+)"/) || [, ""])[1]] || null) : null,
      emphasis: /<strong/i.test(th) ? 2 : /^\s*<em>(?:(?!<\/em>)[\s\S])*<\/em>\s*(<br|$)/i.test(th) ? 1 : 0,
      kind: speech ? "speech" : /入札/.test(title) ? "auction" : /政策金利|金融政策|議事録|議事要旨|FOMC|ECB|BOE|RBA|RBNZ|BOC|SNB|日銀/.test(title) && !speech ? "policy" : "indicator",
      bg: (titleCell.cls.match(/bg-(\w+)/) || [, null])[1],
      values: [],
      children: [],
      links,
    };
    if (vals.length === 1) ev.memo = vals[0];
    else if (vals.length >= 2) ev.values.push({ forecast: vals[0], previous: vals[1] });
    if (labels.length) ev.labels = labels;
    events.push(ev);
    last = ev;
  }
  return { notes, events };
}

// ---------- みんかぶFX ----------
export function parseMinkabu(html) {
  const out = [];
  const tables = html.split(/<caption[^>]*>/i).slice(1);
  for (const t of tables) {
    const dm = t.match(/^\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!dm) continue;
    const ymd = `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}`;
    const body = t.slice(0, t.search(/<\/table>/i));
    for (const tr of body.match(/<tr class="fs-s"[\s\S]*?<\/tr>/gi) || []) {
      const imp = +((tr.match(/data_importance="(\d)"/) || [, 0])[1]);
      const cc = (tr.match(/data_country="(\w+)"/) || [, ""])[1];
      const time = (tr.match(/eilist__time[^>]*>\s*<span>(\d{1,2}:\d{2})<\/span>/) || [, null])[1];
      const name = strip((tr.match(/<p class="flexbox__grow fbd">([\s\S]*?)<\/p>/) || [, ""])[1]);
      const code = (tr.match(/href="\/indicators\/([^"]+)"/) || [, null])[1];
      const move = strip((tr.match(/eilist__move[^>]*>([\s\S]*?)<\/td>/) || [, ""])[1]);
      const data = [...tr.matchAll(/eilist__data[^>]*>\s*<span>([\s\S]*?)<\/span>/g)].map((m) => strip(m[1]));
      const clean = (v) => (!v || /^-+$/.test(v) ? "" : v);
      if (!time) continue;
      out.push({
        date: ymd, time, at: `${ymd}T${time.padStart(5, "0")}:00+09:00`,
        importance: imp, mk: cc, country: MK2C[cc] || cc, name, code,
        prevMove: clean(move), previous: clean(data[0]), forecast: clean(data[1]), actual: clean(data[2]),
      });
    }
  }
  return out;
}

// みんかぶの名前 "米国・消費者信頼感指数 11月 [前月比]" → 比較用の本体
const norm = (s) => s.normalize("NFKC").replace(/非製造業/g, "サービス業").replace(/^[^・)）]{1,6}[・)）]/, "").replace(/\d+月|第\d四半期|\[.*?\]|【.*?】|\(.*?\)|（.*?）|\s/g, "")
  .replace(/S&P\/?|S＆P\/?|・/g, "").toLowerCase();
function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.5 + 0.5;
  const bg = (s) => new Set([...s].map((c, i) => s.slice(i, i + 2)).filter((x) => x.length === 2));
  const A = bg(a), B = bg(b);
  let n = 0;
  A.forEach((x) => B.has(x) && n++);
  return (2 * n) / (A.size + B.size || 1);
}
export const num = (s) => {
  const m = String(s ?? "").normalize("NFKC").replace(/,/g, "").match(/[-+]?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
const subKey = (name) => ((name.match(/\[(.*?)\]/) || [, ""])[1]);

// 羊飼いのイベント1件に対応するみんかぶの行を探す
export function matchMinkabu(ev, mk) {
  const t = new Date(ev.at).getTime();
  const cands = mk.filter((m) => Math.abs(new Date(m.at).getTime() - t) < 60e3 && (m.country === ev.country || (COUNTRY[m.country]?.cur && COUNTRY[m.country].cur === ev.currency && m.mk !== "EU" && ev.country !== "欧")));
  const q = (s) => /四半期/.test(s);
  const scored = cands.map((m) => ({ m, s: similarity(ev.title, m.name) + (q(ev.title) === q(m.name) ? 0.1 : 0) })).filter((x) => x.s >= 0.35).sort((a, b) => b.s - a.s);
  if (!scored.length) return [];
  const best = scored[0].s;
  return scored.filter((x) => x.s >= best - 0.05).map((x) => x.m);
}

// ---------- 日別データ ----------
export function dayPath(ymd) { return path.join(DAYS_DIR, `${ymd}.json`); }
export function loadDay(ymd) {
  try { return JSON.parse(fs.readFileSync(dayPath(ymd), "utf8")); } catch { return null; }
}
export function saveDay(day) {
  fs.mkdirSync(DAYS_DIR, { recursive: true });
  fs.writeFileSync(dayPath(day.date), JSON.stringify(day, null, 1) + "\n");
  const files = fs.readdirSync(DAYS_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
  fs.writeFileSync(path.join(ROOT, "data", "index.json"), JSON.stringify({ days: files, updated: new Date().toISOString() }) + "\n");
}

// 結果(みんかぶ)を日別データへ書き込む。変化があれば true
export function mergeResults(day, mk) {
  let changed = false;
  const set = (o, k, v) => { if (v !== undefined && v !== "" && o[k] !== v) { o[k] = v; changed = true; } };
  for (const ev of day.events) {
    if (ev.kind === "speech" || ev.source === "minkabu") {
      if (ev.source === "minkabu") {
        const m = mk.find((x) => x.code === ev.mkCode && x.at === ev.at);
        if (m) { const v = ev.values[0]; set(v, "actual", m.actual); set(v, "forecast", m.forecast); set(v, "previous", m.previous); set(ev, "prevMove", m.prevMove); }
      }
      continue;
    }
    const ms = matchMinkabu(ev, mk);
    if (!ms.length) continue;
    // 前月比/前年比などの複数値: [ ] 内のラベルで対応付け
    ev.values.forEach((v, i) => {
      const label = ev.labels?.[i];
      // 前回値が一致する行を最優先 (例: 豪CPIの前年比/前月比/トリム平均の取り違え防止)
      const samePrev = ms.filter((x) => num(x.previous) !== null && num(x.previous) === num(v.previous));
      const pool = samePrev.length ? samePrev : ms;
      const m = label ? (pool.find((x) => subKey(x.name).includes(label)) || (samePrev.length === 1 ? samePrev[0] : null))
        : pool.length === 1 ? pool[0] : (pool.find((x) => !subKey(x.name)) || pool.find((x) => /前月比|前期比/.test(subKey(x.name))) || pool[0]);
      if (!m) return;
      set(v, "actual", m.actual);
      if (!v.forecast || v.forecast === "-") set(v, "forecast", m.forecast);
    });
    set(ev, "prevMove", ms[0].prevMove);
    set(ev, "mkCode", ms[0].code);
    // 内訳(↑・個人支出 など): 同時刻・同じ国の行から、名前と前回値で探す
    const t = new Date(ev.at).getTime();
    const same = mk.filter((x) => new Date(x.at).getTime() === t && x.country === ev.country);
    const flat = (s) => s.normalize("NFKC").replace(/非製造業/g, "サービス業").replace(/【.*?】|[・\s\[\]()（）]/g, "");
    for (const c of ev.children) {
      const scored = same.map((x) => {
        const nm = flat(x.name), ct = flat(c.title);
        const nameHit = nm.includes(ct) || ct.split(/(?<=指数|件数|在庫|比)/).some((p) => p.length >= 3 && nm.includes(p));
        const prevHit = num(x.previous) !== null && num(x.previous) === num(c.previous);
        return { x, s: (prevHit ? 2 : 0) + (nameHit ? 1.5 : 0) + similarity(c.title, x.name) * 0.5 };
      }).sort((a, b) => b.s - a.s);
      if (scored[0] && scored[0].s >= 2) set(c, "actual", scored[0].x.actual);
    }
  }
  if (changed) day.resultsUpdated = new Date().toISOString();
  return changed;
}

// 羊飼いのデータが無い日: みんかぶの重要度3以上で作る (羊飼い式に 07:00〜翌06:59 を1日とする)
export function dayFromMinkabu(ymd, mk) {
  const from = new Date(`${ymd}T07:00:00+09:00`).getTime(), to = from + 24 * 3600e3;
  const rows = mk.filter((m) => m.importance >= 3 && new Date(m.at) >= from && new Date(m.at) < to);
  const events = rows.map((m, i) => {
    const h = Math.round((new Date(m.at) - new Date(`${ymd}T00:00:00+09:00`)) / 3600e3 * 60);
    const time = `${String(Math.floor(h / 60)).padStart(2, "0")}:${String(h % 60).padStart(2, "0")}`;
    const ckey = m.country;
    return {
      id: `${ymd}-${time}-${i}`, time, at: m.at, country: ckey, currency: COUNTRY[ckey]?.cur || null,
      title: `${ckey})${m.name.replace(/^[^・]{1,8}・/, "")}`, rank: null, mkImportance: m.importance,
      kind: /発言|講演|会見/.test(m.name) ? "speech" : "indicator", source: "minkabu", mkCode: m.code,
      values: [{ forecast: m.forecast, previous: m.previous, actual: m.actual }], children: [], links: [], prevMove: m.prevMove,
    };
  });
  return { date: ymd, source: "minkabu", notes: ["羊飼いのランクは未取得(みんかぶの重要度★3以上を表示)"], events };
}
