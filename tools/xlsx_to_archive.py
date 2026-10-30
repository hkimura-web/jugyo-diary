#!/usr/bin/env python3
"""過去の年度の授業記録（授業ポータル形式のxlsx）を、過去の学期データ(JSON)に変換する。

使い方（年度ごとに1回）:
  python3 tools/xlsx_to_archive.py 授業時間数_2025.xlsx --year 2025 --outdir data
  python3 tools/xlsx_to_archive.py 授業時間数_2024.xlsx --year 2024 --outdir data

- 2025年度の形: 2行目に見出し、3行目に残り時間。クラスごとに「時数・内容・メモ」の3列。内容は時数列の右。
- 2024年度の形: 1行目に見出し「S2-1論国(火2・木5)」。クラスごとに3列。内容は先頭列か2列目（どちらにも書かれている）。
  日付の月は、日の並びから（日が小さくなったら次の月）推定する。内容が書いてある日は「実施」。
  「授業なし」「学年閉鎖」「模試」などの記載は、実施ではなく「授業なし」として入れる。
  時間割にない曜日に書かれた内容は、なくさないように「行事」欄に【クラス名】つきで書き添える。
  単元名は教科書（三省堂 精選論理国語）の目次の単元名（library/textbook.json）に合わせる。
"""
import argparse, datetime as dt, json, re, sys
import openpyxl

DOW = "日月火水木金土"
NOCLASS = re.compile(r"授業なし|学年閉鎖|学級閉鎖|学校閉鎖|総合学力模試|^模試|生徒総会で潰れ")

# ---- 年度ごとの設定 ----------------------------------------------------------
YEARS = {
    "2025": {
        "layout": "v2025", "ttsheet": "1学期",
        "sheets": [("2025-1", "2025年度 1学期", "1学期", "2025-04-14", "2025-07-15"),
                   ("2025-2", "2025年度 2学期（11月分）", "2学期", "2025-11-01", "2025-11-30"),
                   ("2025-3", "2025年度 3学期", "3学期", "2026-01-08", "2026-02-28")],
    },
    "2024": {
        "layout": "v2024", "ttsheet": None,
        "sheets": [("2024-2", "2024年度 2学期（9〜11月）", "2024年2学期", "2024-09-01", "2024-11-30"),
                   ("2024-3", "2024年度 3学期", "2024年3学期", "2025-01-08", "2025-03-04")],
    },
}
# 見出しの略称 → 表示名
SUBJ = {"論国": "論理国語", "総国": "総合国語", "現特": "現代文特講", "国演": "国語演習", "現代文特講": "現代文特講", "国語演習": "国語演習", "文学国語": "文学国語"}


def disp(label):
    s = re.sub(r"\(.*\)$", "", label).strip()
    m = re.match(r"^(S\d(?:-\d)?)\s*(論国|総国|現特|国演|現代文特講|国語演習|文学国語)$", s)
    if m:
        return "%s %s" % (m.group(1), SUBJ[m.group(2)])
    if s in SUBJ:      # 学年が書かれていないクラス（2024年度の文学国語はS2）
        return "S2 " + SUBJ[s] if s == "文学国語" else "S3 " + SUBJ[s]
    return {"S3-1": "S3-1 論理国語", "S3-2": "S3-2 論理国語", "S2-2": "S2-2 論理国語", "S2-5": "S2-5 論理国語", "S2-6": "S2-6 総合国語"}.get(s)


# ---- 単元の推定ルール: 学期 → 表示名 → (最初の単元名, [(正規表現, 単元名, 以降も続けるか)]) ----
S3RON = ("「市民社会」について考える", [(r"私消え|落語|経済", "経済について考える", True)])
S2RON = ("論理国語へのいざない", [(r"「情報」", "「情報社会」を生きるⅠ", True)])
S2_24_AUTUMN = ("環境問題を考える", [(r"言葉がつくる女と男", "言葉を見つめるⅠ", True)])
RULES = {
    "2025-1": {"S3-1 論理国語": S3RON, "S3-2 論理国語": S3RON, "S2-2 論理国語": S2RON, "S2-5 論理国語": S2RON, "S2-6 総合国語": S2RON,
               "S3 現代文特講": ("現代文特講テキスト（第1問〜）", []),
               "S3 国語演習": ("論理・文学 演習（パック）", [(r"実用文", "実用文演習", True)])},
    "2025-2": {"S3-1 論理国語": ("国際社会を考える", []), "S3-2 論理国語": ("国際社会を考える", []),
               "S2-2 論理国語": ("環境問題を考える", [(r"漢P・語句提出期限", "言葉を見つめるⅠ", True)]),
               "S2-5 論理国語": ("環境問題を考える", [(r"次単元目標", "言葉を見つめるⅠ", True)]),
               "S2-6 総合国語": ("環境問題を考える", [(r"次単元目標", "言葉を見つめるⅠ", True)]),
               "S3 現代文特講": ("現代文特講（演習・入試問題）", []), "S3 国語演習": ("共通テスト演習（パックⅤ）", [])},
    "2025-3": {n: ("芸術について考える", [(r"生命", "生命について考える", True)])
               for n in ["S2-2 論理国語", "S2-5 論理国語", "S2-6 総合国語"]},
    "2024-2": {"S2-1 論理国語": S2_24_AUTUMN, "S2-6 総合国語": S2_24_AUTUMN,
               "S2 文学国語": ("大正の小説（第一章）", [(r"^映画", "映画・文学とは何か", True), (r"こころ", "大正の小説（第一章）", False), (r"私の好きな詩|私の一押しの詩|教科書詩|詩歌|詩とは", "詩歌", True)]),
               "S3-1 論理国語": ("経済について考える", [(r"恐怖とは何か", "心と向き合う", True)]),
               "S3-4 論理国語": ("経済について考える", [(r"恐怖とは何か", "心と向き合う", True)]),
               "S3 現代文特講": ("現代文特講テキスト（第9問〜）", [])},
    "2024-3": {"S2-1 論理国語": ("芸術について考える", [(r"AI時代", "科学技術と人間", True)]),
               "S2-6 総合国語": ("芸術について考える", [(r"AI時代", "科学技術と人間", True)]),
               "S2 文学国語": ("ブックトーク", [(r"ひよこ|クリーム", "平成の小説（第二章）", True), (r"映画", "映画・文学とは何か", True)])},
}

