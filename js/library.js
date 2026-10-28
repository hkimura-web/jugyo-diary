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
    return '<p class="note" style="margin:0 0 6px"><b>' + uniq.length + "件</b>見つかりました" + (uniq.length > show.length ? "（先頭の" + show.length + "件を表示。言葉を足して絞り込めます）" : "") + "</p>" + (show.length ? show.map(row).join("") : "");
  }

  /* ---------- 画面 ---------- */
  function viewLib() {
    const U = A.ui.lib;
    let h = '<div class="seg" style="margin-bottom:10px"><button data-act="lib-mode" data-v="search" aria-pressed="' + (U.mode === "search") + '">資料をさがす</button><button data-act="lib-mode" data-v="check" aria-pressed="' + (U.mode === "check") + '">準備チェックリスト</button></div>';
    if (!A.portal) return h + '<p class="note">読み込んでいます…</p>';
    if (U.mode === "check") return h + checklist();
    const L = A.lib || { materials: [], general: [] };
    const secs = [], yrs = []; L.materials.forEach(m => { if (secs.indexOf(m.section) < 0) secs.push(m.section); }); L.general.forEach(g => { if (g.y && yrs.indexOf(g.y) < 0) yrs.push(g.y); });
    yrs.sort().reverse();
    const sel = (act, val, opts, all) => '<select aria-label="' + all + '" data-act="lib-f" data-f="' + act + '"><option value="">' + all + "</option>" + opts.map(o => '<option value="' + esc(o) + '"' + (o === val ? " selected" : "") + ">" + esc(act === "year" ? o + "年度" : o) + "</option>").join("") + "</select>";
    h += '<div class="lbar"><input type="search" id="lib_q" class="lq" data-act="lib-q" placeholder="資料をさがす（例：水の東西　漢字　シラバス　羅生門）" value="' + esc(U.q) + '" autocomplete="off">' +
      '<div class="lfilters">' + sel("kind", U.kind, KINDS, "すべての種類") + sel("sec", U.sec, secs, "すべての教材区分") + sel("year", U.year, yrs, "すべての年度") +
      '<label class="lfav"><input type="checkbox" data-act="lib-f" data-f="fav"' + (U.favOnly ? " checked" : "") + '> ★だけ</label><button class="btn" data-act="lib-clear">クリア</button></div></div>';
    h += '<p class="small" style="margin:0 0 8px">言葉を空白で区切ると、すべてを含む資料だけに絞れます。★を押すと、「よく使う」としてこの画面の一番上に出ます。資料の元になったスプレッドシートは、そのまま残します（リンク一覧：' + esc((A.lib && A.lib.built) || "—") + ' 作成）。</p>';
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

  A.views.lib = viewLib;
  A.views.libResults = results;
  A.views.matPicker = matPicker;
  A.views.matExtra = matExtra;
  A.shortLabel = sh;

  /* ---------- 操作 ---------- */
  function refreshLib() { const r = $("libres"); if (r) r.innerHTML = results(); }
  function ensureMat(u, i) { const un = A.st.units[u]; if (!un) return null; const m = un.mats = un.mats || []; while (m.length < 4) m.push({}); return m[i]; }
  function trimMats(u) { const un = A.st.units[u], m = un.mats || []; while (m.length && !Object.keys(m[m.length - 1]).length) m.pop(); if (!m.length) delete un.mats; }

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const a = t.dataset.act, id = t.dataset.id;
    switch (a) {
      case "lib-mode": A.ui.lib.mode = t.dataset.v; A.render(); break;
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
