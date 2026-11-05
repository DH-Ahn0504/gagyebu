// 화면 그리기와 버튼 동작
(function () {
  "use strict";
  const L = window.Logic;
  const S = window.Store;
  const C = window.Charts;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const today = () => L.toDateStr(new Date());
  const fmt = L.formatCents;
  const VIEWS = ["login", "main", "history", "accounts", "settings"];

  let data = null;
  let me = null;
  const state = {
    month: today().slice(0, 7),
    hist: { mode: "month", anchor: today(), from: today(), to: today(), type: "all", cat: "" },
    acct: { id: "everyday", mode: "month", anchor: today() },
  };

  // 세 사람 줄: 동현 · 함께 · 나윤 (통장으로 나눔)
  const LANES = [
    { key: "dh", name: "동현", initial: "동", accounts: ["donghyun_allowance"] },
    { key: "us", name: "함께", initial: "함", accounts: ["everyday", "savings"] },
    { key: "ny", name: "나윤", initial: "나", accounts: ["nayoon_allowance"] },
  ];
  const personClass = (name) => (name === "동현" ? "dh" : name === "나윤" ? "ny" : "");
  const personInitial = (name) => (name === "동현" ? "동" : name === "나윤" ? "나" : name === "정기 지출" ? "자" : "?");

  const accountName = (id) => (data.accounts.find((a) => a.id === (id || "everyday")) || { name: id }).name;
  const accountOptions = (selected) =>
    data.accounts.map((a) => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${esc(a.name)}</option>`).join("");
  const catNames = (type) => data.categories.filter((c) => c.type === type).map((c) => c.name);
  const money = (cents) => `<span class="num">${esc(fmt(cents))}</span>`;
  const monthLabel = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
  const shortDate = (d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

  // ---------- 내역 입력 창 (새 입력과 수정에 같이 씀) ----------
  function fillTxnForm(form, t) {
    const type = t.type || "expense";
    const cats = catNames(type);
    if (t.category && !cats.includes(t.category)) cats.push(t.category); // 지워진 분류도 수정할 땐 유지
    form.innerHTML = `
      <div class="seg type-seg" role="group" aria-label="종류">
        ${["expense", "income", "transfer"].map((k) => `
          <button type="button" data-type="${k}" aria-pressed="${k === type}">${k === "transfer" ? "통장 이체" : L.TYPE_LABEL[k]}</button>`).join("")}
      </div>
      <label>금액 (€) <input name="amount" inputmode="decimal" autocomplete="off" placeholder="12,50" value="${t.amount_cents ? (t.amount_cents / 100).toFixed(2).replace(".", ",") : ""}" required></label>
      <label>내용 <input name="description" maxlength="60" value="${esc(t.description)}" required></label>
      <label>날짜 <input name="date" type="date" value="${esc(t.date || today())}" required></label>
      <label>${type === "transfer" ? "보내는 통장" : "통장"} <select name="account_id">${accountOptions(t.account_id || "everyday")}</select></label>
      ${type === "transfer"
        ? `<label>받는 통장 <select name="transfer_account_id">${accountOptions(t.transfer_account_id || "savings")}</select></label>`
        : `<label>분류 <select name="category">${cats.map((c) => `<option ${c === t.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`}
      <p class="error" role="alert"></p>
      <div class="row">
        ${t.id ? `<button type="button" class="btn danger" data-delete>삭제</button>` : ""}
        <button type="button" class="btn" data-cancel>취소</button>
        <button type="submit" class="btn primary">${t.id ? "수정 저장" : "추가"}</button>
      </div>`;
    form.dataset.type = type;
    form.querySelectorAll("[data-type]").forEach((b) =>
      b.addEventListener("click", () => fillTxnForm(form, { ...readFields(form), id: t.id, type: b.dataset.type })));
    form.querySelector("[data-cancel]").onclick = () => $("edit-dialog").close();
    const del = form.querySelector("[data-delete]");
    if (del) del.onclick = async () => {
      if (!confirm(`'${t.description}' ${fmt(t.amount_cents)} 내역을 삭제할까요?`)) return;
      await S.deleteTxn(t.id);
      $("edit-dialog").close();
      await refresh();
    };
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

  function openTxn(t) {
    const form = $("edit-form");
    $("edit-title").textContent = t.id ? "내역 수정" : "내역 추가";
    fillTxnForm(form, t);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const v = readFields(form);
      const error = validate(v);
      form.querySelector(".error").textContent = error;
      if (error) return;
      if (t.id) await S.updateTxn({ ...v, id: t.id });
      else await S.addTxn({ ...v, created_by: me.name });
      $("edit-dialog").close();
      await refresh();
    };
    $("edit-dialog").showModal();
    form.amount.focus();
  }
  // 아이폰: 키보드가 올라오면 입력창(시트)을 키보드 위로 밀어 올림 (키보드 높이를 CSS 변수로 전달)
  if (window.visualViewport) {
    const vv = visualViewport, dlg = $("edit-dialog");
    const fit = () => {
      dlg.style.setProperty("--kb", Math.max(0, innerHeight - vv.height - vv.offsetTop) + "px");
      dlg.style.setProperty("--vvh", vv.height + "px");
    };
    vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit);
  }
  const openNew = () => openTxn({ account_id: state.acct.id && !$("view-accounts").hidden ? state.acct.id : "everyday" });

  // ---------- 내역 줄 ----------
  function txnRows(el, txns, empty) {
    if (!txns.length) { el.innerHTML = `<li class="empty">${esc(empty)}</li>`; return; }
    el.innerHTML = txns.map((t) => {
      const sign = t.type === "income" ? "+" : t.type === "expense" ? "−" : "";
      const where = t.type === "transfer"
        ? `${esc(accountName(t.account_id))} → ${esc(accountName(t.transfer_account_id))}`
        : `${esc(accountName(t.account_id))} · ${esc(t.category || "분류 없음")}`;
      return `<li><button class="row-btn" data-edit="${esc(t.id)}" aria-label="${esc(t.description)} ${esc(fmt(t.amount_cents))} 수정">
        <span class="avatar ${personClass(t.created_by)}" title="${esc(t.created_by)}">${esc(personInitial(t.created_by))}</span>
        <span><span class="row-title" style="display:block">${esc(t.description)}</span><span class="row-sub" style="display:block">${esc(shortDate(t.date))} · ${where}</span></span>
        <span class="row-amt num ${t.type}">${sign}${esc(fmt(t.amount_cents))}</span>
      </button></li>`;
    }).join("");
  }
  document.addEventListener("click", (e) => {
    const edit = e.target.closest("[data-edit]");
    if (edit) openTxn(data.txns.find((t) => t.id === edit.dataset.edit));
    const go = e.target.closest("[data-go]");
    if (go) show(go.dataset.go);
    if (e.target.closest("[data-add]")) openNew();
  });

  // ---------- 가계부 (첫 화면) ----------
  // 이번 달에 아직 기록되지 않은 자동 지출 (매일 아침 Supabase가 기록함)
  function billsLeft(ym) {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return data.bills
      .filter((b) => b.active && b.last_processed_month !== ym && !data.txns.some((t) => t.recurring_bill_id === b.id && t.recurring_month === ym))
      .map((b) => ({ ...b, day: Math.min(b.due_day, last) }))
      .sort((a, b) => a.day - b.day);
  }

  function renderMain() {
    const ym = state.month;
    const isNow = ym === today().slice(0, 7);
    const [start, end] = L.periodRange("month", ym + "-01");
    const monthTxns = L.filterTxns(data.txns, { start, end });
    const sum = L.totals(monthTxns);
    $("m-label").textContent = monthLabel(ym);

    $("sum-h").textContent = `${Number(ym.slice(5))}월 지출`;
    $("sum-expense").innerHTML = money(sum.expense);
    $("sum-income").innerHTML = money(sum.income);

    // 분류별 지출 (가장 큰 것만 분홍)
    const byCat = {};
    for (const t of monthTxns) if (t.type === "expense") byCat[t.category || "분류 없음"] = (byCat[t.category || "분류 없음"] || 0) + t.amount_cents;
    const cats = Object.entries(byCat).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
    if (cats.length) C.barList($("cat-bars"), cats, { format: fmt, thin: true, colour: "var(--accent)" });
    else $("cat-bars").innerHTML = `<p class="empty">${monthLabel(ym)}에는 아직 지출이 없어요.</p>`;

    // 동현 · 함께 · 나윤
    const bal = Object.fromEntries(data.accounts.map((a) => [a.id, L.balanceOn(a, data.txns)]));
    $("lanes").innerHTML = LANES.map((lane) => {
      const spent = monthTxns.filter((t) => t.type === "expense" && lane.accounts.includes(t.account_id || "everyday")).reduce((s, t) => s + t.amount_cents, 0);
      return `<div class="lane">
        <div class="lane-head"><span class="avatar ${lane.key === "us" ? "" : lane.key}" aria-hidden="true">${lane.initial}</span>${lane.name}</div>
        <div class="lane-spent"><span class="label">${Number(ym.slice(5))}월 지출</span><span class="figure num">${esc(fmt(spent))}</span></div>
        <div class="lane-accts">${lane.accounts.map((id) => `<button class="acct-link" data-account="${id}"><span>${esc(accountName(id))}</span><span class="num">${esc(fmt(bal[id]))}</span></button>`).join("")}</div>
      </div>`;
    }).join("");
    $("lanes-meta").innerHTML = `통장 합계 <span class="num">${esc(fmt(Object.values(bal).reduce((s, v) => s + v, 0)))}</span>`;

    txnRows($("month-list"), monthTxns.slice(0, 5), `${monthLabel(ym)}에는 아직 내역이 없어요.`);

    // 남은 자동 지출
    const due = isNow ? billsLeft(ym) : [];
    const dueSum = due.reduce((s, b) => s + b.amount_cents, 0);
    $("bills-due").innerHTML = !isNow
      ? `<li class="empty">이번 달 화면에서만 보여요.</li>`
      : due.length
        ? due.slice(0, 5).map((b) => `<li class="row-static">
            <span class="day-chip"><b class="num">${b.day}</b>일</span>
            <span><span class="row-title" style="display:block">${esc(b.description)}</span><span class="row-sub" style="display:block">${esc(accountName(b.account_id))}</span></span>
            <span></span><span class="row-amt num">−${esc(fmt(b.amount_cents))}</span></li>`).join("")
        : `<li class="empty">이번 달 자동 지출은 모두 기록됐어요.</li>`;
    $("bills-total").innerHTML = due.length ? `<span>${due.length}건 합계</span><span class="num">−${esc(fmt(dueSum))}</span>` : "";

    // 한 줄 요약 (이번 달에 가장 먼저 알아야 할 것)
    $("main-finding").textContent = isNow && due.length
      ? `${monthLabel(ym)} · 자동 지출 ${due.length}건 ${fmt(dueSum)}가 더 빠져요. 다음은 ${due[0].day}일 ${due[0].description}.`
      : `${monthLabel(ym)} · 내역 ${monthTxns.length}건`;
  }

  // ---------- 내역 화면 ----------
  function stepAnchor(mode, anchor, dir) {
    if (mode === "day") return L.addDays(anchor, dir);
    if (mode === "month") return L.addMonths(anchor.slice(0, 7), dir) + "-01";
    return `${Number(anchor.slice(0, 4)) + dir}-01-01`;
  }
  function periodLabel(mode, anchor) {
    if (mode === "day") return shortDate(anchor);
    if (mode === "month") return monthLabel(anchor.slice(0, 7));
    return `${anchor.slice(0, 4)}년`;
  }
  const pressSeg = (el, attr, value) => el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === value)));

  function renderHistory() {
    const h = state.hist;
    pressSeg($("h-mode"), "mode", h.mode);
    $("h-nav").hidden = h.mode === "range";
    $("h-range").hidden = h.mode !== "range";
    $("h-label").textContent = periodLabel(h.mode, h.anchor);
    $("h-type").value = h.type;
    $("h-cat").innerHTML = `<option value="">모든 분류</option>` +
      L.categoryOptions(data.categories, data.txns).map((o) => `<option value="${esc(o.key)}" ${o.key === h.cat ? "selected" : ""}>${esc(o.label)}</option>`).join("");

    const [start, end] = L.periodRange(h.mode, h.anchor, h.from, h.to);
    const list = L.filterTxns(data.txns, { start, end, type: h.type, category: h.cat });
    const sum = L.totals(list);
    $("h-income").innerHTML = money(sum.income);
    $("h-expense").innerHTML = money(sum.expense);
    $("h-count").innerHTML = `<span class="num">${list.length}</span><span class="unit">건</span>`;
    $("h-sub").textContent = h.mode === "range" ? `${shortDate(start)} ~ ${shortDate(end)}` : periodLabel(h.mode, h.anchor);
    txnRows($("h-list"), list, "이 기간에는 내역이 없어요.");
  }

  // ---------- 통장 화면 ----------
  function renderAccounts() {
    const a = data.accounts.find((x) => x.id === state.acct.id) || data.accounts[0];
    state.acct.id = a.id;
    const { mode, anchor } = state.acct;
    $("a-tabs").innerHTML = data.accounts.map((x) => `<button data-account="${x.id}" aria-pressed="${x.id === a.id}">${esc(x.name)}</button>`).join("");
    pressSeg($("a-mode"), "mode", mode);
    $("a-name").textContent = a.name;
    const lane = LANES.find((l) => l.accounts.includes(a.id));
    $("a-sub").textContent = lane.name === "함께" ? "두 사람이 함께 쓰는 통장" : `${lane.name}의 용돈 통장`;
    $("a-label").textContent = periodLabel(mode, anchor);

    const points = L.balanceSeries(a, data.txns, mode, anchor);
    const [start, end] = L.periodRange(mode, anchor);
    const t = today();
    let todayIdx = null;
    if (t >= start && t <= end) todayIdx = mode === "month" ? Number(t.slice(8, 10)) - 1 : Number(t.slice(5, 7)) - 1;
    const shown = todayIdx == null ? points.at(-1) : points[todayIdx];
    $("a-balance").innerHTML = `${money(shown.cents)}<span class="unit">${todayIdx == null ? (mode === "month" ? " 월말" : " 연말") : " 오늘"}</span>`;
    // 0부터 그리면 잔고 선이 위에 붙어 평평해 보여서, 실제 잔고 근처부터 그림
    const vals = points.map((p) => p.cents);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    C.line($("a-chart"), {
      min: Math.max(0, lo - Math.max((hi - lo) * 0.6, Math.abs(lo) * 0.04, 1000)),
      labels: points.map((p) => p.label),
      series: [{ name: a.name, values: points.map((p) => p.cents) }],
      format: fmt,
      tickFormat: (v) => `${(v / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €`,
      step: true, height: innerWidth > 1100 ? 300 : 200, today: todayIdx, todayLabel: "오늘", // 넓은 화면은 옆 목록 높이에 맞춤
    });

    const list = L.filterTxns(data.txns, { start, end, accountId: a.id });
    const sum = L.totals(list, a.id);
    $("a-income").innerHTML = money(sum.income);
    $("a-expense").innerHTML = money(sum.expense);
    $("a-count").textContent = `${list.length}건`;
    txnRows($("a-list"), list.slice(0, 8), "이 기간에는 내역이 없어요.");
  }

  // ---------- 설정 화면 ----------
  function renderSettings() {
    const bal = Object.fromEntries(data.accounts.map((a) => [a.id, L.balanceOn(a, data.txns)]));
    if (!$("balance-form").contains(document.activeElement)) {
      $("balance-form").innerHTML = data.accounts.map((a) =>
        `<label>${esc(a.name)} (€) <input name="${a.id}" inputmode="decimal" value="${(bal[a.id] / 100).toFixed(2).replace(".", ",")}"></label>`).join("") +
        `<p class="error" role="alert"></p><div class="row"><button class="btn primary">현재 잔액 저장</button></div>`;
    }
    $("balance-total").textContent = `지금 통장 합계${fmt(Object.values(bal).reduce((s, v) => s + v, 0))}`;
    for (const type of ["expense", "income"]) {
      $(`cat-${type}`).innerHTML = catNames(type).map((name) =>
        `<li>${esc(name)}<button data-delcat="${type}|${esc(name)}" aria-label="${esc(name)} 분류 삭제">×</button></li>`).join("");
    }
    document.querySelectorAll(".account-select").forEach((s) => { s.innerHTML = accountOptions(s.value || "everyday"); });
    const bills = [...data.bills].sort((a, b) => a.due_day - b.due_day);
    $("bill-total").textContent = bills.length ? `매달 ${bills.length}건 · 합계 ${fmt(bills.reduce((s, b) => s + b.amount_cents, 0))}` : "";
    $("bill-list").innerHTML = bills.length ? bills.map((b) => `<li class="row-static">
      <span class="day-chip"><b class="num">${b.due_day}</b>일</span>
      <span><span class="row-title" style="display:block">${esc(b.description)}</span><span class="row-sub" style="display:block">${esc(accountName(b.account_id))}${b.last_processed_month ? ` · 마지막 기록 ${esc(b.last_processed_month)}` : ""}</span></span>
      <span class="row-amt num">−${esc(fmt(b.amount_cents))}</span>
      <button class="text-btn" data-delbill="${esc(b.id)}" aria-label="${esc(b.description)} 자동 지출 삭제">삭제</button></li>`).join("")
      : `<li class="empty">등록된 자동 지출이 없어요.</li>`;
  }

  // ---------- 화면 전환 ----------
  function show(view) {
    for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
    document.querySelectorAll(".nav-item").forEach((b) => (b.dataset.view === view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    $("month-switch").hidden = view !== "main";
    $("crumb").hidden = view === "main";
    $("crumb").textContent = { history: "내역", accounts: "통장", settings: "설정" }[view] || "";
    window.scrollTo(0, 0);
    render();
  }
  const current = () => VIEWS.find((v) => !$(`view-${v}`).hidden);
  function render() {
    const v = current();
    if (v === "main") renderMain();
    if (v === "history") renderHistory();
    if (v === "accounts") renderAccounts();
    if (v === "settings") renderSettings();
  }
  async function refresh() { data = await S.load(); render(); }

  // ---------- 버튼 연결 ----------
  document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
  $("m-prev").onclick = () => { state.month = L.addMonths(state.month, -1); renderMain(); };
  $("m-next").onclick = () => { state.month = L.addMonths(state.month, 1); renderMain(); };
  $("add-btn").onclick = openNew;
  const openHistory = (type) => { Object.assign(state.hist, { mode: "month", anchor: state.month + "-01", type, cat: "" }); show("history"); };
  $("sum-income").onclick = () => openHistory("income");
  $("sum-expense").onclick = () => openHistory("expense");
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-account]");
    if (!b) return;
    const fromTabs = b.closest("#a-tabs");
    state.acct.id = b.dataset.account;
    if (!fromTabs) Object.assign(state.acct, { mode: "month", anchor: today() });
    if (current() === "accounts") renderAccounts(); else show("accounts");
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
    document.activeElement.blur();
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

  $("h-mode").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { state.hist.mode = b.dataset.mode; renderHistory(); }));
  $("h-prev").onclick = () => { state.hist.anchor = stepAnchor(state.hist.mode, state.hist.anchor, -1); renderHistory(); };
  $("h-next").onclick = () => { state.hist.anchor = stepAnchor(state.hist.mode, state.hist.anchor, 1); renderHistory(); };
  $("h-from").value = state.hist.from;
  $("h-to").value = state.hist.to;
  $("h-from").onchange = (e) => { state.hist.from = e.target.value; renderHistory(); };
  $("h-to").onchange = (e) => { state.hist.to = e.target.value; renderHistory(); };
  $("h-type").onchange = (e) => { state.hist.type = e.target.value; renderHistory(); };
  $("h-cat").onchange = (e) => { state.hist.cat = e.target.value; renderHistory(); };

  $("a-all").onclick = () => { Object.assign(state.hist, { mode: state.acct.mode, anchor: state.acct.anchor, type: "all", cat: "" }); show("history"); };
  $("a-mode").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { state.acct.mode = b.dataset.mode; renderAccounts(); }));
  $("a-prev").onclick = () => { state.acct.anchor = stepAnchor(state.acct.mode, state.acct.anchor, -1); renderAccounts(); };
  $("a-next").onclick = () => { state.acct.anchor = stepAnchor(state.acct.mode, state.acct.anchor, 1); renderAccounts(); };

  // ---------- 로그인 ----------
  window.addEventListener("unhandledrejection", (e) => alert("문제가 생겼습니다: " + (e.reason && e.reason.message || e.reason)));
  const shell = document.querySelector(".shell");
  const loggedIn = (yes) => {
    shell.classList.toggle("logged-out", !yes);
    for (const id of ["side", "topbar", "tabbar"]) $(id).hidden = !yes;
  };

  async function start() {
    me = await S.me();
    if (!me || !me.name) {
      if (me && !me.name) {
        await S.signOut();
        $("login-form").querySelector(".error").textContent = `${me.email}은(는) 허락된 이메일이 아닙니다.`;
      }
      loggedIn(false);
      show("login");
      return;
    }
    $("me").textContent = `${me.name}님`;
    $("me-avatar").textContent = personInitial(me.name);
    $("me-avatar").className = `avatar ${personClass(me.name)}`;
    loggedIn(true);
    await S.runRecurring(today());
    data = await S.load();
    show("main");
    const url = await S.photoUrl();
    if (url) { $("photo").src = url; $("photo-frame").hidden = false; }
    document.querySelector(".summary").classList.toggle("no-photo", !url);
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
    if (!me || !me.name || document.hidden || $("edit-dialog").open || current() === "login") return;
    if (document.activeElement && document.activeElement.closest("form")) return;
    refresh();
  }, 15000);

  start();
})();
