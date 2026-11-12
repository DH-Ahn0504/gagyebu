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
  let warnedBadCents = false; // 경고는 세션당 한 번만
  const formatCents = (cents) => {
    if (Number.isFinite(cents)) return euro.format(cents / 100);
    if (!warnedBadCents) { warnedBadCents = true; console.warn("금액을 읽지 못한 내역이 있어요"); }
    return "-";
  };

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
    const n = Number.isFinite(t.amount_cents) ? t.amount_cents : 0; // 망가진 금액은 0으로 (NaN 방지)
    if (t.type === "income") return from === accountId ? n : 0;
    if (t.type === "expense") return from === accountId ? -n : 0;
    if (t.type === "transfer") {
      return (t.transfer_account_id === accountId ? n : 0) - (from === accountId ? n : 0);
    }
    return 0;
  }

  // uptoDate(포함)까지의 잔액. uptoDate가 없으면 전부
  function balanceOn(account, txns, uptoDate) {
    let b = account.base_cents || 0;
    for (const t of txns) if (!uptoDate || t.date <= uptoDate) b += delta(t, account.id);
    return b;
  }

  // 은행에 실제로 있는 통장. 용돈 통장은 가상이라 돈이 이 둘 안에 들어 있음
  const REAL_ACCOUNTS = ["everyday", "savings"];

  // 용돈 통장 잔액이 실제로는 어느 은행 통장에 들어 있는지: { everyday: {용돈id: 센트}, savings: {...} }
  // 내역마다 더하기만 하므로 순서와 상관없음. 몫이 마이너스여도 그대로 둠
  // shortcut: 용돈→생활비/저축 이체는 은행에서 안 움직인다고 보고, 몫을 '받는 통장'에서 뺌(bank_account_id는 무시).
  //   그래서 은행에서 진짜 돈을 뺀 것(용돈을 현금으로 찾기)은 이 이체로 표현 못 하고, 몫이 마이너스가 될 수 있음. 필요해지면 '출금' 종류를 따로 만들기
  function allowanceShares(accounts, txns, uptoDate) {
    const shares = { everyday: {}, savings: {} };
    const add = (r, id, v) => { shares[r][id] = (shares[r][id] || 0) + v; };
    for (const a of accounts) if (!REAL_ACCOUNTS.includes(a.id) && a.base_cents) add("everyday", a.id, a.base_cents);
    for (const t of txns) {
      if (uptoDate && t.date > uptoDate) continue;
      const n = Number.isFinite(t.amount_cents) ? t.amount_cents : 0;
      const from = t.account_id || "everyday", to = t.transfer_account_id;
      const bank = REAL_ACCOUNTS.includes(t.bank_account_id) ? t.bank_account_id : "everyday";
      const fromReal = REAL_ACCOUNTS.includes(from), toReal = REAL_ACCOUNTS.includes(to);
      if (t.type === "income" && !fromReal) add(bank, from, n);
      else if (t.type === "expense" && !fromReal) add(bank, from, -n);
      else if (t.type === "transfer") {
        const where = toReal ? to : bank; // 용돈이 나가는 쪽의 몫 위치
        if (!fromReal) add(where, from, -n);
        if (to && !toReal) add(fromReal ? from : where, to, n);
      }
    }
    return shares;
  }

  // 은행 앱에서 보이는 잔액 = 앱 잔액 + 그 은행 통장 안에 있는 용돈 몫
  function bankBalance(realId, accounts, txns, uptoDate) {
    const account = accounts.find((a) => a.id === realId);
    if (!account) return null; // 통장 줄이 없으면 화면에 '-'로 보임
    const mine = allowanceShares(accounts, txns, uptoDate)[realId] || {};
    return balanceOn(account, txns, uptoDate) + Object.values(mine).reduce((s, v) => s + v, 0);
  }

  // 화면에 입력한 '현재 잔액'이 되도록 하는 기준값.
  // accounts를 주면 생활비/저축은 입력값을 '은행 잔액'으로 보고 용돈 몫을 뺌
  const baseFor = (accountId, wantedCents, txns, accounts) => {
    const mine = accounts && REAL_ACCOUNTS.includes(accountId) ? allowanceShares(accounts, txns)[accountId] : {};
    return wantedCents - txns.reduce((s, t) => s + delta(t, accountId), 0) - Object.values(mine).reduce((s, v) => s + v, 0);
  };

  // 설정에서 여러 통장을 한꺼번에 바꿀 때: 용돈 통장 기준값을 먼저 구해 반영한 뒤 생활비/저축을 계산
  // (용돈 몫이 같이 바뀌므로 순서가 중요). changed: [[통장id, 센트]] → { id: 기준값 }
  function basesFor(changed, txns, accounts) {
    const accs = accounts.map((a) => ({ ...a })), bases = {};
    const isReal = ([id]) => REAL_ACCOUNTS.includes(id);
    for (const [id, cents] of [...changed.filter((c) => !isReal(c)), ...changed.filter(isReal)]) {
      bases[id] = baseFor(id, cents, txns, accs);
      accs.find((a) => a.id === id).base_cents = bases[id];
    }
    return bases;
  }

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
        (!accountId || delta(t, accountId) !== 0 || (t.account_id || "everyday") === accountId || t.transfer_account_id === accountId)
      )
      .sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at));
  }

  // 수입·지출 합계 (이체는 넣지 않음). accountId를 주면 그 통장만
  function totals(txns, accountId) {
    const r = { income: 0, expense: 0 };
    for (const t of txns) {
      if (t.type === "transfer") continue;
      if (accountId && (t.account_id || "everyday") !== accountId) continue;
      r[t.type] += Number.isFinite(t.amount_cents) ? t.amount_cents : 0;
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

  // 예산 대비 지출: pct는 내림(79.9%가 80으로 보이지 않게). 예산이 없으면 null
  function budgetStatus(spentCents, budgetCents) {
    if (!(budgetCents > 0)) return null;
    const pct = Math.floor((spentCents * 100) / budgetCents);
    return { pct, level: pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok" };
  }

  // 예산이 있는 지출 분류의 이번 달 진행 상황 (지출 0도 포함)
  function budgetRows(categories, monthTxns) {
    return categories
      .filter((c) => c.type === "expense" && c.budget_cents > 0)
      .map((c) => {
        const spent = sumCents(monthTxns.filter((t) => t.type === "expense" && t.category === c.name));
        return { name: c.name, spent, budget: c.budget_cents, ...budgetStatus(spent, c.budget_cents) };
      });
  }

  const newest = (a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at);

  // 같은 종류에서 내용이 정확히 같은 가장 최근 내역 (없으면 null)
  function suggestFor(txns, type, text) {
    return txns.filter((t) => t.type === type && t.description === text).sort(newest)[0] || null;
  }

  // 같은 종류에서 최근에 쓴 내용 (중복 없이, 최근 순, 최대 limit개)
  function recentDescriptions(txns, type, limit = 30) {
    const names = txns.filter((t) => t.type === type && t.description).sort(newest).map((t) => t.description);
    return [...new Set(names)].slice(0, limit);
  }

  // 월말 예상 잔액: 지금 잔액 − 남은 자동 지출 중 이 통장에서 빠질 합계 (통장 없으면 생활비 통장)
  // 금액(amount_cents) 합계. 숫자가 아닌 금액은 건너뜀 (화면에 NaN이 안 뜨게)
  const sumCents = (list) => list.reduce((s, x) => s + (Number.isFinite(x.amount_cents) ? x.amount_cents : 0), 0);
  const projectedBalance = (account, txns, billsLeft) => !account ? null :
    balanceOn(account, txns) - sumCents(billsLeft.filter((b) => (b.account_id || "everyday") === account.id));

  const api = {
    ACCOUNTS, DEFAULT_CATEGORIES, RECURRING_CATEGORY, TYPE_LABEL,
    REAL_ACCOUNTS, allowanceShares, bankBalance,
    formatCents, parseAmount, delta, balanceOn, baseFor, basesFor, toDateStr, addMonths, addDays,
    dueRecurring, periodRange, filterTxns, totals, balanceSeries, categoryOptions,
    budgetStatus, budgetRows, suggestFor, recentDescriptions, projectedBalance, sumCents,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.Logic = api;
})(this);