# 見出しの時間割が実際と違う学期（本人に確認済み）。時限が分からない曜日は 0（画面には「〇時間目」を出さない）
TT_OVERRIDE = {("2024-3", "S2-1 論理国語"): [[4, 5], [5, 0]]}

TB = {}
try:
    for _b in json.load(open("library/textbook.json", encoding="utf8"))["books"]:
        for _p in _b["parts"]:
            for _u in _p["units"]:
                _u["_part"], _u["_book"] = _p["part"], _b["book"]; TB[_u["name"]] = _u
except Exception as e:
    print("教科書の目次が読めません:", e, file=sys.stderr)


def clean(v):
    if v is None:
        return ""
    s = str(v).replace("　", " ").replace("\r", "")
    s = re.sub(r"\s*\n\s*", " / ", s)
    return re.sub(r" {2,}", " ", s).strip()


def parse_tt(s):
    """「火2・木5」「金1・2」「火56・木34」→ [[曜日, 時限], ...]。曜日の後ろの数字1つが1時限。"""
    s = s.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    out = []
    for m in re.finditer(r"([月火水木金土])([0-9・\s]+)", s):
        for d in re.findall(r"\d", m.group(2)):
            out.append([DOW.index(m.group(1)), int(d)])
    return out


def blocks_v2025(ws):
    """3行目の =SUM() 等が入っている列が時数列。内容はその右。"""
    hcs = [c.column for c in ws[3] if c.column > 3 and ((isinstance(c.value, str) and c.value.startswith("=SUM")) or isinstance(c.value, (int, float)))]
    out = []
    for hc in hcs:
        label = ""
        for c in range(hc, hc + 3):
            v = clean(ws.cell(2, c).value)
            if v:
                label = v
        out.append({"label": label, "cols": [hc + 1], "first": 4})
    return out


