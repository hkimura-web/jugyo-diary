/* 授業ダイアリー: 画面の組み立て（今日 / 計画表 / 単元別 / サマリー） */
(function (root) {
  "use strict";
  const J = root.JD, { esc, md, dw, addDays, hrsOf } = J;
  const A = root.A = { st: null, ui: { tab: "today", cls: null, open: null, planAll: false, asof: J.ds(new Date()) } };

  const LABEL = { plan: "予定", done: "実施", part: "途中まで", cancel: "休講", free: "別の内容", off: "授業なし", empty: "計画なし" };
  const PILL = { plan: "p-plan", done: "p-done", part: "p-part", cancel: "p-cancel", free: "p-free", off: "p-off", empty: "p-warn" };
  const unitName = u => ((A.st.units[u] || {}).name) || "（単元未設定）";
  const cname = id => (A.st.classes.find(c => c.id === id) || {}).name || id;
  const sid = k => "n_" + k.replace(/[^0-9a-z]/gi, "_");
  const plain = s => String(s).replace(/\s*\/\s*/g, " / ");
  const clip = (s, n) => { s = plain(s); return s.length > n ? s.slice(0, n) + "…" : s; };
  const cur = () => A.st.classes.find(c => c.id === A.ui.cls) || A.st.classes[0];
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
    if (r.kind === "free") return r.rec.t || "別の内容";
    if (r.kind === "empty") return "この日に入れる計画がありません";
    return (r.cont ? "（続き）" : "") + r.blocks.map(b => b.t).join("　／　");
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
    if (s === "free") h += '<label class="small" for="t_' + id + '">何をやったか</label><input type="text" id="t_' + id + '" data-act="ft" data-key="' + esc(r.key) + '" value="' + esc(r.rec.t || "") + '" placeholder="例：学年集会、テスト返却">';
    r.blocks.forEach((b, i) => {
      h += '<label class="small" for="bt_' + id + i + '">授業内容（' + esc(unitName(b.u)) + '）実際にやった内容に書き換えられます</label><textarea id="bt_' + id + i + '" data-act="bt" data-id="' + esc(b.id) + '">' + esc(b.t) + "</textarea>";
    });
    h += '<label class="small" for="' + id + '">記録メモ（どこまで進んだか、気づいたこと）</label><input type="text" id="' + id + '" data-act="note" data-key="' + esc(r.key) + '" value="' + esc((r.rec && r.rec.n) || "") + '">';
    if (s === "cancel") h += '<div class="note">このコマは使わず、以降の計画が自動で後ろへずれました。</div>';
    return h + "</div>";
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
    const head = '<div class="sd"><b>' + md(r.date) + "</b><span class=\"dow\">" + dw(r.date) + "</span>" + (cn ? '<small class="k-' + subj(cn[1]) + '">' + esc(cn[0]) + " " + esc(cn[1].replace("の国語", "")) + "</small>" : "") + "</div>" +
      '<div class="st">' + chips + "<b>" + esc(rowTitle(r)) + "</b>" + meta + ev + '</div><div class="stt">' + pillFor(r) + (remTxt ? '<span class="rem">' + remTxt + "</span>" : "") + "</div>";
    return '<div class="slot' + (k === "off" ? " off" : "") + (past ? " past" : "") + (today ? " today" : "") + (k === "cancel" ? " cancelled" : "") + '">' +
      '<button class="srow" data-act="open" data-key="' + esc(r.key) + '" aria-expanded="' + open + '">' + head + "</button>" + (open ? editor(r) : "") + "</div>";
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
    rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1);
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
    const unitOpts = sel => Object.keys(st.units).map(u => '<option value="' + u + '"' + (u === sel ? " selected" : "") + ">" + esc(st.units[u].name) + "</option>").join("");
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

  /* ---------- 単元別 ---------- */
  function viewUnit() {
    const st = A.st;
    let h = '<p class="note" style="margin-top:0">単元ごとに、配当（シラバス）・計画・実施した時間をクラス別に集計します。配当は入力できます。学期末の振り返りメモは、次回同じ授業をする時の参考になります。</p>';
    Object.keys(st.units).forEach(u => {
      const un = st.units[u];
      const cs = st.classes.filter(c => (st.plans[c.id] || []).some(b => b.u === u) || un.allot[c.id] != null);
      let b = '<label class="small" for="un_name_' + u + '">単元名</label><input type="text" id="un_name_' + u + '" data-act="un-name" data-id="' + u + '" value="' + esc(un.name) + '">' +
        '<div class="tscroll" style="margin-top:8px"><table class="tbl"><thead><tr><th>クラス</th><th>配当（時間）</th><th>計画</th><th>実施済み</th><th>期間</th><th>差</th></tr></thead><tbody>';
      if (!cs.length) b += '<tr><td colspan="6" class="note">この単元を使うクラスはまだありません。</td></tr>';
      cs.forEach(c => {
        const x = J.unitStats(st, c, u), al = un.allot[c.id];
        let d = '<span class="note">配当未入力</span>';
        if (x.leftU) d = '<span class="pill p-warn">' + x.leftU + "時間入らない</span>";
        else if (al != null && al !== "") { const diff = x.slotsU - al; d = diff === 0 ? '<span class="pill p-ok">配当どおり</span>' : '<span class="pill p-warn">' + (diff > 0 ? "+" : "") + diff + "</span>"; }
        b += "<tr><td>" + esc(c.name) + '</td><td><input class="num-in" type="number" min="0" step="1" inputmode="numeric" aria-label="' + esc(c.name) + 'の配当" data-act="allot" data-u="' + u + '" data-c="' + c.id + '" value="' + (al == null ? "" : al) + '"></td><td>' + x.planned + "</td><td>" + x.actual + "</td><td>" + (x.start ? md(x.start) + "〜" + md(x.end) : "−") + "</td><td>" + d + "</td></tr>";
      });
      b += '</tbody></table></div><label class="small unitnote" for="un_' + u + '">学期末の振り返りメモ</label><textarea id="un_' + u + '" data-act="un" data-id="' + u + '" placeholder="うまくいった点、時間がかかった点、次回の工夫">' + esc(st.unitNotes[u] || "") + "</textarea>";
      h += panel("p-soon", esc(un.name), "", b);
    });
    return h + panel("p-ev", "単元を追加", "", '<div class="addrow" style="grid-template-columns:1fr auto"><input type="text" id="newunit" aria-label="単元名" placeholder="単元名（例：羅生門）"><button class="btn on" data-act="addunit">追加</button></div>');
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
    let ub = "<div class='grid'>";
    order.forEach(u => {
      const ru = rows.filter(r => r.blocks.some(b => b.u === u));
      if (!ru.length) return;
      const x = J.unitStats(st, cls, u), al = (st.units[u] || { allot: {} }).allot[cls.id];
      const firstB = ru[0].blocks.find(b => b.u === u), lastB = ru[ru.length - 1].blocks.filter(b => b.u === u).pop();
      ub += '<div class="card ucard"><h3>' + esc(unitName(u)) + '</h3><div class="num">' + md(ru[0].date) + "〜" + md(ru[ru.length - 1].date) + "　" + x.slotsU + "時間（実施 " + x.actual + (al ? "／配当 " + al : "") + ")</div>" +
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

  A.views = { today: viewToday, plan: viewPlan, unit: viewUnit, sum: viewSummary };
})(window);
