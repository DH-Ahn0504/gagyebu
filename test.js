// 계산 함수 점검: node test.js
const assert = require("node:assert/strict");
const L = require("./logic.js");

// 금액 읽기
assert.equal(L.parseAmount("12,5"), 1250);
assert.equal(L.parseAmount("12.50"), 1250);
assert.equal(L.parseAmount("1.234,56"), 123456);
assert.equal(L.parseAmount("1,234.56"), 123456);
assert.equal(L.parseAmount("1.234"), 123400); // 독일식 천 단위
assert.equal(L.parseAmount("7 €"), 700);
assert.ok(Number.isNaN(L.parseAmount("-5")));
assert.ok(Number.isNaN(L.parseAmount("abc")));
assert.ok(Number.isNaN(L.parseAmount("")));

// 잔액: 수입·지출·이체, 통장 없는 옛 기록은 생활비 통장
const txns = [
  { type: "income", amount_cents: 10000, account_id: "everyday", date: "2026-11-01", created_at: "1" },
  { type: "expense", amount_cents: 2500, account_id: "", date: "2026-11-02", created_at: "2" },
  { type: "transfer", amount_cents: 3000, account_id: "everyday", transfer_account_id: "savings", date: "2026-11-03", created_at: "3" },
];
const everyday = { id: "everyday", base_cents: 0 };
const savings = { id: "savings", base_cents: 500 };
assert.equal(L.balanceOn(everyday, txns), 4500);
assert.equal(L.balanceOn(savings, txns), 3500);
assert.equal(L.balanceOn(everyday, txns, "2026-11-01"), 10000);
assert.equal(L.baseFor("everyday", 5000, txns), 500); // 현재 잔액을 50€로 맞추면 기준값 5€

// 합계에는 이체가 안 들어감
assert.deepEqual(L.totals(txns), { income: 10000, expense: 2500 });

// 정기 지출: 31일 → 2월은 28일, 이번 달에 이미 했으면 다시 안 함
const bill = { id: "b1", active: true, due_day: 31, last_processed_month: "" };
assert.equal(L.dueRecurring([bill], [], "2026-02-27").length, 0);
assert.equal(L.dueRecurring([bill], [], "2026-02-28").length, 1);
assert.equal(L.dueRecurring([{ ...bill, last_processed_month: "2026-02" }], [], "2026-02-28").length, 0);
assert.equal(L.dueRecurring([bill], [{ recurring_bill_id: "b1", recurring_month: "2026-02" }], "2026-02-28").length, 0);
assert.equal(L.dueRecurring([{ ...bill, active: false }], [], "2026-02-28").length, 0);

// 기간
assert.deepEqual(L.periodRange("month", "2026-02-10"), ["2026-02-01", "2026-02-28"]);
assert.deepEqual(L.periodRange("year", "2026-02-10"), ["2026-01-01", "2026-12-31"]);
assert.deepEqual(L.periodRange("range", "", "2026-03-05", "2026-03-01"), ["2026-03-01", "2026-03-05"]);

// 그래프 점 수
assert.equal(L.balanceSeries(everyday, txns, "month", "2026-11-15").length, 30);
assert.equal(L.balanceSeries(everyday, txns, "year", "2026-11-15").length, 12);

console.log("모든 점검 통과");
