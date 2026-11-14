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
// 이체 금액이 망가져도 받는 통장 목록에는 나와야 함
const brokenXfer = { type: "transfer", amount_cents: NaN, account_id: "everyday", transfer_account_id: "savings", date: "2026-11-03", created_at: "9" };
assert.equal(L.filterTxns([brokenXfer], { start: "2026-11-01", end: "2026-11-30", accountId: "savings" }).length, 1);
assert.equal(L.baseFor("everyday", 5000, txns), 500); // 현재 잔액을 50€로 맞추면 기준값 5€

// 여러 통장 기준값을 한꺼번에 구해도 각각 입력한 잔액이 됨
{
  const bases = L.basesFor([["everyday", 5000], ["savings", 100]], txns);
  assert.deepEqual(bases, { everyday: 500, savings: 100 - 3000 });
}

// 합계에는 이체가 안 들어감
assert.deepEqual(L.totals(txns), { income: 10000, expense: 2500 });

// 정기 지출: 31일 → 2월은 28일, 이번 달에 이미 했으면 다시 안 함
const bill = { id: "b1", active: true, due_day: 31, last_processed_month: "" };
assert.equal(L.dueRecurring([bill], [], "2026-02-27").length, 0);
assert.equal(L.dueRecurring([bill], [], "2026-02-28").length, 1);
assert.equal(L.dueRecurring([{ ...bill, last_processed_month: "2026-02" }], [], "2026-02-28").length, 0);
assert.equal(L.dueRecurring([bill], [{ recurring_bill_id: "b1", recurring_month: "2026-02" }], "2026-02-28").length, 0);
assert.equal(L.dueRecurring([{ ...bill, active: false }], [], "2026-02-28").length, 0);
// 정기 수입이 만드는 내역: 수입·급여·'정기 수입', 옛 항목(type 없음)은 지출·공과금·'정기 지출'
assert.deepEqual(L.recurringFields({ type: "income" }), { type: "income", category: "급여", created_by: "정기 수입" });
assert.deepEqual(L.recurringFields(bill), { type: "expense", category: "공과금", created_by: "정기 지출" });
assert.equal(L.RECURRING_INCOME_CATEGORY, "급여");

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
// 쓸 수 있는 돈이 0 이하(이월이 마이너스)면 null이 아니라 바로 over
assert.deepEqual(L.budgetStatus(0, 0), { pct: 100, level: "over" });
assert.deepEqual(L.budgetStatus(5, -300), { pct: 100, level: "over" });

// 저축 목표 진행
assert.equal(L.goalStatus(100, null), null);
assert.equal(L.goalStatus(100, undefined), null);
assert.equal(L.goalStatus(100, 0), null);
assert.equal(L.goalStatus(100, -5), null);
assert.deepEqual(L.goalStatus(0, 1000), { pct: 0, reached: false, shownPct: 0 });
assert.deepEqual(L.goalStatus(499, 1000), { pct: 49, reached: false, shownPct: 49 });
assert.deepEqual(L.goalStatus(1000, 1000), { pct: 100, reached: true, shownPct: 100 });
assert.deepEqual(L.goalStatus(1200, 1000), { pct: 100, reached: true, shownPct: 120 });
assert.deepEqual(L.goalStatus(-500, 1000), { pct: 0, reached: false, shownPct: 0 });
assert.deepEqual(L.goalStatus(NaN, 1000), { pct: 0, reached: false, shownPct: 0 });
assert.deepEqual(L.goalStatus("abc", 1000), { pct: 0, reached: false, shownPct: 0 });
assert.equal(L.goalStatus(100, "1000"), null);
assert.deepEqual(L.goalStatus(5e9, 1e10), { pct: 50, reached: false, shownPct: 50 });
const cats = [
  { type: "expense", name: "식비", budget_cents: 10000 },
  { type: "expense", name: "교통", budget_cents: 5000 }, // 지출 0이어도 나옴
  { type: "expense", name: "쇼핑", budget_cents: null }, // 예산 없음 → 제외
  { type: "income", name: "급여", budget_cents: 9000 }, // 수입 → 제외
];
const month = [
  { type: "expense", category: "식비", amount_cents: 8000, date: "2026-11-05" },
  { type: "expense", category: "식비", amount_cents: 99999, date: "2026-10-05" }, // 다른 달 → 제외
  { type: "income", category: "식비", amount_cents: 99999, date: "2026-11-05" },
  { type: "transfer", category: "식비", amount_cents: 99999, date: "2026-11-05" },
];
assert.deepEqual(L.budgetRows(cats, month, "2026-11"), [
  { name: "식비", spent: 8000, budget: 10000, carry: 0, available: 10000, pct: 80, level: "warn" },
  { name: "교통", spent: 0, budget: 5000, carry: 0, available: 5000, pct: 0, level: "ok" },
]);

