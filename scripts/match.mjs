// 指標名の照合と結果の書き込み (Node とブラウザの両方で使う。Node専用APIは使わないこと)

// 羊飼いの表記 → 通貨・みんかぶ/SBIの国コード
export const COUNTRY = {
  "米": { cur: "USD", mk: "US", sbi: "US", name: "米国" },
  "欧": { cur: "EUR", mk: "EU", sbi: "EC", name: "ユーロ圏" },
  "独": { cur: "EUR", mk: "DE", sbi: "GE", name: "ドイツ" },
  "仏": { cur: "EUR", mk: "FR", sbi: "FR", name: "フランス" },
  "伊": { cur: "EUR", mk: "IT", sbi: "IT", name: "イタリア" },
  "英": { cur: "GBP", mk: "GB", sbi: "UK", name: "英国" },
  "日": { cur: "JPY", mk: "JP", sbi: "JN", name: "日本" },
  "豪": { cur: "AUD", mk: "AU", sbi: "AU", name: "豪州" },
  "NZ": { cur: "NZD", mk: "NZ", sbi: "NZ", name: "NZ" },
  "加": { cur: "CAD", mk: "CA", sbi: "CA", name: "カナダ" },
  "スイス": { cur: "CHF", mk: "CH", sbi: "SZ", name: "スイス" },
  "瑞": { cur: "CHF", mk: "CH", sbi: "SZ", name: "スイス" },
  "中": { cur: "CNY", mk: "CN", sbi: "CH", name: "中国" },
  "南ア": { cur: "ZAR", mk: "ZA", sbi: "SA", name: "南ア" },
  "トルコ": { cur: "TRY", mk: "TR", sbi: "TU", name: "トルコ" },
  "メキシコ": { cur: "MXN", mk: "MX", sbi: "MX", name: "メキシコ" },
};
export const MK2C = Object.fromEntries(Object.entries(COUNTRY).filter(([k]) => k !== "瑞").map(([k, v]) => [v.mk, k]));
MK2C.UK = "英";
const SBI2C = Object.fromEntries(Object.entries(COUNTRY).filter(([k]) => k !== "瑞").map(([k, v]) => [v.sbi, k]));

