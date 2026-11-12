/*
 * Integração da aplicação EducaMente AI com Supabase.
 * Mantém o modelo local legado da interface e sincroniza os CRUDs com as tabelas remotas.
 * Requer uma sessão autenticada do Supabase (criada pela tela de login em index.html).
 *
 * state.reason explica por que o app está (ou não) na nuvem:
 *   'no-client'  Supabase não configurado (sem supabase-config.js)
 *   'no-session' nenhuma sessão autenticada neste navegador
 *   'no-profile' sessão existe, mas a conta ainda não tem perfil em teachers
 *   'error'      falha de rede ou de consulta; o cache local é usado
 *   'ok'         dados carregados da nuvem
 */
(function () {
  const STORAGE_KEY = 'educamente.v2';
  const ID_MAP_KEY = 'educamente.supabase.import.ids.v1';
  // Definido pela tela de login quando o professor escolhe enviar os registros do modo sem conta.
  const MERGE_FLAG = 'educamente.mergeLocal';
  const client = window.educamenteSupabase?.client;
  const state = { mode: 'local', authenticated: false, teacher: null, schoolName: '', lastError: null, reason: 'no-client', dirty: false };
  let queue = Promise.resolve();
  let bootPromise;

  const GROUPS = {
    turmas: 'classes', alunos: 'students', avaliacoes: 'assessments',
    resultados: 'assessment_results', atividades: 'activities', planejamentos: 'lesson_plans'
  };

  function updateUi(message) {
    const el = document.getElementById('cloudState');
    if (el) el.textContent = message;
  }
  function getMap() {
    try { return JSON.parse(localStorage.getItem(ID_MAP_KEY)) || {}; }
    catch { return {}; }
  }
  function saveMap(map) { localStorage.setItem(ID_MAP_KEY, JSON.stringify(map)); }
  function remoteId(group, localId) {
    const id = String(localId || '');
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return id;
    if (!id) throw new Error(`Registro sem ID local em ${group}.`);
    const map = getMap();
    map[group] ||= {};
    if (!map[group][id]) map[group][id] = crypto.randomUUID();
    saveMap(map);
    return map[group][id];
  }
  function localId(group, uuid) {
    const entries = Object.entries(getMap()[group] || {});
    const found = entries.find(([, value]) => value === uuid);
    return found ? found[0] : uuid;
  }
  function dateOnly(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  function timestamp(v) {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  function jsonArray(v) {
    if (Array.isArray(v)) return v;
    if (v == null || String(v).trim() === '') return [];
    if (typeof v !== 'string') return [v];
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return v.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    }
  }
  function textareaValue(v) {
    if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join('\n');
    return v == null ? '' : String(v);
  }
  /* Atividades geradas com IA guardam a versão estruturada em `ia`.
     Os campos de texto (questoes, gabarito) servem às telas e ao histórico existentes. */
  function formatQuestions(qs) {
    return (Array.isArray(qs) ? qs : []).map(q => {
      if (!q || typeof q !== 'object') return String(q ?? '');
      const opts = (q.options || []).map((o, i) => `   ${String.fromCharCode(65 + i)}) ${o}`).join('\n');
      return `${q.number}. ${q.statement}${opts ? '\n' + opts : ''}`;
    }).join('\n');
  }
  function formatAnswers(ks) {
    return (Array.isArray(ks) ? ks : [])
      .map(k => (k && typeof k === 'object' ? `${k.question}. ${k.answer}${k.explanation ? ' — ' + k.explanation : ''}` : String(k ?? '')))
      .join('\n');
  }
  function mapActivity(x, turmaLocalId) {
    const ai = x.origin === 'ai';
    return {
      id: localId('atividades', x.id), titulo: x.title, turmaId: turmaLocalId || localId('turmas', x.class_id),
      componente: x.subject || '', conteudo: x.content || '', tipo: x.activity_type || '', status: x.status,
      aplicacao: x.application_date || '', prazo: x.deadline || '', descricao: x.description || '',
      objetivo: x.objective || '', habilidade: x.skill || '', instrucoes: x.instructions || '',
      questoes: ai ? formatQuestions(x.questions) : textareaValue(x.questions),
      gabarito: ai ? formatAnswers(x.answer_key) : textareaValue(x.answer_key),
      criadoEm: x.created_at, origem: ai ? 'ai' : 'teacher',
      ...(ai ? {
        ia: {
          questions: x.questions || [], answer_key: x.answer_key || [], worked_examples: x.worked_examples || [],
          teacher_guidance: x.teacher_guidance || '', justification: x.justification || '',
          complexity: x.complexity || '', target_group: x.target_group || '', analysis_id: x.analysis_id || null,
          approved_at: x.approved_at || null, generation_metadata: x.generation_metadata || {}
        }
      } : {})
    };
  }
  function readFlag(key) {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  }
  function clearFlag(key) {
    try { localStorage.removeItem(key); } catch { /* armazenamento indisponível */ }
  }
  function localCache() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }
  function writeCache(data) {
    const existing = localCache();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...data }));
  }
  async function checked(query, label) {
    const { data, error } = await query;
    if (error) throw new Error(`${label}: ${error.message}`);
    return data || [];
  }

  async function boot() {
    if (!client) {
      updateUi('Modo local — Supabase não configurado');
      return state;
    }
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      const session = sessionData?.session;
      if (!session?.user) {
        state.reason = 'no-session';
        updateUi('Modo local — sem conta conectada');
        return state;
      }
      const { data: teacher, error: teacherError } = await client.from('teachers')
        .select('id, auth_user_id, name, email, school_id').eq('auth_user_id', session.user.id).maybeSingle();
      if (teacherError) throw new Error(`Perfil de professor não localizado: ${teacherError.message}`);
      if (!teacher) {
        state.reason = 'no-profile';
        updateUi('Conta sem perfil de professor — conclua o cadastro');
        return state;
      }
      const { data: school, error: schoolError } = await client.from('schools')
        .select('id, name').eq('id', teacher.school_id).single();
      if (schoolError) throw new Error(`Escola vinculada não localizada: ${schoolError.message}`);

      // Envia os registros do modo sem conta antes de carregar a nuvem; sem isso,
      // o cache local seria substituído pelos dados remotos logo abaixo.
      if (readFlag(MERGE_FLAG)) {
        state.teacher = teacher;
        state.authenticated = true;
        updateUi('Enviando registros deste navegador…');
        await syncNow(localCache());
        clearFlag(MERGE_FLAG);
      }

      const [classes, students, assessments, results, activities, plans] = await Promise.all([
        checked(client.from('classes').select('*').order('created_at'), 'Turmas'),
        checked(client.from('students').select('*').order('created_at'), 'Alunos'),
        checked(client.from('assessments').select('*').order('assessment_date'), 'Avaliações'),
        checked(client.from('assessment_results').select('*').order('created_at'), 'Resultados'),
        checked(client.from('activities').select('*').order('created_at'), 'Atividades'),
        checked(client.from('lesson_plans').select('*').order('created_at'), 'Planejamentos')
      ]);

      const ids = {
        turmas: new Map(classes.map(x => [x.id, localId('turmas', x.id)])),
        alunos: new Map(students.map(x => [x.id, localId('alunos', x.id)])),
        avaliacoes: new Map(assessments.map(x => [x.id, localId('avaliacoes', x.id)]))
      };
      const data = {
        turmas: classes.map(x => ({ id: ids.turmas.get(x.id), nome: x.name, ano: x.grade || '', turno: x.shift || '', escola: school.name, anoLetivo: x.school_year, descricao: x.description || '', criadoEm: x.created_at })),
        alunos: students.map(x => ({ id: ids.alunos.get(x.id), nome: x.name, turmaId: ids.turmas.get(x.class_id) || localId('turmas', x.class_id), obs: x.observation || '', criadoEm: x.created_at })),
        avaliacoes: assessments.map(x => ({ id: ids.avaliacoes.get(x.id), nome: x.title, turmaId: ids.turmas.get(x.class_id) || localId('turmas', x.class_id), componente: x.subject, conteudo: x.content, data: x.assessment_date, total: Number(x.total_points), descricao: x.description || '', criadoEm: x.created_at })),
        resultados: results.map(x => ({ id: localId('resultados', x.id), avaliacaoId: ids.avaliacoes.get(x.assessment_id) || localId('avaliacoes', x.assessment_id), alunoId: ids.alunos.get(x.student_id) || localId('alunos', x.student_id), pontos: Number(x.score), obs: x.observation || '' })),
        atividades: activities.map(x => mapActivity(x, ids.turmas.get(x.class_id))),
        planejamentos: plans.map(x => ({ id: localId('planejamentos', x.id), turmaId: ids.turmas.get(x.class_id) || localId('turmas', x.class_id), componente: x.subject || '', conteudo: x.content || '', habilidade: x.skill || '', objetivo: x.objective || '', inicio: x.start_date || '', fim: x.end_date || '', obs: x.observations || '', criadoEm: x.created_at }))
      };
      writeCache(data);
      state.mode = 'supabase'; state.authenticated = true; state.teacher = teacher; state.schoolName = school.name;
      state.reason = 'ok';
      updateUi(`Conectado à nuvem · ${teacher.name}`);
      return state;
    } catch (error) {
      // Se o envio do modo sem conta falhou no meio, não deixe o app gravar por cima do cache.
      state.authenticated = false; state.teacher = null;
      state.reason = 'error';
      state.lastError = error;
      console.error('[EducaMente AI] Não foi possível carregar os dados do Supabase:', error);
      updateUi('Supabase indisponível — usando cache local');
      return state;
    }
  }

  function serialize(db) {
    const teacher = state.teacher;
    if (!teacher) throw new Error('Não há professor autenticado para sincronizar os dados.');
    const classes = (db.turmas || []).map(x => ({
      id: remoteId('turmas', x.id), name: x.nome, grade: x.ano || null, shift: x.turno || null,
      school_id: teacher.school_id, teacher_id: teacher.id,
      school_year: Number(x.anoLetivo) || new Date().getFullYear(), description: x.descricao || null,
      ...(timestamp(x.criadoEm) ? { created_at: timestamp(x.criadoEm) } : {})
    }));
    const students = (db.alunos || []).map(x => ({
      id: remoteId('alunos', x.id), name: x.nome,
      class_id: remoteId('turmas', x.turmaId), observation: x.obs || null,
      ...(timestamp(x.criadoEm) ? { created_at: timestamp(x.criadoEm) } : {})
    }));
    const assessments = (db.avaliacoes || []).map(x => ({
      id: remoteId('avaliacoes', x.id), title: x.nome, subject: x.componente || '', content: x.conteudo || '',
      assessment_date: dateOnly(x.data), total_points: Number(x.total), class_id: remoteId('turmas', x.turmaId),
      teacher_id: teacher.id, description: x.descricao || null,
      ...(timestamp(x.criadoEm) ? { created_at: timestamp(x.criadoEm) } : {})
    }));
    const assessmentByLocal = new Map((db.avaliacoes || []).map(x => [String(x.id), x]));
    const results = (db.resultados || []).map(x => {
      const assessment = assessmentByLocal.get(String(x.avaliacaoId));
      const total = Number(assessment?.total || 0);
      const score = Number(x.pontos);
      if (!total || !Number.isFinite(score)) throw new Error('Há resultado sem avaliação ou pontuação válida.');
      return { id: remoteId('resultados', x.id), assessment_id: remoteId('avaliacoes', x.avaliacaoId), student_id: remoteId('alunos', x.alunoId), score, percentage: Number((score / total * 100).toFixed(2)), observation: x.obs || null };
    });
    const activities = (db.atividades || []).map(x => ({
      id: remoteId('atividades', x.id), title: x.titulo, description: x.descricao || null,
      class_id: remoteId('turmas', x.turmaId), subject: x.componente || null, content: x.conteudo || null,
      objective: x.objetivo || null, skill: x.habilidade || null, activity_type: x.tipo || null,
      application_date: dateOnly(x.aplicacao), deadline: dateOnly(x.prazo), instructions: x.instrucoes || null,
      // Atividades da IA: envia a versão estruturada, nunca o texto formatado.
      questions: x.origem === 'ai' && x.ia ? x.ia.questions : jsonArray(x.questoes),
      answer_key: x.origem === 'ai' && x.ia ? x.ia.answer_key : jsonArray(x.gabarito),
      status: x.status || 'Rascunho', origin: x.origem === 'ai' ? 'ai' : 'teacher',
      ...(timestamp(x.criadoEm) ? { created_at: timestamp(x.criadoEm) } : {})
    }));
    const plans = (db.planejamentos || []).map(x => ({
      id: remoteId('planejamentos', x.id), class_id: remoteId('turmas', x.turmaId), teacher_id: teacher.id,
      subject: x.componente || null, content: x.conteudo || null, skill: x.habilidade || null,
      objective: x.objetivo || null, start_date: dateOnly(x.inicio), end_date: dateOnly(x.fim), observations: x.obs || null,
      ...(timestamp(x.criadoEm) ? { created_at: timestamp(x.criadoEm) } : {})
    }));
    return [
      ['classes', classes], ['students', students], ['assessments', assessments],
      ['assessment_results', results], ['activities', activities], ['lesson_plans', plans]
    ];
  }

  async function syncNow(db) {
    if (!state.authenticated || !state.teacher) return;
    const batches = serialize(db);
    for (const [table, rows] of batches) {
      if (!rows.length) continue;
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    state.dirty = false;
    updateUi('Sincronizado com a nuvem');
  }

  function enqueue(task) {
    queue = queue.then(task).catch(error => {
      state.dirty = true;
      state.lastError = error;
      console.error('[EducaMente AI] Erro de sincronização:', error);
      updateUi('Falha ao sincronizar — seus dados continuam no navegador');
    });
    return queue;
  }
  function scheduleSync(db) {
    if (state.authenticated) enqueue(() => syncNow(db));
  }

  async function deleteRemote(group, ids) {
    const table = GROUPS[group];
    if (!table || !ids?.length || !state.authenticated) return;
    const uuids = ids.map(id => remoteId(group, id));
    const { error } = await client.from(table).delete().in('id', uuids);
    if (error) throw new Error(`Exclusão em ${table}: ${error.message}`);
  }

  async function deleteAnalyses(column, uuid) {
    const { error } = await client.from('pedagogical_analyses').delete().eq(column, uuid);
    if (error) throw new Error(`Exclusão em pedagogical_analyses: ${error.message}`);
  }
  async function unlinkAnalyses(assessmentUuid) {
    const { error } = await client.from('pedagogical_analyses').update({ assessment_id: null }).eq('assessment_id', assessmentUuid);
    if (error) throw new Error(`Atualização em pedagogical_analyses: ${error.message}`);
  }

  function scheduleDelete(model, id, db) {
    if (!state.authenticated) return;
    const clone = JSON.parse(JSON.stringify(db));
    enqueue(async () => {
      if (model === 'turmas') {
        const studentIds = clone.alunos.filter(x => x.turmaId === id).map(x => x.id);
        const assessmentIds = clone.avaliacoes.filter(x => x.turmaId === id).map(x => x.id);
        await deleteRemote('resultados', clone.resultados.filter(x => assessmentIds.includes(x.avaliacaoId) || studentIds.includes(x.alunoId)).map(x => x.id));
        await deleteRemote('alunos', studentIds);
        await deleteRemote('atividades', clone.atividades.filter(x => x.turmaId === id).map(x => x.id));
        await deleteRemote('planejamentos', clone.planejamentos.filter(x => x.turmaId === id).map(x => x.id));
        // Análises da IA dependem da turma: saem junto com ela.
        await deleteAnalyses('class_id', remoteId('turmas', id));
        await deleteRemote('avaliacoes', assessmentIds);
        await deleteRemote('turmas', [id]);
      } else if (model === 'alunos') {
        await deleteRemote('resultados', clone.resultados.filter(x => x.alunoId === id).map(x => x.id));
        await deleteRemote('alunos', [id]);
      } else if (model === 'avaliacoes') {
        await deleteRemote('resultados', clone.resultados.filter(x => x.avaliacaoId === id).map(x => x.id));
        // Mantém as análises no histórico, apenas desvinculadas da avaliação excluída.
        await unlinkAnalyses(remoteId('avaliacoes', id));
        await deleteRemote('avaliacoes', [id]);
      } else {
        await deleteRemote(model, [id]);
      }
    });
  }

  window.educamenteSync = {
    state,
    ready: null,
    scheduleSync,
    scheduleDelete,
    syncNow,
    // Aguarda as gravações pendentes (usado antes do logout). Consulte state.dirty depois.
    flush: () => queue,
    // Tradução entre ids locais e UUIDs do Supabase (usada nas chamadas ao agente de IA).
    remoteIdOf: (group, id) => remoteId(group, id),
    localIdOf: (group, uuid) => localId(group, uuid),
    // Converte uma linha de activities (resposta do agente) para o modelo local.
    mapActivity: (row) => mapActivity(row)
  };
  bootPromise = boot();
  window.educamenteSync.ready = bootPromise;
})();