// 이월: carryFor(분류, 내역, 달)
{
  const X = (cents, date, o = {}) => ({ type: "expense", category: "동현 용돈", amount_cents: cents, date, ...o });
  const cat = (o = {}) => ({ type: "expense", name: "동현 용돈", budget_cents: 10000, carry_since: "2026-09", carry_base_cents: 0, ...o });
  // 시작 달 자체는 시작 금액만
  assert.equal(L.carryFor(cat(), [], "2026-09"), 0);
  assert.equal(L.carryFor(cat({ carry_base_cents: 700 }), [X(5000, "2026-09-03")], "2026-09"), 700);
  // 내역 없는 달도 예산을 더함: 9·10·11월 → 11월로 넘어오는 돈 = 2달치
  assert.equal(L.carryFor(cat(), [], "2026-11"), 20000);
  // 일부만 쓰면 남은 만큼 이월
  assert.equal(L.carryFor(cat(), [X(4000, "2026-09-30")], "2026-10"), 6000);
  // 초과 지출은 마이너스 이월 (연도가 바뀌어도 달 단위로 이어짐)
  assert.equal(L.carryFor(cat(), [X(15000, "2026-09-10")], "2026-10"), -5000);
  assert.equal(L.carryFor(cat({ carry_since: "2026-11" }), [X(15000, "2026-11-10")], "2027-01"), 5000);
  // 시작 금액이 더해짐
  assert.equal(L.carryFor(cat({ carry_base_cents: -300 }), [X(1000, "2026-09-01")], "2026-10"), -300 + 9000);
  // 시작 달 이전을 볼 때, 시작 달이 비었을 때(이월 안 함)는 0
  assert.equal(L.carryFor(cat({ carry_base_cents: 700 }), [], "2026-08"), 0);
  assert.equal(L.carryFor(cat({ carry_since: null, carry_base_cents: 700 }), [X(1, "2026-09-01")], "2026-11"), 0);
  assert.equal(L.carryFor(cat({ carry_since: undefined }), [], "2026-11"), 0);
  // 다른 분류·수입·이체는 무시, 시작 달 이전 지출도 무시
  const noise = [
    X(9999, "2026-09-05", { category: "식비" }), X(9999, "2026-09-05", { type: "income" }),
    X(9999, "2026-09-05", { type: "transfer" }), X(9999, "2026-08-31"),
  ];
  assert.equal(L.carryFor(cat(), noise, "2026-10"), 10000);
  // 망가진 금액(NaN)은 0
  assert.equal(L.carryFor(cat(), [X(NaN, "2026-09-05"), X(2000, "2026-09-06")], "2026-10"), 8000);
  // 기준 다시 잡기: 11월에 예산을 바꾸면 '11월 이월액'이 시작 금액이 되고, 12월 이월은 이어서 같은 값
  const t2 = [X(3000, "2026-09-05"), X(12000, "2026-10-05"), X(500, "2026-11-05")];
  const before = cat();
  const nov = L.carryFor(before, t2, "2026-11"); // 10000-3000 + 10000-12000 = 5000
  assert.equal(nov, 5000);
  const after = cat({ budget_cents: 20000, carry_since: "2026-11", carry_base_cents: nov });
  assert.equal(L.carryFor(after, t2, "2026-11"), 5000); // 이번 달 이월은 그대로
  assert.equal(L.carryFor(after, t2, "2026-12"), 5000 + 20000 - 500); // 새 예산은 이번 달부터
  assert.equal(L.carryFor(after, t2, "2026-10"), 0); // 시작 달 이전
  // budgetRows: 이월이 available에 들어가고, 이월 때문에 쓸 수 있는 돈이 0 이하면 over
  const row = (c, ts, ym) => L.budgetRows([c], ts, ym)[0];
  assert.deepEqual(row(cat(), [X(4000, "2026-09-30"), X(1000, "2026-10-02")], "2026-10"),
    { name: "동현 용돈", spent: 1000, budget: 10000, carry: 6000, available: 16000, pct: 6, level: "ok" });
  const broke = row(cat(), [X(30000, "2026-09-10")], "2026-10"); // 이월 -20000 → 쓸 수 있는 돈 -10000
  assert.equal(broke.available, -10000);
  assert.equal(broke.level, "over");
  // 이월을 안 쓰는 분류는 예전과 같음 (carry 0)
  assert.equal(row({ type: "expense", name: "식비", budget_cents: 100 }, [], "2026-11").available, 100);
}

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
// 정기 수입: type 없는 옛 항목은 지출, 수입은 더함, 섞이면 따로 합산
assert.deepEqual(L.billSums([{ amount_cents: 100 }, { type: "expense", amount_cents: 50 }, { type: "income", amount_cents: 700 }]), { expense: 150, income: 700 });
assert.equal(L.projectedBalance(everyday, txns, [{ account_id: "everyday", type: "income", amount_cents: 2000 }]), 6500);
assert.equal(L.projectedBalance(everyday, txns, [{ account_id: "everyday", type: "income", amount_cents: 2000 }, { account_id: "everyday", amount_cents: 1000 }, { account_id: "savings", type: "income", amount_cents: 999 }]), 5500);
assert.equal(L.sumCents([{ amount_cents: 300 }, { amount_cents: NaN }, { amount_cents: "x" }, {}, { amount_cents: 200 }]), 500);