export const num = (s) => {
  const m = String(s ?? "").normalize("NFKC").replace(/,/g, "").match(/[-+]?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
const clean = (v) => { v = String(v ?? "").normalize("NFKC").trim(); return !v || /^[-ー－]+$/.test(v) ? "" : v; };

// ---------- SBI FXトレード (経済指標カレンダーのAPI。CORS許可あり) ----------
export const SBI_API = "https://d60lpgggtdg9i.cloudfront.net/fxt_api/economic-calendar";
export const sbiUrl = (fromYmd, toYmd) => `${SBI_API}?start_date=${fromYmd.replace(/-/g, "")}&end_date=${toYmd.replace(/-/g, "")}`;
export function parseSbi(rows) {
  return (rows || []).filter((r) => r.release_dt && !/2359$/.test(r.release_dt)).map((r) => {
    const d = r.release_dt;
    return {
      src: "sbi", at: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:00+09:00`,
      country: SBI2C[r.country] || r.country, name: String(r.event_title || "").normalize("NFKC"),
      importance: +r.importance || 0, previous: clean(r.previous_value), forecast: clean(r.forecast_value), actual: clean(r.actual_value),
    };
  });
}

// ---------- 名前の照合 ----------
// "米国・消費者信頼感指数 11月 [前月比]" / "製造業PMI-11月" → 比較用の本体
const norm = (s) => s.normalize("NFKC").replace(/非製造業/g, "サービス業").replace(/^[^・)）]{1,6}[・)）]/, "")
  .replace(/-\s*(\d+月|\d+Q|\d+\/\d+.*)$/, "")
  .replace(/\d+月|第\d四半期|\[.*?\]|【.*?】|\(.*?\)|（.*?）|\s/g, "")
  .replace(/S&P\/?|S＆P\/?|・/g, "").toLowerCase();
export function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.5 + 0.5;
  const bg = (s) => new Set([...s].map((c, i) => s.slice(i, i + 2)).filter((x) => x.length === 2));
  const A = bg(a), B = bg(b);
  let n = 0;
  A.forEach((x) => B.has(x) && n++);
  return (2 * n) / (A.size + B.size || 1);
}
// [前月比] や （前年比） の部分
const subKey = (name) => { const s = name.normalize("NFKC"); return (s.match(/\[(.*?)\]/) || s.match(/\(([^()]*比[^()]*)\)/) || [, ""])[1]; };

// 羊飼いのイベント1件に対応する行(みんかぶ/SBI)を探す
export function matchRows(ev, rows) {
  const t = new Date(ev.at).getTime();
  const cands = rows.filter((m) => Math.abs(new Date(m.at).getTime() - t) < 60e3 && m.country === ev.country);
  const q = (s) => /四半期|\dQ/.test(s);
  const scored = cands.map((m) => ({ m, s: similarity(ev.title, m.name) + (q(ev.title) === q(m.name) ? 0.1 : 0) })).filter((x) => x.s >= 0.35).sort((a, b) => b.s - a.s);
  if (!scored.length) return [];
  const best = scored[0].s;
  return scored.filter((x) => x.s >= best - 0.05).map((x) => x.m);
}

// 行データ(みんかぶ/SBI)の結果を日別データへ書き込む。変化があれば true
//  fillOnly: 既に結果が入っていれば上書きしない (優先度の低い取得元用)
//  meta:     みんかぶの「前回発表時の値動き」なども書く
export function applyRows(day, rows, { fillOnly = false, meta = false } = {}) {
  let changed = false;
  const set = (o, k, v) => { if (v !== undefined && v !== "" && o[k] !== v) { o[k] = v; changed = true; } };
  const setActual = (o, v) => { if (fillOnly && o.actual) return; set(o, "actual", v); };
  for (const ev of day.events) {
    if (ev.kind === "speech") continue;
    if (ev.source === "minkabu") {
      if (!meta) continue;
      const m = rows.find((x) => x.code === ev.mkCode && x.at === ev.at);
      if (m) { const v = ev.values[0]; setActual(v, m.actual); set(v, "forecast", m.forecast); set(v, "previous", m.previous); set(ev, "prevMove", m.prevMove); }
      continue;
    }
    // 同時刻の別の指標の方がよく合う行は除外 (例: ケース・シラー と 住宅価格指数、消費者支出 と 消費者物価指数)
    const rivals = day.events.filter((o) => o !== ev && o.at === ev.at && o.country === ev.country && o.kind !== "speech");
    const ms = matchRows(ev, rows).filter((m) => rivals.every((o) => similarity(o.title, m.name) <= similarity(ev.title, m.name)));
    if (ms.length) {
      // 前月比/前年比などの複数値: ラベルで対応付け。前回値が一致する行を最優先
      ev.values.forEach((v, i) => {
        const label = ev.labels?.[i];
        const samePrev = ms.filter((x) => num(x.previous) !== null && num(x.previous) === num(v.previous));
        const pool = samePrev.length ? samePrev : ms;
        const m = label ? (pool.find((x) => subKey(x.name).includes(label)) || (samePrev.length === 1 ? samePrev[0] : null))
          : pool.length === 1 ? pool[0] : (pool.find((x) => !subKey(x.name)) || pool.find((x) => /前月比|前期比/.test(subKey(x.name))) || pool[0]);
        if (!m) return;
        setActual(v, m.actual);
        if (meta && (!v.forecast || v.forecast === "-")) set(v, "forecast", m.forecast);
      });
      if (meta) { set(ev, "prevMove", ms[0].prevMove); set(ev, "mkCode", ms[0].code); }
    }
    // 内訳(↑・個人支出 など): 同時刻・同じ国の行から、名前と前回値で探す
    const t = new Date(ev.at).getTime();
    const same = rows.filter((x) => new Date(x.at).getTime() === t && x.country === ev.country);
    const flat = (s) => s.normalize("NFKC").replace(/非製造業/g, "サービス業").replace(/-\s*(\d+月|\d+Q)$/, "").replace(/【.*?】|[・\s\[\]()（）]/g, "");
    for (const c of ev.children) {
      const scored = same.map((x) => {
        const nm = flat(x.name), ct = flat(c.title);
        const nameHit = nm.includes(ct) || ct.split(/(?<=指数|件数|在庫|比)/).some((p) => p.length >= 3 && nm.includes(p));
        const prevHit = num(x.previous) !== null && num(x.previous) === num(c.previous);
        return { x, s: (prevHit ? 2 : 0) + (nameHit ? 1.5 : 0) + similarity(c.title, x.name) * 0.5 };
      }).sort((a, b) => b.s - a.s);
      if (scored[0] && scored[0].s >= 2) setActual(c, scored[0].x.actual);
    }
  }
  return changed;
}
