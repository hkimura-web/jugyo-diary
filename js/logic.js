/* 授業ダイアリー: 日付と計画のロジック（画面に依存しない部分）
 * ブラウザでは window.JD、Node では module.exports として使える。 */
(function (root) {
  "use strict";
  const DOW = "日月火水木金土";
  const pad = n => String(n).padStart(2, "0");
  const ds = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const pd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const md = s => { const d = pd(s); return (d.getMonth() + 1) + "/" + (d.getDate()); };
  const dw = s => DOW[pd(s).getDay()];
  const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const hrsOf = b => (b && b.h) || 1;

  /* 学期内の各日について、その授業の時間割に当たる日を「コマ」にする（1日1コマ、hrs=その日の時数）。 */
  function buildSlots(st, cls) {
    const out = [];
    for (let d = st.term.start; d <= st.term.end; d = addDays(d, 1)) {
      const w = pd(d).getDay();
      const hrs = cls.tt.filter(t => t[0] === w).length;
      if (!hrs) continue;
      const key = cls.id + "|" + d;
      out.push({ key, date: d, hrs, off: (st.off && st.off[key]) || null, ev: (st.events && st.events[d]) || "" });
    }
    return out;
  }

  /* 計画ブロックを、休講・授業なし・別内容のコマを飛ばしながら順番にコマへ割り当てる。
   * 「途中まで」のコマでは最後のブロックが次のコマに続く。 */
  function project(st, cls) {
    const blocks = st.plans[cls.id] || [];
    let p = 0, contFrom = -1;
    const rows = buildSlots(st, cls).map(s => {
      if (s.off) return Object.assign({}, s, { kind: "off", blocks: [], used: 0, rec: {} });
      const rec = st.rec[s.key] || {}, stt = rec.s || "plan";
      if (stt === "cancel" || stt === "free") return Object.assign({}, s, { kind: stt, blocks: [], used: 0, rec });
      const assigned = [];
      let used = 0;
      const cont = contFrom === p && p < blocks.length;
      while (used < s.hrs && p < blocks.length) { const b = blocks[p]; assigned.push(b); used += hrsOf(b); p++; }
      if (stt === "part" && assigned.length) { p--; contFrom = p; } else contFrom = -1;
      const kind = assigned.length || stt !== "plan" ? stt : "empty";
      return Object.assign({}, s, { kind, blocks: assigned, used, cont, rec });
    });
    return { rows, left: blocks.slice(p) };
  }

  function classStats(st, cls, asof) {
    const pj = project(st, cls);
    const fut = pj.rows.filter(r => r.date >= asof && (r.kind === "plan" || r.kind === "empty"));
    const remain = fut.reduce((a, r) => a + r.hrs, 0);
    const spare = fut.reduce((a, r) => a + Math.max(0, r.hrs - r.used), 0);
    const needed = pj.left.reduce((a, b) => a + hrsOf(b), 0);
    return { pj, remain, needed, spare };
  }

  function unitStats(st, cls, u) {
    const pj = project(st, cls);
    const blocks = st.plans[cls.id] || [];
    const planned = blocks.filter(b => b.u === u).reduce((a, b) => a + hrsOf(b), 0);
    let actual = 0, slotsU = 0, start = null, end = null;
    pj.rows.forEach(r => r.blocks.forEach(b => {
      if (b.u !== u) return;
      slotsU += hrsOf(b);
      if (r.kind === "done" || r.kind === "part") actual += hrsOf(b);
      if (!start) start = r.date;
      end = r.date;
    }));
    const leftU = pj.left.filter(b => b.u === u).reduce((a, b) => a + hrsOf(b), 0);
    return { planned, actual, slotsU, leftU, start, end };
  }

  /* 画面で見せる最初の（これからの）計画ブロックの位置 */
  function firstPendingIndex(st, cls, asof) {
    const pj = project(st, cls), blocks = st.plans[cls.id] || [];
    for (const r of pj.rows) if (r.date >= asof && r.blocks.length) return blocks.indexOf(r.blocks[0]);
    return pj.left.length ? blocks.length - pj.left.length : blocks.length;
  }

  /* 保存用: キー順を固定して差分が読みやすいJSONにする */
  function stable(v) {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object") { const o = {}; Object.keys(v).sort().forEach(k => { o[k] = stable(v[k]); }); return o; }
    return v;
  }
  const toJSON = st => JSON.stringify(stable(st), null, 1) + "\n";

  const api = { DOW, pad, ds, pd, md, dw, addDays, esc, clone, hrsOf, buildSlots, project, classStats, unitStats, firstPendingIndex, toJSON };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.JD = api;
})(typeof window !== "undefined" ? window : globalThis);