// 망가진 금액(NaN/문자열/null)이 섞여도 합계·예산·잔액에 NaN이 안 나옴
const bad = [{ type: "expense", category: "식비", amount_cents: NaN, date: "2026-11-01" }, { type: "expense", category: "식비", amount_cents: null, date: "2026-11-01" }, { type: "expense", category: "식비", amount_cents: 700, date: "2026-11-01" }];
assert.deepEqual(L.totals(bad), { income: 0, expense: 700 });
assert.equal(L.budgetRows([{ type: "expense", name: "식비", budget_cents: 1000 }], bad, "2026-11")[0].spent, 700);
assert.equal(L.balanceOn(everyday, bad), (everyday.base_cents || 0) - 700);
// 망가진 금액은 "NaN €" 대신 "-", 정상 금액 글자는 그대로
assert.deepEqual([NaN, "abc", null, undefined].map(L.formatCents), ["-", "-", "-", "-"]);
assert.equal(L.formatCents(123456), new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(1234.56));
assert.equal(L.formatCents(0), "0,00 €");

// 달 → 테마 (네 계절 CSS가 모두 있음: 3~5 spring, 6~8 summer, 9~11 autumn, 12~2 winter)
const { themeForMonth, THEMES_AVAILABLE } = require("./theme.js");
assert.deepEqual(THEMES_AVAILABLE, ["winter", "spring", "summer", "autumn"]);
for (const m of [3, 4, 5]) assert.equal(themeForMonth(m, THEMES_AVAILABLE), "spring");
for (const m of [6, 7, 8]) assert.equal(themeForMonth(m, THEMES_AVAILABLE), "summer");
for (const m of [9, 10, 11]) assert.equal(themeForMonth(m, THEMES_AVAILABLE), "autumn");
for (const m of [12, 1, 2]) assert.equal(themeForMonth(m, THEMES_AVAILABLE), "winter");
for (const m of [12, 1, 2]) assert.equal(themeForMonth(m), "winter");
for (const m of [3, 4, 5]) assert.equal(themeForMonth(m), "spring");
for (const m of [6, 7, 8]) assert.equal(themeForMonth(m), "summer");
for (const m of [9, 10, 11]) assert.equal(themeForMonth(m), "autumn");
assert.equal(themeForMonth(7, ["winter", "summer"]), "summer");
assert.equal(themeForMonth(4, ["winter", "spring"]), "spring");
assert.equal(themeForMonth(10, ["winter", "spring"]), "winter"); // 없는 계절은 겨울
for (const m of [0, 13, "a", NaN, null]) assert.equal(themeForMonth(m, ["winter", "spring", "summer", "autumn"]), "winter");

