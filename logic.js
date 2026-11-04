// 가계부 계산 함수. 화면(app.js)과 테스트(test.js)가 함께 씁니다.
(function (root) {
  "use strict";

  const ACCOUNTS = [
    { id: "everyday", name: "생활비 통장" },
    { id: "savings", name: "저축 통장" },
    { id: "donghyun_allowance", name: "동현이 용돈 통장" },
    { id: "nayoon_allowance", name: "나윤이 용돈 통장" },
  ];
  const DEFAULT_CATEGORIES = {
    income: ["급여", "용돈", "이자", "기타 수입"],
    expense: ["식비", "교통", "공과금", "쇼핑", "의료", "구독", "기타 지출"],
  };
  const RECURRING_CATEGORY = "공과금";
  const TYPE_LABEL = { income: "수입", expense: "지출", transfer: "이체" };

  const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  const formatCents = (cents) => euro.format(cents / 100);

  // "12,5" "12.50" "1.234,56" "1,234.56" → 센트(정수). 읽을 수 없으면 NaN
  function parseAmount(text) {
    const s = String(text ?? "").replace(/[\s€]/g, "");
    if (!/^\d[\d.,]*$/.test(s)) return NaN;
    const m = s.match(/^(.*?)[.,](\d{1,2})$/); // 끝의 1~2자리만 소수점으로 봄
    const intPart = (m ? m[1] : s).replace(/[.,]/g, "");
    if (!/^\d+$/.test(intPart)) return NaN;
    const cents = Number(intPart) * 100 + Number(m ? m[2].padEnd(2, "0") : 0);
    return Number.isSafeInteger(cents) ? cents : NaN;
  }

  // 거래 하나가 이 통장 잔액을 얼마나 바꾸는지. 통장이 없는 옛 기록은 생활비 통장으로 봄
  function delta(t, accountId) {
    const from = t.account_id || "everyday";
    if (t.type === "income") return from === accountId ? t.amount_cents : 0;
    if (t.type === "expense") return from === accountId ? -t.amount_cents : 0;
    if (t.type === "transfer") {
      return (t.transfer_account_id === accountId ? t.amount_cents : 0) - (from === accountId ? t.amount_cents : 0);
    }
    return 0;
  }

  // uptoDate(포함)까지의 잔액. uptoDate가 없으면 전부
  function balanceOn(account, txns, uptoDate) {
    let b = account.base_cents || 0;
    for (const t of txns) if (!uptoDate || t.date <= uptoDate) b += delta(t, account.id);
    return b;
  }

  // 화면에 입력한 '현재 잔액'이 되도록 하는 기준값
  const baseFor = (accountId, wantedCents, txns) =>
    wantedCents - txns.reduce((s, t) => s + delta(t, accountId), 0);

  const pad = (n) => String(n).padStart(2, "0");
  const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const lastDay = (y, m) => new Date(y, m, 0).getDate(); // m: 1~12
  const parseYM = (ym) => ym.split("-").map(Number);
  function addMonths(ym, n) {
    const [y, m] = parseYM(ym);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  function addDays(dateStr, n) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return toDateStr(new Date(y, m - 1, d + n));
  }

  // 이번 달에 기록해야 할 정기 지출 (예전 앱과 같은 규칙: 납부일이 지났고, 이번 달에 아직 안 했으면)
  function dueRecurring(bills, txns, todayStr) {
    const month = todayStr.slice(0, 7);
    const [y, m] = parseYM(month);
    const day = Number(todayStr.slice(8, 10));
    return bills.filter((b) =>
      b.active &&
      day >= Math.min(b.due_day, lastDay(y, m)) &&
      b.last_processed_month !== month &&
      !txns.some((t) => t.recurring_bill_id === b.id && t.recurring_month === month)
    );
  }

  // 보기 방식(하루·월별·기간·1년)에 맞는 [시작일, 종료일]
  function periodRange(mode, anchor, from, to) {
    if (mode === "day") return [anchor, anchor];
    if (mode === "month") {
      const [y, m] = parseYM(anchor.slice(0, 7));
      return [`${anchor.slice(0, 7)}-01`, `${anchor.slice(0, 7)}-${pad(lastDay(y, m))}`];
    }
    if (mode === "year") return [`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-31`];
    return from <= to ? [from, to] : [to, from];
  }

  function filterTxns(txns, { start, end, type, category, accountId }) {
    return txns
      .filter((t) =>
        t.date >= start && t.date <= end &&
        (!type || type === "all" || t.type === type) &&
        (!category || `${t.type}|${t.category || ""}` === category) &&
        (!accountId || delta(t, accountId) !== 0 || (t.account_id || "everyday") === accountId)
      )
      .sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at));
  }

  // 수입·지출 합계 (이체는 넣지 않음). accountId를 주면 그 통장만
  function totals(txns, accountId) {
    const r = { income: 0, expense: 0 };
    for (const t of txns) {
      if (t.type === "transfer") continue;
      if (accountId && (t.account_id || "everyday") !== accountId) continue;
      r[t.type] += t.amount_cents;
    }
    return r;
  }

  // 잔고 그래프 점: 월별은 날마다, 1년은 달마다(월말) 잔액
  function balanceSeries(account, txns, mode, anchor) {
    const points = [];
    if (mode === "month") {
      const [y, m] = parseYM(anchor.slice(0, 7));
      for (let d = 1; d <= lastDay(y, m); d++) {
        const date = `${anchor.slice(0, 7)}-${pad(d)}`;
        points.push({ label: `${d}일`, cents: balanceOn(account, txns, date) });
      }
    } else {
      const y = Number(anchor.slice(0, 4));
      for (let m = 1; m <= 12; m++) {
        points.push({ label: `${m}월`, cents: balanceOn(account, txns, `${y}-${pad(m)}-${pad(lastDay(y, m))}`) });
      }
    }
    return points;
  }

  // 분류 선택 목록: 지금 분류 + 예전 내역에만 남은(삭제된) 분류
  function categoryOptions(categories, txns) {
    const seen = new Set();
    const out = [];
    for (const type of ["expense", "income"]) {
      const names = [...categories.filter((c) => c.type === type).map((c) => c.name),
        ...txns.filter((t) => t.type === type && t.category).map((t) => t.category)];
      for (const name of names) {
        const key = `${type}|${name}`;
        if (!seen.has(key)) { seen.add(key); out.push({ key, label: `${TYPE_LABEL[type]} · ${name}` }); }
      }
    }
    return out;
  }

  const api = {
    ACCOUNTS, DEFAULT_CATEGORIES, RECURRING_CATEGORY, TYPE_LABEL,
    formatCents, parseAmount, delta, balanceOn, baseFor, toDateStr, addMonths, addDays,
    dueRecurring, periodRange, filterTxns, totals, balanceSeries, categoryOptions,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.Logic = api;
})(this);
