// 기록 저장소 (2단계: Supabase). store-local.js와 함수 이름이 같아서 화면 코드는 그대로 씁니다.
(function (root) {
  "use strict";
  const cfg = root.GAGYEBU_CONFIG;
  const sb = root.supabase.createClient(cfg.url, cfg.key);
  let me = null;

  const check = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  // 한 번에 1000줄까지만 오므로 나눠서 전부 받기
  async function fetchAll(table, order) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const page = check(await sb.from(table).select("*").order(order).range(from, from + 999));
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  }
  const txnRow = (t) => ({
    type: t.type, amount_cents: t.amount_cents, description: t.description, date: t.date,
    account_id: t.account_id, transfer_account_id: t.transfer_account_id || null, category: t.category || "",
  });

  root.Store = {
    async session() { return check(await sb.auth.getSession()).session; },
    async signIn(email, password) { check(await sb.auth.signInWithPassword({ email, password })); me = null; },
    async signUp(email, password) { return check(await sb.auth.signUp({ email, password })); },
    async signOut() { await sb.auth.signOut(); me = null; },
    // 로그인한 사람의 이름 (members 표에 없으면 name이 null)
    async me() {
      if (me) return me;
      const s = await this.session();
      if (!s) return null;
      const rows = check(await sb.from("members").select("name").eq("email", s.user.email.toLowerCase()));
      me = { email: s.user.email, name: rows[0] ? rows[0].name : null };
      return me;
    },
    async photoUrl() {
      const { data, error } = await sb.storage.from("photos").createSignedUrl(cfg.photo, 3600);
      return error ? null : data.signedUrl;
    },

    async load() {
      const [accounts, txns, categories, bills] = await Promise.all([
        fetchAll("accounts", "sort"), fetchAll("txns", "created_at"),
        fetchAll("categories", "name"), fetchAll("bills", "created_at"),
      ]);
      return { accounts, txns, categories, bills };
    },
    async addTxn(t) { check(await sb.from("txns").insert({ ...txnRow(t), created_by: t.created_by })); },
    async updateTxn(t) { check(await sb.from("txns").update(txnRow(t)).eq("id", t.id)); },
    async deleteTxn(id) { check(await sb.from("txns").delete().eq("id", id)); },
    async setBases(bases) {
      for (const [id, base_cents] of Object.entries(bases)) check(await sb.from("accounts").update({ base_cents }).eq("id", id));
    },
    async addCategory(type, name) {
      check(await sb.from("categories").upsert({ type, name }, { onConflict: "type,name", ignoreDuplicates: true }));
    },
    async deleteCategory(type, name) { check(await sb.from("categories").delete().eq("type", type).eq("name", name)); },
    async setBudget(type, name, cents) { check(await sb.from("categories").update({ budget_cents: cents }).eq("type", type).eq("name", name)); },
    async addBill(b) { check(await sb.from("bills").insert(b)); },
    async deleteBill(id) { check(await sb.from("bills").delete().eq("id", id)); },
    async runRecurring() { /* Supabase가 매일 처리함 (schema.sql 8번) */ },
  };
})(this);
