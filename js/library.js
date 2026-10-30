/* myClassBlueprint.log: 資料タブ（資料集の検索・教材カード・お気に入り・準備チェックリスト）と、
 * 単元の教材に資料を取り込む操作。
 *  - 資料のリンク一覧: library/links.json（tools/xlsx_to_library.py でスプレッドシートから作る。アプリでは読むだけ）
 *  - お気に入り・チェックリスト: data/portal.json（アプリで編集。トークンがあれば GitHub に自動保存） */
(function (root) {
  "use strict";
  const J = root.JD, S = root.JDStore, A = root.A, LS = S.LS, { esc } = J;
  const $ = id => document.getElementById(id);
  const KINDS = ["教科書", "指導書", "重要語句", "漢字", "ワークシート", "授業案", "目標・振返", "雛形", "その他"];
  const WHENS = ["年度初め", "学期初め", "定期考査前", "学期末", "随時"];
  const SEED = [
    ["年度初め", "シラバスを提出する"], ["年度初め", "年間計画を確認・更新する"], ["年度初め", "授業初回アンケートを配信する"],
    ["年度初め", "副教材の手続き（費用・証紙券売機）を確認する"], ["年度初め", "スタディサプリの課題を設定・配信する"],
    ["学期初め", "単元目標・振り返りの雛形をコピーする"], ["学期初め", "授業時間数・計画を更新する"],
    ["定期考査前", "試験範囲を提出・確認する"], ["学期末", "単元ごとの振り返りを書く"]
  ];
  const portal = { sha: null, dirty: false, saving: false, timer: null, token: false };
  A.lib = null; A.portal = null;
  Object.assign(A.ui, { lib: { q: "", kind: "", sec: "", year: "", favOnly: false, mode: "search", ckYear: String(new Date().getFullYear()) } });

  const nfkc = s => String(s == null ? "" : s).normalize("NFKC").toLowerCase();
  const sh = l => { const m = /^【([^】]+)】/.exec(l || ""); return m ? m[1] : (l.length > 16 ? l.slice(0, 16) + "…" : l); };
  const aLink = (u, t, cls, title) => '<a class="' + (cls || "ml") + '" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" title="' + esc(title || t) + '">' + esc(t) + "</a>";

  /* ---------- 読み込み・保存 ---------- */
  function defaultPortal() { return { fav: [], checklist: SEED.map((x, i) => ({ id: "c" + i, when: x[0], text: x[1], done: {} })) }; }
  function normPortal(p) { p = p || {}; p.fav = Array.isArray(p.fav) ? p.fav : []; p.checklist = Array.isArray(p.checklist) ? p.checklist : defaultPortal().checklist; p.checklist.forEach(c => { c.done = c.done || {}; }); return p; }
  async function load() {
    try { const r = await fetch("library/links.json?t=" + Date.now(), { cache: "no-store" }); A.lib = r.ok ? await r.json() : { materials: [], general: [], missing: true }; } catch (e) { A.lib = { materials: [], general: [], missing: true }; }
    try { const r = await fetch("library/textbook.json?t=" + Date.now(), { cache: "no-store" }); { const j = r.ok ? await r.json() : null; A.textbooks = j && j.books ? j.books : (j ? [j] : []); } } catch (e) { A.textbooks = []; }
    if (A.ui.tab === "unit" && A.render) A.render();
    A._items = null;
    const s = S.getSettings(); let text = null; portal.token = !!(s.token && s.owner && s.repo);
    if (portal.token) { try { const r = await S.remoteGet(s, "data/portal.json"); text = r.text; portal.sha = r.sha; } catch (e) { text = null; } }
    else { try { const r = await fetch("data/portal.json?t=" + Date.now(), { cache: "no-store" }); if (r.ok) text = await r.text(); } catch (e) { text = null; } }
    let p = null; try { p = text ? JSON.parse(text) : null; } catch (e) { p = null; }
    let dr = null; try { const raw = LS.get("jd.draft.portal"); dr = raw ? JSON.parse(raw) : null; } catch (e) { dr = null; }
    if (dr && dr.dirty && dr.p) { p = dr.p; portal.dirty = true; }
    A.portal = normPortal(p || defaultPortal());
    if (A.ui.tab === "lib" && A.render) A.render();
    if (portal.dirty && portal.token) flush();
  }
  function pcommit() {
    portal.dirty = true;
    LS.set("jd.draft.portal", JSON.stringify({ p: A.portal, dirty: true }));
    clearTimeout(portal.timer); portal.timer = setTimeout(flush, 1500);
  }
  async function flush() {
    if (!portal.dirty || !portal.token) return;
    if (portal.saving) { clearTimeout(portal.timer); portal.timer = setTimeout(flush, 600); return; }
    portal.saving = true;
    const s = S.getSettings(), snap = JSON.stringify(A.portal);
    const body = J.toJSON(A.portal);
    try {
      let r;
      try { r = await S.remotePut(s, "data/portal.json", body, portal.sha, "お気に入り・チェックリストを更新"); }
      catch (e) {
        if (e.status === 409 || e.status === 422) { let sha = null; try { sha = (await S.remoteGet(s, "data/portal.json")).sha; } catch (x) { sha = null; } r = await S.remotePut(s, "data/portal.json", body, sha, "お気に入り・チェックリストを更新"); }
        else throw e;
      }
      portal.sha = r.sha;
      if (JSON.stringify(A.portal) === snap) { portal.dirty = false; LS.del("jd.draft.portal"); } else { clearTimeout(portal.timer); portal.timer = setTimeout(flush, 300); }
    } catch (e) { A.toast && A.toast("お気に入り・チェックリストを保存できませんでした：" + S.explain(e)); }
    portal.saving = false;
  }

  /* ---------- 検索用の一覧 ---------- */
  function items() {
    if (A._items) return A._items;
    const L = A.lib || { materials: [], general: [] }, out = [];
    L.materials.forEach(m => {
      if (m.url) out.push({ t: m.title, u: m.url, kind: "教材フォルダ", sec: m.section, card: m.title, type: "card" });
      m.links.forEach(l => out.push({ t: l.l, u: l.u, kind: l.k, sec: m.section, card: m.title, note: l.n || "", cat: l.c || "", type: "card" }));
    });
    L.general.forEach(g => out.push({ t: g.t, u: g.u, kind: g.k, sec: g.c || "", card: "", y: g.y, sheet: g.s, type: "year" }));
    out.forEach(x => { x.hay = nfkc([x.t, x.card, x.sec, x.kind, x.y, x.sheet, x.note, x.cat].filter(Boolean).join(" ")); });
    return (A._items = out);
  }
  /* ---------- 過去の授業の記録（全学期）を検索できるようにする ---------- */
  function histRows(st, tname) {
    const out = [];
    (st.classes || []).forEach(c => {
      try {
        J.project(st, c).rows.forEach(r => {
          if (!r.blocks || !r.blocks.length) return;
          const rec = r.rec || {}, units = [];
          r.blocks.forEach(b => { const n = st.units[b.u] ? st.units[b.u].name : ""; if (n && units.indexOf(n) < 0) units.push(n); });
          const text = r.blocks.map(b => b.t).filter(Boolean).join(" ／ ");
          out.push({ date: r.date, term: tname, cls: c.name, unit: units.join("・"), text, memo: rec.n || "", st: rec.s === "done" ? "実施" : rec.s === "part" ? "途中" : "予定",
            hay: nfkc([tname, c.name, units.join(" "), text, rec.n || "", r.date].join(" ")) });
        });
      } catch (e) { /* 壊れた学期は飛ばす */ }
    });
    return out;
  }
  async function loadHist() {
    if (A.hist || A._histLoading) return;
    A._histLoading = true;
    const rows = [];
    try {
      const idx = await (await fetch("data/index.json?t=" + Date.now(), { cache: "no-store" })).json();
      for (const t of (idx.terms || [])) {
        try {
          let st;
          if (A.st && A.st.term.id === t.id) st = A.st;
          else { st = await (await fetch("data/" + t.file + "?t=" + Date.now(), { cache: "no-store" })).json(); ["rec", "off", "flags", "events", "units", "plans", "unitNotes"].forEach(k => { st[k] = st[k] || {}; }); st.classes.forEach(c => { st.plans[c.id] = st.plans[c.id] || []; }); J.migrateUnits(st); }
          histRows(st, t.name).forEach(x => rows.push(x));
        } catch (e) { /* この学期は読めなかった */ }
      }
    } catch (e) { /* 一覧が読めない */ }
    rows.sort((x, y) => x.date < y.date ? 1 : x.date > y.date ? -1 : 0);
    A.hist = rows; A._histLoading = false;
    refreshLib();
  }
  const WD = "日月火水木金土";
  function histPanel(toks) {
    if (!A.hist) { loadHist(); return '<p class="note">過去の授業の記録を読み込んでいます…</p>'; }
    const hit = A.hist.filter(x => toks.every(t => x.hay.indexOf(t) >= 0));
    if (!hit.length) return "";
    const show = hit.slice(0, 100);
    return '<section class="panel p-soon" style="margin-top:12px"><header class="panel-h"><h2>授業の記録（これまでの授業）</h2><span class="panel-n">' + hit.length + "件</span></header><div class=\"panel-b\">" +
      show.map(x => { const d = new Date(x.date + "T00:00:00"); return '<div class="lrow hrow"><div class="hd"><b>' + (d.getMonth() + 1) + "/" + d.getDate() + "</b>（" + WD[d.getDay()] + ") <span class=\"small muted\">" + d.getFullYear() + '</span></div><div class="lmain"><div class="ltags">' + tag(x.term, "t-year") + tag(x.cls, "t-card") + tag(x.unit, "t-sec") + tag(x.st, "t-kind") + '</div><div class="lt2">' + esc(x.text) + "</div>" + (x.memo ? '<div class="lnote">' + esc(x.memo) + "</div>" : "") + "</div></div>"; }).join("") +
      (hit.length > show.length ? '<p class="small muted">先頭の' + show.length + "件を表示しています。言葉を足して絞り込めます。</p>" : "") + "</div></section>";
  }
  const isFav = u => A.portal.fav.indexOf(u) >= 0;
  const star = u => '<button class="star' + (isFav(u) ? " on" : "") + '" data-act="lib-fav" data-u="' + esc(u) + '" aria-pressed="' + isFav(u) + '" title="よく使う（★）に入れる／外す">' + (isFav(u) ? "★" : "☆") + "</button>";
  const tag = (t, cls) => t ? '<span class="tg ' + (cls || "") + '">' + esc(t) + "</span>" : "";
  function row(x) {
    return '<div class="lrow">' + star(x.u) + '<div class="lmain">' + aLink(x.u, x.t, "lt") + '<div class="ltags">' + tag(x.card, "t-card") + tag(x.type === "card" ? x.sec : "", "t-sec") + tag(x.kind, "t-kind") + tag(x.y ? x.y + "年度" : "", "t-year") + tag(x.type === "year" ? x.sheet : "", "t-sheet") + tag(x.type === "year" ? x.sec : "", "t-sec") + "</div>" + (x.note ? '<div class="lnote">' + esc(x.note) + "</div>" : "") + "</div></div>";
  }
  function matCard(m) {
    return '<div class="mcard"><div class="mc-h">' + (m.url ? aLink(m.url, m.title, "mc-t", "この教材のフォルダ／資料を開く") : '<span class="mc-t">' + esc(m.title) + "</span>") + "</div><div class=\"mc-l\">" +
      m.links.map(l => '<span class="mc-i">' + star(l.u) + aLink(l.u, sh(l.l), "lk k-" + KINDS.indexOf(l.k), l.l + (l.n ? "（" + l.n + "）" : "")) + "</span>").join("") + "</div></div>";
  }

  function results() {
    const U = A.ui.lib, L = A.lib;
    if (!L) return '<p class="note">資料を読み込んでいます…</p>';
    if (L.missing) return '<p class="note" style="color:var(--cancel)">資料の一覧（library/links.json）が見つかりません。ZIPの library フォルダも、GitHubにアップロードしてください。</p>';
    const toks = nfkc(U.q).split(/\s+/).filter(Boolean), filtered = toks.length || U.kind || U.sec || U.year || U.favOnly;
    if (!filtered) {
      let h = "";
      const fav = items().filter((x, i, ar) => isFav(x.u) && ar.findIndex(y => y.u === x.u) === i);
      if (fav.length) h += '<section class="panel p-ev"><header class="panel-h"><h2>★ よく使う</h2><span class="panel-n">' + fav.length + '件</span></header><div class="panel-b">' + fav.map(row).join("") + "</div></section>";
      const secs = []; L.materials.forEach(m => { if (secs.indexOf(m.section) < 0) secs.push(m.section); });
      h += '<section class="panel p-soon"><header class="panel-h"><h2>教材カード（単元・教材ごと）</h2><span class="panel-n">' + L.materials.length + "教材</span></header><div class=\"panel-b\">";
      secs.forEach(sc => { const ms = L.materials.filter(m => m.section === sc); h += '<details class="lsec"><summary>' + esc(sc) + ' <span class="small muted">' + ms.length + "</span></summary>" + ms.map(matCard).join("") + "</details>"; });
      h += "</div></section>";
      const ys = []; L.general.forEach(g => { const k = g.y ? g.y + "年度" : g.s; if (ys.indexOf(k) < 0) ys.push(k); });
      h += '<section class="panel p-rem"><header class="panel-h"><h2>年度別・そのほかのリンク</h2><span class="panel-n">' + L.general.length + "件</span></header><div class=\"panel-b\">";
      ys.forEach(k => { const gs = L.general.filter(g => (g.y ? g.y + "年度" : g.s) === k); h += '<details class="lsec"><summary>' + esc(k) + ' <span class="small muted">' + gs.length + "</span></summary>" + gs.map(g => row({ t: g.t, u: g.u, kind: g.k, sec: g.c || "", y: g.y, sheet: g.s, type: "year" })).join("") + "</details>"; });
      return h + "</div></section>";
    }
    const list = items().filter(x => toks.every(t => x.hay.indexOf(t) >= 0) && (!U.kind || x.kind === U.kind) && (!U.sec || x.sec === U.sec) && (!U.year || x.y === U.year) && (!U.favOnly || isFav(x.u)));
    const uniq = list.filter((x, i, ar) => ar.findIndex(y => y.u === x.u && y.t === x.t) === i), show = uniq.slice(0, 150);
    const hist = toks.length && !U.kind && !U.sec && !U.year && !U.favOnly ? histPanel(toks) : "";
    return '<p class="note" style="margin:0 0 6px"><b>' + uniq.length + "件</b>見つかりました" + (uniq.length > show.length ? "（先頭の" + show.length + "件を表示。言葉を足して絞り込めます）" : "") + "</p>" + (show.length ? show.map(row).join("") : "") + hist;
  }

  /* ---------- 画面 ---------- */
  function viewLib() {
    const U = A.ui.lib;
    let h = '<div class="seg" style="margin-bottom:10px"><button data-act="lib-mode" data-v="search" aria-pressed="' + (U.mode === "search") + '">資料をさがす</button><button data-act="lib-mode" data-v="check" aria-pressed="' + (U.mode === "check") + '">準備チェックリスト</button><button data-act="lib-mode" data-v="cmp" aria-pressed="' + (U.mode === "cmp") + '">単元を年度で比べる</button></div>';
    if (!A.portal) return h + '<p class="note">読み込んでいます…</p>';
    if (U.mode === "check") return h + checklist();
    if (U.mode === "cmp") return h + cmpView();
    const L = A.lib || { materials: [], general: [] };
    const secs = [], yrs = []; L.materials.forEach(m => { if (secs.indexOf(m.section) < 0) secs.push(m.section); }); L.general.forEach(g => { if (g.y && yrs.indexOf(g.y) < 0) yrs.push(g.y); });
    yrs.sort().reverse();
    const sel = (act, val, opts, all) => '<select aria-label="' + all + '" data-act="lib-f" data-f="' + act + '"><option value="">' + all + "</option>" + opts.map(o => '<option value="' + esc(o) + '"' + (o === val ? " selected" : "") + ">" + esc(act === "year" ? o + "年度" : o) + "</option>").join("") + "</select>";
    h += '<div class="lbar"><input type="search" id="lib_q" class="lq" data-act="lib-q" placeholder="資料をさがす（例：水の東西　漢字　シラバス　羅生門）" value="' + esc(U.q) + '" autocomplete="off">' +
      '<div class="lfilters">' + sel("kind", U.kind, KINDS, "すべての種類") + sel("sec", U.sec, secs, "すべての教材区分") + sel("year", U.year, yrs, "すべての年度") +
      '<label class="lfav"><input type="checkbox" data-act="lib-f" data-f="fav"' + (U.favOnly ? " checked" : "") + '> ★だけ</label><button class="btn" data-act="lib-clear">クリア</button></div></div>';
    h += '<p class="small" style="margin:0 0 8px">言葉を空白で区切ると、すべてを含む資料だけに絞れます。過去の授業の記録（去年の授業など）も、同じ検索で見つかります。★を押すと、「よく使う」としてこの画面の一番上に出ます。資料の元になったスプレッドシートは、そのまま残します（リンク一覧：' + esc((A.lib && A.lib.built) || "—") + ' 作成）。</p>';
    return h + '<div id="libres">' + results() + "</div>";
  }
  function checklist() {
    const U = A.ui.lib, yr = U.ckYear, P = A.portal, now = new Date().getFullYear();
    const years = []; for (let y = now + 1; y >= 2023; y--) years.push(String(y));
    if (years.indexOf(yr) < 0) years.push(yr);
    const done = P.checklist.filter(c => c.done[yr]).length;
    let h = '<div class="lbar"><label class="small" for="ck_year" style="margin:0 8px 0 0">年度</label><select id="ck_year" data-act="ck-year" style="width:auto">' + years.map(y => '<option value="' + y + '"' + (y === yr ? " selected" : "") + ">" + y + "年度</option>").join("") + "</select>" +
      '<span class="ckprog">' + done + " / " + P.checklist.length + " 完了</span></div>" +
      '<p class="small" style="margin:6px 0 10px">年度ごとにチェックを付けられます（来年度は、新しい年度を選ぶと、チェックのないリストに戻ります）。はじめに入っているのは例です。自由に直したり、足したり、消したりできます。</p>';
    WHENS.concat(P.checklist.map(c => c.when).filter(w => WHENS.indexOf(w) < 0).filter((w, i, a) => a.indexOf(w) === i)).forEach(w => {
      const cs = P.checklist.filter(c => c.when === w); if (!cs.length) return;
      h += '<section class="panel"><header class="panel-h"><h2>' + esc(w) + '</h2><span class="panel-n">' + cs.filter(c => c.done[yr]).length + " / " + cs.length + '</span></header><div class="panel-b">' +
        cs.map(c => '<div class="ckrow' + (c.done[yr] ? " done" : "") + '"><input type="checkbox" aria-label="完了" data-act="ck-done" data-id="' + esc(c.id) + '"' + (c.done[yr] ? " checked" : "") + '><input type="text" class="ckt" aria-label="内容" data-act="ck-t" data-id="' + esc(c.id) + '" value="' + esc(c.text) + '">' +
          '<select aria-label="時期" data-act="ck-w" data-id="' + esc(c.id) + '">' + WHENS.map(x => '<option' + (x === c.when ? " selected" : "") + ">" + x + "</option>").join("") + '</select><input type="url" class="cku" aria-label="リンク（任意）" placeholder="リンク（任意）" data-act="ck-u" data-id="' + esc(c.id) + '" value="' + esc(c.u || "") + '">' +
          (c.u ? aLink(c.u, "開く", "ml") : "") + '<button class="btn sm danger" data-act="ck-del" data-id="' + esc(c.id) + '" aria-label="削除">削除</button></div>').join("") + "</div></section>";
    });
    return h + '<section class="panel p-ev"><header class="panel-h"><h2>項目を追加</h2></header><div class="panel-b"><div class="ckrow"><input type="text" id="ck_new_t" class="ckt" placeholder="例：初回アンケートを配信する" aria-label="追加する内容"><select id="ck_new_w" aria-label="時期">' + WHENS.map(x => "<option>" + x + "</option>").join("") + '</select><input type="url" id="ck_new_u" class="cku" placeholder="リンク（任意）" aria-label="リンク（任意）"><button class="btn on" data-act="ck-add">追加</button></div></div></section>';
  }

  /* ---------- 単元の教材に、資料を取り込む（単元別タブから使う） ---------- */
  function matPicker(u, i) {
    const L = A.lib; if (!L || !L.materials || !L.materials.length) return "";
    const secs = []; L.materials.forEach(m => { if (secs.indexOf(m.section) < 0) secs.push(m.section); });
    return '<div class="matpick"><label class="small" for="mp_' + u + i + '">資料集の教材から、リンクをまとめて入れる</label><select id="mp_' + u + i + '" data-act="mat-pick" data-u="' + u + '" data-i="' + i + '"><option value="">選んでください…</option>' +
      secs.map(sc => '<optgroup label="' + esc(sc) + '">' + L.materials.map((m, k) => m.section === sc ? '<option value="' + k + '">' + esc(m.title) + " （" + m.links.length + "）</option>" : "").join("") + "</optgroup>").join("") + "</select></div>";
  }
  function matExtra(u, i) {
    const x = (((A.st.units[u] || {}).mats || [])[i] || {}).x || [];
    return '<div class="matx">' + (x.length ? '<div class="small" style="margin:6px 0 2px">そのほかのリンク</div>' + x.map((e, j) => '<div class="mxrow">' + aLink(e.u, e.l, "ml") + '<button class="btn sm" data-act="mat-xdel" data-u="' + u + '" data-i="' + i + '" data-j="' + j + '" aria-label="外す">外す</button></div>').join("") : "") +
      '<div class="mxadd"><input type="text" id="xl_' + u + i + '" placeholder="リンクの名前（例：重要語句）" aria-label="リンクの名前"><input type="url" id="xu_' + u + i + '" placeholder="https://…" aria-label="リンクのアドレス"><button class="btn" data-act="mat-xadd" data-u="' + u + '" data-i="' + i + '">リンクを追加</button></div></div>';
  }

  /* ---------- 過去の学期の同じ単元の実績（単元別タブに自動で出す） ---------- */
  const normName = x => nfkc(x).replace(/[「」『』（）()・\s　]/g, "");
  async function loadPast() {
    if (A.past || A._pastLoading) return;
    A._pastLoading = true;
    const out = [];
    try {
      const idx = await (await fetch("data/index.json?t=" + Date.now(), { cache: "no-store" })).json();
      for (const t of (idx.terms || [])) {
        if (A.st && A.st.term.id === t.id) continue;
        try {
          const st = await (await fetch("data/" + t.file + "?t=" + Date.now(), { cache: "no-store" })).json();
          ["rec", "off", "flags", "events", "units", "plans", "unitNotes"].forEach(k => { st[k] = st[k] || {}; });
          st.classes.forEach(c => { st.plans[c.id] = st.plans[c.id] || []; });
          J.migrateUnits(st); out.push({ name: t.name, st });
        } catch (e) { /* 読めない学期は飛ばす */ }
      }
    } catch (e) { /* 一覧が読めない */ }
    A.past = out; A._pastLoading = false;
    if ((A.ui.tab === "unit" || (A.ui.tab === "lib" && A.ui.lib.mode === "cmp")) && A.render) A.render();
  }
  function pastHtml(u) {
    const un = A.st.units[u]; if (!un) return "";
    const key = normName(un.pastKey || un.name);
    let h = '<div class="prevbox pastbox"><b>過去の学期の同じ単元（自動）</b>';
    if (!A.past) { loadPast(); return h + '<p class="small muted" style="margin:4px 0 0">読み込んでいます…</p></div>'; }
    const rows = [];
    A.past.forEach(P => Object.keys(P.st.units).forEach(pu => {
      const n = normName(P.st.units[pu].name);
      if (!key || !n || (n !== key && n.indexOf(key) < 0 && key.indexOf(n) < 0)) return;
      P.st.classes.forEach(c => {
        const x = J.unitStats(P.st, c, pu);
        if (x.planned || x.actual) rows.push({ term: P.name, unit: P.st.units[pu].name, cls: c.name, hrs: x.actual || x.planned, st: x });
      });
    }));
    if (!rows.length) return h + '<p class="small muted" style="margin:4px 0 0">同じ名前の単元は、過去の学期にはありません。名前が違うだけのときは、下の「過去の記録をさがす言葉」に、去年の単元名の一部を入れてください。</p>' + pastKeyInput(u, un) + "</div>";
    const hrsAll = rows.map(r => r.hrs), avg = Math.round(hrsAll.reduce((a, b) => a + b, 0) / hrsAll.length * 10) / 10;
    h += '<ul style="margin:6px 0 0;padding-left:18px">' + rows.map(r => "<li>" + esc(r.term) + "　" + esc(r.cls) + "（" + esc(r.unit) + "）：<b>" + r.hrs + "時間</b>" + (r.st.start ? '<span class="small muted">　' + md2(r.st.start) + "〜" + md2(r.st.end) + "</span>" : "") + "</li>").join("") + "</ul>" +
      '<p class="small" style="margin:6px 0 0">クラスの平均は <b>' + avg + "時間</b>です。計画を立てるときの目安にしてください。</p>";
    return h + pastKeyInput(u, un) + "</div>";
  }
  const md2 = d => { const x = new Date(d + "T00:00:00"); return (x.getMonth() + 1) + "/" + x.getDate(); };
  const pastKeyInput = (u, un) => '<label class="small" for="pk_' + u + '" style="margin-top:6px">過去の記録をさがす言葉（名前が違うときだけ。空なら単元名で自動）</label><input type="text" id="pk_' + u + '" data-act="un-pk" data-id="' + u + '" value="' + esc(un.pastKey || "") + '" placeholder="例：納得の構造">';
  /* ---------- 同じ単元を、学期・年度で並べて比べる ---------- */
  function termYear(id, name) { const m = /^(\d{4})/.exec(id || "") || /(\d{4})/.exec(name || ""); return m ? m[1] + "年度" : ""; }
  function cmpIndex() {
    const terms = (A.past || []).map(P => ({ id: P.st.term.id, name: P.name, st: P.st })).concat([{ id: A.st.term.id, name: A.st.term.name, st: A.st, cur: true }]);
    const map = {};
    terms.forEach(T => Object.keys(T.st.units).forEach(u => {
      const un = T.st.units[u], key = normName(un.name); if (!key) return;
      const occ = [];
      T.st.classes.forEach(c => {
        const x = J.unitStats(T.st, c, u); if (!(x.planned || x.actual)) return;
        const rows = []; J.project(T.st, c).rows.forEach(r => r.blocks.forEach(b => { if (b.u === u) rows.push({ date: r.date, text: b.t, done: r.kind === "done" || r.kind === "part" }); }));
        occ.push({ cls: c.name, hrs: x.actual || x.planned, planned: x.planned, actual: x.actual, start: x.start, end: x.end, rows });
      });
      if (!occ.length) return;
      const e = map[key] = map[key] || { key, name: un.name, mats: un.mats || [], tb: un.tb || "", terms: [] };
      if (!e.mats.length && (un.mats || []).length) { e.mats = un.mats; e.tb = un.tb || e.tb; }
      e.terms.push({ id: T.id, name: T.name, cur: !!T.cur, occ });
    }));
    return Object.keys(map).map(k => map[k]).sort((x, y) => y.terms.length - x.terms.length || (x.name < y.name ? -1 : 1));
  }
  function cmpView() {
    if (!A.past) { loadPast(); return '<p class="note">過去の学期を読み込んでいます…</p>'; }
    const idx = cmpIndex(), U = A.ui.lib;
    const mseg = '<div class="seg" style="margin-bottom:10px"><button data-act="cmp-mode" data-v="same" aria-pressed="' + (U.cmpMode !== "multi") + '">同じ単元を、学期で比べる</button><button data-act="cmp-mode" data-v="multi" aria-pressed="' + (U.cmpMode === "multi") + '">違う単元を、横に並べて比べる</button></div>';
    if (U.cmpMode === "multi") return mseg + cmpMulti(idx);
    if (!idx.length) return mseg + '<p class="note">比べられる単元がまだありません。</p>';
    if (!U.cmp || !idx.some(e => e.key === U.cmp)) U.cmp = idx[0].key;
    const cur = idx.find(e => e.key === U.cmp);
    let h = mseg + '<p class="small" style="margin:0 0 8px">同じ名前の単元を、学期・年度ごとに並べて見られます。いくつの学期にあるかが多い順に並んでいます。単元の名前が違うと別の単元として数えるので、名前をそろえておくと比べやすくなります。</p>';
    h += '<div class="lbar"><select id="cmp_u" data-act="cmp-u" aria-label="単元を選ぶ" style="flex:1;min-width:0">' + idx.map(e => '<option value="' + esc(e.key) + '"' + (e.key === U.cmp ? " selected" : "") + ">" + esc(e.name) + "（" + e.terms.length + "学期：" + esc(e.terms.map(t => termYear(t.id, t.name)).filter((x, i, a) => a.indexOf(x) === i).join("・")) + "）</option>").join("") + "</select></div>";
    const part = t => /月分/.test(t.name), all = []; cur.terms.forEach(t => { if (!part(t)) t.occ.forEach(o => all.push(o.hrs)); });
    const avg = all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length * 10) / 10 : 0;
    h += '<section class="panel p-soon"><header class="panel-h"><h2>' + esc(cur.name) + '</h2><span class="panel-n">' + cur.terms.length + "学期</span></header><div class=\"panel-b\">" +
      (cur.mats.length ? '<p class="small" style="margin:0 0 6px"><b>教材：</b>' + esc(cur.mats.map(m => m.n).filter(Boolean).join("　／　")) + (cur.tb ? '<span class="muted">　（' + esc(cur.tb) + "）</span>" : "") + "</p>" : "") +
      '<div class="tscroll"><table class="tbl"><thead><tr><th>学期</th><th>クラス</th><th>かけた時間</th><th>期間</th></tr></thead><tbody>' +
      cur.terms.map(t => t.occ.map(o => "<tr><td>" + esc(t.name) + (t.cur ? ' <span class="small muted">（今学期）</span>' : "") + (part(t) ? ' <span class="small" style="color:var(--part)">※一部の月だけの記録</span>' : "") + "</td><td>" + esc(o.cls) + "</td><td><b>" + o.hrs + "時間</b>" + (o.actual !== o.planned && o.planned ? '<span class="small muted">（計画 ' + o.planned + "）</span>" : "") + "</td><td>" + (o.start ? md2(o.start) + "〜" + md2(o.end) : "−") + "</td></tr>").join("")).join("") +
      '</tbody></table></div><p class="small" style="margin:6px 0 0">' + (all.length ? "クラスの平均は <b>" + avg + "時間</b>です" : "平均を出せる学期がまだありません") + (cur.terms.some(part) ? "（一部の月だけの記録の学期は、平均に入れていません）" : "") + "。</p></div></section>";
    h += '<div class="cmpgrid">' + cur.terms.map(t => '<section class="cmpcol"><h3>' + esc(t.name) + (t.cur ? ' <span class="small muted">（今学期）</span>' : "") + "</h3>" +
      t.occ.map(o => '<details class="lsec"' + (cur.terms.length <= 2 && t.occ.length === 1 ? " open" : "") + "><summary>" + esc(o.cls) + ' <span class="small muted">' + o.hrs + "時間・" + o.rows.length + "コマ</span></summary>" +
        '<ol class="cmpl">' + o.rows.map(r => '<li><span class="cd">' + md2(r.date) + '</span><span class="ct">' + esc(r.text) + "</span></li>").join("") + "</ol></details>").join("") + "</section>").join("") + "</div>";
    return h;
  }
  /* ---------- 違う単元を2〜3つ、横に並べて比べる（これからやる単元を選ぶとき用） ---------- */
  function tbIndex() {
    const out = {};
    (A.textbooks || []).forEach(B => {
      const flat = []; B.parts.forEach(P => P.units.forEach(u => flat.push({ B, P, u })));
      const start = x => { const ps = x.u.mats.concat(x.u.manabi ? [x.u.manabi] : [], x.u.extra || []).map(m => m.p).filter(Boolean); return ps.length ? Math.min.apply(null, ps) : null; };
      flat.forEach((x, i) => {
        const st = start(x), nx = flat.slice(i + 1).map(start).find(v => v);
        out[normName(x.u.name)] = { book: B.book, part: x.P.part, no: x.u.no, u: x.u, pages: st && nx && nx > st ? nx - st : null };
      });
    });
    return out;
  }
  function cmpMulti(idx) {
    const U = A.ui.lib, tb = tbIndex(), hist = {}; idx.forEach(e => { hist[e.key] = e; });
    const ents = {};
    Object.keys(hist).forEach(k => { ents[k] = { key: k, name: hist[k].name }; });
    Object.keys(tb).forEach(k => { if (!ents[k]) ents[k] = { key: k, name: tb[k].u.name }; });
    const list = Object.keys(ents).map(k => ents[k]);
    const done = list.filter(e => hist[e.key]).sort((a, b) => hist[b.key].terms.length - hist[a.key].terms.length || (a.name < b.name ? -1 : 1));
    const fresh = list.filter(e => !hist[e.key]);
    U.cmpSel = (U.cmpSel || []).filter(k => ents[k]);
    while (U.cmpSel.length < 3) U.cmpSel.push("");
    const opt = (cur) => '<option value="">（選ばない）</option>' + (done.length ? '<optgroup label="これまでにやった単元">' + done.map(e => '<option value="' + esc(e.key) + '"' + (e.key === cur ? " selected" : "") + ">" + esc(e.name) + "</option>").join("") + "</optgroup>" : "") +
      (fresh.length ? '<optgroup label="教科書の目次（まだやっていない）">' + fresh.map(e => '<option value="' + esc(e.key) + '"' + (e.key === cur ? " selected" : "") + ">" + esc(e.name) + "</option>").join("") + "</optgroup>" : "");
    let h = '<p class="small" style="margin:0 0 8px">2つか3つの単元を選ぶと、教材・ページ数・これまでかかった時間などを横に並べます。これからどの単元をやるか決めるときに使ってください。</p><div class="cmpsel">' +
      [0, 1, 2].map(i => '<select data-act="cmp-s" data-i="' + i + '" aria-label="単元' + (i + 1) + '">' + opt(U.cmpSel[i]) + "</select>").join("") + "</div>";
    const sel = U.cmpSel.filter(Boolean);
    if (sel.length < 2) return h + '<p class="note">単元を2つ以上選んでください。</p>';
    const part = t => /月分/.test(t.name);
    const cols = sel.map(k => {
      const t = tb[k], e = hist[k], hrs = [], terms = [];
      if (e) e.terms.forEach(T => { if (!part(T)) T.occ.forEach(o => hrs.push(o.hrs)); if (terms.indexOf(T.name) < 0) terms.push(T.name); });
      return { k, name: ents[k].name, t, e, hrs, terms };
    });
    const row = (label, f) => "<tr><th scope=\"row\">" + label + "</th>" + cols.map(c => "<td>" + (f(c) || '<span class="muted">−</span>') + "</td>").join("") + "</tr>";
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
    h += '<div class="tscroll"><table class="tbl cmptbl"><thead><tr><th></th>' + cols.map(c => "<th>" + esc(c.name) + "</th>").join("") + "</tr></thead><tbody>" +
      row("教科書", c => c.t ? esc(c.t.book) + "<br>" + esc(c.t.part + (c.t.no ? " " + c.t.no : "")) : "") +
      row("領域", c => c.t ? esc(c.t.u.mode || "") : "") +
      row("教材（筆者・ページ）", c => c.t ? "<ul class=\"cmpul\">" + c.t.u.mats.map(m => "<li>" + esc(m.n) + '<span class="small muted">' + (m.by ? "　" + esc(m.by) : "") + (m.p ? "　p." + m.p : "") + "</span></li>").join("") + "</ul>" : (c.e && c.e.mats.length ? esc(c.e.mats.map(m => m.n).join("／")) : "")) +
      row("学びを広げる・ズームアップ", c => c.t ? [c.t.u.manabi ? "学びを広げる：" + esc(c.t.u.manabi.n) : ""].concat((c.t.u.extra || []).map(x => esc(x.k + "：" + x.n))).filter(Boolean).join("<br>") : "") +
      row("教科書のページ数", c => c.t && c.t.pages ? "約" + c.t.pages + "ページ" : "") +
      row("教材の数", c => c.t ? c.t.u.mats.length + "つ" : (c.e && c.e.mats.length ? c.e.mats.length + "つ" : "")) +
      row("これまでにやった回数", c => c.e ? c.terms.length + "学期（" + esc(c.terms.map(n => n.replace(/（.*）/, "")).join("、")) + "）" : "まだやっていない") +
      row("かかった時間（平均）", c => avg(c.hrs) != null ? "<b>" + avg(c.hrs) + "時間</b>" : "") +
      row("かかった時間（幅）", c => c.hrs.length ? Math.min.apply(null, c.hrs) + "〜" + Math.max.apply(null, c.hrs) + "時間" : "") +
      row("クラスごとの実績", c => c.e ? c.e.terms.map(T => T.occ.map(o => '<div class="small">' + esc(T.name.replace(/（.*）/, "")) + "　" + esc(o.cls) + "：" + o.hrs + "時間" + (part(T) ? "（一部の月）" : "") + "</div>").join("")).join("") : "") +
      row("今学期（2026年度）", c => { const T = c.e && c.e.terms.find(x => x.cur); return T ? T.occ.map(o => '<div class="small">' + esc(o.cls) + "：計画" + o.planned + "・実施" + o.actual + "時間</div>").join("") : ""; }) +
      row("過去の授業の流れ（例）", c => { const T = c.e && c.e.terms.filter(x => !x.cur).slice(-1)[0], o = T && T.occ[0]; return o ? '<details><summary class="small">' + esc(T.name.replace(/（.*）/, "") + "　" + o.cls) + "（" + o.rows.length + "コマ）</summary><ol class=\"cmpl\">" + o.rows.map(r => '<li><span class="cd">' + md2(r.date) + '</span><span class="ct">' + esc(r.text) + "</span></li>").join("") + "</ol></details>" : ""; }) +
      "</tbody></table></div>";
    return h;
  }
  /* 教科書の目次から単元を追加する（単元別タブの「単元を追加」の下に出す） */
  function tbPicker() {
    const books = A.textbooks; if (!books || !books.length) return "";
    let opts = '<option value="">教科書の単元を選ぶ…</option>';
    books.forEach((B, bi) => B.parts.forEach((P, pi) => { opts += '<optgroup label="' + esc(B.book + "　" + P.part) + '">' + P.units.map((u, ui) => '<option value="' + bi + ":" + pi + ":" + ui + '">' + esc((u.no ? u.no + "　" : "") + u.name + "（" + u.mats.map(m => m.n).join("・") + "）") + "</option>").join("") + "</optgroup>"; }));
    return '<div class="addrow" style="grid-template-columns:1fr 160px auto;margin-top:8px"><select id="tb_unit" aria-label="教科書の単元">' + opts + '</select><select id="tb_subj" aria-label="科目"><option value="">共通</option>' + subjectNames().map(x => '<option value="' + esc(x) + '">' + esc(x) + "</option>").join("") + '</select><button class="btn on" data-act="tb-add">目次から追加</button></div>' +
      '<p class="small muted" style="margin:4px 0 0">' + esc(books.map(b => b.book).join("・")) + "の目次です。単元名と教材名が自動で入ります。</p>";
  }
  const subjectNames = () => { const o = []; (A.st.classes || []).forEach(c => { const x = J.subjectOf(c); if (x && o.indexOf(x) < 0) o.push(x); }); return o; };
  A.views.tbPicker = tbPicker;
  A.views.past = pastHtml;
  A.views.lib = viewLib;
  A.views.libResults = results;
  A.views.matPicker = matPicker;
  A.views.matExtra = matExtra;
  A.shortLabel = sh;

  /* ---------- 操作 ---------- */
  function refreshLib() { const r = $("libres"); if (r) r.innerHTML = results(); }
  function ensureMat(u, i) { const un = A.st.units[u]; if (!un) return null; const m = un.mats = un.mats || []; while (m.length < 6) m.push({}); return m[i]; }
  function trimMats(u) { const un = A.st.units[u], m = un.mats || []; while (m.length && !Object.keys(m[m.length - 1]).length) m.pop(); if (!m.length) delete un.mats; }

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const a = t.dataset.act, id = t.dataset.id;
    switch (a) {
      case "lib-mode": A.ui.lib.mode = t.dataset.v; A.render(); break;
      case "cmp-mode": A.ui.lib.cmpMode = t.dataset.v; A.render(); break;
      case "lib-clear": Object.assign(A.ui.lib, { q: "", kind: "", sec: "", year: "", favOnly: false }); A.render(); break;
      case "lib-fav": { const u = t.dataset.u, i = A.portal.fav.indexOf(u); if (i >= 0) A.portal.fav.splice(i, 1); else A.portal.fav.push(u); pcommit(); A.render(); break; }
      case "ck-del": { const c = A.portal.checklist; const i = c.findIndex(x => x.id === id); if (i >= 0 && root.confirm("「" + c[i].text + "」を消しますか？")) { c.splice(i, 1); pcommit(); A.render(); } break; }
      case "ck-add": {
        const tx = $("ck_new_t").value.trim(), u = $("ck_new_u").value.trim();
        if (!tx) { A.toast("内容を入れてください"); break; }
        if (u && !/^https?:\/\//i.test(u)) { A.toast("リンクは https:// から始まるアドレスを入れてください"); break; }
        const it = { id: "c" + Date.now().toString(36), when: $("ck_new_w").value, text: tx, done: {} }; if (u) it.u = u;
        A.portal.checklist.push(it); pcommit(); A.render(); break;
      }
      case "mat-xdel": { const m = ensureMat(t.dataset.u, Number(t.dataset.i)); if (m && m.x) { m.x.splice(Number(t.dataset.j), 1); if (!m.x.length) delete m.x; trimMats(t.dataset.u); A.commit(); } break; }
      case "mat-xadd": {
        const u = t.dataset.u, i = Number(t.dataset.i), l = $("xl_" + u + i).value.trim(), url = $("xu_" + u + i).value.trim();
        if (!url || !/^https?:\/\//i.test(url)) { A.toast("https:// から始まるアドレスを入れてください"); break; }
        const m = ensureMat(u, i); (m.x = m.x || []).push({ l: l || url, u: url }); A.commit(); break;
      }
    }
  });
  document.addEventListener("change", e => {
    const t = e.target, a = t.dataset && t.dataset.act, v = t.value; if (!a) return;
    if (a === "lib-f") { const f = t.dataset.f; if (f === "fav") A.ui.lib.favOnly = t.checked; else A.ui.lib[f] = v; refreshLib(); return; }
    if (a === "cmp-u") { A.ui.lib.cmp = v; A.render(); return; }
    if (a === "cmp-s") { (A.ui.lib.cmpSel = A.ui.lib.cmpSel || ["", "", ""])[Number(t.dataset.i)] = v; A.render(); return; }
    if (a === "ck-year") { A.ui.lib.ckYear = v; A.render(); return; }
    const ck = id => A.portal.checklist.find(x => x.id === id);
    if (a === "ck-done") { const c = ck(t.dataset.id); if (c) { if (t.checked) c.done[A.ui.lib.ckYear] = true; else delete c.done[A.ui.lib.ckYear]; pcommit(); A.render(); } return; }
    if (a === "ck-t") { const c = ck(t.dataset.id); if (c && v.trim()) { c.text = v.trim(); pcommit(); } return; }
    if (a === "ck-w") { const c = ck(t.dataset.id); if (c) { c.when = v; pcommit(); A.render(); } return; }
    if (a === "ck-u") { const c = ck(t.dataset.id); if (c) { if (v.trim() && !/^https?:\/\//i.test(v.trim())) { A.toast("https:// から始まるアドレスを入れてください"); return; } if (v.trim()) c.u = v.trim(); else delete c.u; pcommit(); A.render(); } return; }
    if (a === "mat-pick") {
      const L = A.lib, card = L && L.materials[Number(v)]; if (!card || v === "") return;
      const u = t.dataset.u, i = Number(t.dataset.i), m = ensureMat(u, i); if (!m) return;
      if (!m.n) m.n = card.title.replace(/^\d+\s*/, "");
      const have = {}; ["d", "t", "g", "p1", "p2", "p3"].forEach(k => { if (m[k]) have[m[k]] = 1; }); (m.x || []).forEach(e2 => { have[e2.u] = 1; });
      m.x = m.x || [];
      if (card.url && !have[card.url]) { m.x.push({ l: "教材フォルダ", u: card.url }); have[card.url] = 1; }
      card.links.forEach(l => { if (!have[l.u]) { m.x.push({ l: l.l, u: l.u }); have[l.u] = 1; } });
      if (!m.x.length) delete m.x;
      A.commit(); A.toast("「" + card.title + "」のリンクを入れました"); return;
    }
  });
  document.addEventListener("input", e => {
    const t = e.target, a = t.dataset && t.dataset.act;
    if (a === "lib-q") { A.ui.lib.q = t.value; refreshLib(); }
    else if (a === "ck-t") { const c = A.portal.checklist.find(x => x.id === t.dataset.id); if (c && t.value.trim()) { c.text = t.value.trim(); pcommit(); } }
  });
  window.addEventListener("beforeunload", () => { if (portal.dirty && portal.token) flush(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && portal.dirty) { clearTimeout(portal.timer); flush(); } });

  load();
})(window);
