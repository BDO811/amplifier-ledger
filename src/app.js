function mountLedger(R, OPT) {
  const NOW = OPT.now || Date.now();
  /* Pipeline status Amit sets by hand. Stored on each Firestore doc as `pipeline`. */
  const PIPE = [
    ["proposal", "Proposal", "var(--gold)"],
    ["call", "First call", "var(--sky)"],
    ["working", "Working", "var(--lav)"],
    ["paying", "Paying", "var(--mint)"]];
  const P = Object.fromEntries(PIPE.map(p => [p[0], p]));
  const FROM_STAGE = { active: "paying", advanced: "working", partner: "working", early: "call", stalled: "call", proposal: "proposal", target: "proposal" };
  const VIEWS = [["board", "Board"], ["active", "Active"], ["followup", "Follow-up"], ["paying", "Paying"], ["all", "All"], ["past", "Past"]];
  const INIT = { Amit: "AM", Jeremy: "JB", Camille: "CN", Troy: "TA", Maxwell: "MS", Max: "MM", Derek: "DD", Bryan: "BR" };
  const DIR = { out: "Sent", in: "Received", int: "Internal", cal: "Calendar" };
  let VIEW = "board";
  try { const h = location.hash.slice(1); if (VIEWS.some(v => v[0] === h)) VIEW = h; } catch (e) {}
  const st = { view: VIEW, chip: "all", sort: "recent", q: "", data: [], user: null };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const days = t => Math.floor((NOW - t) / 864e5);
  const rel = t => !t ? "No email" : days(t) <= 0 ? "Today" : days(t) === 1 ? "1d ago" : days(t) < 60 ? days(t) + "d ago" : new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmt = t => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const initials = n => n.replace(/[^A-Za-z0-9 &/]/g, "").split(/[\s/&]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  const pipe = c => P[c.pipeline] ? c.pipeline : (FROM_STAGE[c.stage] || "proposal");
  const awaiting = c => c.threads.length && c.threads[0].d === "out" && days(c.last) >= 7;
  const quiet = c => c.last && days(c.last) >= 21;
  /* Follow-up: we emailed last and heard nothing for 7+ days, or nobody has written either way in 21+ days. */
  const needsFollow = c => !c.dismissed && pipe(c) !== "paying" && (awaiting(c) || quiet(c));
  /* Active: engaged past the proposal but not yet paying. Paying customers live in their own tab. */
  const isActive = c => !c.dismissed && (pipe(c) === "call" || pipe(c) === "working");
  const isPaying = c => !c.dismissed && pipe(c) === "paying";
  // Proposals stored in the ledger's private Firebase Storage have url "fbs:<path>"; they open
  // through the signed-in user's token (see openFile), never through a public link.
  const pAttr = x => String(x.url || "").startsWith("fbs:")
    ? `href="#" data-fbs="${esc(x.url.slice(4))}"`
    : `href="${esc(x.url)}" target="_blank" rel="noopener"`;
  const props = c => { const l = (c.proposals || []).slice(); if (c.drive && !l.some(x => x.url === c.drive)) l.push({ name: "Proposal", url: c.drive, t: null }); return l.sort((a, b) => (b.t || 0) - (a.t || 0)); };
  const why = c => awaiting(c) ? `We wrote last, ${days(c.last)}d ago` : quiet(c) ? `No contact in ${days(c.last)}d` : "";
  const ICON = {
    search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/></svg>',
    wave: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    archive: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>',
    undo: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
    grip: '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="2" cy="7" r="1.3"/><circle cx="8" cy="7" r="1.3"/><circle cx="2" cy="12" r="1.3"/><circle cx="8" cy="12" r="1.3"/></svg>' };

  R.innerHTML = `<div class="shell"><div class="atmo"><i></i><i></i><i></i></div><div class="wrap" id="wrap"></div>
    <div class="scrim" id="scrim"></div><aside class="drawer" id="drawer" aria-hidden="true"></aside>
    <div class="toast" id="toast" role="status" aria-live="polite"></div></div>`;
  const $ = s => R.querySelector(s), $$ = s => [...R.querySelectorAll(s)];
  const wrap = $("#wrap");

  /* ---------- writes ---------- */
  let toastTimer;
  function toast(html, undoFn) {
    const t = $("#toast");
    t.innerHTML = `<span>${html}</span>${undoFn ? `<button class="tbtn" id="tundo">${ICON.undo} Undo</button>` : ""}`;
    t.classList.add("on");
    if (undoFn) $("#tundo").onclick = () => { undoFn(); t.classList.remove("on"); };
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 5000);
  }
  function patch(id, p, msg, undoP) {
    const c = st.data.find(x => x.id === id); if (!c) return;
    const before = {}; Object.keys(p).forEach(k => before[k] = c[k] ?? null);
    Object.assign(c, p); refresh();
    Promise.resolve(OPT.update ? OPT.update(id, p) : null).catch(e => {
      Object.assign(c, before); refresh();
      toast("Could not save: " + esc(e.message || e));
    });
    if (msg) toast(msg, undoP === false ? null : () => patch(id, before));
  }
  const setPipe = (id, k) => { const c = st.data.find(x => x.id === id); if (!c || pipe(c) === k) return; patch(id, { pipeline: k, pipelineAt: Date.now() }, `${esc(c.name)} moved to <b>${P[k][1]}</b>`); };
  const dismiss = id => { const c = st.data.find(x => x.id === id); patch(id, { dismissed: true, dismissedAt: Date.now() }, `${esc(c.name)} moved to <b>Past</b>`); };
  const restore = id => { const c = st.data.find(x => x.id === id); patch(id, { dismissed: false, dismissedAt: null }, `${esc(c.name)} restored`); };

  /* ---------- liquid pill: leading edge moves first and faster, trailing edge catches up ---------- */
  function slidePill(bar, instant) {
    const pill = bar && bar.querySelector(".pill"), t = bar && bar.querySelector('[aria-pressed="true"]');
    if (!pill || !t) return;
    const l = t.offsetLeft, r = bar.scrollWidth - (t.offsetLeft + t.offsetWidth);
    const prev = pill.__st || { l, r }, fwd = l > prev.l;
    const out = "cubic-bezier(.215,.61,.355,1)", inout = "cubic-bezier(.645,.045,.355,1)";
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    pill.style.transition = instant || reduce ? "none" : fwd ? `right .36s ${out}, left .55s ${inout}` : `left .36s ${out}, right .55s ${inout}`;
    pill.style.left = l + "px"; pill.style.right = r + "px"; pill.__st = { l, r };
  }

  function spark(c) {
    const W = 96, H = 36, N = 20, b = new Array(N).fill(0);
    c.threads.forEach(t => { const w = Math.floor((NOW - t.t) / (7 * 864e5)); if (w >= 0 && w < N) b[N - 1 - w]++; });
    const col = P[pipe(c)][2];
    if (!c.threads.length) return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="M2 ${H - 6} H${W - 2}" stroke="var(--line-hi)" stroke-width="1.5" stroke-dasharray="3 4" fill="none"/></svg>`;
    const sm = b.map((v, i) => (b[i - 1] || 0) * .25 + v * .5 + (b[i + 1] || 0) * .25), mx = Math.max(1, ...sm);
    const pts = sm.map((v, i) => [2 + i * (W - 4) / (N - 1), H - 4 - v / mx * (H - 10)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const id = "g" + Math.random().toString(36).slice(2, 8), e = pts[N - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".45"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${W - 2} ${H} L2 ${H} Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${e[0]}" cy="${e[1]}" r="2.4" fill="${col}"/></svg>`;
  }

  /* ---------- views ---------- */
  function gate(msg) {
    wrap.innerHTML = `<div class="gate glass"><div class="logo">${ICON.wave}</div><h1>Amplifier Ledger</h1>
      <p>Sign in with your Google account to open the client pipeline.</p>
      <button class="cta" id="signin">Continue with Google</button><div class="err" role="alert">${esc(msg || "")}</div></div>`;
    $("#signin").onclick = () => OPT.signIn().catch(e => gate(e.code === "auth/popup-closed-by-user" ? "" : "Sign-in did not complete: " + (e.message || e)));
  }

  function base() {
    const q = st.q.toLowerCase();
    return st.data.filter(c =>
      (st.chip === "all" || c.origin === st.chip) &&
      (!q || [c.name, c.contact, c.status, c.next, c.owner, ...c.threads.map(t => t.s)].join(" ").toLowerCase().includes(q)));
  }
  function sorted(rows) {
    const k = { recent: (a, b) => (b.last || 0) - (a.last || 0), oldest: (a, b) => (a.last || 9e15) - (b.last || 9e15), az: (a, b) => a.name.localeCompare(b.name) }[st.sort];
    return rows.slice().sort(k);
  }
  function rowsFor(view) {
    const b = base();
    if (view === "past") return sorted(b.filter(c => c.dismissed)).sort((a, c2) => (c2.dismissedAt || 0) - (a.dismissedAt || 0));
    if (view === "followup") return b.filter(needsFollow).sort((a, c2) => (a.last || 0) - (c2.last || 0));
    if (view === "active") return sorted(b.filter(isActive));
    if (view === "paying") return sorted(b.filter(isPaying));
    return sorted(b.filter(c => !c.dismissed));
  }

  function shell() {
    const live = st.data.filter(c => !c.dismissed);
    const counts = { active: live.filter(isActive).length, followup: live.filter(needsFollow).length, board: live.filter(c => pipe(c) !== "paying").length, paying: live.filter(isPaying).length, all: live.length, past: st.data.filter(c => c.dismissed).length };
    const ownerInit = st.user ? (st.user.displayName || st.user.email || "AM").split(/[\s@.]/).slice(0, 2).map(w => w[0]).join("").toUpperCase() : "AM";
    const tile = (k, label, sub, i) => { const n = live.filter(c => pipe(c) === k).length;
      return `<button class="tile glass" data-tile="${k}" style="--i:${i}"><span class="ic" style="background:${P[k][2]}">${i + 1}</span><span><small>${label}</small><b>${n}</b><span class="sub">${sub}</span></span></button>`; };
    wrap.innerHTML = `
      <header class="bar glass">
        <div class="brand"><span class="logo">${ICON.wave}</span><span><b>Amplifier</b><small>Client Ledger</small></span></div>
        <nav class="nav" id="nav" aria-label="Views"><span class="pill"></span>
          ${VIEWS.map(([k, l]) => `<button data-view="${k}" aria-pressed="${st.view === k}">${l}<span class="ct">${counts[k]}</span></button>`).join("")}
        </nav>
        <div class="tools">
          <button class="iconbtn hide-sm" id="bell" title="Needs follow-up">${ICON.bell}${counts.followup ? `<span class="dot">${counts.followup}</span>` : ""}</button>
          <button class="avatar" id="me" title="${esc(st.user ? st.user.email + " · sign out" : "Preview")}">${esc(ownerInit)}</button>
        </div>
      </header>
      <section class="head"><div><h1 id="title"></h1><p id="sub"></p></div>
        ${OPT.mode === "preview" ? `<span class="tag">Preview · changes are not saved</span>` : `<span class="tag mono">Live · saves as you click</span>`}</section>
      <section class="tiles anim">
        ${tile("proposal", "Proposal", "sent, awaiting a call", 0)}
        ${tile("call", "First call", "first meeting held or booked", 1)}
        ${tile("working", "Working through it", "pilot, scoping, contracting", 2)}
        ${tile("paying", "Paying customer", "closed and billing", 3)}
      </section>
      <section class="rail">
        ${[["all", "All sources"], ["email", "Email"], ["gtm", "GTM team"], ["drive", "Drive proposal"]].map(([k, l]) => `<button class="chip" data-chip="${k}" aria-pressed="${st.chip === k}">${l}</button>`).join("")}
        <label class="search glass">${ICON.search}<input id="q" type="search" placeholder="Company, contact or subject" value="${esc(st.q)}"></label>
        <div class="seg" id="seg"><span class="pill"></span>
          ${[["recent", "Recent"], ["oldest", "Oldest"], ["az", "A–Z"]].map(([k, l]) => `<button data-sort="${k}" aria-pressed="${st.sort === k}">${l}</button>`).join("")}
        </div>
      </section>
      <section id="body"></section>
      <p class="foot-note">${OPT.mode === "preview" ? "Preview with sample state. On the live page every move and dismissal saves to Firestore." : "Moves and dismissals save instantly. Email threads sync nightly from Gmail, Slack and Notion."}</p>`;
    $$("[data-view]").forEach(b => b.onclick = () => go(b.dataset.view));
    $$("[data-sort]").forEach(b => b.onclick = () => { st.sort = b.dataset.sort; $$("[data-sort]").forEach(x => x.setAttribute("aria-pressed", x === b)); slidePill($("#seg")); body(true); });
    $$("[data-chip]").forEach(b => b.onclick = () => { st.chip = b.dataset.chip; $$("[data-chip]").forEach(x => x.setAttribute("aria-pressed", x === b)); body(true); });
    $$("[data-tile]").forEach(b => b.onclick = () => { if (b.dataset.tile === "paying") return go("paying"); go("board"); requestAnimationFrame(() => { const col = R.querySelector(`.col[data-col="${b.dataset.tile}"]`); col && col.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }); });
    $("#bell").onclick = () => go("followup");
    $("#q").oninput = e => { st.q = e.target.value; body(false); };
    $("#me").onclick = () => { if (OPT.signOut && st.user) OPT.signOut(); };
    requestAnimationFrame(() => { slidePill($("#nav"), true); slidePill($("#seg"), true); });
    body(true);
  }

  function go(v) {
    st.view = v;
    try { history.replaceState(null, "", "#" + v); } catch (e) {}
    $$("[data-view]").forEach(x => x.setAttribute("aria-pressed", x.dataset.view === v));
    slidePill($("#nav")); body(true);
  }

  const TITLES = {
    active: ["Active opportunities", n => `${n} past the proposal and not yet paying: first call or working through it.`],
    followup: ["Needs follow-up", n => `${n} open opportunities where we wrote last and heard nothing in 7+ days, or nobody has written in 21+ days. Oldest first. Paying customers are not listed here.`],
    paying: ["Paying customers", n => `${n} closed and paying. Moved off the Active view; move one back with its status bar if it stops paying.`],
    board: ["Pipeline board", n => `${n} open opportunities. Drag a card to another column, or tap a step on the card. Drop on Paying to move a customer to the Paying tab.`],
    all: ["All open opportunities", n => `${n} open opportunities across every status.`],
    past: ["Past opportunities", n => `${n} dismissed. They stay here with their history; restore any of them to put them back in the pipeline.`] };

  function card(c, i, opts = {}) {
    const p = pipe(c), own = (c.owner || "").split(" / ")[0], fu = !c.dismissed && needsFollow(c);
    const flag = c.dismissed ? `<span class="tag">Dismissed ${c.dismissedAt ? fmt(c.dismissedAt) : ""}</span>`
      : fu ? `<span class="tag flag wait">${esc(why(c))}</span>`
      : c.origin === "gtm" ? `<span class="tag flag gtm">GTM team</span>`
      : c.origin === "drive" ? `<span class="tag flag drive">Not sent</span>`
      : `<span class="tag flag" style="color:${P[p][2]}">${c.threads.length} thread${c.threads.length === 1 ? "" : "s"}</span>`;
    const steps = PIPE.map(([k, l], j) => `<button class="step${k === p ? " on" : ""}${PIPE.findIndex(x => x[0] === p) > j ? " done" : ""}" data-set="${k}" data-id="${esc(c.id)}" aria-pressed="${k === p}" title="Move to ${l}" style="--c:${P[k][2]}" ${c.dismissed ? "disabled" : ""}><span>${l}</span></button>`).join("");
    return `<article class="card${c.dismissed ? " gone" : ""}" data-id="${esc(c.id)}" style="--i:${Math.min(i, 24)};--pc:${P[p][2]}" ${opts.drag ? 'draggable="true"' : ""}>
      <div class="cardhit" data-open="${esc(c.id)}" role="button" tabindex="0" aria-label="Open ${esc(c.name)}">
        <span class="top">${opts.drag ? `<span class="grip">${ICON.grip}</span>` : ""}<span class="mono-av">${esc(initials(c.name))}</span><span class="nm"><b>${esc(c.name)}</b><small>${esc(c.contact || c.status)}</small></span></span>
        ${opts.compact ? "" : `<span class="mid"><span><small>Last touch</small><b class="${fu ? "stale" : ""}">${rel(c.last)}</b></span>${spark(c)}</span>`}
        <span class="foot">${flag}${props(c).length ? `<a class="tag pdf" ${pAttr(props(c)[0])} title="Open the proposal PDF" data-stop>PDF${props(c).length > 1 ? " " + props(c).length : ""}</a>` : ""}<span class="own" title="${esc(c.owner)}">${INIT[own] || initials(own || "?")}</span></span>
      </div>
      <div class="pipe" role="group" aria-label="Status">${steps}</div>
      <div class="acts">${c.dismissed
        ? `<button class="mini" data-restore="${esc(c.id)}">${ICON.undo} Restore</button>`
        : `<button class="mini" data-dismiss="${esc(c.id)}" title="Missed or lost: move to Past">${ICON.archive} Dismiss</button>`}</div>
    </article>`;
  }

  function wireCards(root) {
    root.querySelectorAll("[data-stop]").forEach(a => a.addEventListener("click", e => e.stopPropagation()));
    root.querySelectorAll("[data-fbs]").forEach(a => a.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      if (!OPT.openFile) return toast("Proposals open on the live page only.");
      const w = window.open("", "_blank");
      OPT.openFile(a.dataset.fbs).then(blob => {
        const u = URL.createObjectURL(blob);
        if (w) w.location.href = u; else location.href = u;
      }).catch(err => { if (w) w.close(); toast("Could not open the proposal: " + esc(err.message || String(err))); });
    }));
    root.querySelectorAll("[data-open]").forEach(b => { b.onclick = () => drawer(b.dataset.open); b.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drawer(b.dataset.open); } }; });
    root.querySelectorAll("[data-set]").forEach(b => b.onclick = e => { e.stopPropagation(); setPipe(b.dataset.id, b.dataset.set); });
    root.querySelectorAll("[data-dismiss]").forEach(b => b.onclick = e => { e.stopPropagation(); dismiss(b.dataset.dismiss); });
    root.querySelectorAll("[data-restore]").forEach(b => b.onclick = e => { e.stopPropagation(); restore(b.dataset.restore); });
  }

  function body(animate) {
    const el = $("#body"); if (!el) return;
    const rows = rowsFor(st.view), [t, s] = TITLES[st.view];
    $("#title").textContent = t; $("#sub").textContent = s(rows.length);
    if (st.view === "board") {
      const payN = rows.filter(c => pipe(c) === "paying").length;
      el.innerHTML = `<div class="board-scroll"><div class="board${animate ? " anim" : ""}">${PIPE.filter(p => p[0] !== "paying").map(([k, l, col]) => {
        const items = rows.filter(c => pipe(c) === k);
        return `<section class="col glass" data-col="${k}" style="--c:${col}"><header><i></i><b>${l}</b><span class="mono">${items.length}</span></header>
          <div class="drop" data-drop="${k}">${items.map((c, i) => card(c, i, { drag: true, compact: true })).join("") || `<p class="empty-col">Drop a card here</p>`}</div></section>`;
      }).join("")}
        <section class="col paycol glass" data-col="paying" style="--c:${P.paying[2]}"><header><i></i><b>Paying</b><span class="mono">${payN}</span></header>
          <div class="drop paydrop" data-drop="paying"><p>Drop a card here when they start paying. It moves to the <button class="linkbtn" data-goto="paying">Paying tab</button>.</p></div></section>
      </div></div>`;
      el.querySelectorAll("[data-goto]").forEach(b => b.onclick = () => go(b.dataset.goto));
      wireCards(el); wireDrag(el);
      return;
    }
    el.innerHTML = `<div class="grid${animate ? " anim" : ""}">${rows.map((c, i) => card(c, i)).join("") || `<div class="empty glass">${st.view === "past" ? "Nothing dismissed yet. Use Dismiss on a card when an opportunity is missed or lost." : st.view === "followup" ? "Nothing needs a follow-up right now." : "No opportunities match these filters."}</div>`}</div>`;
    wireCards(el);
  }

  /* ---------- drag and drop between board columns ---------- */
  function wireDrag(root) {
    let dragId = null;
    root.querySelectorAll('.card[draggable="true"]').forEach(c => {
      c.addEventListener("dragstart", e => { dragId = c.dataset.id; c.classList.add("dragging"); try { e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; } catch (_) {} });
      c.addEventListener("dragend", () => { c.classList.remove("dragging"); root.querySelectorAll(".drop.over").forEach(d => d.classList.remove("over")); });
    });
    root.querySelectorAll("[data-drop]").forEach(d => {
      d.addEventListener("dragover", e => { e.preventDefault(); d.classList.add("over"); });
      d.addEventListener("dragleave", e => { if (!d.contains(e.relatedTarget)) d.classList.remove("over"); });
      d.addEventListener("drop", e => { e.preventDefault(); d.classList.remove("over"); let id = dragId; try { id = e.dataTransfer.getData("text/plain") || id; } catch (_) {} if (id) setPipe(id, d.dataset.drop); dragId = null; });
    });
  }

  function drawer(id) {
    const c = st.data.find(x => x.id === id); if (!c) return;
    const p = pipe(c), fu = needsFollow(c);
    const th = c.threads.length ? c.threads.map(t => `<a class="th" target="_blank" rel="noopener" href="https://mail.google.com/mail/u/0/#all/${esc(t.id)}"><span class="d mono">${fmt(t.t)}</span><span class="k">${DIR[t.d] || t.d}</span><span class="s">${esc(t.s)}</span></a>`).join("")
      : `<div class="note">${c.origin === "gtm" ? "GTM team opportunity. Surfaced in #customers-discovery-insights with no email thread yet; the nightly sync attaches threads when they appear." : "Proposal drafted in Drive. No send found in email."}</div>`;
    const d = $("#drawer");
    d.innerHTML = `<button class="iconbtn x" id="close" aria-label="Close">${ICON.x}</button>
      <span class="mono-av" style="width:48px;height:48px;font-size:15px">${esc(initials(c.name))}</span>
      <h2>${esc(c.name)}</h2>
      <div class="tags"><span class="tag" style="color:${P[p][2]}">${P[p][1]}</span>${c.dismissed ? '<span class="tag">In Past</span>' : ""}${c.origin === "gtm" ? '<span class="tag flag gtm">GTM team</span>' : ""}${fu ? `<span class="tag flag wait">${esc(why(c))}</span>` : ""}<span class="tag">${esc(c.owner)}</span></div>
      <div class="pipe big" role="group" aria-label="Status">${PIPE.map(([k, l], j) => `<button class="step${k === p ? " on" : ""}${PIPE.findIndex(x => x[0] === p) > j ? " done" : ""}" data-set="${k}" data-id="${esc(c.id)}" aria-pressed="${k === p}" style="--c:${P[k][2]}" ${c.dismissed ? "disabled" : ""}><span>${l}</span></button>`).join("")}</div>
      <div class="kv glass"><div><span>Status</span><p>${esc(c.status)}</p></div><div><span>Next step</span><p>${esc(c.next)}</p></div>
        ${c.contact ? `<div><span>Contacts</span><p>${esc(c.contact)}</p></div>` : ""}
        ${props(c).length ? `<div><span>Proposals · ${props(c).length}</span>${props(c).map(x => `<p><a ${pAttr(x)}>${esc(x.name || "Proposal")}</a>${x.t ? ` <span class="mono muted">${fmt(x.t)}</span>` : ""}</p>`).join("")}</div>` : ""}
        <div><span>Last touch</span><p>${c.last ? fmt(c.last) + " · " + rel(c.last) : "No email yet"}</p></div></div>
      <div class="drawer-acts">${c.dismissed
        ? `<button class="cta ghost" data-restore="${esc(c.id)}">${ICON.undo} Restore to pipeline</button>`
        : `<button class="cta ghost" data-dismiss="${esc(c.id)}">${ICON.archive} Dismiss · missed or lost</button>`}</div>
      <div class="threads"><h3>Email threads · ${c.threads.length}</h3>${th}</div>`;
    wireCards(d);
    d.querySelectorAll("[data-set],[data-dismiss],[data-restore]").forEach(b => b.addEventListener("click", () => setTimeout(() => drawer(id), 0)));
    d.classList.add("on"); d.setAttribute("aria-hidden", "false"); $("#scrim").classList.add("on"); d.__id = id;
    const close = () => { d.classList.remove("on"); d.setAttribute("aria-hidden", "true"); $("#scrim").classList.remove("on"); d.__id = null; };
    $("#close").onclick = close; $("#scrim").onclick = close;
    R.addEventListener("keydown", e => { if (e.key === "Escape") close(); }, { once: true });
  }

  function refresh() {
    if (!$("#body")) return shell();
    const keep = { q: st.q };
    const live = st.data.filter(c => !c.dismissed);
    const counts = { active: live.filter(isActive).length, followup: live.filter(needsFollow).length, board: live.filter(c => pipe(c) !== "paying").length, paying: live.filter(isPaying).length, all: live.length, past: st.data.filter(c => c.dismissed).length };
    $$("[data-view]").forEach(b => { const ct = b.querySelector(".ct"); if (ct) ct.textContent = counts[b.dataset.view]; });
    $$("[data-tile]").forEach(b => { const v = b.querySelector("b"); if (v) v.textContent = live.filter(c => pipe(c) === b.dataset.tile).length; });
    const bell = $("#bell .dot"); if (bell) bell.textContent = counts.followup;
    slidePill($("#nav"), true);
    st.q = keep.q; body(false);
    const d = $("#drawer"); if (d && d.__id && d.classList.contains("on")) drawer(d.__id);
  }

  addEventListener("resize", () => { slidePill($("#nav"), true); slidePill($("#seg"), true); });

  return {
    gate, setUser(u) { st.user = u; },
    setData(rows) { const first = !$("#body"); st.data = rows; first ? shell() : refresh(); }
  };
}

