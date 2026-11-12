(() => {
  const $ = (id) => document.getElementById(id);
  const status = (message) => { $('status').textContent = message; };
  const cfg = window.EDUCAMENTE_SUPABASE_CONFIG || {};
  const dataKey = 'educamente.v2';
  const idMapKey = 'educamente.supabase.import.ids.v1';
  let client = null;
  let localData = null;
  let currentUser = null;
  let teacher = null;

  function readLocalData() {
    const raw = localStorage.getItem(dataKey);
    if (!raw) throw new Error('Não encontrei os dados locais educamente.v2 neste navegador. Abra esta página pelo mesmo Live Server e na mesma origem da aplicação.');
    const parsed = JSON.parse(raw);
    for (const key of ['turmas','alunos','avaliacoes','resultados','atividades','planejamentos']) {
      if (!Array.isArray(parsed[key])) parsed[key] = [];
    }
    return parsed;
  }

  function readIdMap() {
    try { return JSON.parse(localStorage.getItem(idMapKey)) || {}; }
    catch { return {}; }
  }

  function uuidFor(group, localId) {
    if (!localId) throw new Error(`Registro sem identificador local na categoria ${group}.`);
    const map = readIdMap();
    map[group] ||= {};
    if (!map[group][String(localId)]) map[group][String(localId)] = crypto.randomUUID();
    localStorage.setItem(idMapKey, JSON.stringify(map));
    return map[group][String(localId)];
  }

  function dateOnly(value) {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0,10);
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) throw new Error(`Data inválida encontrada: ${text}`);
    return d.toISOString().slice(0,10);
  }

  function timestamp(value) {
    if (!value) return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  function jsonField(value) {
    if (value == null || String(value).trim() === '') return [];
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); }
    catch { return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean); }
  }

  function requireRelation(map, key, label) {
    const id = map[key];
    if (!id) throw new Error(`Não encontrei o vínculo de ${label}. Confira se todos os registros locais estão relacionados corretamente.`);
    return id;
  }

  function showCounts() {
    const rows = [
      ['Turmas', localData.turmas.length], ['Alunos', localData.alunos.length],
      ['Avaliações', localData.avaliacoes.length], ['Resultados', localData.resultados.length],
      ['Atividades', localData.atividades.length], ['Planejamentos', localData.planejamentos.length]
    ];
    $('counts').innerHTML = rows.map(([label,n]) => `<div class="count"><b>${n}</b><span>${label}</span></div>`).join('');
  }

  async function getTeacher(userId) {
    const { data, error } = await client.from('teachers')
      .select('id, school_id, name, email')
      .eq('auth_user_id', userId)
      .single();
    if (error) throw new Error(`Não consegui localizar o perfil de professor desta conta: ${error.message}`);
    return data;
  }

  async function upload(table, rows, label) {
    if (!rows.length) { status(`${label}: nenhum registro para importar.`); return; }
    const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`Falha ao importar ${label}: ${error.message}`);
    status(`${label}: ${rows.length} registro(s) importado(s).`);
  }

  async function importAll() {
    // Gere e persista todos os UUIDs antes de montar as relações entre tabelas.
    for (const group of ['turmas','alunos','avaliacoes','resultados','atividades','planejamentos']) {
      localData[group].forEach(row => uuidFor(group, row.id));
    }
    const ids = readIdMap();
    const classRows = localData.turmas.map(t => ({
      id: uuidFor('turmas', t.id), name: t.nome, grade: t.ano || null, shift: t.turno || null,
      school_id: teacher.school_id, teacher_id: teacher.id,
      school_year: Number(t.anoLetivo) || new Date().getFullYear(), description: t.descricao || null,
      ...(timestamp(t.criadoEm) ? { created_at: timestamp(t.criadoEm) } : {})
    }));
    await upload('classes', classRows, 'Turmas');

    const studentRows = localData.alunos.map(a => ({
      id: uuidFor('alunos', a.id), name: a.nome,
      class_id: requireRelation(ids.turmas || {}, a.turmaId, 'turma do aluno'),
      observation: a.obs || null,
      ...(timestamp(a.criadoEm) ? { created_at: timestamp(a.criadoEm) } : {})
    }));
    await upload('students', studentRows, 'Alunos');

    const assessmentRows = localData.avaliacoes.map(a => {
      const total = Number(a.total);
      if (!Number.isFinite(total) || total <= 0) throw new Error(`A avaliação "${a.nome}" tem total de pontos inválido.`);
      return {
        id: uuidFor('avaliacoes', a.id), title: a.nome, subject: a.componente,
        content: a.conteudo, assessment_date: dateOnly(a.data), total_points: total,
        class_id: requireRelation(ids.turmas || {}, a.turmaId, 'turma da avaliação'),
        teacher_id: teacher.id, description: a.descricao || null,
        ...(timestamp(a.criadoEm) ? { created_at: timestamp(a.criadoEm) } : {})
      };
    });
    await upload('assessments', assessmentRows, 'Avaliações');

    const localAssessmentById = Object.fromEntries(localData.avaliacoes.map(a => [String(a.id), a]));
    const resultRows = localData.resultados.map(r => {
      const assessment = localAssessmentById[String(r.avaliacaoId)];
      if (!assessment) throw new Error('Há um resultado sem avaliação correspondente.');
      const total = Number(assessment.total);
      const score = Number(r.pontos);
      if (!Number.isFinite(score) || score < 0 || score > total) throw new Error('Há uma pontuação inválida em um resultado.');
      return {
        id: uuidFor('resultados', r.id),
        assessment_id: requireRelation(ids.avaliacoes || {}, r.avaliacaoId, 'avaliação do resultado'),
        student_id: requireRelation(ids.alunos || {}, r.alunoId, 'aluno do resultado'),
        score, percentage: Number((score / total * 100).toFixed(2)), observation: r.obs || null,
        ...(timestamp(r.criadoEm) ? { created_at: timestamp(r.criadoEm) } : {})
      };
    });
    await upload('assessment_results', resultRows, 'Resultados');

    const activityRows = localData.atividades.map(a => ({
      id: uuidFor('atividades', a.id), title: a.titulo, description: a.descricao || null,
      class_id: requireRelation(ids.turmas || {}, a.turmaId, 'turma da atividade'),
      subject: a.componente || null, content: a.conteudo || null, objective: a.objetivo || null,
      skill: a.habilidade || null, activity_type: a.tipo || null,
      application_date: dateOnly(a.aplicacao), deadline: dateOnly(a.prazo),
      instructions: a.instrucoes || null, questions: jsonField(a.questoes), answer_key: jsonField(a.gabarito),
      status: a.status || 'Rascunho', origin: 'teacher',
      ...(timestamp(a.criadoEm) ? { created_at: timestamp(a.criadoEm) } : {})
    }));
    await upload('activities', activityRows, 'Atividades');

    const planRows = localData.planejamentos.map(p => ({
      id: uuidFor('planejamentos', p.id),
      class_id: requireRelation(ids.turmas || {}, p.turmaId, 'turma do planejamento'),
      teacher_id: teacher.id, subject: p.componente || null, content: p.conteudo || null,
      skill: p.habilidade || null, objective: p.objetivo || null,
      start_date: dateOnly(p.inicio), end_date: dateOnly(p.fim), observations: p.obs || null,
      ...(timestamp(p.criadoEm) ? { created_at: timestamp(p.criadoEm) } : {})
    }));
    await upload('lesson_plans', planRows, 'Planejamentos');

    status('CONCLUÍDO! Os registros foram enviados ao Supabase. Os dados locais continuam salvos neste navegador. Você já pode conferir as tabelas no Table Editor.');
  }

  async function login() {
    try {
      $('loginBtn').disabled = true;
      const email = $('email').value.trim();
      const password = $('password').value;
      if (!email || !password) throw new Error('Informe e-mail e senha.');
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
      teacher = await getTeacher(currentUser.id);
      localData = readLocalData();
      showCounts();
      $('accountInfo').textContent = `Conectado como ${teacher.name} (${teacher.email}). Escola vinculada localizada.`;
      $('loginCard').classList.add('hide');
      $('importCard').classList.remove('hide');
      status('Conta autenticada e perfil do professor localizado. Pronto para importar.');
    } catch (e) {
      status(`Não foi possível entrar: ${e.message}`);
    } finally { $('loginBtn').disabled = false; }
  }

  async function startImport() {
    try {
      $('importBtn').disabled = true;
      status('Iniciando importação. Não feche esta página.');
      await importAll();
    } catch (e) {
      status(`A importação parou: ${e.message}\n\nSe algum grupo já foi importado, não apague nada. Corrija o problema e tente novamente; o importador reutiliza os mesmos IDs.`);
    } finally { $('importBtn').disabled = false; }
  }

  async function logout() {
    await client.auth.signOut();
    currentUser = null; teacher = null; localData = null;
    $('importCard').classList.add('hide'); $('loginCard').classList.remove('hide');
    $('password').value = '';
    status('Você saiu da conta.');
  }

  try {
    if (!cfg.url || !cfg.anonKey || !window.supabase?.createClient) {
      throw new Error('Não encontrei a configuração do Supabase. Confira se supabase-config.js está na mesma pasta e preenchido.');
    }
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    localData = readLocalData();
    showCounts();
    status('Conexão configurada. Entre com sua conta de professor para continuar.');
  } catch (e) { status(e.message); }

  $('loginBtn').addEventListener('click', login);
  $('importBtn').addEventListener('click', startImport);
  $('logoutBtn').addEventListener('click', logout);
})();
