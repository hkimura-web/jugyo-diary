// 実行: node tests/logic.test.js
const assert = require("assert");
const fs = require("fs");
const J = require("../js/logic.js");
const load = () => JSON.parse(fs.readFileSync(__dirname + "/../data/2026-2.json", "utf8"));

// 1) 10/23時点の「残り授業時間」が、元のシートの数字と一致する
const st = load();
const sheet = [6, 6, 7, 6, 5, 8, 8, 7];
st.classes.forEach((c, i) => assert.strictEqual(J.classStats(st, c, "2026-10-23").remain, sheet[i], c.short));

// 2) 休講にすると、以降の計画が1コマずつ後ろへずれる
const c = st.classes[0];
const texts = () => J.project(st, c).rows.filter(r => r.date >= "2026-11-09" && r.blocks.length).map(r => r.date + ":" + r.blocks[0].t);
const before = texts();
st.rec["c1|2026-11-09"] = { s: "cancel" };
const after = texts();
assert.ok(after[0].startsWith("2026-11-16"));                               // 11/9 の内容が次の授業日（11/16）へ移る
assert.strictEqual(after[0].split(":")[1], before[0].split(":")[1]);
assert.ok(!after.some(x => x.startsWith("2026-11-09")));                    // 休講の日は使われない
assert.strictEqual(after.length, before.length);                            // 計画の数は変わらない

// 3) 「途中まで」は同じ内容が次のコマに続く
const st2 = load();
st2.rec["c1|2026-11-09"] = { s: "part" };
const rows = J.project(st2, st2.classes[0]).rows.filter(r => r.date >= "2026-11-09" && r.blocks.length);
assert.strictEqual(rows[0].blocks[0].id, rows[1].blocks[0].id);
assert.ok(rows[1].cont);

// 4) 2時間続きの日は1コマで時数2、計画ブロックも2時間分を使う
const dbl = load().classes[1];
assert.ok(J.buildSlots(load(), dbl).every(s => s.hrs === 2));

// 5) 保存用JSONはキー順が固定される
assert.strictEqual(J.toJSON({ b: 1, a: { d: 1, c: 2 } }), J.toJSON({ a: { c: 2, d: 1 }, b: 1 }));
console.log("すべて通りました");