/* ---------- boot ---------- */
(function boot() {
  const R = window.__LEDGER_ROOT__ || document.getElementById("app-root");
  const CFG = window.__LEDGER_CFG__;
  const norm = c => ({ ...c, threads: (c.threads || []).slice().sort((a, b) => b.t - a.t), last: (c.threads && c.threads.length) ? Math.max(...c.threads.map(t => t.t)) : (c.last || null) });
  if (CFG.mode === "preview") {
    const ui = mountLedger(R, { mode: "preview", now: CFG.now, update: () => Promise.resolve() });
    ui.setData(CFG.seed.map(norm));
    return;
  }
  const V = "10.12.2", base = `https://www.gstatic.com/firebasejs/${V}/`;
  const load = src => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Could not load " + src)); document.head.appendChild(s); });
  let ui;
  (async () => {
    await load(base + "firebase-app-compat.js");
    await Promise.all([load(base + "firebase-auth-compat.js"), load(base + "firebase-firestore-compat.js")]);
    firebase.apps.length ? firebase.app() : firebase.initializeApp(CFG.firebase);
    const auth = firebase.auth(), db = firebase.firestore();
    const provider = new firebase.auth.GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
    ui = mountLedger(R, {
      mode: "live",
      signIn: () => auth.signInWithPopup(provider), signOut: () => auth.signOut(),
      openFile: async path => {
        const tok = await auth.currentUser.getIdToken();
        const r = await fetch(`https://firebasestorage.googleapis.com/v0/b/${CFG.firebase.storageBucket}/o/${encodeURIComponent(path)}?alt=media`, { headers: { Authorization: `Firebase ${tok}` } });
        if (!r.ok) throw new Error(r.status === 403 ? "no access" : `error ${r.status}`);
        return new Blob([await r.arrayBuffer()], { type: "application/pdf" });
      },
      update: (id, p) => db.collection("opportunities").doc(id).set({ ...p, editedAt: firebase.firestore.FieldValue.serverTimestamp(), editedBy: auth.currentUser ? auth.currentUser.email : null }, { merge: true })
    });
    let unsub = null;
    auth.onAuthStateChanged(user => {
      if (unsub) { unsub(); unsub = null; }
      if (!user) { ui.gate(); return; }
      ui.setUser(user);
      unsub = db.collection("opportunities").onSnapshot(snap => {
        ui.setData(snap.docs.map(d => norm({ id: d.id, ...d.data() })));
      }, err => {
        auth.signOut();
        ui.gate(err.code === "permission-denied" ? `${user.email} does not have access to this ledger. Sign in with an authorized Amplifier account.` : "Could not load data: " + err.message);
      });
    });
  })().catch(e => { (ui || mountLedger(R, { mode: "live" })).gate("Could not start: " + e.message); });
})();
