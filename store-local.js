// 시험용 기록 저장소 (이 브라우저에만 저장, 로그인 없음). 실제 앱은 store.js(Supabase)를 씁니다.
(function (root) {
  "use strict";
  const KEY = "gagyebu-v1";
  const L = root.Logic;
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  function read() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      if (data) return data;
    } catch (e) { /* 깨진 값이면 새로 시작 */ }
    if (root.GAGYEBU_SEED) return JSON.parse(JSON.stringify(root.GAGYEBU_SEED)); // dev-seed.js의 예시 기록
    return {
      accounts: L.ACCOUNTS.map((a) => ({ ...a, base_cents: 0 })),
      txns: [],
      categories: Object.entries(L.DEFAULT_CATEGORIES).flatMap(([type, names]) => names.map((name) => ({ type, name }))),
      bills: [],
    };
  }
  const write = (data) => localStorage.setItem(KEY, JSON.stringify(data));
  const change = (fn) => { const d = read(); fn(d); write(d); };

  root.Store = {
    async me() { return { email: "local", name: "동현" }; },
    async photoUrl() { return root.GAGYEBU_TEST_PHOTO || null; },
    async signOut() {},
    async load() { return read(); },
    async addTxn(t) { change((d) => d.txns.push({ ...t, id: newId(), created_at: new Date().toISOString() })); },
    async updateTxn(t) { change((d) => { const i = d.txns.findIndex((x) => x.id === t.id); if (i >= 0) d.txns[i] = { ...d.txns[i], ...t }; }); },
    async deleteTxn(id) { change((d) => { d.txns = d.txns.filter((t) => t.id !== id); }); },
    async setBases(bases) { change((d) => d.accounts.forEach((a) => { if (a.id in bases) a.base_cents = bases[a.id]; })); },
    async addCategory(type, name) {
      change((d) => { if (!d.categories.some((c) => c.type === type && c.name === name)) d.categories.push({ type, name }); });
    },
    async deleteCategory(type, name) { change((d) => { d.categories = d.categories.filter((c) => !(c.type === type && c.name === name)); }); },
    async addBill(b) { change((d) => d.bills.push({ ...b, id: newId(), active: true, last_processed_month: "" })); },
    async deleteBill(id) { change((d) => { d.bills = d.bills.filter((b) => b.id !== id); }); },
    // shortcut: 1단계에서는 앱을 열 때 처리, 2단계에서 Supabase 예약 실행(매일)으로 옮김
    async runRecurring(today) {
      change((d) => {
        for (const b of L.dueRecurring(d.bills, d.txns, today)) {
          d.txns.push({
            id: newId(), type: "expense", amount_cents: b.amount_cents, description: b.description, date: today,
            account_id: b.account_id, category: L.RECURRING_CATEGORY, created_by: "정기 지출",
            created_at: new Date().toISOString(), recurring_bill_id: b.id, recurring_month: today.slice(0, 7),
          });
          b.last_processed_month = today.slice(0, 7);
        }
      });
    },
  };
})(this);
