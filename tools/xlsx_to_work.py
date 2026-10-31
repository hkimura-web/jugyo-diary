#!/usr/bin/env python3
"""全データPortal・ICTマニュアル(xlsx) → work/links.json に変換する。

使い方:  python3 tools/xlsx_to_work.py Portal_ICT.xlsx work/links.json [年度シート名=2026]

- 取り込むのは「その年度のシート」（既定 2026）と「指導要録・ICTマニュアル」シートだけ。
  過去の年度のシートは取り込まない（ほとんど同じ内容のコピーのため）。
- 年度シート: A列に分類名、右のセルにリンク。A列が空の行は、直前の分類の続き。
- 「パスワード」「ID・Pass」「pass2026」のような文字を含むセル、自分のパソコンの場所(C:\\...)は取り込まない。
- ハイパーリンクのないセルの文字は、その分類の「メモ」にする。
"""
import sys, re, json, datetime, unicodedata
import openpyxl

SECRET = re.compile(r"パスワード|password|ID・?Pass|ユーザー名|pass\d{4}|^[A-Za-z]:\\", re.I)
ARROWS = re.compile(r"^[←↑↓→\s]+")


def secret(s):
    """パスワード類か（全角・半角・濁点の別の字形も同じに見て調べる）"""
    return bool(SECRET.search(unicodedata.normalize("NFKC", s or "")))


def label(text, url, prev):
    """文字がURLそのままのときは、直前のメモや、サイト名に置き換える"""
    if text.startswith("http"):
        if prev:
            return re.sub(r"[➡→←↑↓\s]+$", "", prev)
        m = re.match(r"https?://([^/]+)", text)
        return "サイト（" + m.group(1) + "）" if m else text
    return text


def clean(v):
    return re.sub(r"\s+", " ", str(v).replace("\u3000", " ")).strip()


def cells(ws):
    for row in ws.iter_rows():
        for c in row:
            if c.value in (None, ""):
                continue
            url = c.hyperlink.target if c.hyperlink and c.hyperlink.target else ""
            v = str(c.value)
            if not url and v.startswith("http"):
                url = v.strip()
            yield c.row, c.column, clean(v), url


def year_sheet(ws):
    secs, cur, skipped = [], None, 0
    for r, col, text, url in cells(ws):
        if secret(text) or secret(url):
            skipped += 1
            continue
        if r == 1:  # 最上段は「いつも使うもの」
            if not secs or secs[0]["title"] != "いつも使う":
                secs.insert(0, {"title": "いつも使う", "group": "ポータル", "items": [], "memo": []})
            if url:
                secs[0]["items"].append({"t": text.lstrip("★◆ "), "u": url, "star": text[:1] == "★"})
            continue
        if col == 1:
            cur = {"title": text.lstrip("★◆ ").replace("\n", " "), "group": "ポータル", "items": [], "memo": []}
            secs.append(cur)
            if url:
                cur["items"].append({"t": "開く（" + cur["title"] + "）", "u": url})
            continue
        if cur is None:
            continue
        if url:
            t = label(text, url, "")
            cur["items"].append({"t": t.lstrip("◆ ") if not t.startswith("★") else t, "u": url})
        else:
            m = ARROWS.sub("", text)
            if m and not re.fullmatch(r"[→←↑↓]+", m):
                cur["memo"].append(m)
    return secs, skipped


def ict_sheet(ws):
    """A列に見出し（大見出し・小見出し）、B列以降にリンク。"""
    secs, cur, skipped = [], None, 0
    rows = {}
    for r, col, text, url in cells(ws):
        rows.setdefault(r, []).append((col, text, url))
    big = ""
    for r in sorted(rows):
        items = rows[r]
        a = [x for x in items if x[0] == 1]
        rest = [x for x in items if x[0] > 1]
        if a and not rest and not a[0][2]:
            big = a[0][1]
            cur = None
            continue
        if a:
            title = a[0][1]
            if not rest and not a[0][2]:
                big = title
                cur = None
                continue
            cur = {"title": (big + "／" if big and big != title else "") + title, "group": "ICTマニュアル", "items": [], "memo": []}
            secs.append(cur)
            if a[0][2]:
                cur["items"].append({"t": "開く（" + title + "）", "u": a[0][2]})
        if cur is None:
            cur = {"title": big or "ICTマニュアル", "group": "ICTマニュアル", "items": [], "memo": []}
            secs.append(cur)
        for col, text, url in rest:
            if secret(text) or secret(url):
                skipped += 1
                continue
            if url:
                t = label(text, url, cur["memo"].pop() if text.startswith("http") and cur["memo"] else "")
                cur["items"].append({"t": t.lstrip("◆ "), "u": url})
            else:
                m = ARROWS.sub("", text)
                if m:
                    cur["memo"].append(m)
    return secs, skipped


def main(src, dst, year="2026"):
    wb = openpyxl.load_workbook(src)
    s1, k1 = year_sheet(wb[year])
    s2, k2 = ict_sheet(wb["指導要録・ICTマニュアル"])
    secs = [s for s in s1 + s2 if s["items"]]
    cover = []
    for r, col, text, url in cells(wb["表紙"]):
        if url:
            cover.append({"t": text, "u": url})
    if cover:
        secs.append({"title": "出張精算書など", "group": "ポータル", "items": cover, "memo": []})
    for s in secs:
        s["title"] = re.sub(r"^20\d\d(?!-)", "", s["title"]).strip() or s["title"]
    for i, s in enumerate(secs):
        s["id"] = "s%02d" % i
        seen, uniq = set(), []
        for it in s["items"]:
            if it["u"] in seen:
                continue
            seen.add(it["u"])
            uniq.append(it)
        s["items"] = uniq
    out = {"built": datetime.date.today().isoformat(), "year": year, "sections": secs}
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    n = sum(len(s["items"]) for s in secs)
    print("セクション", len(secs), "リンク", n, "除外(パスワード等)", k1 + k2)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "2026")