// ?theme= 미리보기: 허용 목록에 정확히 있는 첫 theme 값만, 나머지는 null
const { themeFromQuery, PREVIEWABLE } = require("./theme.js");
assert.deepEqual(PREVIEWABLE, ["winter", "spring", "summer", "autumn"]);
assert.equal(themeFromQuery("?theme=spring", PREVIEWABLE), "spring");
assert.equal(themeFromQuery("?theme=summer", PREVIEWABLE), "summer");
assert.equal(themeFromQuery("?theme=winter", PREVIEWABLE), "winter");
assert.equal(themeFromQuery("?theme=autumn", PREVIEWABLE), "autumn");
assert.equal(themeFromQuery("?theme=Autumn", PREVIEWABLE), null);
assert.equal(themeFromQuery("?theme=autumn", ["winter", "autumn"]), "autumn");
assert.equal(themeFromQuery("?theme=autumn&x=1", ["winter", "autumn"]), "autumn");
assert.equal(themeFromQuery("?theme=a&theme=b", ["a", "b"]), "a"); // 첫 값만 봄
assert.equal(themeFromQuery("?theme=a&theme=winter", PREVIEWABLE), null); // 첫 값이 목록에 없으면 null
for (const q of ["?theme=Autumn", "?theme=", "?theme=autumn;x", "?theme=%20autumn", "?theme=autumn%0A", "?x=autumn", "", null, undefined]) {
  assert.equal(themeFromQuery(q, ["winter", "autumn"]), null, String(q));
}

