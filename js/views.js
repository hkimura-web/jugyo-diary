/* 授業ダイアリー: 画面の組み立て（今日 / 計画表 / 単元別 / サマリー） */
(function (root) {
  "use strict";
  const J = root.JD, { esc, md, dw, addDays, hrsOf } = J;
  const A = root.A = { st: null, ui: { tab: "today", cls: null, open: null, planAll: false, asof: J.ds(new Date()), gridOrder: "class", gridSubj: "all", cell: null, gridEdit: true, lastUnit: {}, flow: { u: null, cls: {} }, carry: null } };

  const LABEL = { plan: "予定", done: "実施", part: "途中まで", cancel: "休講", free: "別の内容", off: "授業なし", empty: "計画なし" };
  const PILL = { plan: "p-plan", done: "p-done", part: "p-part", cancel: "p-cancel", free: "p-free", off: "p-off", empty: "p-warn" };
  const unitName = u => ((A.st.units[u] || {}).name) || "（単元未設定）";
  const cname = id => (A.st.classes.find(c => c.id === id) || {}).name || id;
  const sid = k => "n_" + k.replace(/[^0-9a-z]/gi, "_");
  const plain = s => String(s).replace(/\s*\/\s*/g, " / ");
  const clip = (s, n) => { s = plain(s); return s.length > n ? s.slice(0, n) + "…" : s; };
  const cur = () => A.st.classes.find(c => c.id === A.ui.cls) || A.st.classes[0];
  const perTxt = r => { const ps = (r.periods || []).filter(Boolean); return ps.length ? ps.join("・") + "時間目" : ""; };
  /* 「別の内容」のコマ：他の科目に入れ替えたとき（例：現代の国語の時間に言語文化をやった）の科目・単元・内容 */
  function freeInfo(r) {
    const cid = r.key.split("|")[0], c = A.st.classes.find(x => x.id === cid), own = c ? J.subjectOf(c) : "";
    const sj = (r.rec && r.rec.sj) || "", un = r.rec && r.rec.fu && A.st.units[r.rec.fu] ? A.st.units[r.rec.fu].name : "";
    return { swapped: sj && sj !== own ? sj : "", unit: un, text: (r.rec && r.rec.t) || "" };
  }
  function freeTitle(r) {
    const f = freeInfo(r), body = [f.unit, f.text].filter(Boolean).join("　");
    return (f.swapped ? "【" + f.swapped + "】" : "") + (body || (f.swapped ? "" : "別の内容"));
  }
  /* 別の内容の入力欄（科目・単元・内容）。idp は入力欄のid用 */
  function freeForm(r, idp, compact) {
    const cid = r.key.split("|")[0], c = A.st.classes.find(x => x.id === cid), own = J.subjectOf(c), sj = (r.rec && r.rec.sj) || own, key = esc(r.key);
    const subs = subjectList(), us = Object.keys(A.st.units).filter(u => !A.st.units[u].subj || A.st.units[u].subj === sj);
    const cl = compact ? "gsel" : "";
    return (compact ? "" : '<label for="fs_' + idp + '">実施した科目（他の科目に入れ替えたときは変えてください）</label>') +
      '<select id="fs_' + idp + '" class="' + cl + '" aria-label="実施した科目" data-act="fsj" data-key="' + key + '">' + subs.map(x => '<option value="' + esc(x) + '"' + (x === sj ? " selected" : "") + ">" + esc(x) + (x === own ? "（このクラスの科目）" : "に入れ替え") + "</option>").join("") + "</select>" +
      (compact ? "" : '<label for="fu_' + idp + '">単元（なければ空のままで）</label>') +
      '<select id="fu_' + idp + '" class="' + cl + '" aria-label="単元" data-act="ffu" data-key="' + key + '"><option value="">（単元を選ばない）</option>' + us.map(u => '<option value="' + u + '"' + (u === (r.rec && r.rec.fu) ? " selected" : "") + ">" + esc(A.st.units[u].name) + "</option>").join("") + "</select>" +
      (compact ? '<input type="text" class="gin" aria-label="何をやったか" placeholder="何をやったか" data-act="ft" data-key="' + key + '" value="' + esc((r.rec && r.rec.t) || "") + '">'
        : '<label for="ft_' + idp + '">何をやったか</label><input type="text" id="ft_' + idp + '" data-act="ft" data-key="' + key + '" value="' + esc((r.rec && r.rec.t) || "") + '" placeholder="例：学年集会、テスト返却、言語文化の授業">');
  }
  const hrsTxt = n => n + "時間";
  const parts = n => { const i = n.indexOf(" "); return i < 0 ? [n, ""] : [n.slice(0, i), n.slice(i + 1)]; };
  const subj = n => /現代/.test(n) ? "gen" : /言語|古/.test(n) ? "lang" : "etc";

  /* 学期全体の時間の内訳（実施・休講・別内容・記録待ち・これから）と、その帯グラフ */
  function split(rows, asof) {
    const o = { done: 0, cancel: 0, free: 0, wait: 0, remain: 0, total: 0 };
    rows.forEach(r => {
      if (r.kind === "off") return;
      o.total += r.hrs;
      if (r.kind === "done" || r.kind === "part") o.done += r.hrs;
      else if (r.kind === "cancel") o.cancel += r.hrs;
      else if (r.kind === "free") o.free += r.hrs;
      else if (r.date < asof) o.wait += r.hrs;
      else o.remain += r.hrs;
    });
    return o;
  }
  function meter(o, legend) {
    const seg = (k, n, t) => n ? '<i class="m-' + k + '" style="flex:' + n + '" title="' + t + " " + n + '時間"></i>' : "";
    let h = '<div class="meter" role="img" aria-label="学期の進み具合">' + seg("done", o.done, "実施") + seg("free", o.free, "別の内容") + seg("cancel", o.cancel, "休講") + seg("wait", o.wait, "記録待ち") + seg("remain", o.remain, "これから") + "</div>";
    if (legend) h += '<div class="legend"><span><i class="m-done"></i>実施 ' + o.done + '</span><span><i class="m-cancel"></i>休講 ' + o.cancel + '</span><span><i class="m-free"></i>別の内容 ' + o.free + '</span><span><i class="m-remain"></i>これから ' + o.remain + "</span></div>";
    return h;
  }
  function classChips(rem) {
    return '<div class="chips">' + A.st.classes.map(c => {
      const [a, b] = parts(c.name), s = rem[c.id];
      return '<button class="cc k-' + subj(c.name) + '" data-act="cls" data-id="' + c.id + '" aria-pressed="' + (c.id === cur().id) + '"><span class="cc-n">' + esc(a) + " " + esc(b.replace("の国語", "")) + '</span><span class="cc-r">残り ' + s.remain + "時間</span></button>";
    }).join("") + "</div>";
  }
  const panel = (cls, title, count, body) => '<section class="panel ' + cls + '"><header class="panel-h"><h2>' + title + "</h2>" + (count ? '<span class="panel-n">' + count + "</span>" : "") + '</header><div class="panel-b">' + body + "</div></section>";

  function rowTitle(r) {
    if (r.kind === "off") return r.off;
    if (r.kind === "cancel") return "休講";
    if (r.kind === "free") return freeTitle(r);
    if (r.kind === "empty") return "この日に入れる計画がありません";
    return (r.cont ? "（続き）" : "") + (r.blocks.map(b => b.t).filter(Boolean).join("　／　") || "（内容未入力）");
  }
  function pillFor(r) {
    const waiting = r.date < A.ui.asof && r.kind === "plan";
    return '<span class="pill ' + (waiting ? "p-warn" : PILL[r.kind]) + '">' + (waiting ? "記録待ち" : LABEL[r.kind]) + (r.hrs > 1 ? "・" + r.hrs + "時間" : "") + "</span>";
  }

  function editor(r) {
    const s = (r.rec && r.rec.s) || "plan", id = sid(r.key);
    const B = (v, t) => '<button class="btn' + (s === v && r.kind !== "off" ? " on" : "") + '" data-act="st" data-key="' + esc(r.key) + '" data-v="' + v + '">' + t + "</button>";
    if (r.kind === "off") {
      return '<div class="ed"><div class="note">理由：' + esc(r.off) + '</div><div class="btns"><button class="btn" data-act="offclear" data-key="' + esc(r.key) + '">この日は授業を行う</button></div></div>';
    }
    let h = '<div class="ed"><div class="btns">' + B("done", "実施した") + B("part", "途中まで") + B("cancel", "休講にする") + B("free", "別の内容にする") +
      '<button class="btn" data-act="offset" data-key="' + esc(r.key) + '">行事で授業なし</button>' + B("plan", "予定に戻す") + "</div>";
    if (s === "free") h += freeForm(r, id + "e", false);
    r.blocks.forEach((b, i) => {
      h += '<label class="small" for="bt_' + id + i + '">授業内容（' + esc(unitName(b.u)) + '）実際にやった内容に書き換えられます</label><textarea id="bt_' + id + i + '" data-act="bt" data-id="' + esc(b.id) + '">' + esc(b.t) + "</textarea>";
    });
    h += '<label class="small" for="' + id + '">記録メモ（どこまで進んだか、気づいたこと）</label><input type="text" id="' + id + '" data-act="note" data-key="' + esc(r.key) + '" value="' + esc((r.rec && r.rec.n) || "") + '">';
    if (s === "cancel") h += '<div class="note">このコマは使わず、以降の計画が自動で後ろへずれました。</div>';
    return h + "</div>";
  }

  function slotMats(r, units) {
    const us = units.slice();
    if (r.rec && r.rec.fu && A.st.units[r.rec.fu] && us.indexOf(r.rec.fu) < 0) us.push(r.rec.fu);
    return us.map(u => matHtml(u)).join("");
  }
  function slotCard(r, withClass, remTxt) {
    const past = r.date < A.ui.asof, k = r.kind, today = r.date === A.ui.asof;
    const units = [], seen = {};
    r.blocks.forEach(b => { if (!seen[b.u]) { seen[b.u] = 1; units.push(b.u); } });
    const chips = units.map(u => '<span class="chip">' + esc(unitName(u)) + "</span> ").join("");
    const metaBits = [];
    if (r.rec && r.rec.n) metaBits.push(esc(r.rec.n));
    const fl = A.st.flags && A.st.flags[r.key];
    if (fl) metaBits.push('<span class="flagchip">' + esc(fl) + "</span>");
    const meta = metaBits.length ? '<span class="meta">' + metaBits.join("　") + "</span>" : "";
    const ev = r.ev && r.kind !== "off" ? '<span class="ev">行事：' + esc(clip(r.ev, 60)) + "</span>" : "";
    const open = A.ui.open === r.key;
    const cn = withClass ? parts(cname(r.key.split("|")[0])) : null;
    const head = '<div class="sd"><b>' + md(r.date) + "</b><span class=\"dow\">" + dw(r.date) + "</span>" + (perTxt(r) ? '<span class="per">' + perTxt(r) + "</span>" : "") + (cn ? '<small class="k-' + subj(cn[1]) + '">' + esc(cn[0]) + " " + esc(cn[1].replace("の国語", "")) + "</small>" : "") + "</div>" +
      '<div class="st">' + chips + "<b>" + esc(rowTitle(r)) + "</b>" + meta + ev + '</div><div class="stt">' + pillFor(r) + (remTxt ? '<span class="rem">' + remTxt + "</span>" : "") + "</div>";
    return '<div class="slot' + (k === "off" ? " off" : "") + (past ? " past" : "") + (today ? " today" : "") + (k === "cancel" ? " cancelled" : "") + '">' +
      '<button class="srow" data-act="open" data-key="' + esc(r.key) + '" aria-expanded="' + open + '">' + head + "</button>" + (k === "off" ? "" : slotMats(r, units)) + (open ? editor(r) : "") + "</div>";
  }


  /* 単元の教材（最大6つ）と、教科書本文・指導書・プリント1・プリント2へのリンク */
  const MATF = [["d", "Googleドライブ"], ["t", "教科書"], ["g", "指導書"], ["p1", "ワークシート1"], ["p2", "ワークシート2"], ["p3", "ワークシート3"]];
  function matHtml(u) {
    const m = ((A.st.units[u] || {}).mats || []).filter(x => x && (x.n || (x.x && x.x.length) || MATF.some(f => x[f[0]])));
    if (!m.length) return "";
    return '<div class="gmat">' + m.map(x => '<div class="gm1">' + (x.n ? "<b>" + esc(x.n) + "</b>" : "") +
      MATF.filter(f => x[f[0]]).map(f => ' <a class="ml" href="' + esc(x[f[0]]) + '" target="_blank" rel="noopener noreferrer">' + f[1] + "</a>").join("") +
      (x.x || []).map(e => ' <a class="ml" href="' + esc(e.u) + '" target="_blank" rel="noopener noreferrer" title="' + esc(e.l) + '">' + esc(A.shortLabel ? A.shortLabel(e.l) : e.l) + "</a>").join("") + "</div>").join("") + "</div>";
  }
  function matForm(u) {
    const un = A.st.units[u], m = un.mats || [];
    let h = '<div class="csec" style="margin-top:14px">教材とリンク（教科書の教材を最大6つ。リンクは一覧からも開けます）</div>';
    for (let i = 0; i < 6; i++) {
      const x = m[i] || {};
      h += '<div class="matbox"><label class="small" for="mn_' + u + i + '">教材' + (i + 1) + "の名前</label>" +
        '<input type="text" id="mn_' + u + i + '" data-act="mat" data-u="' + u + '" data-i="' + i + '" data-f="n" value="' + esc(x.n || "") + '" placeholder="' + (i === 0 ? "例：羅生門" : "") + '">' +
        '<div class="matlinks">' + MATF.map(f => '<div><label class="small" for="m_' + u + i + f[0] + '">' + f[1] + '</label><input type="url" id="m_' + u + i + f[0] + '" data-act="mat" data-u="' + u + '" data-i="' + i + '" data-f="' + f[0] + '" value="' + esc(x[f[0]] || "") + '" placeholder="https://…" autocomplete="off"></div>').join("") + "</div>" + (A.views.matPicker ? A.views.matPicker(u, i) : "") + (A.views.matExtra ? A.views.matExtra(u, i) : "") + "</div>";
    }
    return h;
  }

  /* ---------- 今日 ---------- */
  function viewToday() {
    const st = A.st, asof = A.ui.asof;
    const all = st.classes.map(c => ({ c, s: J.classStats(st, c, asof) }));
    let tiles = "<div class='tiles'>";
    all.forEach(({ c, s }) => {
      const [a, b] = parts(c.name), o = split(s.pj.rows, asof);
      const gap = s.needed > 0 ? '<span class="pill p-warn">計画が' + hrsTxt(s.needed) + "分あふれる</span>" :
        s.spare > 0 ? '<span class="pill p-warn">計画なし ' + hrsTxt(s.spare) + "</span>" : '<span class="pill p-ok">計画どおり</span>';
      tiles += '<button class="tile k-' + subj(c.name) + '" data-act="goplan" data-id="' + c.id + '"><span class="tile-h"><b>' + esc(a) + "</b><span>" + esc(b) + '</span></span><span class="big num">' + s.remain + '<small>時間</small></span>' + meter(o, false) + "<span>" + gap + "</span></button>";
    });
    tiles += "</div>";
    let h = panel("p-rem", "残りの授業時間", md(asof) + "から", tiles);

    const rows = [];
    all.forEach(({ s }) => s.pj.rows.forEach(r => rows.push(r)));
    rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : ((a.periods || [0])[0] - (b.periods || [0])[0]) || (a.key < b.key ? -1 : 1));
    const evT = st.events[asof];
    const today = rows.filter(r => r.date === asof);
    h += panel("p-now", md(asof) + "（" + dw(asof) + "）の授業", today.length ? today.length + "コマ" : "", (evT ? '<p class="note" style="margin:0 0 8px">行事：' + esc(evT) + "</p>" : "") +
      (today.length ? '<div class="list">' + today.map(r => slotCard(r, true)).join("") + "</div>" : '<p class="note" style="margin:0">この日に担当授業はありません。</p>'));
    const lim = addDays(asof, 7);
    const soon = rows.filter(r => r.date > asof && r.date <= lim && r.kind !== "off");
    h += panel("p-soon", "これから1週間", soon.length ? soon.length + "コマ" : "", soon.length ? '<div class="list">' + soon.map(r => slotCard(r, true)).join("") + "</div>" : '<p class="note" style="margin:0">授業の予定はありません。</p>');
    const evs = Object.keys(st.events).filter(d => d > asof && d <= addDays(asof, 14)).sort();
    if (evs.length) h += panel("p-ev", "これからの行事（2週間）", evs.length + "件", evs.map(d => '<div class="blk"><span><b class="num">' + md(d) + "（" + dw(d) + "）</b>　" + esc(clip(st.events[d], 80)) + "</span></div>").join(""));
    const wait = rows.filter(r => r.date < asof && r.kind === "plan").length;
    if (wait) h += '<p class="note">記録がまだ入っていない過去のコマが ' + wait + " 件あります（計画表で「記録待ち」）。</p>";
    return h;
  }

  /* ---------- 計画表 ---------- */
  function remainMap() { const m = {}; A.st.classes.forEach(c => { m[c.id] = J.classStats(A.st, c, A.ui.asof); }); return m; }
  function viewPlan() {
    const st = A.st, cls = cur(), asof = A.ui.asof, rem = remainMap(), s = rem[cls.id];
    const o = split(s.pj.rows, asof), planned = s.remain - s.spare;
    const empties = s.pj.rows.filter(r => r.date >= asof && r.kind === "empty");
    const [a, b] = parts(cls.name);
    let h = classChips(rem);
    h += '<section class="panel p-cls k-' + subj(cls.name) + '"><header class="panel-h"><h2>' + esc(a) + " " + esc(b) + '</h2><span class="panel-n">' + md(asof) + "から</span></header><div class=\"panel-b\">" +
      '<div class="facts"><div class="fact main"><span class="num big">' + s.remain + '<small>時間</small></span><span class="fl">残りの授業時間</span></div>' +
      '<div class="fact"><span class="num mid">' + Math.max(0, planned) + '<small>時間</small></span><span class="fl">計画が入っている</span></div>' +
      '<div class="fact' + (s.spare ? " warn" : "") + '"><span class="num mid">' + s.spare + '<small>時間</small></span><span class="fl">まだ計画がない</span></div></div>' +
      meter(o, true) +
      (empties.length ? '<p class="note" style="margin:10px 0 0">計画がない日：' + empties.map(r => "<b>" + md(r.date) + "（" + dw(r.date) + "）</b>" + (r.hrs > 1 ? "×" + r.hrs : "")).join("、") + "</p>" : "") +
      (s.needed ? '<p class="note" style="margin:6px 0 0;color:var(--cancel)">計画が ' + s.needed + " 時間分、学期内に入りきりません。</p>" : "") +
      "</div></section>";
    h += '<div class="seg"><button data-act="pfilter" data-v="future" aria-pressed="' + !A.ui.planAll + '">これから</button><button data-act="pfilter" data-v="all" aria-pressed="' + A.ui.planAll + '">学期ぜんぶ</button></div>';
    h += '<p class="note" style="margin:0 0 10px">コマをタップして記録します。休講にすると、以降の計画が自動で後ろへずれます。</p>';
    let left = s.remain;
    const rows = s.pj.rows.map(r => {
      let t = "";
      if (r.date >= asof && (r.kind === "plan" || r.kind === "empty")) { t = "残り" + left + "時間"; left -= r.hrs; }
      return { r, t };
    }).filter(x => A.ui.planAll || x.r.date >= asof);
    h += '<div class="list">' + (rows.length ? rows.map(x => slotCard(x.r, false, x.t)).join("") : '<p class="note">これからの授業コマはありません。</p>') + "</div>";
    if (s.needed) {
      h += panel("p-ev", "学期内に入りきらない計画", hrsTxt(s.needed) + "分", "<p class='note' style='margin-top:0'>内容を削る、順番を入れ替える、補講を探す、のいずれかで調整します。</p>" +
        s.pj.left.map(bk => '<div class="blk"><span><span class="chip">' + esc(unitName(bk.u)) + "</span> " + esc(clip(bk.t, 120)) + "</span></div>").join(""));
    }
    const bl = st.plans[cls.id] || [], from = J.firstPendingIndex(st, cls, asof);
    const unitOpts = sel => unitOptions(sel, false, cls.id);
    let pb = "<p class='note' style='margin-top:0'>順番に、空いているコマへ入っていきます。内容・単元・時間を直したり、並べ替えたりできます。</p>";
    bl.forEach((bk, i) => {
      if (i < from) return;
      pb += '<div class="blkrow"><textarea id="bk_' + esc(bk.id) + '" aria-label="計画の内容" data-act="blk-t" data-id="' + esc(bk.id) + '">' + esc(bk.t) + '</textarea><div class="blkctl">' +
        '<select aria-label="単元" data-act="blk-u" data-id="' + esc(bk.id) + '">' + unitOpts(bk.u) + "</select>" +
        '<select aria-label="時間" data-act="blk-h" data-id="' + esc(bk.id) + '"><option value="1"' + (hrsOf(bk) === 1 ? " selected" : "") + '>1時間</option><option value="2"' + (hrsOf(bk) === 2 ? " selected" : "") + ">2時間</option></select>" +
        '<span class="grow"></span><span class="btns nowrap"><button class="btn sm" data-act="up" data-id="' + bk.id + '"' + (i === from ? " disabled" : "") + ' aria-label="上へ">▲</button><button class="btn sm" data-act="dn" data-id="' + bk.id + '"' + (i === bl.length - 1 ? " disabled" : "") + ' aria-label="下へ">▼</button><button class="btn sm danger" data-act="del" data-id="' + bk.id + '">削除</button></span></div></div>';
    });
    pb += '<div class="blkrow"><textarea id="addt" aria-label="追加する内容" placeholder="追加する内容（例：漢字小テスト、感想記述）"></textarea><div class="blkctl"><select id="addu" aria-label="単元">' + unitOpts(null) + '</select><select id="addh" aria-label="時間"><option value="1">1時間</option><option value="2">2時間</option></select><span class="grow"></span><button class="btn on" data-act="add">末尾に追加</button></div></div>';
    return h + panel("p-soon", "これからの計画ブロック", "", pb);
  }


  /* ---------- 単元の予定を、各クラスの計画へ順に流し込む ---------- */
  function flowItems(u, cid) {
    const used = {};
    (A.st.plans[cid] || []).forEach(b => { if (b.u === u && b.t) used[b.t] = 1; });
    const all = ((A.st.units[u] || {}).items || []).filter(Boolean);
    return all.filter(t => !used[t]);
  }
  function viewFlow() {
    const st = A.st, F = A.ui.flow, us = Object.keys(st.units);
    if (!F.u || !st.units[F.u]) F.u = us[0];
    const u = F.u, items = (st.units[u].items || []).filter(Boolean);
    let h = "<h2>単元の予定を計画に入れる</h2>" +
      '<p class="note" style="margin:0 0 8px">単元別タブで作った「授業内容の予定」を、選んだクラスの計画の最後に順番に追加します。計画のない日から前の順に埋まります。同じ内容がすでにそのクラスの計画にあれば、追加しません。</p>' +
      '<label for="flow_u">単元</label><select id="flow_u" data-act="flow-u">' + unitOptions(u) + "</select>";
    if (!items.length) return h + '<p class="note" style="margin-top:10px">この単元には「授業内容の予定」がまだありません。単元別タブで、1行＝1コマで書いてください。</p><div class="dlg-btns"><button class="btn on" data-act="flow-close">閉じる</button></div>';
    h += '<div class="csec">入れるクラス（' + items.length + "コマ分の予定）</div>";
    st.classes.forEach(c => {
      const okSub = !st.units[u].subj || st.units[u].subj === J.subjectOf(c);
      const add = okSub ? flowItems(u, c.id).length : 0, rows = J.project(st, c).rows, empty = rows.filter(r => r.kind === "empty").reduce((a, r) => a + r.hrs, 0);
      h += '<label class="flowrow k-' + subj(c.name) + '"><input type="checkbox" data-act="flow-c" data-c="' + esc(c.id) + '"' + (F.cls[c.id] ? " checked" : "") + (add ? "" : " disabled") + "> <b>" + esc(c.name) + "</b>" +
        '<span class="small">　追加 ' + add + "コマ／いま計画のない時間 " + empty + "時間" + (add > empty ? "（" + (add - empty) + "コマ分は学期内に入りきりません）" : "") + (!okSub ? "（科目が違うため対象外）" : add ? "" : "（追加なし：すべて入っています）") + "</span></label>";
    });
    const n = Object.keys(F.cls).filter(k => F.cls[k]).length;
    return h + '<div class="dlg-btns" style="justify-content:space-between"><button class="btn" data-act="flow-all">全クラス選ぶ</button><span class="btns"><button class="btn" data-act="flow-close">閉じる</button><button class="btn on" data-act="flow-do"' + (n ? "" : " disabled") + ">選んだクラスに入れる</button></span></div>";
  }


  function viewUrls() {
    let h = "<h2>Google Classroomのリンク</h2>" +
      '<p class="note" style="margin:0 0 8px">クラスごとにリンクを入れると、一覧のクラス名（S1-1現代など）を押して、新しいタブでClassroomを開けます。Classroomの画面で、そのクラスを開いたときのアドレス（https://classroom.google.com/c/…）をコピーして貼ってください。</p>' +
      '<p class="note" style="margin:0 0 8px;color:var(--cancel)">注意：「招待リンク」や「クラスコード付きのリンク」は貼らないでください。このアプリのデータは公開されるリポジトリに保存されるため、誰でも見られる場所に置かれます。</p>';
    A.st.classes.forEach(c => {
      h += '<label class="k-' + subj(c.name) + '" for="url_' + esc(c.id) + '">' + esc(c.name) + "</label>" +
        '<input type="url" id="url_' + esc(c.id) + '" data-act="cls-url" data-c="' + esc(c.id) + '" value="' + esc(c.url || "") + '" placeholder="https://classroom.google.com/c/…" autocomplete="off">';
    });
    return h + '<p class="small" id="url_msg" role="status"></p><div class="dlg-btns"><button class="btn on" data-act="url-close">閉じる</button></div>';
  }


  /* ---------- 前の学期から引き継ぐ ---------- */
  function carryDefaults(S) {
    const map = {}, on = {}, used = {};
    A.st.classes.forEach(c => {
      let m = S.classes.find(x => x.name === c.name && !used[x.id]) || S.classes.find(x => J.subjectOf(x) === J.subjectOf(c) && x.short === c.short && !used[x.id]);
      if (m) { map[c.id] = m.id; used[m.id] = 1; on[c.id] = !(A.st.plans[c.id] || []).length; }
    });
    return { map, on };
  }
  function carryUnitRows(S, sc) {
    const order = [];
    (S.plans[sc.id] || []).forEach(b => { if (order.indexOf(b.u) < 0 && S.units[b.u]) order.push(b.u); });
    return order.map(u => { const x = J.unitStats(S, sc, u); return { u, planned: x.planned, actual: x.actual }; });
  }
  function viewCarry() {
    const C = A.ui.carry, st = A.st, others = (A.terms || []).filter(t => t.id !== A.termId).slice().reverse();
    let h = "<h2>前の学期から引き継ぐ</h2>" +
      '<p class="note" style="margin:0 0 8px">前の学期の「計画の順番・授業内容・単元・教材とリンク」を、この学期のクラスに写します。日付・行事・実施の記録は写しません。引き継ぎ元は、あとから別の学期を選んで、別のクラスにやり直すこともできます。</p>' +
      '<label for="carry_src">引き継ぎ元の学期</label><select id="carry_src" data-act="carry-src"><option value="">選んでください</option>' +
      others.map(t => '<option value="' + esc(t.id) + '"' + (C.src === t.id ? " selected" : "") + ">" + esc(t.name) + "</option>").join("") + "</select>";
    const close = '<div class="dlg-btns"><button class="btn" data-act="carry-close">閉じる</button></div>';
    if (!others.length) return h + '<p class="note" style="margin-top:10px">引き継げる他の学期がありません。</p>' + close;
    if (C.loading) return h + '<p class="note" style="margin-top:10px">読み込んでいます…</p>' + close;
    if (C.err) return h + '<p class="note" style="margin-top:10px;color:var(--cancel)">' + esc(C.err) + "</p>" + close;
    if (!C.data) return h + close;
    const S = C.data;
    h += '<div class="csec">クラスの対応と、単元ごとの前回の計画・実績</div>';
    let any = 0;
    st.classes.forEach(c => {
      const sc = S.classes.find(x => x.id === C.map[c.id]), has = (st.plans[c.id] || []).length > 0;
      h += '<div class="carrybox k-' + subj(c.name) + '"><div class="carryh"><label class="carrychk"><input type="checkbox" data-act="carry-on" data-c="' + esc(c.id) + '"' + (C.on[c.id] && sc ? " checked" : "") + (sc ? "" : " disabled") + "> <b>" + esc(c.name) + "</b></label>" +
        '<select aria-label="引き継ぎ元のクラス" data-act="carry-map" data-c="' + esc(c.id) + '"><option value="">引き継がない</option>' + S.classes.map(x => '<option value="' + esc(x.id) + '"' + (x.id === C.map[c.id] ? " selected" : "") + ">← " + esc(x.name) + "</option>").join("") + "</select></div>";
      if (has && sc) h += '<p class="small" style="margin:2px 0 0;color:var(--cancel)">この学期のこのクラスには、すでに計画があります。チェックを入れて実行すると、置き換わります。</p>';
      if (sc && C.on[c.id]) {
        any++;
        const rows = carryUnitRows(S, sc);
        h += '<div class="tscroll"><table class="tbl carrytbl"><thead><tr><th>引き継ぐ</th><th>単元</th><th>前回の計画</th><th>前回の実績</th><th>差</th><th>使う時間</th></tr></thead><tbody>';
        rows.forEach(r => {
          const k = c.id + "|" + r.u, sel = C.sel[k] || { on: true, mode: "act" }, un = S.units[r.u], d = r.actual - r.planned;
          h += "<tr><td><input type=\"checkbox\" aria-label=\"引き継ぐ\" data-act=\"carry-u\" data-k=\"" + esc(k) + '"' + (sel.on ? " checked" : "") + "></td><td><b>" + esc(un.name) + '</b> <span class="small muted">' + esc(un.subj || "共通") + "</span></td><td>" + r.planned + "時間</td><td>" + r.actual + "時間</td><td>" +
            (d === 0 ? '<span class="pill p-ok">同じ</span>' : '<span class="pill p-warn">' + (d > 0 ? "+" : "") + d + "</span>") + '</td><td><span class="seg"><button data-act="carry-mode" data-k="' + esc(k) + '" data-v="plan" aria-pressed="' + (sel.mode === "plan") + '">計画 ' + r.planned + '</button><button data-act="carry-mode" data-k="' + esc(k) + '" data-v="act" aria-pressed="' + (sel.mode !== "plan") + '">実績 ' + r.actual + "</button></span></td></tr>";
        });
        h += "</tbody></table></div>";
      }
      h += "</div>";
    });
    return h + '<p class="small" style="margin:8px 0 0">「実績」を選ぶと、途中までで次のコマに続いた授業は、続きのコマも含めて写します。「計画」は、前回の計画のとおりに写します。「実績」の時間は、実施済みのコマだけの合計なので、学期の途中のデータでは少なく出ます（学期が終わってから引き継ぐと正確です）。前回の計画・実績・振り返りメモは、単元別タブにも残ります。</p>' +
      '<div class="dlg-btns"><button class="btn" data-act="carry-close">閉じる</button><button class="btn on" data-act="carry-do"' + (any ? "" : " disabled") + ">この内容で引き継ぐ</button></div>";
  }


  /* ---------- 記録がまだ入っていない過去の授業 ---------- */
  function pendingList() {
    const today = J.ds(new Date()), out = [];
    A.st.classes.forEach(c => J.project(A.st, c).rows.forEach(r => {
      if (r.date < today && (r.kind === "plan" || r.kind === "empty")) out.push({ r, c });
    }));
    out.sort((a, b) => a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : a.c.id < b.c.id ? -1 : 1);
    return out;
  }
  function viewRem() {
    const L = pendingList();
    if (!L.length) return '<h2>記録のもれはありません</h2><p class="note">過去の授業は、すべて記録（または休講・授業なしの設定）が入っています。</p><div class="dlg-btns"><button class="btn on" data-act="rem-close">閉じる</button></div>';
    const show = L.slice(0, 40);
    let h = '<h2>記録がまだ入っていない授業があります</h2><p class="note" style="margin:0 0 8px">日付が過ぎたのに、「実施した」などの記録が入っていない授業が <b>' + L.length + "コマ</b>あります。押すと、一覧のそのコマへ移動します。</p><div class=\"remlist\">";
    show.forEach(x => {
      h += '<button class="remitem k-' + subj(x.c.name) + '" data-act="rem-go" data-key="' + esc(x.r.key) + '"><b class="num">' + md(x.r.date) + "（" + dw(x.r.date) + "）</b> " + esc(x.c.short) + ' <span class="per">' + perTxt(x.r) + "</span>" +
        '<span class="remt">' + esc(x.r.kind === "empty" ? "（計画なし）" : clip(rowTitle(x.r), 36)) + "</span></button>";
    });
    h += "</div>" + (L.length > show.length ? '<p class="small">ほか ' + (L.length - show.length) + " コマ</p>" : "");
    return h + '<div class="dlg-btns" style="justify-content:space-between"><button class="btn" data-act="rem-today">今日はもう表示しない</button><span class="btns"><button class="btn" data-act="rem-close">閉じる</button><button class="btn on" data-act="rem-go" data-key="' + esc(show[0].r.key) + '">いちばん古いコマへ</button></span></div>';
  }

  /* ---------- 単元別 ---------- */
  function subjectList() { const o = []; A.st.classes.forEach(c => { const x = J.subjectOf(c); if (x && o.indexOf(x) < 0) o.push(x); }); return o; }
  function prevHtml(un) {
    const pv = un.prev; if (!pv) return "";
    const st = pv.stats || {}, rows = Object.keys(st).map(cid => "<li>" + esc(cname(cid)) + "：計画 " + st[cid][0] + "時間 → 実績 " + st[cid][1] + "時間</li>").join("");
    return '<div class="prevbox"><b>前回（' + esc(pv.term) + '）</b>' + (rows ? "<ul>" + rows + "</ul>" : "") + (pv.note ? '<p class="small" style="margin:4px 0 0">振り返りメモ：' + esc(pv.note) + "</p>" : "") + "</div>";
  }
  function viewUnit() {
    const st = A.st;
    let h = '<p class="note" style="margin-top:0">単元ごとに、配当（シラバス）・計画・実施した時間をクラス別に集計します。配当は入力できます。学期末の振り返りメモは、次回同じ授業をする時の参考になります。</p>';
    const order = ["", ...subjectList()].map(x => x).sort((a, b) => (a === "" ? 1 : 0) - (b === "" ? 1 : 0));
    const uKeys = Object.keys(st.units).sort((a, b) => order.indexOf(st.units[a].subj || "") - order.indexOf(st.units[b].subj || ""));
    let lastSj = null;
    uKeys.forEach(u => {
      const un = st.units[u];
      if ((un.subj || "") !== lastSj) { lastSj = un.subj || ""; h += '<h2 class="subjh k-' + subj(lastSj) + '">' + esc(lastSj || "共通") + "</h2>"; }
      const cs = st.classes.filter(c => (st.plans[c.id] || []).some(b => b.u === u) || un.allot[c.id] != null || (un.subj && J.subjectOf(c) === un.subj) || J.unitStats(st, c, u).swapped > 0);
      const subjOpts = ["", ...subjectList()].map(x => '<option value="' + esc(x) + '"' + (x === (un.subj || "") ? " selected" : "") + ">" + esc(x || "共通（どの科目でも使う）") + "</option>").join("");
      let b = '<div class="row2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label class="small" for="un_subj_' + u + '">科目</label><select id="un_subj_' + u + '" data-act="un-subj" data-id="' + u + '">' + subjOpts + '</select></div>' +
        '<div><label class="small" for="un_name_' + u + '">単元名（科目名は付けない）</label><input type="text" id="un_name_' + u + '" data-act="un-name" data-id="' + u + '" value="' + esc(un.name) + '"></div></div>' +
        '<div class="tscroll" style="margin-top:8px"><table class="tbl"><thead><tr><th>クラス</th><th>配当（時間）</th><th>計画</th><th>実施済み</th><th>期間</th><th>差</th></tr></thead><tbody>';
      if (!cs.length) b += '<tr><td colspan="6" class="note">この単元を使うクラスはまだありません。</td></tr>';
      cs.forEach(c => {
        const x = J.unitStats(st, c, u), al = un.allot[c.id];
        let d = '<span class="note">配当未入力</span>';
        if (x.leftU) d = '<span class="pill p-warn">' + x.leftU + "時間入らない</span>";
        else if (al != null && al !== "") { const diff = x.slotsU - al; d = diff === 0 ? '<span class="pill p-ok">配当どおり</span>' : '<span class="pill p-warn">' + (diff > 0 ? "+" : "") + diff + "</span>"; }
        b += "<tr><td>" + esc(c.name) + '</td><td><input class="num-in" type="number" min="0" step="1" inputmode="numeric" aria-label="' + esc(c.name) + 'の配当" data-act="allot" data-u="' + u + '" data-c="' + c.id + '" value="' + (al == null ? "" : al) + '"></td><td>' + x.planned + "</td><td>" + x.actual + (x.swapped ? ' <span class="small muted">（別の内容で ' + x.swapped + '）</span>' : "") + "</td><td>" + (x.start ? md(x.start) + "〜" + md(x.end) : "−") + "</td><td>" + d + "</td></tr>";
      });
      b += '</tbody></table></div>' + prevHtml(un) + (A.views.past ? A.views.past(u) : "") + '<div style="margin-top:12px"><button class="btn" data-act="flow-open" data-u="' + u + '">この単元の予定を各クラスの計画に入れる</button></div>' + matForm(u) + '<label class="small unitnote" for="ui_' + u + '">この単元の授業内容の予定（1行＝1コマ。一覧の画面で選んで使えます）</label><textarea id="ui_' + u + '" data-act="un-items" data-id="' + u + '" style="min-height:110px" placeholder="例：\n導入・語句の確認\n本文の読解①\n本文の読解②\nまとめ・小テスト">' + esc((un.items || []).join("\n")) + '</textarea><label class="small unitnote" for="un_' + u + '">学期末の振り返りメモ</label><textarea id="un_' + u + '" data-act="un" data-id="' + u + '" placeholder="うまくいった点、時間がかかった点、次回の工夫">' + esc(st.unitNotes[u] || "") + "</textarea>";
      h += panel("p-soon", esc(un.name), un.subj || "共通", b);
    });
    return h + panel("p-ev", "単元を追加", "", '<div class="addrow" style="grid-template-columns:160px 1fr auto"><select id="newunit_s" aria-label="科目">' + ["", ...subjectList()].map(x => '<option value="' + esc(x) + '">' + esc(x || "共通") + "</option>").join("") + '</select><input type="text" id="newunit" aria-label="単元名" placeholder="単元名（例：羅生門）"><button class="btn on" data-act="addunit">追加</button></div>' + (A.views.tbPicker ? A.views.tbPicker() : ""));
  }

  /* ---------- サマリー ---------- */
  function viewSummary() {
    const st = A.st, cls = cur(), asof = A.ui.asof, rem = remainMap(), rows = rem[cls.id].pj.rows, s0 = rem[cls.id];
    const sum = f => rows.filter(f).reduce((a, r) => a + r.hrs, 0);
    const tile = (v, l) => '<div class="stat"><span class="num big">' + v + "</span><span class=\"fl\">" + l + "</span></div>";
    let h = classChips(rem);
    h += panel("p-cls k-" + subj(cls.name), esc(cls.name) + "：" + esc(st.term.name) + "のまとめ", "", "<div class='stats'>" +
      tile(sum(r => r.kind === "done" || r.kind === "part"), "実施（時間）") + tile(sum(r => r.kind === "cancel"), "休講") + tile(sum(r => r.kind === "free"), "別の内容") + tile(sum(r => r.kind === "off"), "行事などで授業なし") + tile(s0.remain, "これから（残り）") + "</div>" + meter(split(rows, asof), true));
    const order = [];
    (st.plans[cls.id] || []).forEach(b => { if (order.indexOf(b.u) < 0) order.push(b.u); });
    rows.forEach(r => { if (r.kind === "free" && r.rec && r.rec.fu && st.units[r.rec.fu] && order.indexOf(r.rec.fu) < 0) order.push(r.rec.fu); });
    let ub = "<div class='grid'>";
    order.forEach(u => {
      const ru = rows.filter(r => r.blocks.some(b => b.u === u) || (r.kind === "free" && r.rec && r.rec.fu === u));
      if (!ru.length) return;
      const x = J.unitStats(st, cls, u), al = (st.units[u] || { allot: {} }).allot[cls.id];
      const txt = (r, first) => { const bs = r.blocks.filter(b => b.u === u); return bs.length ? (first ? bs[0] : bs[bs.length - 1]).t : (r.rec && r.rec.t) || "別の内容"; };
      const firstB = { t: txt(ru[0], true) }, lastB = { t: txt(ru[ru.length - 1], false) };
      ub += '<div class="card ucard"><h3>' + esc(unitName(u)) + (st.units[u].subj ? ' <small class="muted">' + esc(st.units[u].subj) + "</small>" : "") + '</h3><div class="num">' + md(ru[0].date) + "〜" + md(ru[ru.length - 1].date) + "　" + x.slotsU + "時間（実施 " + x.actual + (al ? "／配当 " + al : "") + ")</div>" +
        '<p class="flow">はじめ：' + esc(clip(firstB.t, 46)) + "<br>おわり：" + esc(clip(lastB.t, 46)) + "</p>" +
        (st.unitNotes[u] ? '<p class="flow" style="color:var(--ink)">メモ：' + esc(clip(st.unitNotes[u], 120)) + "</p>" : "") + "</div>";
    });
    h += panel("p-soon", "単元ごとの流れ", "", ub + "</div>");
    let tb = "<div class='tscroll'><table class='tbl tl sumtbl'><thead><tr><th>日付</th><th>時間</th><th>単元</th><th>内容</th><th>記録メモ</th><th>状態</th><th>行事</th></tr></thead><tbody>";
    rows.forEach(r => {
      const wait = r.date < asof && r.kind === "plan";
      tb += '<tr class="r-' + r.kind + '"><td class="d">' + md(r.date) + "（" + dw(r.date) + "）</td><td>" + r.hrs + "</td><td>" +
        esc(r.blocks.length ? unitName(r.blocks[0].u) : "") + '</td><td class="c m">' + esc(rowTitle(r)) + "</td><td>" + esc((r.rec && r.rec.n) || "") +
        '</td><td><span class="pill ' + (wait ? "p-warn" : PILL[r.kind]) + '">' + (wait ? "記録待ち" : LABEL[r.kind]) + '</span></td><td class="ev2">' + esc(clip(r.ev, 40)) + "</td></tr>";
    });
    return h + panel("p-rem", "いつ・何をやったか（全コマ）", rows.length + "日", tb + "</tbody></table></div>");
  }


  /* ---------- 一覧（スプレッドシートのように、日付×授業を1枚で見る） ---------- */
  /* 一覧の編集モード：コマの中で、単元・授業内容・記録・状態を直接直せる */
  function defaultUnit(c) {
    const l = A.ui.lastUnit[c.id];
    if (l && A.st.units[l]) return l;
    const bl = A.st.plans[c.id] || [];
    const sj = J.subjectOf(c), ks = Object.keys(A.st.units).filter(u => !A.st.units[u].subj || A.st.units[u].subj === sj);
    const last = bl.length ? bl[bl.length - 1].u : null;
    return last && ks.indexOf(last) >= 0 ? last : (ks[0] || Object.keys(A.st.units)[0]);
  }
  function gridCellEdit(r, c, asof) {
    const k = r.kind, sk = "k-" + subj(k === "free" && r.rec && r.rec.sj ? r.rec.sj : c.name), key = esc(r.key), s = (r.rec && r.rec.s) || "plan";
    const waiting = r.date < asof && k === "plan";
    const St = (v, t) => '<button class="mini' + (s === v ? " on" : "") + '" data-act="st" data-key="' + key + '" data-v="' + v + '" aria-pressed="' + (s === v) + '">' + t + "</button>";
    let h = '<div class="gtop"><span class="per">' + perTxt(r) + "</span>" + (waiting ? '<span class="gk wait">記録待ち</span>' : "") +
      (r.ev ? '<span class="gk ev" title="' + esc(r.ev) + '">行事</span>' : "") +
      '<button class="mini more" data-act="cell" data-key="' + key + '" title="順番の入れ替え・削除など">詳細</button></div>';
    if (r.ev) h += '<div class="gev">行事：' + esc(clip(r.ev, 40)) + "</div>";
    h += '<div class="gst">' + St("done", "実施") + St("part", "途中") + St("cancel", "休講") + St("free", "別") + St("plan", "予定") +
      '<button class="mini" data-act="offset" data-key="' + key + '" title="行事などで授業なし（休校）にする">なし</button></div>';
    if (s === "cancel") h += '<div class="gnote">休講（以降の計画が後ろへずれます）</div>';
    else if (s === "free") h += freeForm(r, "g" + sid(r.key), true);
    else if (r.blocks.length) {
      r.blocks.forEach(b => {
        h += '<div class="gblk' + (r.cont ? " cont" : "") + '"><select class="gsel" aria-label="単元" data-act="blk-u" data-id="' + esc(b.id) + '">' + unitOptions(b.u, true, c.id) + "</select>" +
          '<select class="gsel pick" aria-label="単元の予定から入れる" data-act="bpick" data-id="' + esc(b.id) + '">' + itemOptions(b.u, c.id) + "</select>" +
          '<textarea class="gta" aria-label="授業内容" placeholder="授業内容" data-act="bt" data-id="' + esc(b.id) + '">' + esc(b.t) + "</textarea>" + matHtml(b.u) + "</div>";
      });
    } else {
      const u = defaultUnit(c);
      h += '<div class="gblk new"><select class="gsel gnew-u" aria-label="単元" data-act="gnew-u" data-c="' + esc(c.id) + '">' + unitOptions(u, true, c.id) + "</select>" +
        '<select class="gsel pick" aria-label="単元の予定から入れる" data-act="gnew-pick" data-key="' + key + '">' + itemOptions(u, c.id) + "</select>" +
        '<textarea class="gta" aria-label="授業内容" placeholder="授業内容を入力（計画なし）" data-act="gnew-t" data-key="' + key + '"></textarea>' + matHtml(u) + "</div>";
    }
    h += '<textarea class="gta gmemo" aria-label="実施しての記録" placeholder="記録（どこまで進んだか）" data-act="note" data-key="' + key + '">' + esc((r.rec && r.rec.n) || "") + "</textarea>";
    return '<td data-k="' + key + '" class="gc has edit ' + sk + " s-" + k + (waiting ? " s-wait" : "") + '">' + h + "</td>";
  }
  function gridCell(r, c, asof, unitChip) {
    const k = r.kind, sk = "k-" + subj(k === "free" && r.rec && r.rec.sj ? r.rec.sj : c.name);
    if (k === "off") {
      const closed = /休校|休講/.test(r.off);
      return '<td data-k="' + esc(r.key) + '" class="gc has off ' + sk + (closed ? " closed" : "") + '" data-act="cell" data-key="' + esc(r.key) + '" tabindex="0" role="button" title="' + esc(r.off) + '">' +
        '<div class="gtop"><span class="per">' + perTxt(r) + '</span><span class="gk off">' + (closed ? "休校" : "授業なし") + "</span>" + (r.hrs > 1 ? '<span class="gh">' + r.hrs + "時間</span>" : "") + "</div>" +
        '<div class="gt">' + esc(clip(r.off, 40)) + '</div></td>';
    }
    if (A.ui.gridEdit) return gridCellEdit(r, c, asof);
    const waiting = r.date < asof && k === "plan";
    let text, memo = (r.rec && r.rec.n) || "", mark = "";
    const blank = k === "plan" && r.blocks.length && r.blocks.every(b => !(b.t || "").trim());
    if (k === "cancel") { text = "休講"; }
    else if (k === "free") text = freeTitle(r);
    else if (k === "empty") text = "（計画なし）";
    else if (blank) text = "（内容を入力）";
    else text = (r.cont ? "（続き）" : "") + r.blocks.map(b => b.t).filter(Boolean).join(" ／ ");
    if (k === "done") mark = '<span class="gk ok">実施</span>';
    else if (k === "part") mark = '<span class="gk mid">途中</span>';
    else if (waiting) mark = '<span class="gk wait">記録待ち</span>';
    const fl = A.st.flags && A.st.flags[r.key];
    const evTag = r.ev ? '<span class="gk ev" title="' + esc(r.ev) + '">行事</span>' : "";
    const full = plain(text) + (memo ? "／" + memo : "") + (r.ev ? "／行事：" + r.ev : "");
    return '<td data-k="' + esc(r.key) + '" class="gc has ' + sk + " s-" + k + (blank ? " s-blank" : "") + (waiting ? " s-wait" : "") + '" data-act="cell" data-key="' + esc(r.key) + '" tabindex="0" role="button" title="' + esc(full) + '">' +
      '<div class="gtop"><span class="per">' + perTxt(r) + "</span>" + (unitChip ? '<span class="gu">' + esc(unitChip) + "</span>" : "") + (r.hrs > 1 ? '<span class="gh">' + r.hrs + "時間</span>" : "") + evTag + mark + "</div>" +
      '<div class="gt">' + (fl ? '<span class="flagchip">' + esc(fl) + "</span> " : "") + esc(plain(text)) + "</div>" + (memo ? '<div class="gm">' + esc(memo) + "</div>" : "") + r.blocks.map(b => b.u).filter((x, i, ar) => ar.indexOf(x) === i).map(matHtml).join("") + "</td>";
  }
  function viewGrid() {
    const st = A.st, asof = A.ui.asof;
    let cls = st.classes.slice();
    if (A.ui.gridSubj !== "all") cls = cls.filter(c => subj(c.name) === A.ui.gridSubj);
    if (A.ui.gridOrder === "subject") cls = cls.map((c, i) => ({ c, i })).sort((a, b) => (subj(a.c.name) === subj(b.c.name) ? 0 : subj(a.c.name) === "gen" ? -1 : 1) || a.i - b.i).map(x => x.c);
    const stats = {}, rmap = {};
    cls.forEach(c => { stats[c.id] = J.classStats(st, c, asof); rmap[c.id] = {}; stats[c.id].pj.rows.forEach(r => { rmap[c.id][r.date] = r; }); });
    const prefixes = [];
    st.classes.forEach(c => { const p = parts(c.name)[0]; if (prefixes.indexOf(p) < 0) prefixes.push(p); });
    const grp = c => prefixes.indexOf(parts(c.name)[0]) % 4 + 1;
    const seg = (act, cur, items) => '<div class="seg">' + items.map(x => '<button data-act="' + act + '" data-v="' + x[0] + '" aria-pressed="' + (cur === x[0]) + '">' + x[1] + "</button>").join("") + "</div>";
    let h = '<div class="gridbar">' + seg("gord", A.ui.gridOrder, [["class", "クラス順"], ["subject", "科目ごと"]]) +
      seg("gsub", A.ui.gridSubj, [["all", "すべて"], ["gen", "現代の国語"], ["lang", "言語文化"]]) +
      seg("gedit", A.ui.gridEdit ? "e" : "v", [["e", "編集"], ["v", "見るだけ"]]) +
      '<button class="btn" data-act="gridtoday">今日の位置へ</button><button class="btn" data-act="carry-open" title="前の学期の計画・単元・教材を、この学期に写します">前の学期から引き継ぐ</button><button class="btn" data-act="url-open" title="各クラスのGoogle Classroomのリンクを設定します">Classroomリンク</button><button class="btn" data-act="flow-open" title="単元別タブで作った予定を、各クラスの計画に順に入れます">単元の予定を計画に入れる</button><span class="glegend"><span><i class="lg-gen"></i>現代の国語</span><span><i class="lg-lang"></i>言語文化</span><span><i style="background:var(--today-soft);border-color:var(--today)"></i>今日</span></span><span class="note">' + (A.ui.gridEdit ? "コマの中で単元・内容・記録を直接直せます。「詳細」で順番の入れ替えなど。" : "コマをタップすると、記録・休講・内容の書き換えができます。") + '</span></div>';
    h += '<div class="gridwrap" tabindex="-1"><table class="gridt' + (A.ui.gridEdit ? " edit" : "") + '" style="--n:' + cls.length + '"><colgroup><col class="col-d"><col class="col-e">' + cls.map(() => '<col class="col-c">').join("") + "</colgroup><thead><tr>" +
      '<th class="c-date" rowspan="2">日</th><th class="c-ev" rowspan="2">行事</th>' +
      cls.map(c => '<th class="gh1 hs-' + subj(c.name) + '">' + (c.url ? '<a class="gcl" href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer" title="Google Classroomを新しいタブで開く">' + esc(c.short) + ' <span aria-hidden="true">↗</span></a>' : '<button class="gcl none" data-act="url-open" title="Google Classroomのリンクを設定する">' + esc(c.short) + ' <span aria-hidden="true">＋</span></button>') + "<small>" + esc(c.tt.map(t => J.DOW[t[0]] + t[1]).join("・")) + "</small></th>").join("") + "</tr><tr>" +
      cls.map(c => '<th class="gh2 hs-' + subj(c.name) + '">残り <b class="num">' + stats[c.id].remain + "</b> 時間</th>").join("") + "</tr></thead><tbody>";
    const lastUnit = {};
    for (let d = st.term.start; d <= st.term.end; d = addDays(d, 1)) {
      const w = J.pd(d).getDay(), ev = st.events[d] || "";
      let active = 0, cells = "";
      cls.forEach(c => {
        const r = rmap[c.id][d];
        if (!r) { cells += '<td class="gc"></td>'; return; }
        let chip = "";
        if (r.blocks.length) chip = r.blocks.map(b => unitName(b.u)).filter((x, i, arr) => arr.indexOf(x) === i).join("・");
        if (r.kind !== "off") active++;
        cells += gridCell(r, c, asof, chip);
      });
      const wk = w === 0 || w === 6;
      h += '<tr class="' + (d === asof ? "gr-today " : "") + (w === 1 ? "mon " : "") + (!active ? (wk ? "wk" : "none") : "") + '"' + (d === asof ? ' id="gr-today"' : "") + '><td class="c-date"><b class="num">' + md(d) + '</b><span class="dow">' + dw(d) + '</span></td><td class="c-ev" title="' + esc(ev) + '">' + esc(clip(ev, 70)) + "</td>" + cells + "</tr>";
    }
    return h + "</tbody></table></div>";
  }
  const subjLabel = u => (A.st.units[u].subj || "共通");
  /* 単元の選択肢。クラス(cid)を渡すと、そのクラスの科目の単元（と「共通」）だけに絞る。渡さなければ科目ごとにまとめて全部出す */
  function unitOptions(sel, withNew, cid) {
    const opt = u => '<option value="' + u + '"' + (u === sel ? " selected" : "") + ">" + esc(A.st.units[u].name) + "</option>";
    const keys = Object.keys(A.st.units);
    let h;
    if (cid) {
      const c = A.st.classes.find(x => x.id === cid), sj = c ? J.subjectOf(c) : "";
      let ok = keys.filter(u => !A.st.units[u].subj || A.st.units[u].subj === sj || u === sel);
      h = ok.filter(u => A.st.units[u].subj).map(opt).join("") + (ok.some(u => !A.st.units[u].subj) ? '<optgroup label="共通">' + ok.filter(u => !A.st.units[u].subj).map(opt).join("") + "</optgroup>" : "");
    } else {
      const groups = []; keys.forEach(u => { const g = subjLabel(u); if (groups.indexOf(g) < 0) groups.push(g); });
      h = groups.map(g => '<optgroup label="' + esc(g) + '">' + keys.filter(u => subjLabel(u) === g).map(opt).join("") + "</optgroup>").join("");
    }
    return h + (withNew ? '<option value="__new">＋ 新しい単元をつくる…</option>' : "");
  }
  /* 単元の予定（単元別タブで立てたもの）。このクラスで使用済みのものには ✓ を付ける */
  function itemOptions(u, cid) {
    const items = ((A.st.units[u] || {}).items || []).filter(Boolean);
    const used = {};
    ((A.st.plans[cid] || [])).forEach(b => { if (b.u === u && b.t) used[b.t] = 1; });
    return '<option value="">' + (items.length ? "単元の予定から選ぶ…" : "（予定なし）") + '</option>' +
      items.map((t, i) => '<option value="' + i + '">' + (used[t] ? "✓ " : "") + (i + 1) + "　" + esc(clip(t, 40)) + "</option>").join("");
  }
  function viewCell(key) {
    const c = A.st.classes.find(x => x.id === key.split("|")[0]);
    const r = c && J.project(A.st, c).rows.find(x => x.key === key);
    if (!r) return null;
    const k = esc(r.key), s = (r.rec && r.rec.s) || "plan", id = sid(r.key);
    let h = "<h2>" + esc(c.name) + "　" + md(r.date) + "（" + dw(r.date) + "）　" + perTxt(r) + "</h2>" +
      (r.ev ? '<p class="note" style="margin:0 0 6px">行事：' + esc(r.ev) + "</p>" : "") +
      '<p class="cell-now">' + pillFor(r) + " <b>" + esc(rowTitle(r)) + "</b></p>";
    if (r.kind === "off") {
      h += '<div class="note" style="margin-bottom:8px">授業なしの理由：' + esc(r.off) + '</div><div class="btns"><button class="btn" data-act="offclear" data-key="' + k + '">この日は授業を行う</button></div>';
      return h + '<div class="dlg-btns"><button class="btn on" data-act="close-cell">閉じる</button></div>';
    }
    const B = (v, t) => '<button class="btn' + (s === v ? " on" : "") + '" data-act="st" data-key="' + k + '" data-v="' + v + '">' + t + "</button>";
    h += '<div class="csec">このコマの状態</div><div class="btns">' + B("done", "実施した") + B("part", "途中まで") + B("cancel", "休講にする") + B("free", "別の内容にする") +
      '<button class="btn" data-act="offset" data-key="' + k + '">行事で授業なし</button>' + B("plan", "予定に戻す") + "</div>";
    if (s === "free") h += '<p class="note" style="margin:8px 0 0">「別の内容」は、計画とは別のこと（学年集会・テスト返却など）をやった日用です。計画の授業内容として入れたいときは「予定に戻す」を押してください。</p>' +
      freeForm(r, id + "d", false);
    if (s === "cancel") h += '<p class="note" style="margin:8px 0 0">このコマは使わず、以降の計画が自動で後ろへずれました。</p>';
    if (s !== "cancel" && s !== "free") {
      h += '<div class="csec">授業の単元と内容</div>';
      if (r.kind === "empty") h += '<p class="note" style="margin:0 0 6px">このコマは計画がありません。下で単元と内容を入れて「このコマに入れる」を押すと、（計画なし）が消えます。</p>';
      r.blocks.forEach((b, i) => {
        const x = J.unitStats(A.st, c, b.u), al = (A.st.units[b.u] || { allot: {} }).allot[c.id];
        h += '<div class="cbk"><div class="row2"><div><label for="bu_' + id + i + '">単元</label><select id="bu_' + id + i + '" data-act="blk-u" data-id="' + esc(b.id) + '">' + unitOptions(b.u, false, c.id) + "</select></div>" +
          '<div><label for="bp_' + id + i + '">単元の予定から入れる</label><select id="bp_' + id + i + '" data-act="bpick" data-id="' + esc(b.id) + '">' + itemOptions(b.u, c.id) + "</select></div></div>" +
          '<p class="hint">この単元：計画 ' + x.planned + "時間" + (al != null && al !== "" ? "／配当 " + al + "時間" : "") + "</p>" +
          '<label for="bt_' + id + i + '">授業内容（空にすると内容なしになります）</label><textarea id="bt_' + id + i + '" data-act="bt" data-id="' + esc(b.id) + '" placeholder="授業内容を入力">' + esc(b.t) + "</textarea>" + matHtml(b.u) +
          '<div class="btns" style="margin-top:6px"><select aria-label="時間" data-act="blk-h" data-id="' + esc(b.id) + '" style="width:auto"><option value="1"' + (hrsOf(b) === 1 ? " selected" : "") + '>1時間</option><option value="2"' + (hrsOf(b) === 2 ? " selected" : "") + ">2時間</option></select>" +
          '<button class="btn sm" data-act="bup" data-id="' + esc(b.id) + '">▲ 前のコマへ</button><button class="btn sm" data-act="bdn" data-id="' + esc(b.id) + '">▼ 後のコマへ</button>' +
          '<button class="btn sm danger" data-act="bdel" data-id="' + esc(b.id) + '">この内容を削除（以降が前に詰まる）</button></div></div>';
      });
      const au = A.ui.addUnit && A.st.units[A.ui.addUnit] ? A.ui.addUnit : (r.blocks.length ? r.blocks[r.blocks.length - 1].u : Object.keys(A.st.units)[0]);
      h += '<div class="cadd"><h3>' + (r.blocks.length ? "授業内容を追加する" : "このコマに授業内容を入れる") + '</h3><div class="row2"><div><label for="cu">単元</label><select id="cu" data-act="cu">' + unitOptions(au, false, c.id) + "</select></div>" +
        '<div><label for="cp">単元の予定から入れる</label><select id="cp" data-act="cp">' + itemOptions(au, c.id) + "</select></div></div>" +
        '<label for="ct">授業内容</label><textarea id="ct" placeholder="授業内容を入力"></textarea>' +
        '<div class="btns" style="margin-top:6px"><select id="ch" aria-label="時間" style="width:auto"><option value="1"' + (r.kind === "empty" && r.hrs === 1 || r.hrs === 1 ? " selected" : "") + '>1時間</option><option value="2"' + (r.hrs > 1 ? " selected" : "") + ">2時間</option></select>" +
        (r.blocks.length ? '<button class="btn" data-act="cins" data-key="' + k + '" data-v="before">このコマの前に入れる</button><button class="btn" data-act="cins" data-key="' + k + '" data-v="after">このコマの後に入れる</button>'
          : '<button class="btn on" data-act="cins" data-key="' + k + '" data-v="after">このコマに入れる</button>') + "</div>" +
        '<div class="cnu"><input type="text" id="cnu" placeholder="新しい単元名（なければ作る）" aria-label="新しい単元名"><button class="btn" data-act="cnewunit">単元を作る</button></div></div>';
    }
    h += '<div class="csec">実施しての記録</div><div class="cmemo"><textarea id="' + id + '" data-act="note" data-key="' + k + '" placeholder="どこまで進んだか、気づいたこと" style="min-height:80px">' + esc((r.rec && r.rec.n) || "") + "</textarea></div>";
    return h + '<div class="dlg-btns"><button class="btn on" data-act="close-cell">閉じる</button></div>';
  }

  A.views = { rem: viewRem, pendingList, carry: viewCarry, carryDefaults, urls: viewUrls, flow: viewFlow, flowItems, today: viewToday, plan: viewPlan, grid: viewGrid, unit: viewUnit, sum: viewSummary, cell: viewCell };
})(window);