def blocks_v2024(ws):
    """1行目の見出し（クラス名）が先頭列。3列で1クラス。内容は先頭列または2列目に書かれている。"""
    out = []
    for c in range(4, 40):
        v = clean(ws.cell(1, c).value)
        if v and disp(v):
            out.append({"label": v, "cols": [c, c + 1], "first": 2})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx"); ap.add_argument("--year", default="2025"); ap.add_argument("--outdir", default="data")
    a = ap.parse_args()
    Y = YEARS[a.year]
    wbv = openpyxl.load_workbook(a.xlsx, data_only=True)
    getb = blocks_v2025 if Y["layout"] == "v2025" else blocks_v2024

    # --- 時間割（見出しの「(月6・水4)」）。2025年度は1学期の見出し、2024年度は各シートの見出し
    def tt_map(ws):
        out = {}
        for b in getb(ws):
            m = re.match(r"^(.*?)\((.*)\)$", b["label"])
            n = disp(b["label"])
            if m and n and parse_tt(m.group(2)):
                out[n] = parse_tt(m.group(2))
        return out
    tt_global = tt_map(wbv[Y["ttsheet"]]) if Y["ttsheet"] else {}
    print("時間割:", tt_global, file=sys.stderr)

    index_terms = []
    for tid, tname, sheet, s0, s1 in Y["sheets"]:
        start, end = dt.date.fromisoformat(s0), dt.date.fromisoformat(s1)
        ws = wbv[sheet]
        tt_sheet = tt_map(ws)
        blocks = []
        for b in getb(ws):
            n = disp(b["label"])
            if n:
                b["name"] = n; blocks.append(b)
        classes = [{"id": "c%d" % (i + 1), "name": b["name"], "short": b["name"].split(" ")[0] + b["name"].split(" ")[1][:2],
                    "tt": TT_OVERRIDE.get((tid, b["name"])) or tt_global.get(b["name"]) or tt_sheet.get(b["name"], [])} for i, b in enumerate(blocks)]
        first = blocks[0]["first"]
        # 日付
        rows, prev = [], None
        for r in range(first - 1 if Y["layout"] == "v2024" else 4, ws.max_row + 1):
            v = ws.cell(r, 1).value
            if not isinstance(v, (int, float)):
                continue
            d, wd = int(v), clean(ws.cell(r, 2).value)
            # 日付は「前の日の翌日」を基本にする。シートの日の数字が違っていても（例：2月に29日）、曜日で確かめて合わせる
            cand = start if prev is None else prev + dt.timedelta(days=1)
            if prev is None:
                date = cand
            elif not wd or DOW[(cand.weekday() + 1) % 7] == wd:
                date = cand
            else:
                date = next((prev + dt.timedelta(days=k) for k in range(2, 8) if DOW[((prev + dt.timedelta(days=k)).weekday() + 1) % 7] == wd), cand)
                print("警告: 日が飛んでいます（曜日で合わせました）", sheet, r, prev, "→", date, file=sys.stderr)
            if wd and DOW[(date.weekday() + 1) % 7] != wd:
                print("警告: 曜日が合いません", sheet, r, date, wd, file=sys.stderr)
            if date.day != d:
                print("注意: シートの日の数字と違います（曜日を優先）", sheet, r, "シート", d, "→", date, file=sys.stderr)
            rows.append((r, date)); prev = date
        if rows[0][1] != start or rows[-1][1] != end:
            print("警告: 期間が違います", sheet, rows[0][1], rows[-1][1], file=sys.stderr)
        events = {d.isoformat(): clean(ws.cell(r, 3).value) for r, d in rows if clean(ws.cell(r, 3).value)}
        plans, rec, off, units, uid, warns = {}, {}, {}, {}, {}, []

        def uid_for(name):
            if name not in uid:
                uid[name] = "u%d" % (len(uid) + 1)
                units[uid[name]] = {"name": name, "allot": {}}
            return uid[name]

        for cl, b in zip(classes, blocks):
            cid, n = cl["id"], b["name"]; plans[cid] = []
            first_u, kws = RULES[tid].get(n, ("（未分類）", []))
            cur = first_u
            for r, date in rows:
                wd = (date.weekday() + 1) % 7
                tt_h = sum(1 for (w, p) in cl["tt"] if w == wd)
                text = " / ".join(t for t in (clean(ws.cell(r, c).value) for c in b["cols"]) if t)
                key = "%s|%s" % (cid, date.isoformat())
                ev = events.get(date.isoformat(), "")
                if tt_h == 0:
                    if text:   # 時間割にない曜日の記載は、なくさないよう「行事」欄に書き添える
                        k = date.isoformat()
                        events[k] = (events.get(k, "") + " ／ " if events.get(k) else "") + "【%s】%s" % (n, text)
                        warns.append("時間割にない曜日の記載を行事欄に追記: %s %s %s" % (n, date, text[:20]))
                    continue
                if not text:
                    off[key] = ev or "記録なし"
                    continue
                if NOCLASS.search(text):
                    off[key] = text
                    continue
                name = cur
                for pat, nm, sticky in kws:
                    if re.search(pat, text):
                        name = nm
                        if sticky:
                            cur = nm
                        break
                plans[cid].append({"id": "b%s_%d" % (cid, len(plans[cid]) + 1), "u": uid_for(name), "t": text, "h": tt_h})
                rec[key] = {"s": "done"}
        # 教科書の目次にある単元は、教材名（と学びを広げる）を教材欄に入れる
        for uk, un in units.items():
            tu = TB.get(un["name"])
            if tu:
                un["mats"] = [{"n": m["n"]} for m in tu["mats"]] + ([{"n": "学びを広げる：" + tu["manabi"]["n"]}] if tu.get("manabi") else [])
                un["tb"] = " ".join(x for x in (tu["_book"], tu["_part"], tu["no"]) if x)
        data = {"schema": 2, "term": {"id": tid, "name": tname, "start": s0, "end": s1}, "classes": classes, "events": events,
                "units": units, "plans": plans, "rec": rec, "off": off, "flags": {}, "unitNotes": {}}
        with open("%s/%s.json" % (a.outdir, tid), "w", encoding="utf8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        index_terms.append({"id": tid, "name": tname, "file": tid + ".json"})
        print(tname, "クラス", len(classes), "ブロック", sum(len(v) for v in plans.values()), "単元", len(units), "授業なし等", len(off), file=sys.stderr)
        for w in warns:
            print("  注意:", w, file=sys.stderr)
    print(json.dumps(index_terms, ensure_ascii=False))


if __name__ == "__main__":
    main()
