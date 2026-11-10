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

console.log("모든 점검 통과");
