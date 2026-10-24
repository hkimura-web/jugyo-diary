#!/usr/bin/env python3
"""授業時間数・計画.xlsx の1学期分のシートを、授業ダイアリー用のJSONに変換する。

使い方:
  python3 tools/xlsx_to_json.py 授業時間数_計画.xlsx --sheet "2学期(2026)" \
      --id 2026-2 --name "2026年度 2学期" --start 2026-08-31 --end 2026-12-04 \
      --asof 2026-10-23 --rules tools/rules-2026-2.json --out data/2026-2.json

シートの形:  A=日 B=曜 C=行事、D列以降は3列1組（時数・内容・🚩）がクラスごとに並ぶ。
  asof より前の日で内容が書いてあるコマは「実施」、それ以降は「予定」として取り込む。
"""
import argparse, datetime as dt, json, re, sys
import openpyxl

DOW = "日月火水木金土"   # index = JS の getDay()


def clean(v):
    if v is None:
        return ""
    s = str(v).replace("　", " ").replace("\r", "")
    s = re.sub(r"\s*\n\s*", " / ", s)
    return re.sub(r" {2,}", " ", s).strip()


def parse_tt(s):
    return [[DOW.index(m.group(1)), int(m.group(2))] for m in re.finditer(r"([月火水木金土])\s*(\d+)", s)]


def pretty(label):
    m = re.match(r"^(.*?)(現代|言語)$", label)
    if m:
        return m.group(1) + " " + ("現代の国語" if m.group(2) == "現代" else "言語文化")
    return label


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx"); ap.add_argument("--sheet", required=True)
    ap.add_argument("--id", required=True); ap.add_argument("--name", required=True)
    ap.add_argument("--start", required=True); ap.add_argument("--end", required=True)
    ap.add_argument("--asof", required=True); ap.add_argument("--rules")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    start, end, asof = (dt.date.fromisoformat(x) for x in (a.start, a.end, a.asof))
    rules = json.load(open(a.rules, encoding="utf8")) if a.rules else []
    ws = openpyxl.load_workbook(a.xlsx, data_only=True)[a.sheet]

    # --- クラス（3列1組）を見つける
    classes, blocks = [], []
    for k in range(0, 12):
        c0 = 5 + 3 * k
        label = tt = None
        for c in range(c0, c0 + 3):
            v = clean(ws.cell(2, c).value)
            m = re.match(r"^(.*?)\((.*)\)$", v)
            if m and parse_tt(m.group(2)):
                label, tt = m.group(1).strip(), parse_tt(m.group(2))
        if not label:
            continue
        cid = "c%d" % (len(classes) + 1)
        classes.append({"id": cid, "name": pretty(label), "short": label, "tt": tt})
        blocks.append({"hr": c0, "tx": c0 + 1, "fl": c0 + 2, "sheet_left": ws.cell(3, c0).value})

    # --- 行を読む（日付の月は日の並びから推定）
    rows, prev, y, mo = [], None, start.year, start.month
    r = 4
    while isinstance(ws.cell(r, 1).value, (int, float)):
        d = int(ws.cell(r, 1).value)
        if prev is not None and d < prev:
            mo += 1
            if mo > 12:
                mo, y = 1, y + 1
        prev = d
        date = dt.date(y, mo, d)
        wd = clean(ws.cell(r, 2).value)
        if wd and DOW[(date.weekday() + 1) % 7] != wd:
            print("警告: 曜日が合いません", r, date, wd, file=sys.stderr)
        rows.append((r, date))
        r += 1
    if rows[0][1] != start or rows[-1][1] != dt.date.fromisoformat(a.end):
        print("警告: 期間が指定と違います", rows[0][1], rows[-1][1], file=sys.stderr)

    events = {}
    for r, date in rows:
        t = clean(ws.cell(r, 3).value)
        if t:
            events[date.isoformat()] = t

    plans, rec, off, flags, units, warns = {}, {}, {}, {}, {}, []
    unit_ids = {}

    def uid_for(name):
        if name not in unit_ids:
            unit_ids[name] = "u%d" % (len(unit_ids) + 1)
            units[unit_ids[name]] = {"name": name, "allot": {}}
        return unit_ids[name]

    for cl, b in zip(classes, blocks):
        cid = cl["id"]
        plans[cid] = []
        rule = next((x for x in rules if re.search(x["classes"], cl["short"])), {})
        seq = rule.get("sequence")
        seq_i, cur_name = 0, (seq["names"][0] if seq else rule.get("default", "（未分類）"))
        count_blocks = 0
        for r, date in rows:
            wd = (date.weekday() + 1) % 7
            tt_h = sum(1 for (w, p) in cl["tt"] if w == wd)
            text = clean(ws.cell(r, b["tx"]).value)
            hv = ws.cell(r, b["hr"]).value
            hv = float(hv) if isinstance(hv, (int, float)) and hv > 0 else 0
            fl = clean(ws.cell(r, b["fl"]).value)
            key = "%s|%s" % (cid, date.isoformat())
            ev = events.get(date.isoformat(), "")
            if not (start <= date <= dt.date.fromisoformat(a.end)):
                continue
            if tt_h == 0 and not text and not hv:
                continue
            if tt_h == 0:
                warns.append("時間割にない曜日に記載: %s %s %s" % (cl["short"], date, text[:20]))
            if not text and not hv:
                off[key] = ev or "授業なし"          # 時間割上はあるが、授業を行わない日
                continue
            hrs = int(hv) if hv else (tt_h or 1)
            if fl:
                flags[key] = fl
            past = date < asof
            if text and re.search(r"休校|休講", ev):
                rec[key] = {"s": "cancel", "n": "（休校日の記載）" + text}
                warns.append("休校日に記載あり→休講として取り込み: %s %s (%s)" % (cl["short"], date, ev))
                continue
            if not text:
                if past:
                    off[key] = "記録なし"
                    warns.append("過去の日で内容が空: %s %s → 授業なし扱い" % (cl["short"], date))
                continue                                # 未来で内容なし＝これから計画するコマ
            # 単元の推定
            if seq and re.search(seq["marker"], text) and count_blocks > 0:
                seq_i = min(seq_i + 1, len(seq["names"]) - 1)
                cur_name = seq["names"][seq_i]
            name = cur_name
            for pat, nm, sticky in [(k[0], k[1], k[2] if len(k) > 2 else False) for k in rule.get("keywords", [])]:
                if re.search(pat, text):
                    name = nm
                    if sticky:
                        cur_name = nm
                    break
            plans[cid].append({"id": "b%s_%d" % (cid, len(plans[cid]) + 1), "u": uid_for(name), "t": text, "h": hrs})
            count_blocks += 1
            if past:
                rec[key] = {"s": "done"}
        # 検算: 時数の入っている未来コマの合計 = シートの「残り授業時間」
        remain = sum(int(ws.cell(r, b["hr"]).value) for r, d in rows if isinstance(ws.cell(r, b["hr"]).value, (int, float)))
        print("%-10s 時数マーカー合計=%s  シート上部の残り=%s" % (cl["short"], remain, b["sheet_left"]), file=sys.stderr)

    data = {"schema": 2, "term": {"id": a.id, "name": a.name, "start": a.start, "end": a.end},
            "classes": classes, "events": events, "units": units, "plans": plans,
            "rec": rec, "off": off, "flags": flags, "unitNotes": {}}
    json.dump(data, open(a.out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    for w in warns:
        print("注意:", w, file=sys.stderr)
    print("書き出し:", a.out, "クラス", len(classes), "ブロック", sum(len(v) for v in plans.values()), "単元", len(units), file=sys.stderr)


main()
