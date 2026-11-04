// 화면 그리기와 버튼 동작
(function () {
  "use strict";
  const L = window.Logic;
  const S = window.Store;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const today = () => L.toDateStr(new Date());
  const fmt = L.formatCents;

  let data = null;
  let me = null;
  const state = {
    month: today().slice(0, 7),
    hist: { mode: "month", anchor: today(), from: today(), to: today(), type: "all", cat: "" },
    acct: { id: null, mode: "month", anchor: today() },
  };

  const accountName = (id) => (data.accounts.find((a) => a.id === (id || "everyday")) || { name: id }).name;
  const accountOptions = (selected) =>
    data.accounts.map((a) => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${esc(a.name)}</option>`).join("");
  const catNames = (type) => data.categories.filter((c) => c.type === type).map((c) => c.name);

  // ---------- 내역 입력 폼 (새 입력과 수정에 같이 씀) ----------
  function fillTxnForm(form, t, submitLabel, withCancel) {
    const type = t.type || "expense";
    const cats = catNames(type);
    if (t.category && !cats.includes(t.category)) cats.push(t.category); // 지워진 분류도 수정 화면에선 유지
    form.innerHTML = `
      <div class="seg">
        ${["expense", "income", "transfer"].map((k) => `
          <button type="button" data-type="${k}" class="${k === type ? "active" : ""}">${k === "transfer" ? "통장 이체" : L.TYPE_LABEL[k]}</button>`).join("")}
      </div>
      <label>금액 (€) <input name="amount" inputmode="decimal" placeholder="예: 12,50" value="${t.amount_cents ? (t.amount_cents / 100).toFixed(2).replace(".", ",") : ""}" required></label>
      <label>내용 <input name="description" maxlength="60" value="${esc(t.description)}" required></label>
      <label>날짜 <input name="date" type="date" value="${esc(t.date || today())}" required></label>
      <label>${type === "transfer" ? "보내는 통장" : "통장"} <select name="account_id">${accountOptions(t.account_id || "everyday")}</select></label>
      ${type === "transfer"
        ? `<label>받는 통장 <select name="transfer_account_id">${accountOptions(t.transfer_account_id || "savings")}</select></label>`
        : `<label>분류 <select name="category">${cats.map((c) => `<option ${c === t.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`}
      <p class="error" role="alert"></p>
      <div class="row">
        ${withCancel ? `<button type="button" data-cancel>취소</button>` : ""}
        <button type="submit">${submitLabel}</button>
      </div>`;
    form.dataset.type = type;
    form.querySelectorAll("[data-type]").forEach((b) =>
      b.addEventListener("click", () => fillTxnForm(form, { ...readFields(form), id: t.id, type: b.dataset.type }, submitLabel, withCancel)));
  }

  function readFields(form) {
    const f = new FormData(form);
    return {
      type: form.dataset.type,
      amount_cents: L.parseAmount(f.get("amount")),
      description: String(f.get("description") || "").trim(),
      date: f.get("date"),
      account_id: f.get("account_id"),
      transfer_account_id: form.dataset.type === "transfer" ? f.get("transfer_account_id") : "",
      category: form.dataset.type === "transfer" ? "" : f.get("category") || "",
    };
  }

  function validate(t) {
    if (!(t.amount_cents > 0)) return "금액을 0보다 크게 입력해 주세요. (예: 12,50)";
    if (!t.description || t.description.length > 60) return "내용은 1자 이상 60자 이하로 입력해 주세요.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || "")) return "날짜를 확인해 주세요.";
    if (t.type === "transfer" && t.transfer_account_id === t.account_id) return "보내는 통장과 다른 받는 통장을 선택해 주세요.";
    if (t.type !== "transfer" && !t.category) return "분류를 선택해 주세요.";
    return "";
  }

  async function submitTxn(form, original) {
    const t = readFields(form);
    const error = validate(t);
    form.querySelector(".error").textContent = error;
    if (error) return false;
    if (original) await S.updateTxn({ ...t, id: original.id });
    else await S.addTxn({ ...t, created_by: me.name });
    await refresh();
    return true;
  }

  // ---------- 내역 목록 ----------
  function txnList(el, txns) {
    if (!txns.length) { el.innerHTML = `<li class="empty">내역이 없습니다.</li>`; return; }
    el.innerHTML = txns.map((t) => {
      const sign = t.type === "income" ? "+" : t.type === "expense" ? "−" : "";
      const where = t.type === "transfer"
        ? `${esc(accountName(t.account_id))} → ${esc(accountName(t.transfer_account_id))}`
        : `${esc(accountName(t.account_id))} · ${esc(t.category || "분류 없음")}`;
      return `<li>
        <div><div>${esc(t.description)}</div><div class="meta">${esc(t.date)} · ${where} · ${esc(t.created_by || "")}</div></div>
        <span class="amount ${t.type}">${sign}${fmt(t.amount_cents)}</span>
        <span class="actions">
          <button data-edit="${t.id}" aria-label="수정">✏️</button>
          <button data-del="${t.id}" aria-label="삭제">🗑</button>
        </span></li>`;
    }).join("");
  }

  document.addEventListener("click", async (e) => {
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-del]");
    if (edit) openEdit(data.txns.find((t) => t.id === edit.dataset.edit));
    if (del) {
      const t = data.txns.find((x) => x.id === del.dataset.del);
      if (t && confirm(`'${t.description}' ${fmt(t.amount_cents)} 내역을 삭제할까요?`)) { await S.deleteTxn(t.id); await refresh(); }
    }
  });

  function openEdit(t) {
    const form = $("edit-form");
    fillTxnForm(form, t, "수정 저장", true);
    form.onsubmit = async (e) => { e.preventDefault(); if (await submitTxn(form, t)) $("edit-dialog").close(); };
    form.querySelector("[data-cancel]").onclick = () => $("edit-dialog").close();
    $("edit-dialog").showModal();
  }

  // ---------- 가계부 화면 ----------
  function renderMain() {
    const bal = Object.fromEntries(data.accounts.map((a) => [a.id, L.balanceOn(a, data.txns)]));
    $("accounts").innerHTML = data.accounts.map((a) =>
      `<button class="account" data-account="${a.id}"><small>${esc(a.name)}</small><strong>${fmt(bal[a.id])}</strong></button>`).join("");

    const [start, end] = L.periodRange("month", state.month + "-01");
    const monthTxns = L.filterTxns(data.txns, { start, end });
    const sum = L.totals(monthTxns);
    $("m-label").textContent = `${state.month.slice(0, 4)}년 ${Number(state.month.slice(5))}월`;
    $("sum-income").innerHTML = `수입<b>${fmt(sum.income)}</b>`;
    $("sum-expense").innerHTML = `지출<b>${fmt(sum.expense)}</b>`;
    txnList($("month-list"), monthTxns);

    if (!$("balance-form").contains(document.activeElement)) $("balance-form").innerHTML = data.accounts.map((a) =>
      `<label>${esc(a.name)} (€) <input name="${a.id}" inputmode="decimal" value="${(bal[a.id] / 100).toFixed(2).replace(".", ",")}"></label>`).join("") +
      `<p class="error" role="alert"></p><button>현재 잔액 저장</button>`;

    for (const type of ["expense", "income"]) {
      $(`cat-${type}`).innerHTML = catNames(type).map((name) =>
        `<li>${esc(name)}<button data-delcat="${type}|${esc(name)}" aria-label="${esc(name)} 분류 삭제">×</button></li>`).join("");
    }

    document.querySelectorAll(".account-select").forEach((s) => { s.innerHTML = accountOptions(s.value || "everyday"); });
    $("bill-list").innerHTML = data.bills.length ? data.bills.map((b) => `<li>
      <div><div>${esc(b.description)}</div><div class="meta">매달 ${b.due_day}일 · ${esc(accountName(b.account_id))}${b.last_processed_month ? ` · 마지막 기록 ${esc(b.last_processed_month)}` : ""}</div></div>
      <span class="amount expense">−${fmt(b.amount_cents)}</span>
      <span class="actions"><button data-delbill="${b.id}" aria-label="삭제">🗑</button></span></li>`).join("")
      : `<li class="empty">등록된 자동 지출이 없습니다.</li>`;
  }

  // ---------- 내역 화면 ----------
  function stepAnchor(mode, anchor, dir) {
    if (mode === "day") return L.addDays(anchor, dir);
    if (mode === "month") return L.addMonths(anchor.slice(0, 7), dir) + "-01";
    return `${Number(anchor.slice(0, 4)) + dir}-01-01`;
  }
  function periodLabel(mode, anchor) {
    if (mode === "day") return anchor;
    if (mode === "month") return `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`;
    return `${anchor.slice(0, 4)}년`;
  }

  function renderHistory() {
    const h = state.hist;
    document.querySelectorAll("#h-mode button").forEach((b) => b.classList.toggle("active", b.dataset.mode === h.mode));
    $("h-nav").hidden = h.mode === "range";
    $("h-range").hidden = h.mode !== "range";
    $("h-label").textContent = periodLabel(h.mode, h.anchor);
    $("h-type").value = h.type;
    $("h-cat").innerHTML = `<option value="">모든 분류</option>` +
      L.categoryOptions(data.categories, data.txns).map((o) => `<option value="${esc(o.key)}" ${o.key === h.cat ? "selected" : ""}>${esc(o.label)}</option>`).join("");

    const [start, end] = L.periodRange(h.mode, h.anchor, h.from, h.to);
    const list = L.filterTxns(data.txns, { start, end, type: h.type, category: h.cat });
    const sum = L.totals(list);
    $("h-income").innerHTML = `기간 수입<b>${fmt(sum.income)}</b>`;
    $("h-expense").innerHTML = `기간 지출<b>${fmt(sum.expense)}</b>`;
    txnList($("h-list"), list);
  }

  // ---------- 통장 화면 ----------
  function lineChart(points) {
    const w = 360, h = 200, padL = 64, padB = 22, padT = 10; // 휴대폰 너비 기준이라 글자가 작아지지 않음
    const vals = points.map((p) => p.cents);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 100; max += 100; }
    const x = (i) => padL + (i * (w - padL - 10)) / Math.max(points.length - 1, 1);
    const y = (v) => padT + ((max - v) * (h - padT - padB)) / (max - min);
    const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`).join(" ");
    const every = Math.ceil(points.length / 8);
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="잔고 그래프">
      ${[max, (max + min) / 2, min].map((v) => `
        <line x1="${padL}" x2="${w - 10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>
        <text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${esc(fmt(Math.round(v)))}</text>`).join("")}
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.cents)}" r="2.5" fill="var(--accent)"><title>${esc(p.label)}: ${esc(fmt(p.cents))}</title></circle>`).join("")}
      ${points.map((p, i) => (i % every === 0 ? `<text x="${x(i)}" y="${h - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(p.label)}</text>` : "")).join("")}
    </svg>`;
  }

  function renderAccount() {
    const a = data.accounts.find((x) => x.id === state.acct.id);
    if (!a) return;
    const { mode, anchor } = state.acct;
    document.querySelectorAll("#a-mode button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $("a-name").textContent = a.name;
    $("a-balance").textContent = fmt(L.balanceOn(a, data.txns));
    $("a-label").textContent = periodLabel(mode, anchor);
    $("a-chart").innerHTML = lineChart(L.balanceSeries(a, data.txns, mode, anchor));
    const [start, end] = L.periodRange(mode, anchor);
    const list = L.filterTxns(data.txns, { start, end, accountId: a.id });
    const sum = L.totals(list, a.id);
    $("a-income").innerHTML = `수입 합계<b>${fmt(sum.income)}</b>`;
    $("a-expense").innerHTML = `지출 합계<b>${fmt(sum.expense)}</b>`;
    txnList($("a-list"), list);
  }

  // ---------- 화면 전환 ----------
  function show(view) {
    for (const v of ["login", "main", "history", "account"]) $(`view-${v}`).hidden = v !== view;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    window.scrollTo(0, 0);
    render();
  }
  const current = () => ["main", "history", "account"].find((v) => !$(`view-${v}`).hidden);
  function render() {
    const v = current();
    if (v === "main") renderMain();
    if (v === "history") renderHistory();
    if (v === "account") renderAccount();
  }
  async function refresh() { data = await S.load(); render(); }

  // ---------- 버튼 연결 ----------
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
  $("m-prev").onclick = () => { state.month = L.addMonths(state.month, -1); renderMain(); };
  $("m-next").onclick = () => { state.month = L.addMonths(state.month, 1); renderMain(); };
  const openHistory = (type) => { Object.assign(state.hist, { mode: "month", anchor: state.month + "-01", type, cat: "" }); show("history"); };
  $("sum-income").onclick = () => openHistory("income");
  $("sum-expense").onclick = () => openHistory("expense");
  $("accounts").addEventListener("click", (e) => {
    const b = e.target.closest("[data-account]");
    if (b) { Object.assign(state.acct, { id: b.dataset.account, mode: "month", anchor: today() }); show("account"); }
  });

  const txnForm = $("txn-form");
  txnForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const keep = { type: txnForm.dataset.type, date: txnForm.date.value, account_id: txnForm.account_id.value };
    if (await submitTxn(txnForm)) fillTxnForm(txnForm, keep, "내역 추가하기", false);
  });

  $("balance-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const bases = {};
    for (const a of data.accounts) {
      const cents = L.parseAmount(f.get(a.id));
      if (!(cents >= 0)) { e.target.querySelector(".error").textContent = `${a.name} 금액을 확인해 주세요.`; return; }
      bases[a.id] = L.baseFor(a.id, cents, data.txns);
    }
    await S.setBases(bases);
    await refresh();
  });

  $("cat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = String(f.get("name")).trim();
    if (name) { await S.addCategory(f.get("type"), name); e.target.reset(); await refresh(); }
  });
  document.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-delcat]");
    const b = e.target.closest("[data-delbill]");
    if (c) {
      const [type, name] = c.dataset.delcat.split("|");
      if (confirm(`'${name}' 분류를 삭제할까요? 예전 내역의 분류는 그대로 남습니다.`)) { await S.deleteCategory(type, name); await refresh(); }
    }
    if (b && confirm("이 자동 지출을 삭제할까요? 이미 기록된 내역은 남습니다.")) { await S.deleteBill(b.dataset.delbill); await refresh(); }
  });

  $("bill-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const amount = L.parseAmount(f.get("amount"));
    const day = Number(f.get("due_day"));
    if (!(amount > 0) || !(day >= 1 && day <= 31)) { alert("금액과 날짜(1~31일)를 확인해 주세요."); return; }
    await S.addBill({ description: String(f.get("description")).trim(), amount_cents: amount, account_id: f.get("account_id"), due_day: day });
    e.target.reset();
    await refresh();
  });

  document.querySelectorAll("#h-mode button").forEach((b) => b.addEventListener("click", () => { state.hist.mode = b.dataset.mode; renderHistory(); }));
  $("h-prev").onclick = () => { state.hist.anchor = stepAnchor(state.hist.mode, state.hist.anchor, -1); renderHistory(); };
  $("h-next").onclick = () => { state.hist.anchor = stepAnchor(state.hist.mode, state.hist.anchor, 1); renderHistory(); };
  $("h-from").value = state.hist.from;
  $("h-to").value = state.hist.to;
  $("h-from").onchange = (e) => { state.hist.from = e.target.value; renderHistory(); };
  $("h-to").onchange = (e) => { state.hist.to = e.target.value; renderHistory(); };
  $("h-type").onchange = (e) => { state.hist.type = e.target.value; renderHistory(); };
  $("h-cat").onchange = (e) => { state.hist.cat = e.target.value; renderHistory(); };

  $("a-back").onclick = () => show("main");
  document.querySelectorAll("#a-mode button").forEach((b) => b.addEventListener("click", () => { state.acct.mode = b.dataset.mode; renderAccount(); }));
  $("a-prev").onclick = () => { state.acct.anchor = stepAnchor(state.acct.mode, state.acct.anchor, -1); renderAccount(); };
  $("a-next").onclick = () => { state.acct.anchor = stepAnchor(state.acct.mode, state.acct.anchor, 1); renderAccount(); };

  // ---------- 로그인 ----------
  window.addEventListener("unhandledrejection", (e) => alert("문제가 생겼습니다: " + (e.reason && e.reason.message || e.reason)));

  async function start() {
    me = await S.me();
    if (!me) { show("login"); return; }
    if (!me.name) {
      await S.signOut();
      show("login");
      $("login-form").querySelector(".error").textContent = `${me.email}은(는) 허락된 이메일이 아닙니다.`;
      return;
    }
    $("me").textContent = `${me.name}님`;
    $("logout").hidden = false;
    $("tabs").hidden = false;
    await S.runRecurring(today());
    data = await S.load();
    fillTxnForm(txnForm, {}, "내역 추가하기", false); // 통장 목록이 필요해서 불러온 뒤에 그림
    show("main");
    S.photoUrl().then((url) => { if (url) { $("photo").src = url; $("photo").hidden = false; } });
  }

  const loginForm = $("login-form");
  const loginError = (msg) => { loginForm.querySelector(".error").textContent = msg; };
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await S.signIn(loginForm.email.value.trim(), loginForm.password.value); await start(); }
    catch (err) { loginError(/confirm/i.test(err.message) ? "확인 메일의 링크를 먼저 눌러 주세요." : "이메일 또는 비밀번호를 확인해 주세요."); }
  });
  $("signup").onclick = async () => {
    if (!loginForm.reportValidity()) return;
    try {
      const r = await S.signUp(loginForm.email.value.trim(), loginForm.password.value);
      if (r.session) await start();
      else loginError("확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 여기서 로그인하세요.");
    } catch (err) { loginError("가입하지 못했습니다: " + err.message); }
  };
  $("logout").onclick = async () => { await S.signOut(); location.reload(); };

  // 상대방이 적은 내역을 15초마다 불러옴 (입력·수정 중에는 건너뜀)
  setInterval(() => {
    if (!me || !me.name || document.hidden || $("edit-dialog").open || !$("view-login").hidden) return;
    refresh();
  }, 15000);

  start();
})();
