// Pragati — login against the Supabase-backed accounts (exclusive IDs provisioned by admin).
// Session token is cached in localStorage so she doesn't have to re-enter her PIN every open;
// the token itself is validated server-side on every request and expires after 90 days.
const Auth = (() => {
  const SESSION_KEY = "pragati_session";

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }

  function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  async function login(username, pin) {
    try {
      const rows = await SB.rpc("fn_login", { p_username: username.trim().toLowerCase(), p_pin: pin.trim() });
      const row = rows[0];
      const session = { token: row.token, userId: row.user_id, displayName: row.display_name, role: row.role };
      setSession(session);
      return { ok: true, session };
    } catch (e) {
      return { ok: false, msg: e.message.includes("Invalid") ? "Wrong username or PIN" : e.message };
    }
  }

  function logout() { clearSession(); }

  return { getSession, setSession, clearSession, login, logout };
})();
