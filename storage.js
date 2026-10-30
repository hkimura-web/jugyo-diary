/* 授業ダイアリー: 保存まわり（この端末のブラウザ内 / GitHub のリポジトリ） */
(function (root) {
  "use strict";
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* 使えない環境では何もしない */ } }
  };

  /* https://<owner>.github.io/<repo>/ で開いていれば、リポジトリを自動で推定する */
  function guess() {
    const h = location.hostname, parts = location.pathname.split("/").filter(Boolean);
    let owner = "", repo = "";
    if (h.endsWith(".github.io")) { owner = h.split(".")[0]; repo = parts[0] && !/\.html?$/.test(parts[0]) ? parts[0] : owner + ".github.io"; }
    return { owner, repo, branch: "main", token: "" };
  }
  function getSettings() {
    let s = {};
    try { s = JSON.parse(LS.get("jd.settings") || "{}"); } catch (e) { s = {}; }
    return Object.assign(guess(), s);
  }
  function saveSettings(s) { return LS.set("jd.settings", JSON.stringify(s)); }

  const enc = new TextEncoder(), dec = new TextDecoder();
  function b64e(str) {
    const b = enc.encode(str); let bin = "";
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64d(b64) {
    const bin = atob(b64.replace(/\s/g, "")), b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return dec.decode(b);
  }

  function ghUrl(s, path) {
    return "https://api.github.com/repos/" + encodeURIComponent(s.owner) + "/" + encodeURIComponent(s.repo) +
      "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  }
  const headers = s => ({ "Authorization": "Bearer " + s.token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });

  async function fail(res) {
    let msg = "";
    try { msg = (await res.json()).message || ""; } catch (e) { /* 本文なし */ }
    const e = new Error(msg || ("HTTP " + res.status));
    e.status = res.status;
    throw e;
  }
  async function remoteGet(s, path) {
    const res = await fetch(ghUrl(s, path) + "?ref=" + encodeURIComponent(s.branch) + "&t=" + Date.now(), { headers: headers(s), cache: "no-store" });
    if (!res.ok) await fail(res);
    const j = await res.json();
    return { text: b64d(j.content || ""), sha: j.sha };
  }
  async function remotePut(s, path, text, sha, message) {
    const body = { message, content: b64e(text), branch: s.branch };
    if (sha) body.sha = sha;
    const res = await fetch(ghUrl(s, path), { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, headers(s)), body: JSON.stringify(body) });
    if (!res.ok) await fail(res);
    const j = await res.json();
    return { sha: j.content.sha };
  }
  function explain(e) {
    if (e.status === 401) return "トークンが正しくないか、期限が切れています。";
    if (e.status === 403) return "このトークンに書き込み権限がありません（Contents: Read and write が必要です）。";
    if (e.status === 404) return "リポジトリまたはファイルが見つかりません。ユーザー名・リポジトリ名・ブランチ名とトークンの対象リポジトリを確認してください。";
    if (e.status === 409 || e.status === 422) return "別の端末で先に更新されています。最新を読み込み直してください。";
    return e.message || "接続できませんでした。";
  }

  root.JDStore = { LS, getSettings, saveSettings, remoteGet, remotePut, explain };
})(window);
