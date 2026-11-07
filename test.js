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

// 예산: 80% 미만 ok, 80~99 warn, 100 이상 over, 예산 없음/0 이하는 null
for (const [spent, level] of [[79, "ok"], [80, "warn"], [99, "warn"], [100, "over"], [150, "over"]]) {
  assert.equal(L.budgetStatus(spent, 100).level, level);
}
assert.equal(L.budgetStatus(150, 100).pct, 150);
assert.equal(L.budgetStatus(5, null), null);
assert.equal(L.budgetStatus(5, 0), null);
const cats = [
  { type: "expense", name: "식비", budget_cents: 10000 },
  { type: "expense", name: "교통", budget_cents: 5000 }, // 지출 0이어도 나옴
  { type: "expense", name: "쇼핑", budget_cents: null }, // 예산 없음 → 제외
  { type: "income", name: "급여", budget_cents: 9000 }, // 수입 → 제외
];
const month = [
  { type: "expense", category: "식비", amount_cents: 8000 },
  { type: "income", category: "식비", amount_cents: 99999 },
  { type: "transfer", category: "식비", amount_cents: 99999 },
];
assert.deepEqual(L.budgetRows(cats, month), [
  { name: "식비", spent: 8000, budget: 10000, pct: 80, level: "warn" },
  { name: "교통", spent: 0, budget: 5000, pct: 0, level: "ok" },
]);

// 자동완성: 같은 종류의 가장 최근 것, 다른 종류는 무시, 없으면 null, 목록은 중복 없이 최근 순
const past = [
  { type: "expense", description: "마트", category: "식비", amount_cents: 100, date: "2026-11-01", created_at: "1" },
  { type: "expense", description: "마트", category: "쇼핑", amount_cents: 200, date: "2026-11-05", created_at: "2" },
  { type: "income", description: "마트", category: "기타 수입", amount_cents: 300, date: "2026-11-06", created_at: "3" },
  { type: "expense", description: "버스", category: "교통", amount_cents: 50, date: "2026-11-03", created_at: "4" },
];
assert.equal(L.suggestFor(past, "expense", "마트").amount_cents, 200);
assert.equal(L.suggestFor(past, "income", "마트").amount_cents, 300);
assert.equal(L.suggestFor(past, "transfer", "마트"), null);
assert.equal(L.suggestFor(past, "expense", "없는 내용"), null);
assert.deepEqual(L.recentDescriptions(past, "expense"), ["마트", "버스"]);

// 월말 예상: 자동 지출 0건이면 지금 잔액과 같고, 그 통장에서 빠질 것만 뺌
assert.equal(L.projectedBalance(everyday, txns, []), 4500);
assert.equal(L.projectedBalance(everyday, txns, [{ account_id: "", amount_cents: 1000 }, { account_id: "savings", amount_cents: 999 }]), 3500);
assert.equal(L.projectedBalance(savings, txns, [{ account_id: "savings", amount_cents: 4000 }]), -500);
assert.equal(L.projectedBalance(undefined, txns, []), null);
assert.equal(L.projectedBalance(everyday, txns, [{ account_id: "everyday", amount_cents: NaN }, { account_id: "everyday", amount_cents: "x" }, { account_id: "everyday", amount_cents: 500 }]), 4000);
assert.equal(L.sumCents([{ amount_cents: 300 }, { amount_cents: NaN }, { amount_cents: "x" }, {}, { amount_cents: 200 }]), 500);

// 망가진 금액(NaN/문자열/null)이 섞여도 합계·예산·잔액에 NaN이 안 나옴
const bad = [{ type: "expense", category: "식비", amount_cents: NaN, date: "2026-11-01" }, { type: "expense", category: "식비", amount_cents: null, date: "2026-11-01" }, { type: "expense", category: "식비", amount_cents: 700, date: "2026-11-01" }];
assert.deepEqual(L.totals(bad), { income: 0, expense: 700 });
assert.equal(L.budgetRows([{ type: "expense", name: "식비", budget_cents: 1000 }], bad)[0].spent, 700);
assert.equal(L.balanceOn(everyday, bad), (everyday.base_cents || 0) - 700);

// 달 → 테마 (아직 겨울 CSS만 있으니 기본은 모두 winter)
const { themeForMonth } = require("./theme.js");
for (const m of [12, 1, 2, 7]) assert.equal(themeForMonth(m), "winter");
assert.equal(themeForMonth(7, ["winter", "summer"]), "summer");
assert.equal(themeForMonth(4, ["winter", "spring"]), "spring");
assert.equal(themeForMonth(10, ["winter", "spring"]), "winter"); // 없는 계절은 겨울
for (const m of [0, 13, "a", NaN, null]) assert.equal(themeForMonth(m, ["winter", "spring", "summer", "autumn"]), "winter");

console.log("모든 점검 통과");
