#!/usr/bin/env python3
"""授業ポータル（資料集）のスプレッドシート(xlsx) → library/links.json に変換する。

使い方:  python3 tools/xlsx_to_library.py 資料集.xlsx library/links.json

- 「授業用ドキュメント・プリント類」シートは、教材ごとの「教材カード」にまとめる。
  （A列に教材名、B列以降に 教科書・指導書・重要語句・漢字・ワークシートなどのリンク。
    A列が空の行は、直前の教材の続き）
- そのほかのシート（表紙・年度別・副教材・成績関係など）は「年度別リンク」として、
  1リンク1行で取り込む。
- パスワードなどの文字（「パスワード」を含むセル）は取り込まない。
- ハイパーリンクのないセルの文字は、直前のリンクの「メモ」にする（←などは外す）。
"""
import sys, re, json, zlib, datetime
import openpyxl

DOC_SHEET = "授業用ドキュメント・プリント類"
BAD = re.compile(r"パスワード|password", re.I)


def hid(*parts):
    return format(zlib.crc32("|".join(parts).encode("utf-8")) & 0xFFFFFFFF, "08x")


def kind(label):
    s = label or ""
    if re.search(r"雛形|雛型|ひな形|Template", s, re.I): return "雛形"
    if "指導書" in s: return "指導書"
    if re.search(r"教科書|原文|本文", s): return "教科書"
    if "重要語句" in s: return "重要語句"
    if "漢字" in s: return "漢字"
    if re.search(r"目標|振返|振り返", s): return "目標・振返"
    if re.search(r"授業案|指導計画|板書|授業計画|構成", s): return "授業案"
    if re.search(r"ﾜｰｸｼｰﾄ|ワークシート|プリント|問題|答|解答", s): return "ワークシート"
    return "その他"


def clean_note(v):
    return re.sub(r"^[←↑↓→\s]+", "", str(v)).strip()


def text_of(c, url):
    v = str(c.value).strip() if c.value not in (None, "") else ""
    if v.startswith("http"):
        m = re.match(r"https?://([^/]+)", url or v)
        return m.group(1) if m else v
    return v


def main(src, dst):
    wb = openpyxl.load_workbook(src)
    mats, general, skipped = [], [], []
    seen = set()

    # --- 授業用ドキュメント・プリント類 → 教材カード
    ws = wb[DOC_SHEET]
    section, card, last = "全般・雛形・Tips", None, None
    top = True
    topcard = {"id": hid("top"), "section": "全般・雛形・Tips", "title": "全般・雛形・授業Tips", "url": "", "links": []}
    mats.append(topcard)
    toplabel = {1: "雛形", 3: "授業Tips", 5: "資料・課題"}
    for row in ws.iter_rows(min_row=1, max_col=12):
        cells = [c for c in row if c.value not in (None, "")]
        if not cells:
            continue
        r = row[0].row
        a = next((c for c in cells if c.column == 1), None)
        if top and a is not None and not a.hyperlink and re.match(r"S\d|文学|論理|現代|国語|古文", str(a.value)) and r >= 7:
            top = False
        if top:
            cat = toplabel.get(r, "")
            last = None
            for c in cells:
                u = c.hyperlink.target if c.hyperlink and c.hyperlink.target else None
                if u:
                    if BAD.search(str(c.value)): skipped.append(str(c.value)); continue
                    last = {"l": text_of(c, u), "u": u, "k": kind(str(c.value)), "c": cat}
                    topcard["links"].append(last)
                elif last is not None and not (c.column == 1 and not c.hyperlink and cat == "授業Tips"):
                    last["n"] = clean_note(c.value)
            continue
        if a is not None and not a.hyperlink:
            section = str(a.value).strip()
            card = None
            links = [c for c in cells if c.column > 1]
            if any(c.hyperlink for c in links):
                card = {"id": hid("sec", section), "section": section, "title": section + "（共通）", "url": "", "links": []}
                mats.append(card)
        elif a is not None:
            card = {"id": hid("m", section, str(a.value)), "section": section, "title": str(a.value).strip(),
                    "url": a.hyperlink.target or "", "links": []}
            mats.append(card)
        elif card is None:
            card = {"id": hid("cont", section, str(r)), "section": section, "title": section + "（そのほか）", "url": "", "links": []}
            mats.append(card)
        last = None
        for c in cells:
            if c.column == 1:
                continue
            u = c.hyperlink.target if c.hyperlink and c.hyperlink.target else None
            if u:
                if BAD.search(str(c.value)): skipped.append(str(c.value)); continue
                last = {"l": text_of(c, u), "u": u, "k": kind(str(c.value))}
                card["links"].append(last)
            elif last is not None:
                last["n"] = clean_note(c.value)
    mats = [m for m in mats if m["links"] or m["url"]]

    # --- ほかのシート → 年度別リンク
    for ws in wb.worksheets:
        if ws.title == DOC_SHEET:
            continue
        ym = re.match(r"^(20\d\d)$", ws.title)
        year = ym.group(1) if ym else ""
        cat = ""
        for row in ws.iter_rows():
            for c in row:
                if c.column == 1 and c.value not in (None, "") and not c.hyperlink and not str(c.value).startswith("http"):
                    cat = str(c.value).strip()[:40]
            row_cat = cat
            for c in row:
                if not (c.hyperlink and c.hyperlink.target):
                    continue
                u = c.hyperlink.target
                t = text_of(c, u)
                if BAD.search(t):
                    skipped.append(t); continue
                key = (u, t)
                if key in seen:
                    continue
                seen.add(key)
                general.append({"id": hid("g", ws.title, u, t), "t": t, "u": u, "c": row_cat, "y": year, "s": ws.title, "k": kind(t)})

    out = {"built": datetime.date.today().isoformat(), "source": "資料集.xlsx", "materials": mats, "general": general}
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    nlinks = sum(len(m["links"]) for m in mats)
    print("教材カード", len(mats), "（リンク", nlinks, "）/ 年度別リンク", len(general), "/ 除外", len(skipped), skipped)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
