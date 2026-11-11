/*
 * Cliente Supabase opcional para a aplicação HTML/JS atual.
 * 1) Copie supabase-config.example.js para supabase-config.js.
 * 2) Preencha URL e anonKey no arquivo local (não compartilhe credenciais privadas).
 * 3) O index.html carrega este arquivo depois do SDK.
 *
 * Este módulo apenas prepara o cliente. O app.js ainda usa localStorage até que
 * cada operação CRUD seja migrada e testada. Isso evita perder dados existentes.
 */
(function () {
  const cfg = window.EDUCAMENTE_SUPABASE_CONFIG || {};
  const ready = Boolean(cfg.url && cfg.anonKey && window.supabase?.createClient);
  window.educamenteSupabase = {
    configured: ready,
    client: ready ? window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    }) : null
  };
})();
