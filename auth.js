/*
 * Tela de entrada da EducaMente AI (index.html).
 * Entrar, criar conta (usuário Auth + escola + perfil em teachers), recuperar senha
 * e "continuar sem conta" (modo local). Ao concluir, segue para dashboard.html.
 */
(() => {
  const LOCAL_FLAG = 'educamente.localMode';   // lido por app.js: permite o painel sem sessão
  const MERGE_FLAG = 'educamente.mergeLocal';  // lido por supabase-sync.js: envia o cache local ao entrar
  const CACHE_KEY = 'educamente.v2';
  const BACKUP_KEY = 'educamente.v2.semConta';
  const GROUPS = ['turmas', 'alunos', 'avaliacoes', 'resultados', 'atividades', 'planejamentos'];
  const DASHBOARD = 'dashboard.html';
  const client = window.educamenteSupabase?.client;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* armazenamento indisponível */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* armazenamento indisponível */ } }
  };
  // Capturado antes de o SDK limpar o endereço depois de ler o link de recuperação.
  const urlHash = new URLSearchParams(location.hash.slice(1));
  let recovering = urlHash.get('type') === 'recovery';
  let currentUser = null;

  /* ===== painéis e mensagens ===== */
  function show(name) {
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    const tabbed = name === 'login' || name === 'signup';
    document.querySelector('.auth-tabs').hidden = !tabbed;
    document.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $('localBox').hidden = !tabbed;
    const role = ['aluno', 'responsavel', 'coordenacao'].includes(name) ? name : 'professor';
    document.querySelectorAll('[data-role]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.role === role)));
    renderDemo(role);
  }

  /* ===== perfis da escola (login demonstrativo, conferido neste navegador) ===== */
  const PORTAL = 'portal.html';
  const ROLE_LABEL = { professor: 'Professor', aluno: 'Aluno', responsavel: 'Responsável', coordenacao: 'Coordenação' };
  const escola = () => window.EscolaStore?.load();
  function demoAccesses(role) {
    const db = escola();
    if (!db) return [];
    if (role === 'professor') return db.professores.map((p) => ({ label: p.nome, info: p.acesso, fill: { id: p.acesso }, panel: 'professorId' }));
    if (role === 'aluno') return db.alunos.slice(0, 4).map((a) => ({ label: a.nome, info: a.acesso, fill: { id: a.acesso }, panel: 'aluno' }));
    if (role === 'responsavel') {
      // Primeiro alunos do 6º ano (o responsável envia atividades), depois os do 7º ano em diante e do médio (só leitura).
      const iniciais = db.alunos.filter((a) => window.EscolaCore.guardianCanSubmit(db, a.id)).slice(0, 2);
      const finais = db.alunos.filter((a) => !window.EscolaCore.guardianCanSubmit(db, a.id)).slice(0, 2);
      return [...iniciais, ...finais].map((a) => {
        const serie = db.turmas.find((t) => t.id === a.turmaId)?.serie || '';
        const envia = window.EscolaCore.guardianCanSubmit(db, a.id);
        return { label: `${a.responsavel}, de ${a.nome}`, info: `${serie} · ${envia ? 'envia atividades' : 'só leitura'} · matrícula ${a.matricula}`, fill: { nome: a.nome, matricula: a.matricula }, panel: 'responsavel' };
      });
    }
    return db.coordenadores.map((c) => ({ label: c.nome, info: c.acesso, fill: { id: c.acesso }, panel: 'coordenacao' }));
  }
  function renderDemo(role) {
    const list = $('demoList');
    if (!list) return;
    list.innerHTML = '';
    demoAccesses(role).forEach((acc) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'demo-pick';
      const nome = document.createElement('b');
      nome.textContent = acc.label;
      const info = document.createElement('span');
      info.textContent = acc.info;
      b.append(nome, info);
      b.addEventListener('click', () => {
        say('');
        show(acc.panel);
        const form = document.querySelector(`[data-panel="${acc.panel}"]`);
        Object.entries(acc.fill).forEach(([k, v]) => { const input = form.querySelector(`[data-cred="${k}"]`); if (input) input.value = v; });
        form.querySelector('[type="submit"]').focus();
      });
      li.append(b);
      list.append(li);
    });
  }
  document.querySelectorAll('[data-demo]').forEach((form) => form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const db = escola();
    if (!db) { say('Não foi possível carregar os dados de demonstração neste navegador.', 'error'); return; }
    const creds = {};
    form.querySelectorAll('[data-cred]').forEach((input) => { creds[input.dataset.cred] = input.value; });
    const role = form.dataset.demo;
    const found = window.EscolaCore.authenticate(db, role, creds);
    if (!found) {
      say(role === 'responsavel'
        ? 'Nome e matrícula não conferem. Confira o nome completo do aluno, como na matrícula, e o número.'
        : role === 'coordenacao' ? 'Chave de acesso não encontrada. Confira com a direção da escola.'
          : 'ID de acesso não encontrado. Confira o e-mail enviado pela coordenação.', 'error');
      form.querySelector('[data-cred]').focus();
      return;
    }
    window.EscolaStore.session.set(found);
    say(`Entrando como ${ROLE_LABEL[role].toLowerCase()}…`, 'ok');
    location.href = PORTAL;
  }));
  document.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => {
    say('');
    const target = b.dataset.role === 'professor' ? 'login' : b.dataset.role;
    show(target);
    focusFirst(target);
  }));
  $('demoReset')?.addEventListener('click', () => {
    if (!confirm('Restaurar os dados de demonstração? Turmas, alunos, chamadas e atividades criados neste navegador serão apagados.')) return;
    window.EscolaStore?.reset();
    show(document.querySelector('[data-panel]:not([hidden])')?.dataset.panel || 'login');
    say('Dados de demonstração restaurados.', 'ok');
  });
  function focusFirst(name) {
    document.querySelector(`[data-panel="${name}"] input, [data-panel="${name}"] button`)?.focus();
  }
  function say(message, kind = 'info') {
    const el = $('authStatus');
    el.textContent = message || '';
    el.dataset.kind = kind;
    el.hidden = !message;
  }
  function friendly(error) {
    const m = String(error?.message || error || '');
    if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar: procure a mensagem de confirmação na sua caixa de entrada.';
    if (/already registered|already been registered/i.test(m)) return 'Já existe uma conta com este e-mail. Entre ou recupere a senha.';
    if (/password should be|weak password/i.test(m)) return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Sem conexão com o Supabase. Verifique a internet ou continue sem conta.';
    if (/row-level security/i.test(m)) return 'O banco recusou a gravação do perfil. Confira se as políticas RLS da migration foram aplicadas.';
    return m || 'Algo deu errado. Tente de novo.';
  }
  async function busy(form, task) {
    const btn = form.querySelector('[type="submit"], .btn');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = btn.dataset.busy || 'Aguarde…';
    try { await task(); }
    catch (error) { console.error('[EducaMente AI]', error); say(friendly(error), 'error'); }
    finally { btn.disabled = false; btn.textContent = label; }
  }
  const value = (id) => $(id).value.trim();

  /* ===== dados do modo sem conta ===== */
  function localRecordCount() {
    try {
      const data = JSON.parse(store.get(CACHE_KEY)) || {};
      return GROUPS.reduce((n, k) => n + (Array.isArray(data[k]) ? data[k].length : 0), 0);
    } catch { return 0; }
  }
  function enterDashboard() {
    store.del(LOCAL_FLAG);
    location.replace(DASHBOARD);
  }

  /* ===== perfil do professor ===== */
  async function findTeacher(userId) {
    const { data, error } = await client.from('teachers').select('id, name').eq('auth_user_id', userId).maybeSingle();
    if (error) throw error;
    return data;
  }
  async function createProfile(user, { name, school, municipality }) {
    // Reaproveita a escola de uma tentativa anterior que parou antes de criar o perfil.
    const { data: own, error: ownError } = await client.from('schools')
      .select('id').eq('created_by', user.id).order('created_at').limit(1);
    if (ownError) throw ownError;
    let schoolId = own?.[0]?.id;
    if (schoolId) {
      const { error } = await client.from('schools').update({ name: school, municipality: municipality || null }).eq('id', schoolId);
      if (error) throw error;
    } else {
      const { data, error } = await client.from('schools')
        .insert({ name: school, municipality: municipality || null, created_by: user.id }).select('id').single();
      if (error) throw error;
      schoolId = data.id;
    }
    const { data: teacher, error } = await client.from('teachers')
      .insert({ auth_user_id: user.id, name, email: user.email, school_id: schoolId }).select('id, name').single();
    if (error) throw error;
    return teacher;
  }

  /* Depois de qualquer autenticação: garante o perfil e decide o destino. */
  async function afterAuth(user) {
    currentUser = user;
    let teacher = await findTeacher(user.id);
    if (!teacher) {
      const meta = user.user_metadata || {};
      if (meta.name && meta.school) {
        say('Criando seu perfil de professor…');
        teacher = await createProfile(user, { name: meta.name, school: meta.school, municipality: meta.municipality });
      } else {
        $('pfName').value = meta.name || '';
        $('pfSchool').value = meta.school || '';
        $('pfCity').value = meta.municipality || '';
        say('');
        show('profile');
        focusFirst('profile');
        return;
      }
    }
    const pending = store.get(LOCAL_FLAG) === '1' ? localRecordCount() : 0;
    if (pending > 0) {
      $('mergeCount').textContent = String(pending);
      say('');
      show('merge');
      $('mergeSend').focus();
      return;
    }
    say(`Bem-vindo, ${teacher.name}. Abrindo o painel…`, 'ok');
    enterDashboard();
  }

  /* ===== formulários ===== */
  document.querySelector('[data-panel="login"]').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!e.target.reportValidity()) return;
    busy(e.target, async () => {
      const { data, error } = await client.auth.signInWithPassword({ email: value('loginEmail'), password: $('loginPassword').value });
      if (error) throw error;
      await afterAuth(data.user);
    });
  });

  document.querySelector('[data-panel="signup"]').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!e.target.reportValidity()) return;
    busy(e.target, async () => {
      const email = value('suEmail');
      const profile = { name: value('suName'), school: value('suSchool'), municipality: value('suCity') };
      const { data, error } = await client.auth.signUp({
        email,
        password: $('suPassword').value,
        // Os dados do perfil ficam guardados na conta até o primeiro acesso, caso o e-mail precise ser confirmado.
        options: { data: profile, emailRedirectTo: new URL('index.html', location.href).href }
      });
      if (error) throw error;
      if (data.session) return afterAuth(data.user);
      $('loginEmail').value = email;
      e.target.reset();
      show('login');
      say(`Conta criada. Enviamos um link de confirmação para ${email}. Depois de confirmar, entre com sua senha.`, 'ok');
      $('loginPassword').focus();
    });
  });

  document.querySelector('[data-panel="recover"]').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!e.target.reportValidity()) return;
    busy(e.target, async () => {
      const { error } = await client.auth.resetPasswordForEmail(value('recEmail'), {
        redirectTo: new URL('index.html', location.href).href
      });
      if (error) throw error;
      say('Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha.', 'ok');
    });
  });

  document.querySelector('[data-panel="newpass"]').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!e.target.reportValidity()) return;
    busy(e.target, async () => {
      const { data, error } = await client.auth.updateUser({ password: $('npPassword').value });
      if (error) throw error;
      recovering = false;
      say('Senha alterada.', 'ok');
      await afterAuth(data.user);
    });
  });

  document.querySelector('[data-panel="profile"]').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!e.target.reportValidity()) return;
    busy(e.target, async () => {
      if (!currentUser) throw new Error('Sessão expirada. Entre novamente.');
      await createProfile(currentUser, { name: value('pfName'), school: value('pfSchool'), municipality: value('pfCity') });
      await afterAuth(currentUser);
    });
  });

  $('mergeSend').addEventListener('click', () => {
    store.set(MERGE_FLAG, '1');
    enterDashboard();
  });
  $('mergeSkip').addEventListener('click', () => {
    const cache = store.get(CACHE_KEY);
    if (cache) store.set(BACKUP_KEY, cache);
    store.del(CACHE_KEY);
    enterDashboard();
  });

  $('localBtn').addEventListener('click', () => {
    store.set(LOCAL_FLAG, '1');
    location.href = DASHBOARD;
  });

  /* ===== navegação entre painéis ===== */
  document.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
    say('');
    show(tab.dataset.tab);
  }));
  document.querySelector('.auth-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = document.querySelector('[data-tab][aria-selected="false"]');
    show(next.dataset.tab);
    next.focus();
  });
  document.querySelectorAll('[data-go]').forEach((link) => link.addEventListener('click', () => {
    if (link.dataset.go === 'recover') $('recEmail').value = value('loginEmail');
    say('');
    show(link.dataset.go);
    focusFirst(link.dataset.go);
  }));
  document.querySelector('[data-signout]').addEventListener('click', async () => {
    await client.auth.signOut({ scope: 'local' });
    currentUser = null;
    say('');
    show('login');
    focusFirst('login');
  });
  document.querySelectorAll('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
    const input = $(btn.dataset.toggle);
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    btn.textContent = visible ? 'Ocultar' : 'Mostrar';
    btn.setAttribute('aria-pressed', String(visible));
  }));

  /* ===== início ===== */
  show('login');
  if (!client) {
    document.querySelectorAll('[data-panel]:not([data-demo]) input, [data-panel]:not([data-demo]) .btn, .auth-tabs button').forEach((el) => { el.disabled = true; });
    say('O Supabase não está configurado neste computador, então o login por e-mail está desligado. Use o ID de acesso, os outros perfis ou continue sem conta.', 'warn');
    return;
  }
  const linkError = urlHash.get('error_description');
  if (linkError) {
    say(/expired|invalid/i.test(linkError)
      ? 'Este link expirou ou já foi usado. Peça um novo.'
      : linkError.replace(/\+/g, ' '), 'error');
    history.replaceState(null, '', location.pathname);
  }
  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      recovering = true;
      show('newpass');
      say('Link confirmado. Escolha sua nova senha.', 'ok');
      focusFirst('newpass');
    }
  });
  client.auth.getSession().then(async ({ data }) => {
    const user = data?.session?.user;
    if (!user || recovering) {
      if (recovering) { show('newpass'); focusFirst('newpass'); }
      return;
    }
    say('Retomando sua sessão…');
    try { await afterAuth(user); }
    catch (error) {
      console.error('[EducaMente AI]', error);
      say(friendly(error), 'error');
      show('login');
    }
  });
})();