// 계절 색 블록 검사: 겨울 블록의 변수 이름 목록이 기준. 다른 계절 블록은 있을 때만 검사
const css = require("node:fs").readFileSync(require("node:path").join(__dirname, "style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const blockOf = (sel) => (css.match(new RegExp(`${sel.replace(/[[\]"]/g, "\\$&")}\\s*\\{([^}]*)\\}`)) || [])[1];
const namesOf = (body) => [...body.matchAll(/(--[\w-]+|color-scheme)\s*:/g)].map((m) => m[1]);
const valuesOf = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const lum = (hex) => {
  const h = hex.length === 4 ? hex.replace(/[^#]/g, "$&$&") : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const isHex = (v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v || "");

const winterNames = namesOf(blockOf(':root, [data-theme="winter"]'));
assert.ok(winterNames.includes("color-scheme") && winterNames.length > 40, "겨울 블록을 못 찾음");
for (const season of ["autumn", "spring", "summer"]) {
  const body = blockOf(`[data-theme="${season}"]`);
  if (!body) continue; // 아직 없는 계절은 건너뜀
  const names = namesOf(body);
  const missing = winterNames.filter((n) => !names.includes(n));
  const extra = names.filter((n) => !winterNames.includes(n));
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, `${season}: 겨울과 변수 이름이 다름`);
  const v = valuesOf(body);
  const need = (fg, bgs, min) => { // hex가 아니면 건너뜀
    for (const bg of bgs) {
      if (!isHex(v[fg]) || !isHex(v[bg])) continue;
      const r = ratio(v[fg], v[bg]);
      assert.ok(r >= min, `${season}: ${fg} ${v[fg]} 가 ${bg} ${v[bg]} 위에서 ${r.toFixed(2)}:1 (최소 ${min}:1)`);
    }
  };
  for (const t of ["--text", "--muted", "--faint"]) need(t, ["--ground", "--surface", "--raised"], 4.5);
  need("--control-edge", ["--ground", "--surface"], 3);
  need("--accent", ["--surface", "--raised"], 4.5);
  need("--on-accent", ["--cta"], 4.5);
  for (const t of ["--positive", "--negative"]) need(t, ["--surface"], 4.5);
  for (let i = 1; i <= 8; i++) need(`--cat-${i}`, ["--surface"], 3);
  for (const p of ["dh", "ny", "us"]) need(`--person-${p}-ink`, [`--person-${p}`], 4.5);
}

// 보안 점검(index.html): CSP가 있고, supabase 스크립트 주소가 CSP에 그대로 있고, 글꼴 link에 integrity가 있음
const html = require("node:fs").readFileSync(require("node:path").join(__dirname, "index.html"), "utf8");
const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1];
assert.ok(csp, "CSP meta가 없음");
const scriptSrc = (csp.match(/(?:^|;)\s*script-src ([^;]*)/) || [])[1] || "";
assert.ok(scriptSrc && !/'unsafe-(inline|eval)'/.test(scriptSrc), "script-src가 없거나 unsafe-inline/eval이 있음");
const sbSrc = (html.match(/<script[^>]*\ssrc="([^"]*supabase[^"]*)"/) || [])[1];
assert.ok(sbSrc && scriptSrc.split(/\s+/).includes(sbSrc), "supabase 주소가 CSP script-src에 없음 (버전만 올리면 빈 화면)");
assert.ok(/<link[^>]*pretendard[^>]*\sintegrity="sha384-/.test(html), "글꼴 link에 integrity가 없음");
const entries = (n) => ((csp.match(new RegExp("(?:^|;)\\s*" + n + " ([^;]*)")) || [])[1] || "").trim().split(/\s+/).filter(Boolean);
assert.ok(scriptSrc.trim().split(/\s+/).every((x) => x === "'self'" || x === sbSrc), "script-src에 'self'와 supabase 파일 주소 말고 다른 항목이 있음");
for (const d of ["object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.split(";").map((x) => x.trim()).includes(d), "CSP에 " + d + " 가 없음");
const fontLink = (html.match(/<link[^>]*pretendard[^>]*>/) || [""])[0];
assert.ok(/\scrossorigin="anonymous"/.test(fontLink), "글꼴 link에 crossorigin이 없음");
assert.ok(!/\.min\./.test(fontLink), "글꼴 link가 .min. 파일임 (jsDelivr 자동 생성 파일은 지문이 깨질 수 있음)");
const sbTag = (html.match(/<script[^>]*\ssrc="[^"]*supabase[^"]*"[^>]*>/) || [""])[0];
assert.ok(/\sintegrity="sha384-/.test(sbTag) && /\scrossorigin="anonymous"/.test(sbTag), "supabase script에 integrity/crossorigin이 없음");
for (const n of ["style-src", "font-src"]) assert.ok(entries(n).every((x) => !/^https:\/\/cdn\.jsdelivr\.net\/?$/.test(x)), n + "에 jsDelivr 전체 허락이 있음 (폴더 접두어로 좁혀야 함)");

// 캐시 꼬리표: 내 파일(외부 http 주소 제외)의 link stylesheet·script src는 모두 같은 ?v=8자리숫자(+소문자 1자)여야 함
const mine = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*\shref="([^"]*)"|<script[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1] || m[2]).filter((u) => !/^https?:/.test(u));
assert.ok(mine.length >= 8, "내 파일 link/script가 8개보다 적게 잡힘 (" + mine.length + "개)");
const vers = mine.map((u) => (u.match(/\?v=(\d{8}[a-z]?)$/) || [])[1]);
assert.ok(vers.every(Boolean), "버전 꼬리표(?v=20261114 같은 것)가 빠진 파일이 있음: " + mine.filter((u, i) => !vers[i]).join(", "));
assert.ok(new Set(vers).size === 1, "파일마다 버전 꼬리표가 다름: " + [...new Set(vers)].join(", "));

console.log("모든 점검 통과");
