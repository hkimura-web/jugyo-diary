/* 授業ダイアリー: 起動・保存・操作 */
(function () {
  "use strict";
  const J = window.JD, S = window.JDStore, A = window.A, LS = S.LS;
  const $ = id => document.getElementById(id);
  let terms = [], term = null, sha = null, mode = "local";
  let dirty = false, saving = false, ver = 0, timer = null, banner = null;

  const stamp = () => { const d = new Date(); return J.ds(d) + " " + J.pad(d.getHours()) + ":" + J.pad(d.getMinutes()); };
  function normalize(st) {
    ["rec", "off", "flags", "events", "units", "plans", "unitNotes"].forEach(k => { st[k] = st[k] || {}; });
    st.classes.forEach(c => { st.plans[c.id] = st.plans[c.id] || []; });
    return st;
  }
  function clampAsof() {
    const t = A.st.term, today = J.ds(new Date());
    A.ui.asof = today < t.start ? t.start : today > t.end ? t.end : today;
  }
  function toast(t) {
    const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d);
    setTimeout(() => d.remove(), 2400);
  }

  /* ---------- 表示 ---------- */
  function renderStatus() {
    let dot = "", txt = "";
    if (mode === "github") {
      if (saving) { dot = "warn"; txt = "GitHubに保存中…"; }
      else if (dirty) { dot = "warn"; txt = "変更あり（まもなくGitHubに保存します）"; }
      else { dot = "ok"; txt = "GitHubに保存済み"; }
    } else if (dirty) { dot = "warn"; txt = "この端末に下書き保存中（GitHubには保存されていません）"; }
    else { dot = ""; txt = "閲覧モード：右上の「設定」でGitHubを接続すると、記録を保存できます"; }
    $("status").innerHTML = '<span><span class="dot ' + dot + '"></span>' + J.esc(txt) + "</span>";
  }
  function renderBanner() {
    const b = banner;
    $("banner").innerHTML = b ? '<div class="banner' + (b.err ? " err" : "") + '"><div>' + J.esc(b.msg) + '</div><div class="btns">' +
      (b.btns || []).map(x => '<button class="btn" data-act="' + x[0] + '">' + J.esc(x[1]) + "</button>").join("") + "</div></div>" : "";
  }
  function render() {
    if (!A.st) return;
    $("sub").textContent = A.st.term.name + "（" + J.md(A.st.term.start) + "〜" + J.md(A.st.term.end) + "）";
    $("asof").value = A.ui.asof;
    ["today", "plan", "unit", "sum"].forEach(t => $("tab-" + t).setAttribute("aria-selected", A.ui.tab === t));
    $("app").innerHTML = A.views[A.ui.tab]();
    renderStatus(); renderBanner();
  }
  function fatal(msg) {
    $("sub").textContent = "データを読み込めません";
    $("app").innerHTML = '<div class="banner err"><div>' + J.esc(msg) + "</div><div class=\"small\">index.html をファイルとして直接開くと、データを読めません。GitHub Pagesで開くか、このフォルダで <code>python3 -m http.server</code> を実行して http://localhost:8000/ を開いてください。手元のJSONを読み込むこともできます。</div>" +
      '<div><label class="btn" for="importfile2" style="color:var(--ink)">JSONを読み込む</label><input type="file" id="importfile2" accept="application/json,.json" hidden></div></div>';
    $("importfile2").addEventListener("change", e => importFile(e.target.files[0]));
  }

  /* ---------- 読み込み ---------- */
  async function loadTerm(id) {
    term = terms.find(t => t.id === id) || terms[terms.length - 1];
    LS.set("jd.term", term.id);
    $("term").value = term.id;
    const s = S.getSettings();
    banner = null; sha = null; mode = "local"; dirty = false;
    let text = null;
    if (s.token && s.owner && s.repo) {
      try { const r = await S.remoteGet(s, "data/" + term.file); text = r.text; sha = r.sha; mode = "github"; }
      catch (e) { banner = { err: true, msg: "GitHubから最新のデータを読めませんでした：" + S.explain(e) + " 公開中のデータを表示します（この状態では保存されません）。", btns: [["b-reload", "もう一度読む"]] }; }
    }
    if (text == null) {
      try { const res = await fetch("data/" + term.file + "?t=" + Date.now(), { cache: "no-store" }); if (!res.ok) throw new Error(res.status); text = await res.text(); }
      catch (e) { fatal("データファイル（data/" + term.file + "）を読み込めませんでした。"); return; }
    }
    let remote;
    try { remote = normalize(JSON.parse(text)); } catch (e) { fatal("データファイルの形式が正しくありません。"); return; }
    let draft = null;
    try { const raw = LS.get("jd.draft." + term.id); draft = raw ? JSON.parse(raw) : null; } catch (e) { draft = null; }
    if (draft && draft.dirty && draft.st) {
      A.st = normalize(draft.st); dirty = true;
      banner = mode === "github"
        ? { msg: "この端末に、まだGitHubへ保存していない変更があります。", btns: [["b-push", "この変更をGitHubに保存"], ["b-discard", "破棄して最新を読む"]] }
        : { msg: "この端末の下書きを表示しています。", btns: [["export", "JSONを書き出す"], ["b-discard", "破棄して公開データに戻す"]] };
    } else A.st = remote;
    A.ui.open = null;
    if (!A.st.classes.some(c => c.id === A.ui.cls)) A.ui.cls = A.st.classes[0].id;
    clampAsof();
    render();
    if (dirty && mode === "github" && !banner) flush();
  }

  /* ---------- 保存 ---------- */
  function commit() {
    ver++; dirty = true;
    LS.set("jd.draft." + term.id, JSON.stringify({ st: A.st, dirty: true }));
    render();
    clearTimeout(timer); timer = setTimeout(flush, 1500);
  }
  async function flush() {
    if (!dirty || mode !== "github") { renderStatus(); return; }
    if (saving) { clearTimeout(timer); timer = setTimeout(flush, 600); return; }
    saving = true; renderStatus();
    const v = ver, s = S.getSettings();
    try {
      const r = await S.remotePut(s, "data/" + term.file, J.toJSON(A.st), sha, "授業記録を更新（" + stamp() + "）");
      sha = r.sha;
      if (v === ver) { dirty = false; LS.del("jd.draft." + term.id); banner = null; }
      else { clearTimeout(timer); timer = setTimeout(flush, 300); }
    } catch (e) {
      const conflict = e.status === 409 || e.status === 422;
      banner = { err: true, msg: "GitHubに保存できませんでした：" + S.explain(e),
        btns: conflict ? [["b-force", "この端末の内容で上書き保存"], ["b-reload", "最新を読み込む（この端末の変更は破棄）"]]
          : [["b-push", "もう一度保存"], ["b-reload", "最新を読み込む（この端末の変更は破棄）"]] };
    }
    saving = false; renderStatus(); renderBanner();
  }
  async function forcePush() {
    const s = S.getSettings();
    try { const r = await S.remoteGet(s, "data/" + term.file); sha = r.sha; } catch (e) { if (e.status !== 404) { banner.msg = "最新の状態を取得できませんでした：" + S.explain(e); renderBanner(); return; } sha = null; }
    banner = null; await flush();
  }

  /* ---------- 変更操作 ---------- */
  function blockById(id) { for (const c in A.st.plans) { const b = A.st.plans[c].find(x => x.id === id); if (b) return b; } return null; }
  function setRec(key, patch) {
    const nx = Object.assign({}, A.st.rec[key] || {}, patch);
    if (!nx.s || nx.s === "plan") { delete nx.s; delete nx.t; }
    else if (nx.s !== "free") delete nx.t;
    if (!nx.s && !nx.n) delete A.st.rec[key]; else A.st.rec[key] = nx;
    commit();
  }
  function move(id, dir) {
    const cls = A.ui.cls, a = A.st.plans[cls], i = a.findIndex(b => b.id === id), j = i + dir;
    if (i < 0 || j < J.firstPendingIndex(A.st, A.st.classes.find(c => c.id === cls), A.ui.asof) || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; commit();
  }
  function importFile(f) {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const o = JSON.parse(rd.result);
        if (!o.term || !o.classes || !o.plans || !o.units) throw new Error("形式");
        if (!term) { terms = [{ id: o.term.id, name: o.term.name, file: "" }]; term = terms[0]; }
        A.st = normalize(o); A.ui.open = null; A.ui.cls = A.st.classes[0].id; clampAsof(); commit(); toast("読み込みました");
      } catch (e) { toast("読み込めませんでした（授業ダイアリーのJSONではありません）"); }
    };
    rd.readAsText(f);
  }
  function exportJson() {
    const url = URL.createObjectURL(new Blob([J.toJSON(A.st)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = A.st.term.id + ".json"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------- 設定ダイアログ ---------- */
  function openSettings() {
    const s = S.getSettings();
    $("s_owner").value = s.owner; $("s_repo").value = s.repo; $("s_branch").value = s.branch; $("s_token").value = s.token; $("s_msg").textContent = "";
    $("dlg").showModal();
  }
  const readForm = () => ({ owner: $("s_owner").value.trim(), repo: $("s_repo").value.trim(), branch: $("s_branch").value.trim() || "main", token: $("s_token").value.trim() });
  async function testConn() {
    const s = readForm();
    if (!s.owner || !s.repo || !s.token) { $("s_msg").textContent = "ユーザー名・リポジトリ名・トークンを入れてください。"; return; }
    $("s_msg").textContent = "確かめています…";
    try { await S.remoteGet(s, "data/index.json"); $("s_msg").textContent = "接続できました。書き込み権限は、最初の保存で確認されます。"; }
    catch (e) { $("s_msg").textContent = S.explain(e); }
  }

  /* ---------- イベント ---------- */
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-tab],[data-act]"); if (!t) return;
    if (t.dataset.tab) { A.ui.tab = t.dataset.tab; A.ui.open = null; render(); return; }
    const a = t.dataset.act, k = t.dataset.key, id = t.dataset.id;
    switch (a) {
      case "open": A.ui.open = A.ui.open === k ? null : k; render(); break;
      case "st": { const cur = (A.st.rec[k] || {}).s || "plan", v = t.dataset.v; setRec(k, { s: cur === v && v !== "plan" ? "plan" : v }); break; }
      case "offset": A.st.off[k] = A.st.events[k.split("|")[1]] || "授業なし"; delete A.st.rec[k]; A.ui.open = null; commit(); break;
      case "offclear": delete A.st.off[k]; commit(); break;
      case "cls": A.ui.cls = id; A.ui.open = null; render(); break;
      case "goplan": A.ui.cls = id; A.ui.tab = "plan"; A.ui.open = null; render(); window.scrollTo(0, 0); break;
      case "pfilter": A.ui.planAll = t.dataset.v === "all"; render(); break;
      case "up": move(id, -1); break;
      case "dn": move(id, 1); break;
      case "del": A.st.plans[A.ui.cls] = A.st.plans[A.ui.cls].filter(b => b.id !== id); commit(); break;
      case "add": {
        const tx = $("addt").value.trim(); if (!tx) { toast("追加する内容を入れてください"); break; }
        A.st.plans[A.ui.cls].push({ id: "b" + A.ui.cls + "_" + Date.now().toString(36), u: $("addu").value, t: tx, h: Number($("addh").value) || 1 }); commit(); break;
      }
      case "addunit": {
        const nm = $("newunit").value.trim(); if (!nm) { toast("単元名を入れてください"); break; }
        let n = 1; while (A.st.units["u" + n]) n++;
        A.st.units["u" + n] = { name: nm, allot: {} }; commit(); break;
      }
      case "settings": openSettings(); break;
      case "close-dlg": $("dlg").close(); break;
      case "test": testConn(); break;
      case "save-settings": S.saveSettings(readForm()); $("dlg").close(); loadTerm(term ? term.id : null); break;
      case "export": exportJson(); break;
      case "b-push": banner = null; flush(); break;
      case "b-force": forcePush(); break;
      case "b-discard": case "b-reload": LS.del("jd.draft." + term.id); loadTerm(term.id); break;
    }
  });
  document.addEventListener("change", e => {
    const t = e.target, a = t.dataset && t.dataset.act, v = t.value;
    if (t.id === "asof") { if (v) { A.ui.asof = v; A.ui.open = null; render(); } return; }
    if (t.id === "term") { loadTerm(v); return; }
    if (t.id === "importfile") { importFile(t.files[0]); $("dlg").close(); return; }
    if (!a) return;
    if (a === "note") setRec(t.dataset.key, { n: v.trim() });
    else if (a === "ft") setRec(t.dataset.key, { t: v.trim() });
    else if (a === "bt" || a === "blk-t") { const b = blockById(t.dataset.id); if (b && v.trim()) { b.t = v.trim(); commit(); } }
    else if (a === "blk-u") { const b = blockById(t.dataset.id); if (b) { b.u = v; commit(); } }
    else if (a === "blk-h") { const b = blockById(t.dataset.id); if (b) { b.h = Number(v) || 1; commit(); } }
    else if (a === "un-name") { const u = A.st.units[t.dataset.id]; if (u && v.trim()) { u.name = v.trim(); commit(); } }
    else if (a === "allot") { const u = A.st.units[t.dataset.u]; if (v === "") delete u.allot[t.dataset.c]; else u.allot[t.dataset.c] = Math.max(0, Number(v) || 0); commit(); }
    else if (a === "un") { A.st.unitNotes[t.dataset.id] = v; commit(); }
  });
  window.addEventListener("beforeunload", e => { if (dirty && mode === "github") { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && dirty) { clearTimeout(timer); flush(); } });

  /* ---------- 起動 ---------- */
  (async function boot() {
    try {
      const res = await fetch("data/index.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      terms = (await res.json()).terms || [];
    } catch (e) { terms = []; }
    if (!terms.length) { fatal("data/index.json を読み込めませんでした。"); return; }
    $("term").innerHTML = terms.map(t => '<option value="' + J.esc(t.id) + '">' + J.esc(t.name) + "</option>").join("");
    $("termwrap").hidden = terms.length < 2;
    const saved = LS.get("jd.term");
    await loadTerm(terms.some(t => t.id === saved) ? saved : terms[terms.length - 1].id);
  })();
})();
