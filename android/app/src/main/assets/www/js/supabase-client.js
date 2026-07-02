// Pragati — thin Supabase client (plain fetch, no SDK bundle needed).
// Talks to Postgres RPC functions (fn_login, fn_get_state, fn_mark_topic, ...) which do their
// own token-based auth internally — see the migrations for the full access-control model.
// Direct table reads are only used for the public catalog (subjects/topics/questions/rewards
// are readable via RLS "public read" policies); everything else goes through RPCs.
const SB = (() => {
  const URL = "https://mzdctuvygixnbapvjevg.supabase.co";
  const KEY = "sb_publishable_ARMCSofPD6Xe9OK05y0phg_JyBljp40";

  // Some RPC functions (e.g. "returns void") send back a 200/204 with an EMPTY body — calling
  // .json() on that throws "Unexpected end of JSON input". Read the body as text first and only
  // parse it if there's actually something there.
  async function safeJson(res) {
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  async function rpc(fn, params) {
    const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": "Bearer " + KEY },
      body: JSON.stringify(params || {})
    });
    if (!res.ok) {
      const err = await safeJson(res) || {};
      throw new Error(err.message || err.hint || ("Request failed: " + res.status));
    }
    return await safeJson(res);
  }

  async function select(table, queryString) {
    const res = await fetch(`${URL}/rest/v1/${table}?${queryString || "select=*"}`, {
      headers: { "apikey": KEY, "Authorization": "Bearer " + KEY }
    });
    if (!res.ok) throw new Error("Request failed: " + res.status);
    return (await safeJson(res)) || [];
  }

  async function uploadFile(bucket, path, file) {
    const res = await fetch(`${URL}/storage/v1/object/${bucket}/${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": file.type || "application/octet-stream" },
      body: file
    });
    if (!res.ok) {
      const err = (await safeJson(res)) || {};
      throw new Error(err.message || ("Upload failed: " + res.status));
    }
    return `${URL}/storage/v1/object/public/${bucket}/${path}`;
  }

  return { rpc, select, uploadFile, URL, KEY };
})();
