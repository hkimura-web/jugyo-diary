/* myClassBlueprint.log: 「仕事」モード（1年間の仕事・リンク集・手順メモ・カレンダー）
 *  - 仕事のデータ: data/work.json（トークンがあれば GitHub に自動保存。なければこの端末の下書き）
 *  - リンク集の元データ: work/links.json（tools/xlsx_to_work.py でスプレッドシートから作る。アプリでは読むだけ）
 *  - 自分で足したリンク・★は work.json に入る */
(function (root) {
  "use strict";
  const J = root.JD, S = root.JDStore, A = root.A, LS = S.LS, esc = J.esc;
  const { SEED, IMG, RL, tgl, OLDN, DOCS } = root.WSEED;
  const $ = id => document.getElementById(id);
  const ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  const now = new Date(), FY = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const MAIL = "h.k1(サブ)のGmail";
  const EM = "\nClaudeアカウント: " + MAIL;
  const DAYS = { "前年度の出金伝票": 11, "中間試験問題作成": 28, "面談調査用紙": 20, "スポーツ安全保険": 31 };
  const PAT = { "懇談会(S1)": "d11", "懇談会(S3)": "d12", "夏期面談の実施": "d13", "通知表プレビュー": "d7", "指導要録ほぼ完成": "d8", "指導要録の最終確認": "d8" };
  const PV = ["備考欄の「出停」「忌引」の数字が表と一致", "成績に抜けがない", "委員・係・検定の入力", "欠課時数の合算(遅刻3回=欠課1)"];
  const W = { S: null, links: null, sha: null, dirty: false, saving: false, timer: null, token: false, conflict: false, canSave: true, st: "読み込み中…", ready: false, ed: null };
  const ui = { tab: "home", q: "", grp: "", fav: false };
  A.work = {}; A.ui.work = ui;
  const nl = s => esc(s).replace(/\n/g, "<br>");
  const nfkc = s => String(s == null ? "" : s).normalize("NFKC").toLowerCase();
  const pad = n => String(n).padStart(2, "0");

  /* ---------- データ ---------- */
  const U = k => "https://docs.google.com/" + (k[0] === "s" ? "spreadsheets" : "document") + "/d/" + k.slice(1) + "/edit";
  const LK = { att: 's1coeU3UCaEPLb0k_0bHZIFzzz92B-26jThI2VIURSftA', yo: 'd1nTvqPpJnBGcaREvU8Hw5vh0gi6FHmshaCaP0wv9og9Q', sei: 's1KQE9tKWQsx0PwGnRogI59oAvlAlRAJSJuo8wQh0GIF8', sin: 'd1vWaba5FgTkuGDipEFjhQsgW7g947dzzsMJMNqu-am1Q', san: 's1Z85uVnzohQjYUHYhj1_84ia8kIeV5xb0zcrI7k2x4i8', pro: 'd1WnaKwGZBtXo6bmo58zCQCe4MSZpWb49b1PLKnDJBVGg', dat: 's1nunck2Sur7n2negbkOGUqZXK9B2xQYhLNumqkaakokU', cls: 's1LlrvW2Q69NHbk2mr7MJWbL-try9C9gAuyY9_VXKFDBA', tai: 's19nJUdkpWGQsLZuVlrYDP-6d0ddm6RNIkD0MusiWkjog', sui: 'd1Yz4mAAgKGstWST1GV1BIgFJjfnSqv63Ql5QLCN0genE' };
  const mkT = (a, i) => ({ id: "t" + i, m: a[0], r: a[1], tg: a[2], t: a[3], n: a[4] || "", u: a[5] && LK[a[5]] ? U(LK[a[5]]) : "", p: a[6] || "", c: a[7] === "__PV" ? PV.slice() : [], rep: !!a[8], k: "", dd: 0, lk: [] });
  function san(s) {
    return String(s == null ? "" : s)
      .replace(/Claudeで作成\(hayato\.kimura\.1@gmail\.com のアカウント\)/g, "Claudeアカウント: " + MAIL)
      .replace(/hayato\.kimura\.1@gmail\.com/g, MAIL)
      .replace(/カウンセラー直通[ 　]*[0-9０-９\-－ー]+\n?/g, "");
  }
  function mig(s) {
    s.tasks = s.tasks || []; s.docs = s.docs || [];
    if ((s.v || 0) < 2) {
      DOCS.forEach(d => { if (!s.docs.find(x => x.id === d.id)) s.docs.push(JSON.parse(JSON.stringify(d))); });
      SEED.forEach((a, i) => { if (i >= OLDN && !s.tasks.find(t => t.id === "t" + i)) s.tasks.push(mkT(a, i)); });
      ["d2", "d6"].forEach(id => { const d = s.docs.find(x => x.id === id); if (d && !d.b.includes("h.k1")) d.b += EM; });
      s.v = 2;
    }
    if (s.v < 3) {
      DOCS.forEach(d => { if (!s.docs.find(x => x.id === d.id)) s.docs.push(JSON.parse(JSON.stringify(d))); });
      const d3 = s.docs.find(x => x.id === "d3"); if (d3) d3.b = d3.b.split("\n").filter(l => !l.startsWith("マイコプラズマ")).join("\n");
      s.docs.forEach(d => { if (["d3", "d4", "d5", "d15", "d16", "d17"].includes(d.id)) d.tip = true; });
      s.v = 3;
    }
    s.docs.forEach(d => { d.img = (DOCS.find(x => x.id === d.id) || {}).img || d.img || []; d.b = san(d.b); d.t = san(d.t); d.u = d.u || ""; });
    s.tasks.forEach(t => {
      if (t.dd == null) t.dd = 0;
      for (const k in DAYS) if (!t.dd && t.t.startsWith(k)) t.dd = DAYS[k];
      for (const k in PAT) if (!t.p && t.t.startsWith(k)) t.p = PAT[k];
      if (t.t.startsWith("11月個人面談 予定表") && !String(t.n).includes("h.k1") && !String(t.n).includes("hayato")) t.n += (t.n ? "\n" : "") + "Claudeアカウント: " + MAIL + " で作成";
      t.n = san(t.n); t.k = san(t.k); t.t = san(t.t); t.lk = Array.isArray(t.lk) ? t.lk : [];
    });
    s.d = s.d || {}; s.cd = s.cd || {}; s.fav = Array.isArray(s.fav) ? s.fav : []; s.mine = Array.isArray(s.mine) ? s.mine : [];
    s.roles = s.roles || ["担", "教", "部"]; s.g = s.g || "3";
    if (!s.y || s.y < FY) s.y = FY; /* 年度が変わると自動で新しい年度になる（完了チェックは年度ごとに別なので、未完了に戻る） */
    return s;
  }
  const fresh = () => mig({ v: 3, y: FY, g: "3", roles: ["担", "教", "部"], docs: JSON.parse(JSON.stringify(DOCS)), d: {}, cd: {}, tasks: SEED.map(mkT), fav: [], mine: [] });

  /* ---------- 読み込み・保存 ---------- */
  const ghOn = () => { const s = S.getSettings(); return !!(s.token && s.owner && s.repo); };
  async function load() {
    try { const r = await fetch("work/links.json?t=" + Date.now(), { cache: "no-store" }); W.links = r.ok ? await r.json() : { sections: [] }; } catch (e) { W.links = { sections: [] }; }
    const s = S.getSettings(); W.token = ghOn();
    let text = null;
    if (W.token) {
      try { const r = await S.remoteGet(s, "data/work.json"); text = r.text; W.sha = r.sha; W.st = "GitHubと同期中"; }
      catch (e) { if (e.status !== 404) { W.canSave = false; W.st = "⚠ " + S.explain(e) + "（GitHubへの保存は止めています）"; } else W.st = "GitHubに新規作成します"; }
    } else {
      try { const r = await fetch("data/work.json?t=" + Date.now(), { cache: "no-store" }); if (r.ok) text = await r.text(); } catch (e) { text = null; }
      W.st = "この端末のみ保存（右上の「設定」でGitHubを接続できます）";
    }
    let p = null; try { p = text ? JSON.parse(text) : null; } catch (e) { p = null; }
    let dr = null; try { const raw = LS.get("jd.draft.work"); dr = raw ? JSON.parse(raw) : null; } catch (e) { dr = null; }
    if (dr && dr.dirty && dr.p && dr.p.tasks) { p = dr.p; W.dirty = true; }
    W.S = mig(p && p.tasks ? p : fresh());
    if (!(p && p.tasks)) W.dirty = true; /* 初回: ひな形をGitHubに作る */
    W.ready = true;
    if (W.dirty && W.token && W.canSave) flush(); else if (W.dirty) LS.set("jd.draft.work", JSON.stringify({ p: W.S, dirty: true }));
    A.render && A.render(); A.remCheck && A.remCheck();
  }
  function save() {
    W.dirty = true; LS.set("jd.draft.work", JSON.stringify({ p: W.S, dirty: true }));
    clearTimeout(W.timer); W.timer = setTimeout(flush, 900); setStatus();
  }
  async function flush() {
    if (!W.dirty || !W.token || !W.canSave || W.conflict) { setStatus(); return; }
    if (W.saving) { clearTimeout(W.timer); W.timer = setTimeout(flush, 600); return; }
    W.saving = true; W.st = "GitHubに保存中…"; setStatus();
    const snap = JSON.stringify(W.S), body = J.toJSON(W.S);
    try {
      const r = await S.remotePut(S.getSettings(), "data/work.json", body, W.sha, "仕事タブを更新");
      W.sha = r.sha; W.st = "GitHubに保存済み";
      if (JSON.stringify(W.S) === snap) { W.dirty = false; LS.del("jd.draft.work"); } else { clearTimeout(W.timer); W.timer = setTimeout(flush, 300); }
    } catch (e) {
      if (e.status === 409 || e.status === 422) W.conflict = true;
      W.st = "⚠ " + S.explain(e);
    }
    W.saving = false; setStatus(); if (W.conflict && A.ui.mode === "work") A.render();
  }
  function setStatus() { if (A.ui.mode === "work" && A.renderStatus) A.renderStatus(); }
  async function reloadRemote() {
    try { const r = await S.remoteGet(S.getSettings(), "data/work.json"); W.sha = r.sha; W.S = mig(JSON.parse(r.text)); W.conflict = false; W.canSave = true; W.dirty = false; LS.del("jd.draft.work"); W.st = "GitHubと同期中"; A.render(); }
    catch (e) { root.alert(S.explain(e)); }
  }
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !W.ready || !W.token || W.saving || W.dirty || W.conflict || !W.canSave || $("wdlg").open) return;
    try { const r = await S.remoteGet(S.getSettings(), "data/work.json"); if (r.sha !== W.sha) { W.sha = r.sha; W.S = mig(JSON.parse(r.text)); A.render(); } } catch (e) { /* 次の機会に */ }
  });

  /* ---------- 計算 ---------- */
  const vis = t => W.S.roles.includes(t.r) && (!t.tg || t.tg.includes(W.S.g));
  const key = (t, m) => W.S.y + ":" + t.id + (t.rep ? ":" + m : "");
  const ck = (t, i) => W.S.y + ":" + t.id + ":c" + i;
  const isD = (t, m) => !!W.S.d[key(t, m)];
  const inM = m => W.S.tasks.filter(t => vis(t) && (t.rep || t.m === m));
  const calYear = m => m >= 4 ? W.S.y : W.S.y + 1;
  const idx = m => ORDER.indexOf(m);
  const fyIdx = () => W.S.y === FY ? idx(now.getMonth() + 1) : W.S.y > FY ? 0 : 11;
  function dueOf(t, m) {
    const y = calYear(m);
    if (t.rep) return y + "-" + pad(m) + "-" + pad(new Date(y, m, 0).getDate());
    return t.dd ? y + "-" + pad(m) + "-" + pad(Math.min(t.dd, new Date(y, m, 0).getDate())) : null;
  }
  /* 期限が今日までに来ている／2日以内に来る仕事 */
  function dueList() {
    if (!W.ready || W.S.y !== FY) return [];
    const today = J.ds(new Date()), lim = J.addDays(today, 2), m0 = new Date().getMonth() + 1, out = [];
    W.S.tasks.filter(vis).forEach(t => {
      const m = t.rep ? m0 : t.m;
      if (isD(t, m)) return;
      const due = dueOf(t, m);
      if (!due || due > lim) return;
      out.push({ t, m, due, kind: due < today ? "late" : due === today ? "today" : "soon" });
    });
    return out.sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0);
  }
  function monthCounts() {
    if (!W.ready || W.S.y !== FY) return { cur: 0, carry: 0 };
    const m0 = new Date().getMonth() + 1, i0 = idx(m0); let cur = 0, carry = 0;
    W.S.tasks.filter(t => vis(t) && !t.rep && !t.dd).forEach(t => { if (isD(t, t.m)) return; const i = idx(t.m); if (i === i0) cur++; else if (i < i0) carry++; });
    return { cur, carry, m0 };
  }
  const dueTag = x => x.kind === "late" ? '<span class="late">期限切れ ' + J.md(x.due) + "</span>" : x.kind === "today" ? '<span class="late today">今日</span>' : '<span class="late soon">' + J.md(x.due) + "</span>";

  /* ---------- 画面の部品 ---------- */
  const imgs = d => (d.img || []).filter(k => IMG[k]).map(k => '<img class="wim" title="押すと大きく開きます" loading="lazy" src="' + IMG[k] + '" alt="">').join("");
  const linkOf = u => { const t = linkTitle(u); return '<a class="ml" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(t) + "</a>"; };
  function allLinks() {
    const o = []; ((W.links && W.links.sections) || []).forEach(s => s.items.forEach(i => o.push({ t: i.t, u: i.u, sec: s.title, grp: s.group })));
    W.S.mine.forEach(i => o.push({ t: i.t, u: i.u, sec: i.sec || "自分で追加", grp: "自分で追加", mine: i.id }));
    return o;
  }
  function linkTitle(u) { const f = allLinks().find(x => x.u === u); if (f) return f.t; const m = /^https?:\/\/([^/]+)/.exec(u); return m ? m[1] : u; }
  function item(t, m, tag) {
    const dn = isD(t, m);
    return '<div class="wit' + (dn ? " dn" : "") + '"><input type="checkbox" aria-label="完了" ' + (dn ? "checked" : "") + ' data-wchg="tg" data-id="' + t.id + '" data-m="' + m + '"><div class="wbody" data-wact="op" data-id="' + t.id + '" data-m="' + m + '"><b>' + esc(t.t) + '</b> <span class="wc">' + RL[t.r] + (t.tg ? " " + tgl(t.tg) : "") + (t.dd && !t.rep ? " " + m + "/" + t.dd : "") + "</span>" + (tag || "") +
      (t.n ? '<div class="ww">⚠ ' + esc(t.n.split("\n")[0]) + "</div>" : "") + (t.k ? '<div class="wk">📝 ' + esc(t.k.split("\n")[0]) + "</div>" : "") + "</div></div>";
  }
  const TO = ["d5", "d3", "d15", "d4", "d16", "d17"];
  function tipsH() {
    const f = x => { const i = TO.indexOf(x.id); return i < 0 ? 99 : i; }, l = W.S.docs.filter(d => d.tip).sort((a, b) => f(a) - f(b));
    return '<section class="panel p-ev"><header class="panel-h"><h2>重要Tips</h2><span class="panel-n">押すとすぐ説明が開きます</span></header><div class="panel-b">' +
      l.map(d => '<button class="wtp" data-wact="tip" data-id="' + d.id + '">' + esc(d.t) + "</button>").join("") + '<button class="wtp add" data-wact="tip-add">＋ 追加</button></div></section>';
  }
  const panel = (cls, title, count, body) => '<section class="panel ' + cls + '"><header class="panel-h"><h2>' + title + "</h2>" + (count ? '<span class="panel-n">' + count + "</span>" : "") + '</header><div class="panel-b">' + body + "</div></section>";

  /* ---------- 各タブ ---------- */
  function viewHome() {
    const s = W.S, cur = fyIdx(), all = s.tasks.filter(t => vis(t) && !t.rep), dn = all.filter(t => isD(t, t.m)).length, due = dueList();
    let late = ""; for (let i = 0; i < cur; i++) { const m = ORDER[i]; inM(m).filter(t => !isD(t, m)).forEach(t => { late += item(t, m, '<span class="late">' + m + "月</span>"); }); }
    const m = ORDER[Math.max(0, Math.min(11, cur))], nx = cur < 11 ? ORDER[cur + 1] : null;
    let h = "";
    if (W.conflict) h += '<div class="banner err"><div>別の端末で先に更新されています。</div><div class="btns"><button class="btn" data-wact="reload">最新を読み込み直す</button></div></div>';
    if (due.length) h += panel("p-work", "期限が近い仕事", due.length + "件", due.map(x => item(x.t, x.m, dueTag(x))).join(""));
    h += tipsH();
    h += panel("p-rem", s.y + "年度のようす", "", '<div class="note">' + esc(s.g === "J" ? "中学" : "高" + s.g) + "担当 ・ " + esc(W.st) + '</div><div class="bar"><i style="width:' + (all.length ? dn / all.length * 100 : 0) + '%"></i></div><div class="note">年間の進み: ' + dn + " / " + all.length + "</div>");
    if (late) h += panel("p-late", "⚠ 繰越・期限切れ", "", late);
    h += panel("p-now", "今月（" + m + "月）", "", inM(m).map(t => item(t, m)).join("") || '<p class="note" style="margin:0">なし</p>');
    if (nx) h += panel("p-soon", "来月（" + nx + "月）の準備 ― 前倒しOK", "", inM(nx).filter(t => !t.rep && !isD(t, nx)).map(t => item(t, nx)).join("") || '<p class="note" style="margin:0">なし</p>');
    return h;
  }
  function viewYear() {
    const cur = fyIdx();
    return '<p><button class="btn on" data-wact="eo">＋ タスク追加</button></p>' + ORDER.map((m, i) => {
      const l = inM(m), d = l.filter(t => isD(t, m)).length;
      return '<details class="wdet"' + (i === cur ? " open" : "") + "><summary><b>" + m + '月</b> <span class="note">' + d + "/" + l.length + "</span></summary>" + (l.map(t => item(t, m)).join("") || '<div class="note">なし</div>') + "</details>";
    }).join("");
  }
  function linkRow(x) {
    const fav = W.S.fav.indexOf(x.u) >= 0;
    return '<div class="wlink"><button class="wstar" data-wact="fav" data-u="' + esc(x.u) + '" aria-pressed="' + fav + '" title="★よく使う">' + (fav ? "★" : "☆") + '</button><a class="ml" href="' + esc(x.u) + '" target="_blank" rel="noopener noreferrer">' + esc(x.t) + "</a>" +
      (x.mine ? '<button class="btn sm danger" data-wact="mine-del" data-id="' + esc(x.mine) + '">消す</button>' : "") + "</div>";
  }
  function linkResults() {
    const q = nfkc(ui.q).split(/\s+/).filter(Boolean), secs = {};
    const list = allLinks().filter(x => (!ui.grp || x.grp === ui.grp) && (!ui.fav || W.S.fav.indexOf(x.u) >= 0) && q.every(t => nfkc(x.t + " " + x.sec).indexOf(t) >= 0));
    list.forEach(x => { (secs[x.sec + "\u0001" + x.grp] = secs[x.sec + "\u0001" + x.grp] || []).push(x); });
    let h = "";
    if (!q.length && !ui.fav && !ui.grp) {
      const fs = allLinks().filter(x => W.S.fav.indexOf(x.u) >= 0);
      h += panel("p-ev", "★よく使う", fs.length + "件", fs.length ? fs.map(linkRow).join("") : '<p class="note" style="margin:0">リンクの左の ☆ を押すと、ここに出ます。</p>');
    } else h += '<p class="note"><b>' + list.length + "件</b>見つかりました</p>";
    const memoOf = {}; ((W.links && W.links.sections) || []).forEach(s => { memoOf[s.title] = s.memo; });
    Object.keys(secs).forEach(k => {
      const [t, g] = k.split("\u0001"), open = q.length || ui.fav || ui.grp;
      h += '<details class="wdet"' + (open ? " open" : "") + "><summary><b>" + esc(t) + '</b> <span class="note">' + secs[k].length + "件 ・ " + esc(g) + "</span></summary>" + secs[k].map(linkRow).join("") + ((memoOf[t] || []).length && !q.length ? '<p class="note">' + (memoOf[t] || []).map(esc).join(" ／ ") + "</p>" : "") + "</details>";
    });
    return h;
  }
  function viewLinks() {
    const grps = ["", "ポータル", "ICTマニュアル", "自分で追加"], nm = { "": "すべて" };
    const secs = []; ((W.links && W.links.sections) || []).forEach(s => { if (secs.indexOf(s.title) < 0) secs.push(s.title); });
    let h = '<div class="seg">' + grps.map(g => '<button data-wact="grp" data-v="' + g + '" aria-pressed="' + (ui.grp === g) + '">' + (nm[g] || g) + "</button>").join("") + "</div>";
    h += '<div class="lbar"><input type="search" id="wq" class="lq" data-wf="lq" placeholder="リンクをさがす（例：勤怠　BLEND　推薦書　陸上）" value="' + esc(ui.q) + '" autocomplete="off"><label class="lfav"><input type="checkbox" data-wchg="favonly"' + (ui.fav ? " checked" : "") + '> ★だけ</label></div>';
    h += '<div id="wres">' + linkResults() + "</div>";
    h += '<details class="wdet"><summary><b>＋ リンクを追加する</b></summary><div style="padding:6px 0"><label>名前</label><input type="text" id="wl_t" placeholder="例：新しい手順書"><label>URL</label><input type="text" id="wl_u" placeholder="https://…"><label>分類</label><select id="wl_s"><option value="">自分で追加（分類なし）</option>' + secs.map(s => "<option>" + esc(s) + "</option>").join("") + '</select><button class="btn on" data-wact="mine-add">追加</button></div></details>';
    return h + '<p class="note">リンク一覧の作成日：' + esc((W.links && W.links.built) || "—") + "（" + esc((W.links && W.links.year) || "") + "年度のシートから）。パスワード・IDはここには入れません。</p>";
  }
  function viewDocs() {
    return '<p class="note">タスクの「手順」として紐づけられる共通メモです。1か所直せば全部に反映されます。</p>' + W.S.docs.map((d, i) => '<div class="wcard"><input type="text" value="' + esc(d.t) + '" data-wf="doc-t" data-i="' + i + '"><label class="wck"><input type="checkbox" ' + (d.tip ? "checked" : "") + ' data-wchg="doc-tip" data-i="' + i + '"> ホームの「重要Tips」に表示</label><input type="text" placeholder="資料URL(任意)" value="' + esc(d.u || "") + '" data-wf="doc-u" data-i="' + i + '"><textarea style="min-height:110px" data-wf="doc-b" data-i="' + i + '">' + esc(d.b) + "</textarea>" + imgs(d) + '<button class="btn" data-wact="doc-del" data-i="' + i + '">削除</button></div>').join("") + '<button class="btn on" data-wact="doc-add">＋ 追加</button>';
  }
  function icsText(o) {
    const yr = calYear, e = s => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, "\\$&").replace(/\n/g, "\\n"), s = W.S, ev = []; let n = 0;
    const add = (ds, sum, desc, rr) => ev.push(["BEGIN:VEVENT", "UID:work" + (n++) + "-" + s.y + "@myclassblueprint", "DTSTAMP:20260101T000000Z", "DTSTART;VALUE=DATE:" + ds, "SUMMARY:" + e(sum), "DESCRIPTION:" + e(desc), rr || "", "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + e(sum), "TRIGGER:PT9H", "END:VALARM", "END:VEVENT"].filter(Boolean).join("\r\n"));
    ORDER.forEach(m => {
      const l = s.tasks.filter(t => vis(t) && !t.rep && t.m === m); if (!l.length) return;
      const tx = l.map(t => "・" + t.t + (t.n ? "\n   ⚠ " + t.n.split("\n")[0] : "")).join("\n");
      if (o.a) add(yr(m) + pad(m) + "01", "【今月】" + m + "月のタスク(" + l.length + "件)", tx);
      if (o.b) { const pm = m === 1 ? 12 : m - 1; add((m === 4 ? s.y : yr(pm)) + pad(pm) + "25", "【来月の準備】" + m + "月のタスク", tx); }
      if (o.c) l.filter(t => t.dd).forEach(t => add(yr(m) + pad(m) + pad(t.dd), t.t, t.n || ""));
    });
    if (o.d) s.tasks.filter(t => vis(t) && t.rep).forEach(t => add(s.y + "0430", t.t, t.n || "", "RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=12"));
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//myclassblueprint-work//JA\r\nCALSCALE:GREGORIAN\r\n" + ev.join("\r\n") + "\r\nEND:VCALENDAR";
  }
  function viewCal() {
    const o = (k, l) => '<label class="wck"><input type="checkbox" id="' + k + '" checked> ' + l + "</label>";
    return '<div class="wcard"><b>Googleカレンダーなどに取り込む(.icsファイル)</b><p class="note">' + W.S.y + "年度・今の担当設定で表示されるタスクが対象です。日付は各タスクの編集画面の「日」で設定できます(未設定はまとめ予定になります)。</p>" +
      o("c1", "毎月1日に「今月のタスク一覧」") + o("c2", "前月25日に「来月の準備」(前倒し用)") + o("c3", "日付を設定したタスクを個別の予定に") + o("c4", "毎月末の繰り返しタスク(出欠確認など)") + '<button class="btn on" data-wact="ics">.icsを書き出す</button><textarea id="icsx" style="display:none"></textarea></div>' +
      '<div class="wcard"><b>取り込み方</b><p>Googleカレンダー(PC) → 右上の歯車 → 設定 → 「インポート/エクスポート」 → ファイルを選んで取り込み。予定の通知はカレンダー側で届きます。</p><p class="note">一度取り込んだ予定は自動では更新されません。タスクを変更したら、古い予定を消して取り込み直してください。</p></div>';
  }
  function viewSet() {
    const s = W.S;
    return '<div class="wcard"><b>担当</b><br>' + [["J", "中学"], ["1", "高1"], ["2", "高2"], ["3", "高3"]].map(([v, l]) => '<label class="wck" style="display:inline-block;margin-right:12px"><input type="radio" name="wg" ' + (s.g === v ? "checked" : "") + ' data-wchg="grade" data-v="' + v + '"> ' + l + "</label>").join("") + "<br><b>表示する仕事</b><br>" +
      Object.entries(RL).map(([v, l]) => '<label class="wck" style="display:inline-block;margin-right:12px"><input type="checkbox" ' + (s.roles.includes(v) ? "checked" : "") + ' data-wchg="role" data-v="' + v + '"> ' + l + "</label>").join("") + "</div>" +
      '<div class="wcard"><b>保存</b><p class="note">' + esc(W.st) + '</p><p class="note">GitHubの接続は、画面右上の「設定」で授業の記録と共通です（トークンは1つで足ります）。仕事のデータは <code>data/work.json</code> に保存されます。</p></div>' +
      '<div class="wcard"><b>バックアップ</b><p class="note">いままでの「1年間の仕事」アプリで書き出した .json は、そのまま読み込めます（完了チェックも引き継がれます）。</p><button class="btn" data-wact="bk-out">ファイルに書き出す</button> <label class="btn" for="wbk" style="margin:0">ファイルから読み込む</label><input type="file" id="wbk" accept="application/json,.json" hidden></div>' +
      '<div class="wcard"><b>年度</b><p class="note">いまは ' + s.y + "年度です。4月になると自動で新しい年度になり、完了チェックは未完了に戻ります（タスクの内容と「来年へのメモ」はそのまま残ります）。</p></div>";
  }
  A.work.view = function () {
    if (!W.ready) return '<p class="note">読み込んでいます…</p>';
    return { home: viewHome, year: viewYear, links: viewLinks, docs: viewDocs, cal: viewCal, set: viewSet }[ui.tab]();
  };
  A.work.sub = () => W.ready ? "仕事 ・ " + W.S.y + "年度" : "仕事";
  A.work.statusText = () => W.st;
  A.work.dueCount = () => dueList().length;

  /* 授業の「今日」タブの下に出す「今日の仕事」 */
  A.work.todayPanel = function () {
    if (!W.ready) return "";
    const due = dueList(), mc = monthCounts();
    if (!due.length && !mc.cur && !mc.carry) return "";
    let b = due.length ? due.map(x => item(x.t, x.m, dueTag(x))).join("") : '<p class="note" style="margin:0 0 6px">今日が期限の仕事はありません。</p>';
    if (mc.cur || mc.carry) b += '<p class="note" style="margin:8px 0 0">' + (mc.cur ? mc.m0 + "月の仕事（日付なし）：未完了 " + mc.cur + "件" : "") + (mc.cur && mc.carry ? " ／ " : "") + (mc.carry ? "繰越 " + mc.carry + "件" : "") + ' <button class="btn sm" data-wact="go-home">仕事タブを開く</button></p>';
    return panel("p-work", "今日の仕事", due.length ? due.length + "件" : "", b);
  };
  /* 「記録待ち」と同じお知らせ画面に出す、期限が近い仕事 */
  A.work.remHtml = function () {
    const due = dueList(); if (!due.length) return "";
    return '<h2 style="margin-top:0">期限が近い仕事があります</h2><div class="remlist">' + due.map(x => '<div class="wit"><div class="wbody"><b>' + esc(x.t.t) + "</b> " + dueTag(x) + (x.t.n ? '<div class="ww">⚠ ' + esc(x.t.n.split("\n")[0]) + "</div>" : "") + "</div></div>").join("") + '</div><p><button class="btn" data-wact="go-home">仕事タブで開く</button></p>';
  };
  A.work.dueCount = () => dueList().length;

  /* ---------- 操作 ---------- */
  function modal(h) { $("wbody").innerHTML = h; if (!$("wdlg").open) $("wdlg").showModal(); }
  function cl() { if ($("wdlg").open) $("wdlg").close(); }
  function redraw() { if (A.ui.mode === "work") A.render(); else A.render(); }
  function toggle(id, m) {
    const t = W.S.tasks.find(x => x.id === id), k = key(t, m);
    if (!W.S.d[k] && t.c.length && !t.c.every((_, i) => W.S.cd[ck(t, i)])) { root.alert("完了前チェックがまだ終わっていません。詳細を開いて確認してください。"); redraw(); return; }
    if (W.S.d[k]) delete W.S.d[k]; else W.S.d[k] = true;
    save(); redraw();
  }
  function openTask(id, m) {
    const t = W.S.tasks.find(x => x.id === id), p = W.S.docs.find(d => d.id === t.p), dn = isD(t, m);
    modal('<h2 style="margin:0">' + esc(t.t) + '</h2><div class="note">' + (t.rep ? "毎月" : t.m + "月") + " ・ " + RL[t.r] + " ・ " + (t.tg ? tgl(t.tg) : "全学年") + "</div>" +
      (t.n ? '<div class="ww2">⚠ ' + nl(t.n) + "</div>" : "") +
      (p ? '<details class="wdet" open><summary>' + esc(p.t) + "</summary><div>" + nl(p.b) + "</div>" + (p.u ? '<p><a href="' + esc(p.u) + '" target="_blank" rel="noopener">資料を開く ↗</a></p>' : "") + imgs(p) + "</details>" : "") +
      (t.c.length ? "<b>完了前チェック</b>" : "") + t.c.map((c, i) => '<label class="wck"><input type="checkbox" ' + (W.S.cd[ck(t, i)] ? "checked" : "") + ' data-wchg="cc" data-id="' + t.id + '" data-i="' + i + '"> ' + esc(c) + "</label>").join("") +
      (t.u ? '<p><a href="' + esc(t.u) + '" target="_blank" rel="noopener">資料を開く ↗</a></p>' : "") + (t.lk.length ? "<p>" + t.lk.map(linkOf).join(" ") + "</p>" : "") +
      '<div class="note">📝 来年へのメモ(次の年度の注意として残ります)</div><textarea data-wchg="mk" data-id="' + t.id + '">' + esc(t.k) + "</textarea>" +
      '<div class="dlg-btns" style="justify-content:flex-start"><button class="btn on" data-wact="done" data-id="' + t.id + '" data-m="' + m + '">' + (dn ? "未完了に戻す" : "完了にする") + '</button><button class="btn" data-wact="eo" data-id="' + t.id + '">編集</button><button class="btn" data-wact="cl">閉じる</button></div>');
  }
  function openEdit(id) {
    const t = id ? W.S.tasks.find(x => x.id === id) : { m: fyIdx() >= 0 && fyIdx() < 12 ? ORDER[fyIdx()] : 4, r: "担", tg: "", t: "", n: "", u: "", p: "", c: [], rep: false, k: "", dd: 0, lk: [] };
    W.ed = Object.assign({}, t, { _id: id || "", c: t.c.slice(), lk: (t.lk || []).slice() }); renderEdit();
  }
  function renderEdit() {
    const t = W.ed, id = t._id, secs = {};
    allLinks().forEach(x => { (secs[x.sec] = secs[x.sec] || []).push(x); });
    modal('<h2 style="margin:0">' + (id ? "編集" : "タスク追加") + '</h2><label>タイトル</label><input type="text" id="we1" value="' + esc(t.t) + '"><label>月</label><select id="we2">' + ORDER.map(m => "<option " + (m === t.m ? "selected" : "") + ">" + m + "</option>").join("") + "</select>" +
      '<label>役割</label><select id="we3">' + ["担", "教", "部"].map(r => '<option value="' + r + '" ' + (r === t.r ? "selected" : "") + ">" + RL[r] + "</option>").join("") + "</select>" +
      '<div>対象(未選択=全学年): ' + ["J", "1", "2", "3"].map(g => '<label class="wck" style="display:inline-block;margin-right:8px"><input type="checkbox" class="we4" value="' + g + '" ' + (t.tg.includes(g) ? "checked" : "") + "> " + (g === "J" ? "中学" : "高" + g) + "</label>").join("") + '<label class="wck" style="display:inline-block"><input type="checkbox" id="we8" ' + (t.rep ? "checked" : "") + "> 毎月繰り返す</label></div>" +
      '<label>日(任意・期限のお知らせとカレンダー用)</label><input type="number" id="we10" min="0" max="31" value="' + (t.dd || "") + '" style="width:90px"><label>注意事項(見落とし防止)</label><textarea id="we5">' + esc(t.n) + '</textarea><label>資料URL</label><input type="text" id="we6" value="' + esc(t.u) + '">' +
      '<label>手順メモ</label><select id="we7"><option value="">なし</option>' + W.S.docs.map(d => '<option value="' + d.id + '" ' + (d.id === t.p ? "selected" : "") + ">" + esc(d.t) + "</option>").join("") + "</select>" +
      '<label>リンク集のリンク（タスクを開いたときに出ます）</label>' + (t.lk.length ? t.lk.map((u, i) => '<div class="wlink"><span class="ml">' + esc(linkTitle(u)) + '</span><button class="btn sm danger" data-wact="lk-del" data-i="' + i + '">外す</button></div>').join("") : "") +
      '<div class="wlink"><select id="we_lk"><option value="">リンク集から選ぶ…</option>' + Object.keys(secs).map(k => '<optgroup label="' + esc(k) + '">' + secs[k].map(x => '<option value="' + esc(x.u) + '">' + esc(x.t) + "</option>").join("") + "</optgroup>").join("") + '</select><button class="btn sm" data-wact="lk-add">追加</button></div>' +
      '<label>完了前チェック(1行1項目)</label><textarea id="we9">' + esc(t.c.join("\n")) + '</textarea><div class="dlg-btns" style="justify-content:flex-start"><button class="btn on" data-wact="es">保存</button>' + (id ? '<button class="btn danger" data-wact="task-del" data-id="' + id + '">削除</button>' : "") + '<button class="btn" data-wact="cl">キャンセル</button></div>');
  }
  function readEd() {
    const t = W.ed;
    Object.assign(t, { t: $("we1").value, m: +$("we2").value, r: $("we3").value, tg: [].slice.call(document.querySelectorAll(".we4:checked")).map(x => x.value).join(""), n: $("we5").value, u: $("we6").value.trim(), p: $("we7").value, c: $("we9").value.split("\n").filter(x => x.trim()), rep: $("we8").checked, dd: +$("we10").value || 0 });
  }
  function saveEdit() {
    readEd(); const e = W.ed; let t = e._id ? W.S.tasks.find(x => x.id === e._id) : null;
    if (!t) { t = { id: "n" + Date.now(), k: "" }; W.S.tasks.push(t); }
    Object.assign(t, { t: e.t || "(無題)", m: e.m, r: e.r, tg: e.tg, n: e.n, u: e.u, p: e.p, c: e.c, rep: e.rep, dd: e.dd, lk: e.lk });
    save(); cl(); redraw();
  }
  function exportBackup() {
    const text = JSON.stringify(W.S, null, 1), name = "shigoto-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name; a.click(); } catch (e) { root.alert("書き出せませんでした。"); }
  }
  function importBackup(f) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(r.result); if (!o.tasks || !o.docs) throw 0;
        if (!root.confirm("いまの仕事タブのデータを、このファイルの内容に置き換えます。よろしいですか？\n（メールアドレスや電話番号は自動で伏せ字に置き換えます。生徒の名前など個人情報が書いていないかは、念のため確認してください）")) return;
        o.y = o.y || FY; W.S = mig(o); save(); ui.tab = "home"; A.render(); A.toast && A.toast("読み込みました");
      } catch (e) { root.alert("読み込めませんでした。「1年間の仕事」アプリで書き出したバックアップ(.json)を選んでください。"); }
    };
    r.readAsText(f);
  }

  function zoom(z) {
    const i = $("wimgbig"); i.dataset.z = z; i.style.width = z === "fit" ? "100%" : z === "x2" ? "200%" : "300%";
    document.querySelectorAll("[data-wzoom]").forEach(b => b.setAttribute("aria-pressed", b.dataset.wzoom === z));
  }
  document.addEventListener("click", e => {
    const im = e.target.closest(".wim");
    if (im) { $("wimgbig").src = im.src; zoom("fit"); if (!$("wimgdlg").open) $("wimgdlg").showModal(); return; }
    const zb = e.target.closest("[data-wzoom]"); if (zb) { zoom(zb.dataset.wzoom); return; }
    if (e.target.id === "wimgbig") { zoom($("wimgbig").dataset.z === "fit" ? "x2" : "fit"); return; }
    if (e.target.id === "wimgclose") { $("wimgdlg").close(); return; }
    const tb = e.target.closest("[data-wtab]");
    if (tb) { ui.tab = tb.dataset.wtab; A.render(); root.scrollTo(0, 0); return; }
    const t = e.target.closest("[data-wact]"); if (!t) return;
    const a = t.dataset.wact, id = t.dataset.id, i = +t.dataset.i;
    switch (a) {
      case "op": openTask(id, +t.dataset.m); break;
      case "cl": cl(); break;
      case "done": toggle(id, +t.dataset.m); cl(); break;
      case "eo": openEdit(id || ""); break;
      case "es": saveEdit(); break;
      case "task-del": if (root.confirm("削除しますか？")) { W.S.tasks = W.S.tasks.filter(x => x.id !== id); save(); cl(); redraw(); } break;
      case "lk-add": { readEd(); const u = $("we_lk").value; if (u && W.ed.lk.indexOf(u) < 0) W.ed.lk.push(u); renderEdit(); break; }
      case "lk-del": readEd(); W.ed.lk.splice(i, 1); renderEdit(); break;
      case "tip": { const d = W.S.docs.find(x => x.id === id); modal('<h2 style="margin:0">' + esc(d.t) + '</h2><div style="margin-top:8px">' + nl(d.b) + "</div>" + (d.u ? '<p><a href="' + esc(d.u) + '" target="_blank" rel="noopener">資料を開く ↗</a></p>' : "") + imgs(d) + '<div class="dlg-btns"><button class="btn" data-wact="cl">閉じる</button></div>'); break; }
      case "tip-add": W.S.docs.push({ id: "d" + Date.now(), t: "新しいTips", b: "", tip: true, img: [], u: "" }); save(); ui.tab = "docs"; A.render(); root.scrollTo(0, document.body.scrollHeight); break;
      case "doc-add": W.S.docs.push({ id: "d" + Date.now(), t: "新しいメモ", b: "", img: [], u: "" }); save(); A.render(); break;
      case "doc-del": if (root.confirm("削除しますか？")) { W.S.docs.splice(i, 1); save(); A.render(); } break;
      case "fav": { const u = t.dataset.u, k = W.S.fav.indexOf(u); if (k >= 0) W.S.fav.splice(k, 1); else W.S.fav.push(u); save(); A.render(); break; }
      case "grp": ui.grp = t.dataset.v; A.render(); break;
      case "mine-add": {
        const n = $("wl_t").value.trim(), u = $("wl_u").value.trim();
        if (!n || !/^https?:\/\//.test(u)) { root.alert("名前と、https:// から始まるURLを入れてください。"); break; }
        W.S.mine.push({ id: "m" + Date.now(), t: n, u, sec: $("wl_s").value }); save(); A.render(); break;
      }
      case "mine-del": if (root.confirm("このリンクを消しますか？")) { W.S.mine = W.S.mine.filter(x => x.id !== id); save(); A.render(); } break;
      case "ics": {
        const txt = icsText({ a: $("c1").checked, b: $("c2").checked, c: $("c3").checked, d: $("c4").checked });
        try { const el = document.createElement("a"); el.href = URL.createObjectURL(new Blob([txt], { type: "text/calendar" })); el.download = "shigoto-" + W.S.y + ".ics"; el.click(); } catch (x) { const ta = $("icsx"); ta.style.display = "block"; ta.value = txt; ta.select(); root.alert("自動保存できなかったので、下の欄に出しました。コピーして .ics として保存してください。"); }
        break;
      }
      case "bk-out": exportBackup(); break;
      case "reload": reloadRemote(); break;
      case "go-home": { const rd = $("remdlg"); if (rd && rd.open) rd.close(); A.ui.mode = "work"; LS.set("jd.mode", "work"); ui.tab = "home"; A.render(); root.scrollTo(0, 0); break; }
    }
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "wbk") { if (t.files[0]) importBackup(t.files[0]); t.value = ""; return; }
    const c = t.dataset && t.dataset.wchg; if (!c) return;
    const id = t.dataset.id, i = +t.dataset.i;
    switch (c) {
      case "tg": toggle(id, +t.dataset.m); break;
      case "cc": { const tk = W.S.tasks.find(x => x.id === id), k = ck(tk, i); if (W.S.cd[k]) delete W.S.cd[k]; else W.S.cd[k] = true; save(); break; }
      case "mk": W.S.tasks.find(x => x.id === id).k = t.value; save(); if (A.ui.mode === "work") A.render(); break;
      case "doc-tip": W.S.docs[i].tip = t.checked; save(); break;
      case "grade": W.S.g = t.dataset.v; save(); break;
      case "role": { const v = t.dataset.v; W.S.roles = W.S.roles.includes(v) ? W.S.roles.filter(x => x !== v) : W.S.roles.concat(v); save(); break; }
      case "favonly": ui.fav = t.checked; A.render(); break;
    }
  });
  document.addEventListener("input", e => {
    const t = e.target, f = t.dataset && t.dataset.wf; if (!f) return;
    const i = +t.dataset.i;
    if (f === "lq") { ui.q = t.value; const r = $("wres"); if (r) r.innerHTML = linkResults(); return; }
    if (f === "doc-t") W.S.docs[i].t = t.value; else if (f === "doc-b") W.S.docs[i].b = t.value; else if (f === "doc-u") W.S.docs[i].u = t.value;
    save();
  });

  A.work.load = load;
  load();
})(window);
