// JDP 通信簿 — 画面（コーチ: #coach-<キー> ／ 保護者: #fam-<家族トークン>）
(function () {
  "use strict";
  const CFG = window.JDP_CONFIG || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const phTime = iso => { const t = Date.parse(iso || ""); if (isNaN(t)) return ""; const d = new Date(t + 8 * 3600e3); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };

  const S = { role: null, secret: "", lang: "en", view: "list", sel: null, form: null, saving: false, fbText: "",
    week: null, players: {}, reports: {}, feedback: [], family: null, kids: [], kidId: null };

  // ---------- 通信 ----------
  const ERR = {
    bad_link: "This link is not valid. Please ask JDP for a new one.<br>このリンクは使えません。JDPに新しいリンクをもらってください。",
    not_coach: "コーチ用のリンクが正しくありません。JDTに新しいリンクをもらってください。",
    not_set_up: "まだ準備中です。/ Not ready yet.",
    network: "通信できませんでした。電波の良いところで開き直してください。<br>Couldn't connect. Please try again.",
  };
  async function api(a, body) {
    if (!CFG.API_URL) throw Object.assign(new Error("not_set_up"), { code: "not_set_up" });
    let res;
    try {
      // text/plain にすると GAS へ事前確認なしで送れる
      res = await fetch(CFG.API_URL, { method: "POST", body: JSON.stringify(Object.assign({ a }, body)), redirect: "follow" });
    } catch (e) { throw Object.assign(new Error("network"), { code: "network" }); }
    let j; try { j = await res.json(); } catch (e) { throw Object.assign(new Error("network"), { code: "network" }); }
    if (!j.ok) throw Object.assign(new Error(j.error || "server_error"), { code: j.error || "server_error" });
    return j;
  }
  const auth = () => S.role === "coach" ? { key: S.secret } : { t: S.secret };

  function toast(t) { const el = document.createElement("div"); el.className = "toast"; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2400); }
  function fatal(code) { $("#app").innerHTML = `<div class="card pad center">${ERR[code] || ("エラーが起きました / Something went wrong (" + esc(code) + ")")}</div>`; }

  const txt = it => S.lang === "ja" ? (it.ja || it.en || it.src || "") : (it.en || it.ja || it.src || "");
  const coachTxt = it => it.src || it.ja || it.en || "";
  const repId = (pid, wk) => pid + "__" + wk;

  // ======================= コーチ =======================
  async function loadCoach() {
    const j = await api("coach", auth());
    S.week = j.week;
    S.players = {}; j.players.forEach(p => { S.players[p.id] = p; });
    S.reports = {}; j.reports.forEach(r => { S.reports[repId(r.playerId, r.week)] = r; });
    S.feedback = j.feedback;
    S.families = j.families || [];
  }
  const playersSorted = () => Object.values(S.players).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
  const reportsFor = pid => Object.values(S.reports).filter(r => r.playerId === pid).sort((a, b) => b.week.localeCompare(a.week));
  const current = pid => S.reports[repId(pid, S.week.key)] || null;

  function status(p) {
    const r = current(p.id);
    if ((p.weekAttend || 0) === 0 && !r) return { t: "今週休み", c: "st-sent" };
    if (!r) return { t: "未入力", c: "st-todo" };
    if (r.status === "draft") return { t: "入力済み", c: "st-draft" };
    return r.liked ? { t: "送信済 ♥既読", c: "st-like" } : { t: "送信済・未読", c: "st-sent" };
  }

  function renderList() {
    const ps = playersSorted();
    const counts = { todo: 0, draft: 0, sent: 0 };
    ps.forEach(p => { const r = current(p.id); if (!r) { if ((p.weekAttend || 0) > 0) counts.todo++; } else if (r.status === "draft") counts.draft++; else counts.sent++; });
    $("#app").innerHTML = `
    <div class="stack">
      <div class="card pad stack">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h1>今週</h1><span class="muted small">${esc(S.week.label)}</span></div>
        <div class="stats">
          <div class="stat"><b>${counts.todo}</b><span>未入力</span></div>
          <div class="stat"><b>${counts.draft}</b><span>入力済み</span></div>
          <div class="stat"><b>${counts.sent}</b><span>送信済み</span></div>
        </div>
      </div>
      <div class="card" style="overflow:hidden">
        <div class="thead"><span>名前（タップで開く）</span><span>出席</span><span>状態</span></div>
        <div class="list">
          ${ps.length ? ps.map(p => { const s = status(p); return `<button class="row" data-pid="${esc(p.id)}"><span class="nm">${esc(p.name)} ›</span><span class="num">${p.weekAttend || 0}</span><span class="st ${s.c}">${s.t}</span></button>`; }).join("") : `<div class="pad muted">まだ生徒がいません。</div>`}
        </div>
      </div>
      <button class="btn" id="bulk" ${counts.draft ? "" : "disabled"}>入力済み ${counts.draft}人をまとめて送信</button>
      <button class="btn ghost sm" id="reload" style="align-self:center">最新に更新</button>
      <div class="card pad stack">
        <h2>保護者からのフィードバック</h2>
        ${S.feedback.length ? `<div class="inbox">${S.feedback.slice(0, 10).map(f => `<div class="msg"><b>${esc(f.name)} の保護者</b> <span class="muted small">${esc(phTime(f.at))}</span><br>${esc(f.text)}</div>`).join("")}</div>` : `<span class="muted small">まだありません。保護者が送ると、ここに出ます。</span>`}
      </div>
      <div class="card pad stack">
        <h2>保護者に送るリンク</h2>
        <span class="muted small">家族ごとに1つ（ご両親どちらも同じリンク）。「コピー」で案内文ごとコピーされるので、WhatsApp などに貼って送ってください。ほかの家族には送らないでください。</span>
        ${(S.families || []).length ? (S.families || []).map((f, i) => `<div class="famrow"><div><b>${esc(f.label)}</b><div class="muted small">${esc(f.kids.join("・"))}</div></div><button class="btn ghost sm" data-fam="${i}">コピー</button></div>`).join("") : `<span class="muted small">まだ家族が登録されていません。</span>`}
      </div>
    </div>`;
    document.querySelectorAll(".row").forEach(b => b.onclick = () => openDetail(b.dataset.pid));
    document.querySelectorAll("[data-fam]").forEach(b => b.onclick = () => copyInvite(S.families[Number(b.dataset.fam)], b));
    $("#bulk").onclick = bulkSend;
    $("#reload").onclick = async () => { $("#reload").disabled = true; try { await loadCoach(); } catch (e) { toast("更新できませんでした"); } render(); };
  }

  function inviteText(f) {
    const link = location.origin + location.pathname + "#fam-" + f.token;
    const en = f.kids.join(" & "), ja = f.kids.join("・");
    return `Hi! This is Coach Daisuke from JDP Football Academy.
We've started a weekly report card for ${en} (beta version). Each week you'll get a short comment from the coach about how your child is doing.
${link}
• Both parents can use this same link. Please don't share it outside your family.
• Tap ♥ to let me know you've read it, and feel free to send a short comment.
It's a beta, so your feedback is very welcome!

こんにちは、JDPの大輔です。
${ja}の毎週の通信簿（ベータ版）を始めました。毎週、コーチからお子さまの様子についてのコメントが届きます。
${link}
・ご両親どちらも同じリンクで見られます。ご家族以外には送らないでください。
・読んだら♥を押してください。ひとことコメントも送れます。
お試し中なので、ご意見をぜひ聞かせてください！`;
  }
  async function copyInvite(f, btn) {
    const t = inviteText(f);
    try { await navigator.clipboard.writeText(t); toast("コピーしました"); }
    catch (e) { window.prompt("コピーしてください", t); }
    if (btn) btn.textContent = "コピー済み";
  }

  function openDetail(pid) {
    const r = current(pid);
    S.sel = pid; S.view = "detail";
    S.form = { comment: r && r.comment ? coachTxt(r.comment) : "" };
    render(); window.scrollTo(0, 0);
  }

  function renderDetail() {
    const p = S.players[S.sel]; if (!p) { S.view = "list"; return renderList(); }
    const past = reportsFor(p.id).filter(r => r.week < S.week.key && r.status === "sent");
    const prev = past[0];
    const f = S.form;
    const ok = f.comment.trim();
    const cur = current(p.id);
    $("#app").innerHTML = `
    <div class="stack">
      <button class="back" id="back">‹ 一覧に戻る</button>
      <div class="card pad stack">
        <h1>${esc(p.name)}</h1>
        <div class="chips">
          <span class="chip">今週 ${p.weekAttend || 0}回</span>
          <span class="chip">通算 ${p.attendTotal || 0}回</span>
          <span class="chip">先週 ${prev ? (prev.liked ? "♥ 既読" : "未読") : "—"}</span>
          ${cur && cur.status === "sent" ? `<span class="chip">今週分は送信済み（直すと保護者の画面も変わります）</span>` : ""}
        </div>
        <details class="hist" ${past.length ? "" : "open"}>
          <summary>これまでの記録（${past.length}週）</summary>
          ${past.length ? past.map(r => `<div class="hweek"><span class="muted small" style="font-weight:600">${esc(r.weekLabel || r.week)}</span>
            <span>${esc(coachTxt(r.comment || {}))}</span></div>`).join("") : `<div class="hweek muted">まだ記録はありません。</div>`}
        </details>
      </div>
      <div class="card pad stack">
        <div style="display:flex;gap:8px;align-items:center"><h2>コーチからのコメント</h2><span class="tag req">必須</span></div>
        <div class="field"><textarea id="comment" aria-label="コーチからのコメント" rows="5" maxlength="600" placeholder="例: Great first touch under pressure. Let's work on using the left foot more.">${esc(f.comment)}</textarea></div>
        <span class="muted small" id="hint">${ok ? "英語・日本語どちらで書いても、保存するときにもう一方を自動で作ります。" : "コメントを書くと保存・送信できます。"}</span>
      </div>
      <div class="actions">
        <button class="btn ghost" id="sendNow" ${ok && !S.saving ? "" : "disabled"}>今すぐ送信</button>
        <button class="btn" id="saveNext" ${ok && !S.saving ? "" : "disabled"}>${S.saving ? "保存中…" : "保存して次の子へ"}</button>
      </div>
    </div>`;
    $("#back").onclick = () => { S.view = "list"; render(); };
    $("#comment").oninput = (e) => {
      S.form.comment = e.target.value;
      const ok2 = S.form.comment.trim();
      $("#sendNow").disabled = !ok2 || S.saving; $("#saveNext").disabled = !ok2 || S.saving;
      $("#hint").textContent = ok2 ? "英語・日本語どちらで書いても、保存するときにもう一方を自動で作ります。" : "コメントを書くと保存・送信できます。";
    };
    $("#sendNow").onclick = () => save(true);
    $("#saveNext").onclick = () => save(false);
  }

  async function save(sendNow) {
    const pid = S.sel, comment = S.form.comment.trim();
    if (!comment || S.saving) return;
    S.saving = true; render();
    try {
      await api("save", Object.assign(auth(), { playerId: pid, comment, send: !!sendNow }));
      await loadCoach();
      toast(sendNow ? "送信しました" : "保存しました");
    } catch (e) {
      S.saving = false; render();
      toast(e.code === "not_coach" ? "コーチ用リンクが無効です" : "保存できませんでした。もう一度押してください");
      return;
    }
    S.saving = false;
    if (sendNow) { S.view = "list"; return render(); }
    const nxt = playersSorted().find(p => !current(p.id) && (p.weekAttend || 0) > 0 && p.id !== pid);
    if (nxt) openDetail(nxt.id); else { S.view = "list"; render(); }
  }

  async function bulkSend() {
    const btn = $("#bulk"); btn.disabled = true; btn.textContent = "送信中…";
    try { const j = await api("bulkSend", auth()); await loadCoach(); toast(j.sent + "人に送信しました"); }
    catch (e) { toast("送信できませんでした。もう一度押してください"); }
    render();
  }

  // ======================= 保護者 =======================
  async function loadFamily() {
    const j = await api("family", auth());
    S.family = j.family; S.kids = j.kids;
    if (!S.kidId || !S.kids.find(k => k.id === S.kidId)) S.kidId = S.kids[0] && S.kids[0].id;
  }

  function renderParent() {
    const ja = S.lang === "ja";
    document.documentElement.lang = ja ? "ja" : "en";
    if (!S.kids.length) { $("#app").innerHTML = `<div class="card pad muted center">${ja ? "まだ情報がありません。" : "Nothing here yet."}</div>`; return; }
    const p = S.kids.find(k => k.id === S.kidId);
    const sent = p.reports;
    const latest = sent[0];
    const months = p.attendByMonth || [];
    const max = Math.max(1, ...months.map(m => m.n || 0));
    const first = (p.name || "").split(" ")[0];
    $("#app").innerHTML = `
    <div class="stack">
      ${S.kids.length > 1 ? `<div class="sibs" role="tablist" aria-label="${ja ? "お子さま" : "Children"}">${S.kids.map(k => { const r = k.reports[0]; const nw = r && !r.liked;
        return `<button class="sib" role="tab" aria-selected="${k.id === p.id}" data-kid="${esc(k.id)}"><b>${esc(k.name)}</b><span class="small muted">${ja ? "通算 " + (k.attendTotal || 0) + "回" : (k.attendTotal || 0) + " sessions"}${nw ? ` · <span style="color:var(--next)">${ja ? "新着" : "New"}</span>` : ""}</span></button>`; }).join("")}</div>` : ""}
      <div class="card pad stack">
        <div style="display:flex;justify-content:flex-end">
          <div class="seg" role="group" aria-label="Language"><button id="l-en" aria-pressed="${!ja}">EN</button><button id="l-ja" aria-pressed="${ja}">日本語</button></div>
        </div>
        <h1>${ja ? esc(first) + "の成長" : esc(first) + "'s growth"}</h1>
        <span class="muted small">${latest ? esc(latest.weekLabel || latest.week) + " · " : ""}Coach Daisuke</span>
        <div class="stack" style="border:1px solid var(--line);border-radius:14px;padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:baseline"><b class="small">${ja ? "出席" : "Attendance"}</b><span class="small"><b style="font-size:20px">${p.attendTotal || 0}</b> ${ja ? "回（通算）" : "total"} · ${p.weekAttend || 0} ${ja ? "回（今週）" : "this week"}</span></div>
          ${months.length ? `<div class="chart" role="img" aria-label="${ja ? "月ごとの出席回数" : "Sessions per month"}">${months.map((m, i) => `<div class="col ${i === months.length - 1 ? "now" : ""}"><span>${m.n}</span><i style="height:${Math.round((m.n / max) * 60)}px"></i></div>`).join("")}</div>
          <div class="mon">${months.map(m => `<span>${esc(m.m)}</span>`).join("")}</div>` : ""}
        </div>
        ${latest ? `
          <div class="stack" style="padding-top:4px">
            <div class="pt">${esc(txt(latest.comment || {}))}</div>
          </div>
          <button class="btn like ${latest.liked ? "liked" : ""}" id="like" ${latest.liked ? "disabled" : ""}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"></path></svg>
            ${latest.liked ? (ja ? "コーチに届きました" : "Sent to Coach") : (ja ? "ありがとう、コーチ！" : "Thanks, Coach!")}</button>
          ${sent.length > 1 ? `<details class="hist"><summary>${ja ? "過去の週" : "Past weeks"}（${sent.length - 1}）</summary>${sent.slice(1).map(r => `<div class="hweek"><span class="muted small" style="font-weight:600">${esc(r.weekLabel || r.week)}</span><span>${esc(txt(r.comment || {}))}</span></div>`).join("")}</details>` : ""}
        ` : `<div class="muted">${ja ? "まだ通信簿は届いていません。" : "No report yet."}</div>`}
      </div>
      <div class="card pad stack fb">
        <label for="fb"><b>${ja ? "JDPへのフィードバック・要望" : "Feedback / requests to JDP"}</b></label>
        <span class="muted small">${ja ? "スクールについて何でも、100文字以内で。" : "Anything about the school, up to 100 characters."}</span>
        <textarea id="fb" maxlength="100" placeholder="${ja ? "例: 木曜の開始を少し早められますか？" : "e.g. Could practice start a bit earlier?"}">${esc(S.fbText)}</textarea>
        <div style="display:flex;justify-content:space-between;align-items:center"><span class="small muted" id="cnt">${S.fbText.length} / 100</span><button class="btn sm" id="fbSend" ${S.fbText.trim() ? "" : "disabled"}>${ja ? "送信" : "Send"}</button></div>
      </div>
    </div>`;
    document.querySelectorAll(".sib").forEach(b => b.onclick = () => { S.kidId = b.dataset.kid; S.fbText = ""; render(); });
    $("#l-en").onclick = () => { S.lang = "en"; render(); }; $("#l-ja").onclick = () => { S.lang = "ja"; render(); };
    const like = $("#like"); if (like) like.onclick = async () => {
      like.disabled = true;
      try { await api("like", Object.assign(auth(), { playerId: p.id, week: latest.week })); latest.liked = true; render(); }
      catch (e) { like.disabled = false; toast(ja ? "送れませんでした" : "Couldn't send. Try again"); }
    };
    const fb = $("#fb"); fb.oninput = () => { S.fbText = fb.value; $("#cnt").textContent = fb.value.length + " / 100"; $("#fbSend").disabled = !fb.value.trim(); };
    $("#fbSend").onclick = async () => {
      const t = S.fbText.trim().slice(0, 100); if (!t) return; $("#fbSend").disabled = true;
      try { await api("feedback", Object.assign(auth(), { playerId: p.id, text: t })); S.fbText = ""; toast(ja ? "送信しました" : "Sent"); render(); }
      catch (e) { $("#fbSend").disabled = false; toast(e.code === "too_many" ? (ja ? "今日はこれ以上送れません" : "Daily limit reached") : (ja ? "送れませんでした" : "Couldn't send. Try again")); }
    };
  }

  function render() {
    if (S.role === "parent") return renderParent();
    if (S.view === "detail") return renderDetail();
    renderList();
  }

  // ======================= 起動 =======================
  async function boot() {
    if (CFG.SAMPLE_BANNER) { $("#proto").textContent = CFG.SAMPLE_BANNER; $("#proto").hidden = false; }
    const h = decodeURIComponent((location.hash || "").slice(1));
    if (h.indexOf("coach-") === 0) { S.role = "coach"; S.secret = h.slice(6); S.lang = "ja"; document.title = "JDP 通信簿（コーチ）"; document.documentElement.lang = "ja"; }
    else if (h.indexOf("fam-") === 0) { S.role = "parent"; S.secret = h.slice(4); }
    else { $("#app").innerHTML = `<div class="card pad center">Please open this page from the link JDP sent you.<br>JDPから届いたリンクから開いてください。</div>`; return; }
    try { await (S.role === "coach" ? loadCoach() : loadFamily()); render(); }
    catch (e) { fatal(e.code || "network"); }
  }
  window.addEventListener("hashchange", () => location.reload());
  boot();
})();
