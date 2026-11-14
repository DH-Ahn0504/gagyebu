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

  // 세 사람 줄: 동현 · 함께 · 나윤. 동현·나윤은 통장 대신 용돈 분류(월 예산 + 이월)를 보여 줌
  const LANES = [
    { key: "dh", name: "동현", initial: "동", accounts: [], category: "동현 용돈" },
    { key: "us", name: "함께", initial: "함", accounts: ["everyday", "savings"] },
    { key: "ny", name: "나윤", initial: "나", accounts: [], category: "나윤 용돈" },
  ];
  const personClass = (name) => (name === "동현" ? "dh" : name === "나윤" ? "ny" : "");
  const personInitial = (name) => (name === "동현" ? "동" : name === "나윤" ? "나" : name === "정기 지출" ? "자" : "?");

  const accountName = (id) => (data.accounts.find((a) => a.id === (id || "everyday")) || { name: id }).name;
  const accountOptions = (selected) =>
    data.accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === selected ? "selected" : ""}>${esc(a.name)}</option>`).join("");
  const catNames = (type) => data.categories.filter((c) => c.type === type).map((c) => c.name);
  // 금액 표시: 센트(,56)만 작고 흐리게. 계산은 건드리지 않고 fmt() 결과 글자만 나눔
  const amtHtml = (cents) => {
    const s = fmt(cents), i = s.lastIndexOf(",");
    return i < 0 ? esc(s) : `${esc(s.slice(0, i))}<span class="cents">${esc(s.slice(i, i + 3))}</span>${esc(s.slice(i + 3))}`;
  };
  const money = (cents) => `<span class="num">${amtHtml(cents)}</span>`;
  // 분류 이름 → 늘 같은 색 (8가지 차분한 색)
  const catColor = (name) => {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return `var(--cat-${(Math.round(h / 45) % 8) + 1})`; // 1~8 정수만 (색은 style.css의 --cat-N)
  };
  const dayHead = (d) => `${shortDate(d)} (${"일월화수목금토"[new Date(d + "T00:00:00").getDay()]})`;
  const monthLabel = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
  const shortDate = (d) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

  // ---------- 내역 입력 창 (새 입력과 수정에 같이 씀) ----------
  let toastTimer;
  function toast(text, ms = 2500) {
    const el = $("toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  function fillTxnForm(form, t) {
    const type = t.type || "expense";
    const cats = catNames(type);
    if (t.id && t.category && !cats.includes(t.category)) cats.push(t.category); // 지워진 분류도 수정할 땐 유지
    form.innerHTML = `
      <div class="seg type-seg" role="group" aria-label="종류">
        ${["expense", "income", "transfer"].map((k) => `
          <button type="button" data-type="${k}" aria-pressed="${k === type}">${k === "transfer" ? "통장 이체" : L.TYPE_LABEL[k]}</button>`).join("")}
      </div>
      <label>금액 (€) <input name="amount" inputmode="decimal" autocomplete="off" placeholder="12,50" value="${t.amount_cents ? (t.amount_cents / 100).toFixed(2).replace(".", ",") : ""}" required></label>
      <label>내용 <input name="description" maxlength="60" list="desc-list" value="${esc(t.description)}" required><datalist id="desc-list">${L.recentDescriptions(data.txns, type).map((d) => `<option value="${esc(d)}"></option>`).join("")}</datalist></label>
      <label>날짜 <input name="date" type="date" value="${esc(t.date || today())}" required></label>
      <label>${type === "transfer" ? "보내는 통장" : "통장"} <select name="account_id">${accountOptions(t.account_id || "everyday")}</select></label>
      ${type === "transfer"
        ? `<label>받는 통장 <select name="transfer_account_id">${accountOptions(t.transfer_account_id || "savings")}</select></label>`
        : `<label>분류 <select name="category">${cats.map((c) => `<option value="${esc(c)}" ${c === t.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`}
      <p class="error" role="alert"></p>
      <div class="row">
        ${t.id ? `<button type="button" class="btn danger" data-delete>삭제</button>` : ""}
        <button type="button" class="btn" data-cancel>취소</button>
        <button type="submit" class="btn primary">${t.id ? "수정 저장" : "추가"}</button>
      </div>`;
    form.dataset.type = type;
    form.querySelectorAll("[data-type]").forEach((b) =>
      b.addEventListener("click", () => {
        const f = readFields(form);
        // 통장·분류는 사용자가 고른 것일 때만 touched로 넘김. 종류가 바뀌면 분류는 비우되, 처음 연 내역의 종류로 돌아오면 원래 분류
        const orig = t.orig || t;
        const same = b.dataset.type === type;
        fillTxnForm(form, { ...f, id: t.id, orig, type: b.dataset.type, touched: !!form.account_id.dataset.touched,
          catTouched: same && !!form.category?.dataset.touched,
          category: same ? f.category : t.id && b.dataset.type === orig.type ? orig.category : "" });
      }));
    form.querySelector("[data-cancel]").onclick = () => $("edit-dialog").close();
    // 새 입력일 때만: 예전에 쓴 내용이면 분류·통장(비어 있을 때만 금액)을 채움
    if (!t.id && type !== "transfer") form.description.addEventListener("change", () => {
      const s = L.suggestFor(data.txns, type, form.description.value.trim());
      if (!s) return;
      const has = (sel, v) => [...sel.options].some((o) => o.value === v);
      if (!form.category.dataset.touched && has(form.category, s.category)) form.category.value = s.category;
      if (!form.account_id.dataset.touched && has(form.account_id, s.account_id)) form.account_id.value = s.account_id;
      if (!form.amount.value.trim() && Number.isFinite(s.amount_cents)) form.amount.value = (s.amount_cents / 100).toFixed(2).replace(".", ",");
    });
    // 사용자가 직접 고른(또는 미리 골라 둔) 값은 자동 채우기가 덮어쓰지 않음
    if (t.touched ?? t.account_id) form.account_id.dataset.touched = "1";
    if (t.catTouched && form.category) form.category.dataset.touched = "1";
    for (const name of ["category", "account_id"]) form[name]?.addEventListener("change", (e) => { e.target.dataset.touched = "1"; });
    const del = form.querySelector("[data-delete]");
    if (del) del.onclick = () => {
      const o = t.orig || t; // 종류 버튼을 눌러도 처음 열었던 내역을 보여줌
      if (busy || !confirm(`'${o.description}' ${fmt(o.amount_cents)} 내역을 삭제할까요?`)) return;
      save(form, del, () => S.deleteTxn(t.id), "삭제하지 못했어요. 인터넷을 확인하고 다시 시도해 주세요.",
        () => { $("edit-dialog").close(); toast(`${o.description} 삭제했어요`); });
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

  function validate(t, orig) {
    if (!(t.amount_cents > 0)) return "금액을 0보다 크게 입력해 주세요. (예: 12,50)";
    if (!t.description || t.description.length > 60) return "내용은 1자 이상 60자 이하로 입력해 주세요.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || "")) return "날짜를 확인해 주세요.";
    const ids = data.accounts.map((a) => a.id);
    if (!ids.includes(t.account_id) || (t.type === "transfer" && !ids.includes(t.transfer_account_id))) return "통장을 다시 선택해 주세요.";
    if (t.type === "transfer" && t.transfer_account_id === t.account_id) return "보내는 통장과 다른 받는 통장을 선택해 주세요.";
    if (t.type !== "transfer" && !t.category) return "분류를 선택해 주세요.";
    // 그 종류의 분류여야 함. 단, 수정 중인 옛 내역의 (지워진) 분류는 그대로 저장 가능
    if (t.type !== "transfer" && !catNames(t.type).includes(t.category) && !(orig && orig.type === t.type && orig.category === t.category)) return "분류를 다시 선택해 주세요.";
    return "";
  }

  function openTxn(t) {
    const form = $("edit-form");
    $("edit-title").textContent = t.id ? "내역 수정" : "내역 추가";
    fillTxnForm(form, t);
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = readFields(form);
      const error = validate(v, t.id ? t : null);
      form.querySelector(".error").textContent = error;
      if (error) return;
      save(form, e.submitter || form.querySelector("[type=submit]"),
        () => (t.id ? S.updateTxn({ ...v, id: t.id }) : S.addTxn({ ...v, created_by: me.name })),
        t.id ? "수정하지 못했어요. 인터넷을 확인하고 다시 시도해 주세요."
          : "저장하지 못했어요. 이미 저장됐을 수도 있으니 닫고 목록에서 확인한 뒤, 없을 때만 다시 추가해 주세요.",
        () => { $("edit-dialog").close(); toast(t.id ? `${v.description} 수정했어요` : `${v.category || v.description} ${fmt(v.amount_cents)} 추가했어요`); });
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
  const openNew = () => openTxn(state.acct.id && !$("view-accounts").hidden ? { account_id: state.acct.id } : {});

  // ---------- 내역 줄 ----------
  // 같은 날짜끼리 묶어 날짜 머리글을 한 번만 보여 줌. 분류는 색 점으로 표시
  function txnRows(el, txns, empty, addHint) {
    if (!txns.length) {
      el.innerHTML = `<li class="empty">${esc(empty)}${addHint ? `<button class="btn" data-add>+ 내역 추가</button>` : ""}</li>`;
      return;
    }
    let last = "";
    el.innerHTML = txns.map((t) => {
      const sign = t.type === "income" ? "+" : t.type === "expense" ? "−" : "";
      const where = t.type === "transfer"
        ? `${esc(accountName(t.account_id))} → ${esc(accountName(t.transfer_account_id))}`
        : `<i class="dot" style="--c:${catColor(t.category || "분류 없음")}"></i>${esc(t.category || "분류 없음")} · ${esc(accountName(t.account_id))}`;
      const head = t.date !== last ? `<li class="day-head">${esc(dayHead(t.date))}</li>` : "";
      last = t.date;
      return `${head}<li><button class="row-btn" data-edit="${esc(t.id)}" aria-label="${esc(t.description)} ${esc(fmt(t.amount_cents))} 수정">
        <span class="avatar ${personClass(t.created_by)}" title="${esc(t.created_by)}">${esc(personInitial(t.created_by))}</span>
        <span><span class="row-title" style="display:block">${esc(t.description)}</span><span class="row-sub" style="display:block">${where}</span></span>
        <span class="row-amt num ${t.type}">${sign}${amtHtml(t.amount_cents)}</span>
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

  // 이번 달 화면 통장 줄 아래: 월말 예상 잔액 (음수면 빨간 글자)
  function projected(id, due) {
    const cents = L.projectedBalance(data.accounts.find((a) => a.id === id), data.txns, due);
    if (cents === null) return "";
    return `<p class="meta num${cents < 0 ? " neg" : ""}">월말 예상 ${esc(fmt(cents))}</p>`;
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
    for (const t of monthTxns) if (t.type === "expense") byCat[t.category || "분류 없음"] = (byCat[t.category || "분류 없음"] || 0) + L.sumCents([t]);
    const cats = Object.entries(byCat).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
    if (cats.length) C.barList($("cat-bars"), cats, { format: fmt, thin: true, colour: "var(--accent)" });
    else $("cat-bars").innerHTML = `<p class="empty">${monthLabel(ym)}에는 아직 지출이 없어요.</p>`;

    // 분류별 예산 진행 막대 (예산이 하나도 없으면 숨김)
    const budgets = L.budgetRows(data.categories, data.txns, ym);
    $("budget-bars").hidden = !budgets.length;
    $("budget-list").innerHTML = budgets.map((b) => `<li>
      <div class="budget-line"><span>${esc(b.name)}${b.carry ? `<small class="budget-carry">이월 ${esc(fmt(b.carry))}</small>` : ""}</span><span class="num">${esc(fmt(b.spent))} / ${esc(fmt(b.available))}</span></div>
      <div class="budget-track" role="progressbar" aria-label="${esc(b.name)} 예산 사용" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(b.pct, 100)}"><div class="budget-fill budget-${b.level}" style="width:${Math.min(b.pct, 100)}%"></div></div>
      ${b.level === "over" ? `<p class="budget-over">초과 ${esc(fmt(b.spent - b.available))}</p>` : ""}
    </li>`).join("");

    const due = isNow ? billsLeft(ym) : [];

    // 동현 · 함께 · 나윤
    const bal = Object.fromEntries(data.accounts.map((a) => [a.id, L.balanceOn(a, data.txns)]));
    const acctLine = (id) =>
      `<button class="acct-link" data-account="${id}"><span>${esc(accountName(id))}</span><span class="num">${amtHtml(bal[id])}</span></button>${isNow ? projected(id, due) : ""}`;
    // 용돈 줄: 이번 달 쓸 수 있는 돈(예산+이월)과 남은 돈. 예산이 없으면 안내만
    const allowLine = (name) => {
      const r = budgets.find((b) => b.name === name);
      const piece = (text) => `<span class="nw">${text}</span>`;
      return `<p class="meta num">${r
        ? `${piece(`쓸 수 있는 용돈 ${esc(fmt(r.available))}`)} ${piece(`(예산 ${esc(fmt(r.budget))} + 이월 ${esc(fmt(r.carry))})`)} · ${piece(`남은 돈 ${esc(fmt(r.available - r.spent))}`)}`
        : "설정에서 월 예산을 정해 주세요"}</p>`;
    };
    $("lanes").innerHTML = LANES.map((lane) => {
      const spent = monthTxns.filter((t) => t.type === "expense" && (lane.category ? t.category === lane.category : !L.CARRY_CATEGORIES.includes(t.category) && lane.accounts.includes(t.account_id || "everyday"))).reduce((s, t) => s + L.sumCents([t]), 0);
      return `<div class="lane">
        <div class="lane-head"><span class="avatar ${lane.key === "us" ? "" : lane.key}" aria-hidden="true">${lane.initial}</span>${lane.name}</div>
        <div class="lane-spent"><span class="label">${Number(ym.slice(5))}월 지출</span><span class="figure num">${amtHtml(spent)}</span></div>
        <div class="lane-accts">${lane.category ? allowLine(lane.category) : lane.accounts.map(acctLine).join("")}</div>
      </div>`;
    }).join("");
    $("lanes-meta").innerHTML = `전체 합계 <span class="num">${esc(fmt(Object.values(bal).reduce((s, v) => s + v, 0)))}</span>`;

    txnRows($("month-list"), monthTxns.slice(0, 5), `${monthLabel(ym)}에는 아직 내역이 없어요.`, true);

    // 남은 자동 지출
    const dueSum = L.sumCents(due);
    $("bills-due").innerHTML = !isNow
      ? `<li class="empty">이번 달 화면에서만 보여요.</li>`
      : due.length
        ? due.slice(0, 5).map((b, i) => {
            const left = b.day - Number(today().slice(8, 10));
            const when = left === 0 ? "오늘" : left > 0 ? `${left}일 뒤` : "";
            return `<li class="row-static${i === 0 ? " next" : ""}">
            <span class="day-chip"><b class="num">${b.day}</b>일</span>
            <span><span class="row-title" style="display:block">${esc(b.description)}</span><span class="row-sub" style="display:block">${esc(accountName(b.account_id))}${when ? ` · <span class="when">${when}</span>` : ""}</span></span>
            <span></span><span class="row-amt num">−${amtHtml(b.amount_cents)}</span></li>`;
          }).join("")
        : `<li class="empty ok">이번 달 자동 지출은 모두 기록됐어요.</li>`;
    $("bills-total").innerHTML = due.length ? `<span>${due.length}건 합계</span><span class="num">−${amtHtml(dueSum)}</span>` : "";

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
    $("a-tabs").innerHTML = data.accounts.map((x) => `<button data-account="${esc(x.id)}" aria-pressed="${x.id === a.id}">${esc(x.name)}</button>`).join("");
    pressSeg($("a-mode"), "mode", mode);
    $("a-name").textContent = a.name;
    $("a-sub").textContent = "두 사람이 함께 쓰는 통장";
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
        `<label>${esc(a.name)} (€) <input name="${esc(a.id)}" inputmode="decimal" value="${(bal[a.id] / 100).toFixed(2).replace(".", ",")}"></label>`).join("") +
        `<p class="error" role="alert"></p><div class="row"><button class="btn primary">현재 잔액 저장</button></div>`;
    }
    $("balance-total").textContent = `전체 합계 ${fmt(Object.values(bal).reduce((s, v) => s + v, 0))}`;
    for (const type of ["expense", "income"]) {
      $(`cat-${type}`).innerHTML = catNames(type).map((name) =>
        `<li><span class="chip-name" title="${esc(name)}">${esc(name)}</span><button data-delcat="${type}|${esc(name)}" aria-label="${esc(name)} 분류 삭제">×</button></li>`).join("");
    }
    if (!$("budget-form").contains(document.activeElement)) {
      $("budget-form").innerHTML = data.categories.filter((c) => c.type === "expense").map((c) =>
        `<label>${esc(c.name)} 월 예산 (€) <input data-budget="${esc(c.name)}" inputmode="decimal" placeholder="없음" value="${c.budget_cents ? (c.budget_cents / 100).toFixed(2).replace(".", ",") : ""}"></label>`).join("") +
        `<p class="error" role="alert"></p><div class="row"><button class="btn primary">예산 저장</button></div>`;
    }
    document.querySelectorAll(".account-select").forEach((s) => { s.innerHTML = accountOptions(s.value || "everyday"); });
    const bills = [...data.bills].sort((a, b) => a.due_day - b.due_day);
    $("bill-total").textContent = bills.length ? `매달 ${bills.length}건 · 합계 ${fmt(L.sumCents(bills))}` : "";
    $("bill-list").innerHTML = bills.length ? bills.map((b) => `<li class="row-static">
      <span class="day-chip"><b class="num">${esc(b.due_day)}</b>일</span>
      <span><span class="row-title" style="display:block">${esc(b.description)}</span><span class="row-sub" style="display:block">${esc(accountName(b.account_id))}${b.last_processed_month ? ` · 마지막 기록 ${esc(b.last_processed_month)}` : ""}</span></span>
      <span class="row-amt num">−${amtHtml(b.amount_cents)}</span>
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
    const snowBox = $("snow-setting");
    if (snowBox) snowBox.hidden = !["winter", "autumn"].includes(document.documentElement.dataset.theme); // 계절 효과는 겨울·가을만 (snow.js와 같은 목록)
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
    drawnKey = JSON.stringify(data) + today();   // 자동 새로고침이 "달라졌나" 비교할 기준 (날짜 포함)
  }
  let drawnKey = "";
  async function refresh() { data = await S.load(); render(); }

  // 저장은 한 번에 하나만: 저장 중이면 무시, 버튼 끄기, 실패하면 그 폼의 .error 칸에 문구 (예산 폼과 같은 방식)
  let busy = false;
  const errBox = (form) => {
    let p = form.querySelector(".error");
    if (!p) { p = document.createElement("p"); p.className = "error"; p.setAttribute("role", "alert"); form.appendChild(p); }
    return p;
  };
  async function save(form, btn, write, failMsg, onOk) {
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;
    let msg = "", ok = false;
    try { await write(); ok = true; if (onOk) onOk(); }
    catch (err) { console.error(err); msg = failMsg; }
    try { await refresh(); }
    catch (err) {
      console.error(err);
      if (ok) { msg = "저장은 됐지만 화면을 새로고침하지 못했어요. 페이지를 다시 열어 주세요."; toast(msg, 6000); }
    } finally { busy = false; if (btn) btn.disabled = false; }
    errBox(form).textContent = msg;
  }

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

  $("balance-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target, err = errBox(form);
    const changed = [];   // 사용자가 바꾼 통장만 저장
    for (const a of data.accounts) {
      const input = form.elements[a.id];
      if (!input) continue;
      if (input.value === input.defaultValue) continue;
      const cents = L.parseAmount(input.value);
      if (!(cents >= 0)) { err.textContent = `${a.name} 금액을 확인해 주세요.`; return; }
      changed.push([a.id, cents]);
    }
    err.textContent = "";
    if (!changed.length) return;
    save(form, form.querySelector("button"), async () => {
      const fresh = await S.load();   // 저장 직전의 최신 내역으로 계산
      await S.setBases(L.basesFor(changed, fresh.txns));
    }, "저장하지 못했어요. 인터넷을 확인하고 다시 시도해 주세요.", () => document.activeElement.blur());
  });

  let budgetSaving = false;
  $("budget-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (budgetSaving) return;   // 저장 중 중복 제출 방지
    const changes = [];
    for (const input of e.target.querySelectorAll("[data-budget]")) {
      const name = input.dataset.budget;
      const text = input.value.trim();
      const cents = text === "" ? null : L.parseAmount(text);
      if (text !== "" && !(cents > 0)) { e.target.querySelector(".error").textContent = `${name} 금액을 확인해 주세요. (예: 300,00)`; return; }
      const old = data.categories.find((c) => c.type === "expense" && c.name === name)?.budget_cents ?? null;
      if (cents !== old) changes.push([name, cents]);
    }
    const form = e.target;
    const btn = form.querySelector("button");
    budgetSaving = true;
    btn.disabled = true;
    let msg = "";   // refresh()가 폼을 다시 그리므로, 끝난 뒤 새 .error 칸에 넣을 고정 문구
    try {
      const ym = today().slice(0, 7);
      const fresh = changes.some(([n]) => L.CARRY_CATEGORIES.includes(n)) ? await S.load() : null;   // 저장 직전의 최신 내역으로 이월 계산
      for (const [name, cents] of changes) {
        // 이월 분류: 예산을 바꾸면 지난달까지의 이월액을 시작 금액으로 굳히고 이번 달부터 다시 셈. 예산을 지우면 이월도 끝
        const cat = data.categories.find((c) => c.type === "expense" && c.name === name);
        if (cents === null && L.CARRY_CATEGORIES.includes(name)) {
          const lost = L.carryFor(cat, fresh.txns, ym);
          if (lost !== 0 && !confirm(`'${name}' 이월 ${L.formatCents(lost)}가 사라져요. 계속할까요?`)) continue;   // 취소하면 저장 안 함, refresh()가 입력칸을 원래 값으로 되돌림
        }
        const carry = !L.CARRY_CATEGORIES.includes(name) ? undefined
          : cents === null ? { carry_since: null, carry_base_cents: 0 }
          : { carry_since: ym, carry_base_cents: cat?.budget_cents > 0 ? L.carryFor(cat, fresh.txns, ym) : 0 };
        await S.setBudget("expense", name, cents, carry);
      }
      form.querySelector(".error").textContent = "";
      document.activeElement.blur();
    } catch (err) {
      console.error(err);
      msg = "일부만 저장됐을 수 있어요. 화면의 값을 확인하고 다시 시도해 주세요.";
      document.activeElement.blur();   // 커서를 빼야 refresh()가 입력칸을 저장된 값으로 다시 그림
    } finally {
      try { await refresh(); }   // 일부만 저장됐어도 화면을 최신으로
      catch (err) { console.error(err); msg = "화면을 새로고침하지 못했어요. 페이지를 다시 열어 주세요."; }
      finally { budgetSaving = false; btn.disabled = false; }
      if (msg) $("budget-form").querySelector(".error").textContent = msg;
    }
  });

  $("cat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target, f = new FormData(form);
    const name = String(f.get("name")).trim();
    if (name) save(form, form.querySelector("button"), () => S.addCategory(f.get("type"), name), "분류를 추가하지 못했어요. 다시 시도해 주세요.", () => form.reset());
  });
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-delcat]");
    const b = e.target.closest("[data-delbill]");
    if (busy) return;
    if (c) {
      const k = c.dataset.delcat.indexOf("|"), type = c.dataset.delcat.slice(0, k), name = c.dataset.delcat.slice(k + 1);
      if (confirm(`'${name}' 분류를 삭제할까요? 예전 내역의 분류는 그대로 남습니다.`) &&
        (type !== "expense" || !L.CARRY_CATEGORIES.includes(name) || confirm(`'${name}'은(는) 월 예산과 이월 기록이 붙은 분류예요. 정말 삭제할까요?`))) save($("cat-form"), c, () => S.deleteCategory(type, name), "분류를 지우지 못했어요. 다시 시도해 주세요.");
    }
    if (b && confirm("이 자동 지출을 삭제할까요? 이미 기록된 내역은 남습니다.")) save($("bill-form"), b, () => S.deleteBill(b.dataset.delbill), "자동 지출을 지우지 못했어요. 다시 시도해 주세요.");
  });

  $("bill-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target, f = new FormData(form);
    const amount = L.parseAmount(f.get("amount"));
    const day = Number(f.get("due_day"));
    if (!(amount > 0) || !(day >= 1 && day <= 31)) { errBox(form).textContent = "금액과 날짜(1~31일)를 확인해 주세요."; return; }
    save(form, form.querySelector("button"),
      () => S.addBill({ description: String(f.get("description")).trim(), amount_cents: amount, account_id: f.get("account_id"), due_day: day }),
      "자동 지출을 추가하지 못했어요. 다시 시도해 주세요.", () => form.reset());
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
  window.addEventListener("unhandledrejection", (e) => toast("문제가 생겼습니다: " + (e.reason && e.reason.message || e.reason), 6000));
  const shell = document.querySelector(".shell");
  const loggedIn = (yes) => {
    shell.classList.toggle("logged-out", !yes);
    for (const id of ["side", "topbar", "tabbar"]) $(id).hidden = !yes;
  };

  // 400ms 넘게 걸릴 때만 "불러오는 중" 표시 (처음부터 보이면 깜빡임). 성공·실패 모두 제거
  async function start() {
    const timer = setTimeout(() => {
      if ($("loading")) return;
      const el = document.createElement("div");
      el.id = "loading";
      el.setAttribute("role", "status");
      el.textContent = "불러오는 중…";
      document.body.prepend(el);
    }, 400);
    const hideLoading = () => { clearTimeout(timer); $("loading")?.remove(); };
    try { await startInner(hideLoading); }
    finally { hideLoading(); }
  }

  async function startInner(hideLoading) {
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
    hideLoading(); // 사진을 기다리는 동안 완성된 화면 위에 로딩 표시가 남지 않게
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
  let offline = false;   // 끊김 안내는 한 번만, 다시 연결되면 초기화
  setInterval(async () => {
    if (!me || !me.name || document.hidden || $("edit-dialog").open || current() === "login") return;
    if (document.activeElement && document.activeElement.closest("form")) return;
    try {
      const fresh = await S.load();
      offline = false;
      if (JSON.stringify(fresh) + today() === drawnKey) return;   // 똑같으면 다시 그리지 않음 (오류 문구·커서 유지)
      const errs = ["budget-form", "balance-form"].map((id) => $(id).querySelector(".error")?.textContent || "");
      data = fresh; render();
      ["budget-form", "balance-form"].forEach((id, i) => { const p = $(id).querySelector(".error"); if (p) p.textContent = errs[i]; });
    }
    catch (err) {
      console.error(err);
      if (!offline) { offline = true; toast("연결이 끊겼어요. 인터넷을 확인해 주세요. 연결되면 자동으로 다시 불러와요.", 6000); }
    }
  }, 15000);

  // 처음 불러오기 실패 시: 안내와 "다시 시도" 버튼 (화면 틀은 JS로 만듦)
  function startFailed(err) {
    console.error(err);
    let box = $("start-error");
    if (!box) {
      box = document.createElement("div");
      box.id = "start-error";
      box.setAttribute("role", "alert");
      const p = document.createElement("p");
      p.className = "error";
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = "다시 시도";
      b.onclick = () => { box.hidden = true; start().catch(startFailed); };
      box.append(p, b);
      document.body.prepend(box);
    }
    box.firstChild.textContent = "불러오지 못했어요. 인터넷을 확인하고 다시 시도해 주세요.";
    box.hidden = false;
  }
  start().catch(startFailed);
})();
