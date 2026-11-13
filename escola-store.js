/*
 * Armazenamento do portal da escola (MVP demonstrativo): dados em localStorage
 * e sessão demonstrativa do perfil. Usado por index.html (auth.js) e portal.html.
 */
(function () {
  const KEY = 'educamente.escola.v1';
  const SESSION = 'educamente.portal.sessao';
  const C = window.EscolaCore;
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* indisponível */ } },
  };
  let memory = null; // reserva quando o navegador bloqueia o armazenamento

  function load() {
    if (memory) return memory;
    let db = null;
    try { db = JSON.parse(ls.get(KEY)); } catch { db = null; }
    if (!db || db.versao !== C.VERSAO) { db = C.seed(); ls.set(KEY, JSON.stringify(db)); }
    memory = db;
    return db;
  }
  function reload() { memory = null; return load(); }
  function save(db) {
    memory = db;
    return ls.set(KEY, JSON.stringify(db));
  }
  function reset() {
    memory = C.seed();
    ls.set(KEY, JSON.stringify(memory));
    return memory;
  }
  const session = {
    get() { try { return JSON.parse(ls.get(SESSION)); } catch { return null; } },
    set(s) { ls.set(SESSION, JSON.stringify({ ...s, desde: new Date().toISOString() })); },
    clear() { ls.del(SESSION); },
  };
  window.EscolaStore = { load, reload, save, reset, session };
})();
