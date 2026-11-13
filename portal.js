/*
 * Portal da escola (MVP demonstrativo): aluno, responsável, coordenação e professor.
 * Dados em localStorage (escola-store.js); regras em escola-core.js.
 * A correção de dissertativas chama o agente (POST /api/demo/grade) e, se ele não
 * responder, usa a correção local aproximada, avisando o professor.
 */
(function () {
  'use strict';
  const C = window.EscolaCore;
  const S = window.EscolaStore;
  const params = new URLSearchParams(location.search);

  // Vindo do painel pedagógico: entra como o professor de demonstração.
  if (params.get('entrar') === 'professor') {
    if (S.session.get()?.role !== 'professor') S.session.set({ role: 'professor', id: 'p1' });
    history.replaceState(null, '', location.pathname + location.hash);
  }
  const sess = S.session.get();
  if (!sess) { location.replace('index.html'); return; }
  let db = S.load();
  const ROLE = sess.role;
  const ROLE_LABEL = { aluno: 'Aluno', responsavel: 'Responsável', coordenacao: 'Coordenação', professor: 'Professor' };
  const me = ROLE === 'professor' ? db.professores.find((p) => p.id === sess.id)
    : ROLE === 'coordenacao' ? db.coordenadores.find((c) => c.id === sess.id)
      : db.alunos.find((a) => a.id === sess.id);
  if (!me) { S.session.clear(); location.replace('index.html'); return; }
  const AGENT_URL = ((window.EDUCAMENTE_SUPABASE_CONFIG || {}).agentUrl || 'http://localhost:3000').replace(/\/$/, '');

  /* ===== utilidades ===== */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 1) => (n == null ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toFixed(d).replace('.', ','));
  const pct = (n) => (n == null ? '—' : num(n, 0) + '%');
  const dt = (d) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
  const today = () => new Date().toISOString().slice(0, 10);
  const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const save = () => { if (!S.save(db)) toast('O navegador não deixou salvar. As alterações valem só até fechar a página.'); };
  const turma = (id) => db.turmas.find((t) => t.id === id);
  const materia = (id) => db.materias.find((m) => m.id === id);
  const aluno = (id) => db.alunos.find((a) => a.id === id);
  const prof = (id) => db.professores.find((p) => p.id === id);
  const chipNota = (n) => (n == null ? '<span class="muted">—</span>' : `<span class="chip ${n >= 6 ? 'ok' : n >= 5 ? 'wn' : 'bad'}">${num(n)}</span>`);
  const chipFreq = (f) => (f == null ? '<span class="muted">—</span>' : `<span class="chip ${f >= 85 ? 'ok' : f >= 75 ? 'wn' : 'bad'}">${pct(f)}</span>`);
  const STATUS_CHIP = { P: '<span class="chip ok">P</span>', F: '<span class="chip bad">F</span>', FJ: '<span class="chip wn">FJ</span>' };
  const bimestreAtual = () => { const m = new Date().getMonth() + 1; return m <= 4 ? 1 : m <= 7 ? 2 : m <= 9 ? 3 : 4; };
  const empty = (msg) => `<div class="empty">${esc(msg)}</div>`;
  function toast(msg) {
    $('toast').innerHTML = `<div class="toast">${esc(msg)}</div>`;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { $('toast').innerHTML = ''; }, 3200);
  }
  const bars = (items) => (items.length ? items.map((i) => `<div class="ln"><span>${esc(i.l)}</span><div class="bar ${i.v == null ? '' : i.v >= 70 ? '' : i.v >= 50 ? 'wn' : 'bad'}"><i style="width:${Math.max(0, Math.min(100, i.v || 0))}%"></i></div><b>${i.txt ?? pct(i.v)}</b></div>`).join('') : empty('Sem dados.'));

  /* ===== ícones (traço único, 24×24) ===== */
  const P = {
    inicio: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
    frequencia: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M8 14l2.5 2.5L16 12',
    notas: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z',
    atividades: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5',
    atestados: 'M14 3H6v18h12V7zM14 3v4h4M12 11v6M9 14h6',
    plano: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7',
    ocorrencias: 'M12 4l9 16H3zM12 10v4M12 17v.5',
    desempenho: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    turmas: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.8M16 4.2a3 3 0 0 1 0 5.6',
    alunos: 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 8v6M16 11h6',
    professores: 'M3 5h18v14H3zM7 15h4M7 11h10M15 15h2',
    chamada: 'M9 11l3 3 8-8M20 12v7H4V5h11',
    correcoes: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
    painel: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[k] || P.inicio}"/></svg>`;

  /* ===== menus por perfil ===== */
  const MENUS = {
    aluno: [['inicio', 'Início'], ['frequencia', 'Frequência'], ['notas', 'Notas'], ['atividades', 'Atividades'], ['atestados', 'Atestados'], ['plano', 'Plano anual'], ['desempenho', 'Desempenho'], ['ocorrencias', 'Ocorrências']],
    coordenacao: [['inicio', 'Início'], ['turmas', 'Turmas'], ['alunos', 'Alunos'], ['professores', 'Professores'], ['desempenho', 'Desempenho'], ['ocorrencias', 'Ocorrências'], ['atestados', 'Atestados']],
    professor: [['inicio', 'Início'], ['chamada', 'Chamada'], ['atividades', 'Atividades'], ['correcoes', 'Correções com IA'], ['plano', 'Plano anual'], ['painel', 'Painel pedagógico']],
  };
  MENUS.responsavel = MENUS.aluno;
  const menu = MENUS[ROLE];
  const route = () => {
    const [view, arg] = decodeURIComponent(location.hash.slice(1)).split(':');
    return { view: menu.some(([k]) => k === view) || VIEWS_EXTRA.includes(view) ? view : 'inicio', arg };
  };
  const VIEWS_EXTRA = ['atividade', 'turma', 'aluno', 'nova-atividade', 'correcao'];
  const PARENT = { atividade: 'atividades', turma: 'turmas', aluno: ROLE === 'coordenacao' ? 'alunos' : 'inicio', 'nova-atividade': 'atividades', correcao: 'correcoes' };

  function renderNav(active) {
    const on = PARENT[active] || active;
    $('nav').innerHTML = menu.map(([k, l]) => `<button type="button" data-go="${k}" class="${k === on ? 'on' : ''}" ${k === on ? 'aria-current="page"' : ''}><span>${icon(k)}</span><span>${esc(l)}</span></button>`).join('')
      + (ROLE === 'responsavel' ? `<p class="nav-note">${esc(notaResponsavel(true))}</p>` : '');
  }
  function header() {
    $('escola').textContent = db.escola.nome;
    const nome = ROLE === 'responsavel' ? me.responsavel : me.nome;
    const sub = ROLE === 'responsavel' ? `Responsável por ${me.nome.split(' ')[0]}` : ROLE === 'aluno' ? `Aluno · ${turma(me.turmaId)?.nome || ''}` : ROLE_LABEL[ROLE];
    $('who').innerHTML = `<span class="av-i" aria-hidden="true">${esc(nome[0])}</span><span class="who-t"><b>${esc(nome)}</b><small>${esc(sub)}</small></span>`;
  }

  /* ===== dados derivados ===== */
  const turmasDoProfessor = (pid) => db.turmas.filter((t) => t.professores.some((v) => v.professorId === pid));
  const materiasDoProfessor = (pid, tid) => (turma(tid)?.professores || []).filter((v) => v.professorId === pid).map((v) => materia(v.materiaId)).filter(Boolean);
  const freqGeral = (aid) => { const linhas = C.attendanceSummary(db, aid).filter((l) => l.aulas); const a = linhas.reduce((s, l) => s + l.aulas, 0); const f = linhas.reduce((s, l) => s + l.F, 0); return a ? ((a - f) / a) * 100 : null; };
  const mediaGeral = (aid) => avg(C.gradeSummary(db, aid).map((l) => l.media).filter((m) => m != null));
  const entregaDe = (atvId, aid) => db.entregas.find((e) => e.atividadeId === atvId && e.alunoId === aid);
  const totalPontos = (at) => at.questoes.reduce((s, q) => s + q.pontos, 0);
  function statusEntrega(at, aid) {
    const e = entregaDe(at.id, aid);
    if (e?.correcao) return `<span class="chip ok">Corrigida · ${num(e.correcao.nota)} de ${num(totalPontos(at))}</span>`;
    if (e) return '<span class="chip">Enviada</span>';
    if (at.prazo && at.prazo < today()) return '<span class="chip bad">Prazo encerrado</span>';
    return '<span class="chip wn">Pendente</span>';
  }

  /* ===================== ALUNO / RESPONSÁVEL ===================== */
  const leitura = ROLE === 'responsavel';
  // Até o 6º ano o responsável responde e envia as atividades pelo filho; depois, só acompanha.
  const podeEnviar = ROLE === 'aluno' || (ROLE === 'responsavel' && C.guardianCanSubmit(db, me.id));
  function notaResponsavel(curta) {
    const nome = me.nome.split(' ')[0];
    if (podeEnviar) return curta
      ? `Acesso de responsável. Como ${nome} está no ${turma(me.turmaId)?.serie}, você responde e envia as atividades por ${nome}.`
      : `Acesso de responsável: ${nome} está no ${turma(me.turmaId)?.serie}, então você pode responder e enviar as atividades por ${nome}, além de enviar atestados. O restante é só leitura.`;
    return curta ? 'Acesso de responsável: somente leitura. Você pode enviar atestados.'
      : 'Acesso de responsável: você acompanha tudo em modo de leitura e pode enviar atestados para justificar faltas.';
  }
  const alunoVer = () => (ROLE === 'aluno' || ROLE === 'responsavel' ? me : null);

  function vInicioAluno() {
    const a = alunoVer();
    const t = turma(a.turmaId);
    const pend = db.atividades.filter((x) => x.turmaId === a.turmaId && x.publicadaEm && !entregaDe(x.id, a.id) && (!x.prazo || x.prazo >= today()));
    const faltas = C.attendanceSummary(db, a.id).reduce((s, l) => s + l.F, 0);
    const baixas = C.attendanceSummary(db, a.id).filter((l) => l.freq != null).sort((x, y) => x.freq - y.freq).slice(0, 4);
    const titulo = leitura ? `Acompanhamento de ${esc(a.nome)}` : `Olá, ${esc(a.nome.split(' ')[0])}`;
    return `<div class="top"><div><h1>${titulo}</h1><p class="sub">${esc(t?.nome)} · ${esc(t?.turno)} · Ano letivo ${db.escola.anoLetivo} · ${bimestreAtual()}º bimestre</p></div></div>
      ${leitura ? `<p class="note">${esc(notaResponsavel(false))}</p>` : ''}
      <div class="stats"><div><b>${pct(freqGeral(a.id))}</b><span>Frequência geral</span></div><div><b>${num(mediaGeral(a.id))}</b><span>Média geral</span></div><div><b>${faltas}</b><span>Faltas sem justificativa</span></div><div><b>${pend.length}</b><span>Atividades pendentes</span></div></div>
      <div class="g2"><section class="card"><h2>Atividades com prazo</h2>${pend.length ? `<ul class="list">${pend.map((x) => `<li><button type="button" class="row-link" data-go="atividade:${x.id}"><b>${esc(x.titulo)}</b><span>${esc(materia(x.materiaId)?.nome)} · até ${dt(x.prazo)}</span></button></li>`).join('')}</ul>` : empty('Nenhuma atividade pendente.')}</section>
      <section class="card"><h2>Menor frequência</h2>${bars(baixas.map((l) => ({ l: l.materia, v: l.freq })))}<p class="hint">A frequência mínima é de 75% em cada componente.</p></section></div>`;
  }

  function vFrequencia() {
    const a = alunoVer();
    const linhas = C.attendanceSummary(db, a.id);
    const tot = linhas.reduce((s, l) => ({ aulas: s.aulas + l.aulas, P: s.P + l.P, F: s.F + l.F, FJ: s.FJ + l.FJ }), { aulas: 0, P: 0, F: 0, FJ: 0 });
    const faltas = db.aulas.filter((x) => x.alunoId === a.id && x.status !== 'P').sort((x, y) => (x.data < y.data ? 1 : -1));
    return `<div class="top"><div><h1>Frequência</h1><p class="sub">${esc(a.nome)} · ${esc(turma(a.turmaId)?.nome)} · Faltas por componente curricular</p></div></div>
      <section class="card"><div class="tw"><table class="num"><thead><tr><th>Componente curricular</th><th>Aulas dadas</th><th>Presenças</th><th>Faltas (F)</th><th>Justificadas (FJ)</th><th>Frequência</th></tr></thead><tbody>
      ${linhas.map((l) => `<tr><td>${esc(l.materia)}</td><td>${l.aulas}</td><td>${l.P}</td><td>${l.F}</td><td>${l.FJ}</td><td>${chipFreq(l.freq)}</td></tr>`).join('')}
      </tbody><tfoot><tr><th>Total</th><th>${tot.aulas}</th><th>${tot.P}</th><th>${tot.F}</th><th>${tot.FJ}</th><th>${chipFreq(tot.aulas ? ((tot.aulas - tot.F) / tot.aulas) * 100 : null)}</th></tr></tfoot></table></div>
      <p class="legend">${STATUS_CHIP.P} presente ${STATUS_CHIP.F} faltou ${STATUS_CHIP.FJ} falta justificada por atestado. Abaixo de 75% em um componente, o aluno corre risco de reprovação por falta.</p></section>
      <section class="card"><h2>Faltas registradas</h2>${faltas.length ? `<div class="tw"><table><thead><tr><th>Data</th><th>Componente</th><th>Registro</th><th>Professor</th></tr></thead><tbody>${faltas.map((x) => `<tr><td>${dt(x.data)}</td><td>${esc(materia(x.materiaId)?.nome)}</td><td>${STATUS_CHIP[x.status]}</td><td>${esc(prof(x.professorId)?.nome || '—')}</td></tr>`).join('')}</tbody></table></div>
      <p class="row-act"><button type="button" class="btn s" data-go="atestados">Enviar atestado para justificar faltas</button></p>` : empty('Nenhuma falta registrada.')}</section>`;
  }

  function vNotas() {
    const a = alunoVer();
    const linhas = C.gradeSummary(db, a.id);
    const b = bimestreAtual();
    return `<div class="top"><div><h1>Notas</h1><p class="sub">${esc(a.nome)} · Notas de 0 a 10 por bimestre · Média mínima para aprovação: 6,0</p></div></div>
      <section class="card"><div class="tw"><table class="num"><thead><tr><th>Componente curricular</th>${[1, 2, 3, 4].map((i) => `<th>${i}º bim.${i === b ? ' <small>(atual)</small>' : ''}</th>`).join('')}<th>Média</th></tr></thead><tbody>
      ${linhas.map((l) => `<tr><td>${esc(l.materia)}</td>${l.bimestres.map((n) => `<td>${chipNota(n)}</td>`).join('')}<td><b>${chipNota(l.media)}</b></td></tr>`).join('')}
      </tbody></table></div><p class="legend">A média considera só os bimestres já lançados. "—" indica bimestre ainda sem nota.</p></section>`;
  }

  function vAtividadesAluno() {
    const a = alunoVer();
    const lista = db.atividades.filter((x) => x.turmaId === a.turmaId && x.publicadaEm).sort((x, y) => (x.publicadaEm < y.publicadaEm ? 1 : -1));
    return `<div class="top"><div><h1>Atividades</h1><p class="sub">Atividades publicadas pelos professores da turma ${esc(turma(a.turmaId)?.nome)}</p></div></div>
      <section class="card">${lista.length ? `<div class="tw"><table><thead><tr><th>Atividade</th><th>Componente</th><th>Professor</th><th>Prazo</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((x) => `<tr><td><b>${esc(x.titulo)}</b></td><td>${esc(materia(x.materiaId)?.nome)}</td><td>${esc(prof(x.professorId)?.nome)}</td><td>${dt(x.prazo)}</td><td>${statusEntrega(x, a.id)}</td><td><button type="button" class="ib" data-go="atividade:${x.id}">${podeEnviar && !entregaDe(x.id, a.id) && !(x.prazo && x.prazo < today()) ? 'Responder' : 'Abrir'}</button></td></tr>`).join('')}
      </tbody></table></div>` : empty('Nenhuma atividade publicada ainda.')}</section>`;
  }

  function vAtividadeAluno(id) {
    const a = alunoVer();
    const at = db.atividades.find((x) => x.id === id && x.turmaId === a.turmaId && x.publicadaEm);
    if (!at) return empty('Atividade não encontrada.');
    const e = entregaDe(at.id, a.id);
    const encerrada = at.prazo && at.prazo < today();
    const head = `<div class="top"><div><h1>${esc(at.titulo)}</h1><p class="sub">${esc(materia(at.materiaId)?.nome)} · ${esc(prof(at.professorId)?.nome)} · Prazo ${dt(at.prazo)} · ${num(totalPontos(at))} pontos</p></div><button type="button" class="btn s" data-go="atividades">Voltar</button></div>
      ${at.instrucoes ? `<p class="note">${esc(at.instrucoes)}</p>` : ''}`;
    if (!e) {
      if (!podeEnviar) return head + `<section class="card">${empty(`${a.nome.split(' ')[0]} ainda não enviou esta atividade.`)}</section>`;
      if (encerrada) return head + `<section class="card">${empty('O prazo desta atividade terminou. Fale com o professor.')}</section>`;
      return head + `<form class="card" id="fResp">${leitura ? `<p class="note">Você está respondendo por ${esc(a.nome)}. O professor verá que a entrega foi enviada pelo responsável.</p>` : ''}${at.questoes.map((q, i) => `<fieldset class="q"><legend><b>Questão ${i + 1}</b> <span class="muted">· ${q.tipo === 'objetiva' ? 'objetiva' : 'dissertativa'} · ${num(q.pontos)} pt</span></legend><p class="q-st">${esc(q.enunciado)}</p>
        ${q.tipo === 'objetiva' ? q.alternativas.map((alt, j) => `<label class="choice"><input type="radio" name="q${i}" value="${j}"><span><b>${C.LETRAS[j]})</b> ${esc(alt)}</span></label>`).join('') : `<label for="q${i}">Sua resposta</label><textarea id="q${i}" name="q${i}" maxlength="4000" rows="4"></textarea>`}</fieldset>`).join('')}
        <div class="row-act"><button class="btn" type="submit">Enviar respostas</button><span class="muted">Depois de enviar, não é possível alterar.</span></div></form>`;
    }
    const corr = e.correcao;
    return head + `<section class="card"><div class="row-act" style="margin:0 0 12px">${statusEntrega(at, a.id)}<span class="muted">Enviada em ${dt(e.enviadaEm)}${e.enviadoPor === 'responsavel' ? ' pelo responsável' : ''}</span></div>
      ${at.questoes.map((q, i) => { const c = corr?.porQuestao[i]; const r = e.respostas[i]; return `<div class="q"><p class="q-st"><b>Questão ${i + 1}.</b> ${esc(q.enunciado)}</p>
        <p><span class="muted">Resposta:</span> ${q.tipo === 'objetiva' ? (r == null || r === '' ? '<i>em branco</i>' : `${C.LETRAS[r]}) ${esc(q.alternativas[r])}`) : (String(r || '').trim() ? esc(r) : '<i>em branco</i>')}</p>
        ${c ? `<p>${c.correta ? '<span class="chip ok">Correta</span>' : '<span class="chip bad">Precisa revisar</span>'} <span class="muted">${num(c.pontos)} de ${num(q.pontos)} pt</span></p><p class="q-fb">${esc(c.comentario)}</p>` : ''}</div>`; }).join('')}
      ${corr ? `<p class="legend">Correção ${corr.fonteDissertativas === 'ia' ? 'feita com apoio da IA e revisada pelo professor' : 'feita pelo gabarito e pelos critérios do professor'}.</p>` : '<p class="legend">Aguardando correção do professor.</p>'}
      ${e.feedbackProfessor ? `<p class="note"><b>Comentário do professor:</b> ${esc(e.feedbackProfessor)}</p>` : ''}</section>`;
  }

  function vAtestadosAluno() {
    const a = alunoVer();
    const lista = db.atestados.filter((x) => x.alunoId === a.id).sort((x, y) => (x.enviadoEm < y.enviadoEm ? 1 : -1));
    return `<div class="top"><div><h1>Atestados</h1><p class="sub">Envie atestados para justificar faltas. A coordenação analisa e, ao aprovar, as faltas do período viram FJ.</p></div></div>
      <form class="card" id="fAtestado"><h2>Enviar atestado</h2><div class="fg">
        <div><label for="atIni">Primeiro dia de afastamento</label><input type="date" id="atIni" required></div>
        <div><label for="atFim">Último dia</label><input type="date" id="atFim" required></div>
        <div class="full"><label for="atMot">Motivo <span class="muted">(opcional)</span></label><input id="atMot" maxlength="200" placeholder="Ex.: consulta médica"></div>
        <div class="full"><label for="atArq">Arquivo do atestado (PDF, JPG ou PNG, até 2 MB)</label><input type="file" id="atArq" accept="application/pdf,image/jpeg,image/png" required></div>
      </div><div class="row-act"><button class="btn" type="submit">Enviar atestado</button><span class="muted">Enviado como ${leitura ? 'responsável' : 'aluno'}.</span></div></form>
      <section class="card"><h2>Atestados enviados</h2>${lista.length ? `<div class="tw"><table><thead><tr><th>Período</th><th>Motivo</th><th>Enviado em</th><th>Arquivo</th><th>Situação</th></tr></thead><tbody>${lista.map(rowAtestado).join('')}</tbody></table></div>` : empty('Nenhum atestado enviado.')}</section>`;
  }
  function chipAtestado(x) {
    if (x.status === 'aprovado') return `<span class="chip ok">Aprovado · ${x.faltasJustificadas ?? 0} falta(s) justificada(s)</span>`;
    if (x.status === 'recusado') return `<span class="chip bad">Recusado</span>${x.motivoRecusa ? `<div class="muted small">${esc(x.motivoRecusa)}</div>` : ''}`;
    return '<span class="chip wn">Em análise</span>';
  }
  const arquivoLink = (x) => (x.arquivo?.dataUrl ? `<a href="${esc(x.arquivo.dataUrl)}" download="${esc(x.arquivo.nome)}" class="ib">${esc(x.arquivo.nome)}</a>` : `<span class="muted">${esc(x.arquivo?.nome || '—')}</span>`);
  const rowAtestado = (x) => `<tr><td>${dt(x.inicio)}${x.fim !== x.inicio ? ' a ' + dt(x.fim) : ''}</td><td>${esc(x.motivo || '—')}</td><td>${dt(x.enviadoEm)}</td><td>${arquivoLink(x)}</td><td>${chipAtestado(x)}</td></tr>`;

  function vPlano() {
    const opts = ROLE === 'professor'
      ? turmasDoProfessor(me.id).flatMap((t) => materiasDoProfessor(me.id, t.id).map((m) => ({ t, m })))
      : C.materiasDaTurma(db, alunoVer().turmaId).map((m) => ({ t: turma(alunoVer().turmaId), m }));
    const sel = route().arg || `${opts[0].t.id}|${opts[0].m.id}`;
    const [tid, mid] = sel.split('|');
    const plano = db.planos.find((p) => p.turmaId === tid && p.materiaId === mid);
    const b = bimestreAtual();
    return `<div class="top"><div><h1>Plano de aula anual</h1><p class="sub">${esc(turma(tid)?.nome)} · ${esc(materia(mid)?.nome)} · ${esc(prof(plano?.professorId)?.nome || '')} · ${db.escola.anoLetivo}</p></div>
      <div class="flt"><div><label for="selPlano">Componente</label><select id="selPlano">${opts.map((o) => `<option value="${o.t.id}|${o.m.id}" ${`${o.t.id}|${o.m.id}` === sel ? 'selected' : ''}>${esc(ROLE === 'professor' ? `${o.t.nome} · ${o.m.nome}` : o.m.nome)}</option>`).join('')}</select></div></div></div>
      ${plano ? `<div class="plan">${plano.bimestres.map((x) => `<section class="card ${x.bimestre === b ? 'now' : ''}"><h2>${x.bimestre}º bimestre${x.bimestre === b ? ' <span class="chip">em andamento</span>' : ''}</h2><ul>${x.conteudos.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>`).join('')}</div>` : `<section class="card">${empty('Plano ainda não publicado.')}</section>`}`;
  }

  function vOcorrenciasAluno() {
    const a = alunoVer();
    const lista = db.ocorrencias.filter((x) => x.alunoId === a.id).sort((x, y) => (x.data < y.data ? 1 : -1));
    return `<div class="top"><div><h1>Ocorrências</h1><p class="sub">Registros da coordenação: advertências, suspensões e outras ocorrências</p></div></div>
      <section class="card">${lista.length ? `<ul class="occ">${lista.map(occItem).join('')}</ul>` : empty('Nenhuma ocorrência registrada.')}</section>`;
  }
  const TIPO_CHIP = { 'Advertência': 'wn', 'Suspensão': 'bad', 'Ocorrência': '', 'Elogio': 'ok' };
  const occItem = (x, comAluno) => `<li><div class="occ-h"><span class="chip ${TIPO_CHIP[x.tipo] ?? ''}">${esc(x.tipo)}</span><b>${dt(x.data)}${x.fim && x.fim !== x.data ? ' a ' + dt(x.fim) : ''}</b>${comAluno ? `<span>${esc(aluno(x.alunoId)?.nome)} · ${esc(turma(aluno(x.alunoId)?.turmaId)?.nome)}</span>` : ''}</div><p>${esc(x.descricao)}</p></li>`;

  function vDesempenhoAluno(a = alunoVer()) {
    const notas = C.gradeSummary(db, a.id);
    const freq = C.attendanceSummary(db, a.id);
    const porBim = [1, 2, 3, 4].map((b) => avg(notas.map((l) => l.bimestres[b - 1]).filter((n) => n != null)));
    const atencao = notas.map((l, i) => ({ ...l, freq: freq[i].freq })).filter((l) => (l.media != null && l.media < 6) || (l.freq != null && l.freq < 75));
    const entregues = db.entregas.filter((e) => e.alunoId === a.id && e.correcao);
    return `<div class="top"><div><h1>Desempenho</h1><p class="sub">${esc(a.nome)} · ${esc(turma(a.turmaId)?.nome)}</p></div>${ROLE === 'coordenacao' ? '<button type="button" class="btn s" data-go="alunos">Voltar</button>' : ''}</div>
      <div class="stats"><div><b>${num(mediaGeral(a.id))}</b><span>Média geral</span></div><div><b>${pct(freqGeral(a.id))}</b><span>Frequência geral</span></div><div><b>${atencao.length}</b><span>Componentes em atenção</span></div><div><b>${entregues.length}</b><span>Atividades corrigidas</span></div></div>
      <div class="g2"><section class="card"><h2>Média por componente</h2>${bars(notas.map((l) => ({ l: l.materia, v: l.media == null ? null : l.media * 10, txt: num(l.media) })))}</section>
      <section class="card"><h2>Evolução por bimestre</h2>${bars(porBim.map((v, i) => ({ l: `${i + 1}º bimestre`, v: v == null ? null : v * 10, txt: num(v) })))}
      <h2 class="h-sec">Pontos de atenção</h2>${atencao.length ? `<ul class="ops">${atencao.map((l) => `<li><b>${esc(l.materia)}</b>: ${l.media != null && l.media < 6 ? `média ${num(l.media)}` : ''}${l.media != null && l.media < 6 && l.freq != null && l.freq < 75 ? ' e ' : ''}${l.freq != null && l.freq < 75 ? `frequência ${pct(l.freq)}` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nenhum componente abaixo da média ou da frequência mínima.</p>'}</section></div>
      ${entregues.length ? `<section class="card"><h2>Atividades corrigidas</h2>${bars(entregues.map((e) => { const at = db.atividades.find((x) => x.id === e.atividadeId); return { l: at?.titulo || 'Atividade', v: (e.correcao.nota / totalPontos(at)) * 100 }; }))}</section>` : ''}`;
  }

  /* ===================== COORDENAÇÃO ===================== */
  function vInicioCoord() {
    const pend = db.atestados.filter((x) => x.status === 'pendente');
    const atencao = db.alunos.map((a) => ({ a, f: freqGeral(a.id), m: mediaGeral(a.id) })).filter((x) => (x.f != null && x.f < 85) || (x.m != null && x.m < 6)).sort((x, y) => (x.m ?? 10) - (y.m ?? 10));
    return `<div class="top"><div><h1>Coordenação</h1><p class="sub">${esc(db.escola.nome)} · Ano letivo ${db.escola.anoLetivo} · ${bimestreAtual()}º bimestre</p></div></div>
      <div class="stats"><div><b>${db.turmas.length}</b><span>Turmas</span></div><div><b>${db.alunos.length}</b><span>Alunos matriculados</span></div><div><b>${db.professores.length}</b><span>Professores</span></div><div><b>${pend.length}</b><span>Atestados em análise</span></div></div>
      <div class="g2"><section class="card"><h2>Atestados aguardando análise</h2>${pend.length ? `<ul class="list">${pend.map((x) => `<li><button type="button" class="row-link" data-go="atestados"><b>${esc(aluno(x.alunoId)?.nome)}</b><span>${dt(x.inicio)}${x.fim !== x.inicio ? ' a ' + dt(x.fim) : ''} · ${esc(x.motivo || 'sem motivo')}</span></button></li>`).join('')}</ul>` : empty('Nenhum atestado pendente.')}</section>
      <section class="card"><h2>Alunos em atenção</h2>${atencao.length ? `<div class="tw"><table class="compact"><thead><tr><th>Aluno</th><th>Média</th><th>Frequência</th></tr></thead><tbody>${atencao.slice(0, 6).map((x) => `<tr><td><button type="button" class="ib" data-go="aluno:${x.a.id}">${esc(x.a.nome)}</button></td><td>${chipNota(x.m)}</td><td>${chipFreq(x.f)}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum aluno em atenção.')}</section></div>`;
  }

  function vTurmas() {
    return `<div class="top"><div><h1>Turmas</h1><p class="sub">Crie turmas e defina o professor de cada componente</p></div></div>
      <form class="card" id="fTurma"><h2>Nova turma</h2><div class="fg">
        <div><label for="tuNome">Nome</label><input id="tuNome" required maxlength="40" placeholder="Ex.: 7º Ano C"></div>
        <div><label for="tuSerie">Série</label><select id="tuSerie"><optgroup label="Ensino fundamental II">${C.SERIES.EF.map((s) => `<option>${s}</option>`).join('')}</optgroup><optgroup label="Ensino médio">${C.SERIES.EM.map((s) => `<option>${s}</option>`).join('')}</optgroup></select></div>
        <div><label for="tuTurno">Turno</label><select id="tuTurno"><option>Manhã</option><option>Tarde</option><option>Noite</option></select></div>
      </div><div class="row-act"><button class="btn" type="submit">Criar turma</button></div></form>
      <section class="card"><div class="tw"><table><thead><tr><th>Turma</th><th>Série</th><th>Turno</th><th>Alunos</th><th>Professores</th><th></th></tr></thead><tbody>
      ${db.turmas.map((t) => `<tr><td><b>${esc(t.nome)}</b></td><td>${esc(t.serie)}</td><td>${esc(t.turno)}</td><td>${db.alunos.filter((a) => a.turmaId === t.id).length}</td><td>${C.materiasDaTurma(db, t.id).filter((m) => t.professores.some((v) => v.materiaId === m.id && v.professorId)).length} de ${C.materiasDaTurma(db, t.id).length} componentes com professor</td><td><button type="button" class="ib" data-go="turma:${t.id}">Professores</button></td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function vTurma(id) {
    const t = turma(id);
    if (!t) return empty('Turma não encontrada.');
    return `<div class="top"><div><h1>${esc(t.nome)}</h1><p class="sub">${esc(t.serie)} · ${esc(t.turno)} · ${db.alunos.filter((a) => a.turmaId === t.id).length} alunos</p></div><button type="button" class="btn s" data-go="turmas">Voltar</button></div>
      <section class="card"><h2>Professores da turma</h2><p class="hint">Escolha quem leciona cada componente. A mudança vale na hora para a chamada e as atividades.</p>
      <div class="tw"><table class="compact"><thead><tr><th>Componente</th><th>Professor</th></tr></thead><tbody>
      ${C.materiasDaTurma(db, t.id).map((m) => { const v = t.professores.find((x) => x.materiaId === m.id); return `<tr><td>${esc(m.nome)}</td><td><select data-vinc="${t.id}|${m.id}" aria-label="Professor de ${esc(m.nome)}"><option value="">Sem professor</option>${db.professores.map((p) => `<option value="${p.id}" ${v?.professorId === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></td></tr>`; }).join('')}
      </tbody></table></div></section>
      <section class="card"><h2>Alunos</h2>${db.alunos.filter((a) => a.turmaId === t.id).map((a) => `<button type="button" class="ib" data-go="aluno:${a.id}">${esc(a.nome)}</button>`).join(' ') || empty('Nenhum aluno matriculado.')}</section>`;
  }

  let ultimoCadastro = null;
  function credencialBox() {
    if (!ultimoCadastro) return '';
    const x = ultimoCadastro;
    return `<section class="card cred" id="cred"><h2>${x.tipo === 'aluno' ? 'Matrícula concluída' : 'Professor liberado'}</h2>
      <p>${x.tipo === 'aluno' ? `Envie ao aluno e ao responsável (${esc(x.email || 'e-mail não informado')}):` : `Envie ao professor (${esc(x.email || 'e-mail não informado')}):`}</p>
      <dl class="kv"><dt>${x.tipo === 'aluno' ? 'Aluno' : 'Professor'}</dt><dd>${esc(x.nome)}</dd><dt>ID de acesso</dt><dd><code>${esc(x.acesso)}</code></dd>${x.matricula ? `<dt>Matrícula</dt><dd><code>${esc(x.matricula)}</code></dd><dt>Acesso do responsável</dt><dd>nome completo do aluno + matrícula</dd>` : ''}</dl>
      <p class="legend">Demonstração: o e-mail não é enviado de verdade.</p></section>`;
  }

  function vAlunos() {
    const f = route().arg || '';
    const lista = db.alunos.filter((a) => !f || a.turmaId === f);
    return `<div class="top"><div><h1>Alunos</h1><p class="sub">Matrícula gera o ID de acesso do aluno e o número de matrícula para o responsável</p></div></div>
      ${credencialBox()}
      <form class="card" id="fAluno"><h2>Matricular aluno</h2><div class="fg">
        <div class="full"><label for="alNome">Nome completo</label><input id="alNome" required maxlength="160"></div>
        <div><label for="alTurma">Turma</label><select id="alTurma">${db.turmas.map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join('')}</select></div>
        <div><label for="alNasc">Nascimento</label><input type="date" id="alNasc"></div>
        <div><label for="alResp">Responsável</label><input id="alResp" required maxlength="160"></div>
        <div><label for="alEmail">E-mail para envio do acesso</label><input type="email" id="alEmail" maxlength="160"></div>
      </div><div class="row-act"><button class="btn" type="submit">Matricular e gerar acesso</button></div></form>
      <section class="card"><div class="flt"><div><label for="fTurmaAl">Turma</label><select id="fTurmaAl"><option value="">Todas</option>${db.turmas.map((t) => `<option value="${t.id}" ${f === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></div></div>
      <div class="tw"><table><thead><tr><th>Aluno</th><th>Turma</th><th>Matrícula</th><th>ID de acesso</th><th>Responsável</th><th>Média</th><th>Frequência</th><th></th></tr></thead><tbody>
      ${lista.map((a) => `<tr><td><b>${esc(a.nome)}</b></td><td>${esc(turma(a.turmaId)?.nome)}</td><td class="mono">${esc(a.matricula)}</td><td class="mono">${esc(a.acesso)}</td><td>${esc(a.responsavel)}</td><td>${chipNota(mediaGeral(a.id))}</td><td>${chipFreq(freqGeral(a.id))}</td><td><button type="button" class="ib" data-go="aluno:${a.id}">Desempenho</button></td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function vProfessores() {
    return `<div class="top"><div><h1>Professores</h1><p class="sub">Libere o ID de acesso e vincule o professor às turmas</p></div></div>
      ${credencialBox()}
      <form class="card" id="fProf"><h2>Liberar professor</h2><div class="fg">
        <div><label for="prNome">Nome completo</label><input id="prNome" required maxlength="160"></div>
        <div><label for="prEmail">E-mail</label><input type="email" id="prEmail" maxlength="160"></div>
      </div><div class="row-act"><button class="btn" type="submit">Liberar e gerar ID</button></div></form>
      <section class="card"><div class="tw"><table><thead><tr><th>Professor</th><th>ID de acesso</th><th>E-mail</th><th>Turmas e componentes</th></tr></thead><tbody>
      ${db.professores.map((p) => { const vs = db.turmas.flatMap((t) => t.professores.filter((v) => v.professorId === p.id).map((v) => `${t.nome} · ${materia(v.materiaId)?.nome}`)); return `<tr><td><b>${esc(p.nome)}</b></td><td class="mono">${esc(p.acesso)}</td><td>${esc(p.email || '—')}</td><td>${vs.length ? esc(vs.join('; ')) : '<span class="muted">Sem turma. Vincule em Turmas.</span>'}</td></tr>`; }).join('')}
      </tbody></table></div></section>`;
  }

  function vDesempenhoCoord() {
    const tid = route().arg || db.turmas[0]?.id;
    const t = turma(tid);
    const alunos = db.alunos.filter((a) => a.turmaId === tid);
    const porMateria = C.materiasDaTurma(db, tid).map((m) => ({ l: m.nome, v: avg(alunos.map((a) => C.gradeSummary(db, a.id).find((l) => l.materiaId === m.id).media).filter((n) => n != null)) }));
    const linhas = alunos.map((a) => ({ a, m: mediaGeral(a.id), f: freqGeral(a.id), faltas: C.attendanceSummary(db, a.id).reduce((s, l) => s + l.F, 0), oc: db.ocorrencias.filter((o) => o.alunoId === a.id).length })).sort((x, y) => (x.m ?? 10) - (y.m ?? 10));
    return `<div class="top"><div><h1>Desempenho</h1><p class="sub">${esc(t?.nome || '')} · Médias, frequência e ocorrências</p></div>
      <div class="flt"><div><label for="selTurmaD">Turma</label><select id="selTurmaD">${db.turmas.map((x) => `<option value="${x.id}" ${x.id === tid ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div></div></div>
      <div class="stats"><div><b>${num(avg(linhas.map((x) => x.m).filter((n) => n != null)))}</b><span>Média da turma</span></div><div><b>${pct(avg(linhas.map((x) => x.f).filter((n) => n != null)))}</b><span>Frequência média</span></div><div><b>${linhas.filter((x) => x.m != null && x.m < 6).length}</b><span>Alunos abaixo da média</span></div><div><b>${linhas.filter((x) => x.f != null && x.f < 75).length}</b><span>Abaixo de 75% de frequência</span></div></div>
      <div class="g2"><section class="card"><h2>Média por componente</h2>${bars(porMateria.map((x) => ({ l: x.l, v: x.v == null ? null : x.v * 10, txt: num(x.v) })))}</section>
      <section class="card"><h2>Alunos</h2><div class="tw"><table class="compact"><thead><tr><th>Aluno</th><th>Média</th><th>Freq.</th><th>Faltas</th><th>Ocorr.</th></tr></thead><tbody>${linhas.map((x) => `<tr><td><button type="button" class="ib" data-go="aluno:${x.a.id}">${esc(x.a.nome)}</button></td><td>${chipNota(x.m)}</td><td>${chipFreq(x.f)}</td><td>${x.faltas}</td><td>${x.oc}</td></tr>`).join('')}</tbody></table></div></section></div>`;
  }

  function vOcorrenciasCoord() {
    const lista = db.ocorrencias.slice().sort((x, y) => (x.data < y.data ? 1 : -1));
    return `<div class="top"><div><h1>Ocorrências</h1><p class="sub">Registre advertências, suspensões e outras ocorrências. Aluno e responsável veem o registro.</p></div></div>
      <form class="card" id="fOc"><h2>Registrar ocorrência</h2><div class="fg">
        <div><label for="ocAluno">Aluno</label><select id="ocAluno" required>${db.turmas.map((t) => `<optgroup label="${esc(t.nome)}">${db.alunos.filter((a) => a.turmaId === t.id).map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</optgroup>`).join('')}</select></div>
        <div><label for="ocTipo">Tipo</label><select id="ocTipo"><option>Advertência</option><option>Suspensão</option><option>Ocorrência</option><option>Elogio</option></select></div>
        <div><label for="ocData">Data</label><input type="date" id="ocData" required value="${today()}"></div>
        <div><label for="ocFim">Fim da suspensão <span class="muted">(se houver)</span></label><input type="date" id="ocFim"></div>
        <div class="full"><label for="ocDesc">Descrição</label><textarea id="ocDesc" required maxlength="1000"></textarea></div>
      </div><div class="row-act"><button class="btn" type="submit">Registrar</button></div></form>
      <section class="card"><h2>Registros</h2>${lista.length ? `<ul class="occ">${lista.map((x) => occItem(x, true)).join('')}</ul>` : empty('Nenhuma ocorrência registrada.')}</section>`;
  }

  function vAtestadosCoord() {
    const ordem = { pendente: 0, aprovado: 1, recusado: 2 };
    const lista = db.atestados.slice().sort((x, y) => ordem[x.status] - ordem[y.status] || (x.enviadoEm < y.enviadoEm ? 1 : -1));
    const faltasNoPeriodo = (x) => db.aulas.filter((au) => au.alunoId === x.alunoId && au.status === 'F' && au.data >= x.inicio && au.data <= x.fim).length;
    return `<div class="top"><div><h1>Atestados</h1><p class="sub">Ao aprovar, as faltas (F) do aluno no período passam a ser faltas justificadas (FJ)</p></div></div>
      <section class="card">${lista.length ? `<div class="tw"><table><thead><tr><th>Aluno</th><th>Período</th><th>Faltas no período</th><th>Enviado por</th><th>Arquivo</th><th>Situação</th><th></th></tr></thead><tbody>
      ${lista.map((x) => `<tr><td><b>${esc(aluno(x.alunoId)?.nome)}</b><div class="muted small">${esc(turma(aluno(x.alunoId)?.turmaId)?.nome)} · ${esc(x.motivo || 'sem motivo')}</div></td><td>${dt(x.inicio)}${x.fim !== x.inicio ? ' a ' + dt(x.fim) : ''}</td><td>${x.status === 'pendente' ? faltasNoPeriodo(x) : '—'}</td><td>${x.enviadoPor === 'responsavel' ? 'Responsável' : 'Aluno'} · ${dt(x.enviadoEm)}</td><td>${arquivoLink(x)}</td><td>${chipAtestado(x)}</td>
        <td>${x.status === 'pendente' ? `<div class="acts"><button type="button" class="btn g sm" data-aprovar="${x.id}">Aprovar</button><button type="button" class="btn d sm" data-recusar="${x.id}">Recusar</button></div>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : empty('Nenhum atestado recebido.')}</section>`;
  }

  /* ===================== PROFESSOR ===================== */
  const minhasAtividades = () => db.atividades.filter((x) => x.professorId === me.id).sort((x, y) => (x.publicadaEm < y.publicadaEm ? 1 : -1));
  const aguardando = (atId) => db.entregas.filter((e) => e.atividadeId === atId && !e.correcao).length;

  function vInicioProf() {
    const ts = turmasDoProfessor(me.id);
    const ats = minhasAtividades();
    const pend = ats.map((a) => ({ a, n: aguardando(a.id) })).filter((x) => x.n);
    return `<div class="top"><div><h1>Olá, ${esc(me.nome.split(' ')[0])}</h1><p class="sub">${ts.map((t) => esc(t.nome)).join(' · ')} · ${bimestreAtual()}º bimestre</p></div><button type="button" class="btn" data-go="chamada">Fazer chamada</button></div>
      <div class="stats"><div><b>${ts.length}</b><span>Turmas</span></div><div><b>${ats.length}</b><span>Atividades publicadas</span></div><div><b>${pend.reduce((s, x) => s + x.n, 0)}</b><span>Entregas para corrigir</span></div><div><b>${db.aulas.filter((x) => x.professorId === me.id && x.data === today()).length ? 'Feita' : 'Pendente'}</b><span>Chamada de hoje</span></div></div>
      <div class="g2"><section class="card"><h2>Entregas para corrigir</h2>${pend.length ? `<ul class="list">${pend.map((x) => `<li><button type="button" class="row-link" data-go="correcao:${x.a.id}"><b>${esc(x.a.titulo)}</b><span>${esc(turma(x.a.turmaId)?.nome)} · ${x.n} entrega(s) aguardando</span></button></li>`).join('')}</ul>` : empty('Nenhuma entrega aguardando correção.')}</section>
      <section class="card"><h2>Minhas turmas</h2><ul class="list">${ts.map((t) => `<li><div class="row-link static"><b>${esc(t.nome)}</b><span>${materiasDoProfessor(me.id, t.id).map((m) => esc(m.nome)).join(', ')} · ${db.alunos.filter((a) => a.turmaId === t.id).length} alunos</span></div></li>`).join('')}</ul></section></div>`;
  }

  const chamadaSel = { turmaId: null, materiaId: null, data: null, aula: 1 };
  function vChamada() {
    const ts = turmasDoProfessor(me.id);
    if (!ts.length) return `<h1>Chamada</h1><section class="card">${empty('Você ainda não foi vinculado a nenhuma turma pela coordenação.')}</section>`;
    if (!ts.some((t) => t.id === chamadaSel.turmaId)) chamadaSel.turmaId = ts[0].id;
    const ms = materiasDoProfessor(me.id, chamadaSel.turmaId);
    if (!ms.some((m) => m.id === chamadaSel.materiaId)) chamadaSel.materiaId = ms[0]?.id;
    chamadaSel.data ||= today();
    const alunos = db.alunos.filter((a) => a.turmaId === chamadaSel.turmaId);
    const reg = (aid) => db.aulas.find((x) => x.alunoId === aid && x.materiaId === chamadaSel.materiaId && x.data === chamadaSel.data && x.aula === chamadaSel.aula);
    const feita = alunos.some((a) => reg(a.id));
    const recentes = [...new Set(db.aulas.filter((x) => x.professorId === me.id && x.turmaId === chamadaSel.turmaId && x.materiaId === chamadaSel.materiaId).map((x) => x.data))].sort().reverse().slice(0, 5);
    return `<div class="top"><div><h1>Chamada</h1><p class="sub">P = presente · F = faltou · FJ = falta justificada</p></div></div>
      <form class="card" id="fChamada"><div class="flt">
        <div><label for="chTurma">Turma</label><select id="chTurma">${ts.map((t) => `<option value="${t.id}" ${t.id === chamadaSel.turmaId ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></div>
        <div><label for="chMat">Componente</label><select id="chMat">${ms.map((m) => `<option value="${m.id}" ${m.id === chamadaSel.materiaId ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
        <div><label for="chData">Data</label><input type="date" id="chData" value="${chamadaSel.data}" required></div>
        <div><label for="chAula">Aula</label><select id="chAula">${[1, 2, 3].map((n) => `<option value="${n}" ${n === chamadaSel.aula ? 'selected' : ''}>${n}ª aula</option>`).join('')}</select></div>
      </div>
      ${feita ? '<p class="note">Esta chamada já foi registrada. Você pode corrigir e salvar de novo.</p>' : ''}
      <div class="tw"><table class="call"><thead><tr><th>Aluno</th><th>Registro</th></tr></thead><tbody>
      ${alunos.map((a) => { const st = reg(a.id)?.status || 'P'; return `<tr><td>${esc(a.nome)}</td><td><div class="seg" role="radiogroup" aria-label="Frequência de ${esc(a.nome)}">${['P', 'F', 'FJ'].map((s) => `<label class="seg-${s}"><input type="radio" name="ch-${a.id}" value="${s}" ${st === s ? 'checked' : ''}><span>${s}</span></label>`).join('')}</div></td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="row-act"><button class="btn" type="submit">Salvar chamada</button><button class="btn s" type="button" id="todosP">Marcar todos presentes</button><span class="muted">${alunos.length} alunos</span></div></form>
      <section class="card"><h2>Últimas chamadas deste componente</h2>${recentes.length ? `<div class="tw"><table class="compact num"><thead><tr><th>Data</th><th>Presentes</th><th>Faltas</th><th>Justificadas</th></tr></thead><tbody>${recentes.map((d) => { const xs = db.aulas.filter((x) => x.turmaId === chamadaSel.turmaId && x.materiaId === chamadaSel.materiaId && x.data === d); return `<tr><td>${dt(d)}</td><td>${xs.filter((x) => x.status === 'P').length}</td><td>${xs.filter((x) => x.status === 'F').length}</td><td>${xs.filter((x) => x.status === 'FJ').length}</td></tr>`; }).join('')}</tbody></table></div>` : empty('Nenhuma chamada registrada.')}</section>`;
  }

  function vAtividadesProf() {
    const ats = minhasAtividades();
    return `<div class="top"><div><h1>Atividades</h1><p class="sub">Publique atividades para as turmas. Os alunos respondem pelo portal.</p></div><button type="button" class="btn" data-go="nova-atividade">Publicar atividade</button></div>
      <section class="card">${ats.length ? `<div class="tw"><table><thead><tr><th>Atividade</th><th>Turma</th><th>Componente</th><th>Publicada</th><th>Prazo</th><th>Entregas</th><th></th></tr></thead><tbody>
      ${ats.map((a) => `<tr><td><b>${esc(a.titulo)}</b><div class="muted small">${a.questoes.length} questões · ${a.questoes.filter((q) => q.tipo === 'objetiva').length} objetivas</div></td><td>${esc(turma(a.turmaId)?.nome)}</td><td>${esc(materia(a.materiaId)?.nome)}</td><td>${dt(a.publicadaEm)}</td><td>${dt(a.prazo)}</td><td>${db.entregas.filter((e) => e.atividadeId === a.id).length} de ${db.alunos.filter((x) => x.turmaId === a.turmaId).length}</td><td><button type="button" class="ib" data-go="correcao:${a.id}">Correção</button></td></tr>`).join('')}
      </tbody></table></div>` : empty('Nenhuma atividade publicada.')}</section>`;
  }

  let rascunho = null;
  const novaQuestao = (tipo) => (tipo === 'objetiva'
    ? { tipo, enunciado: '', alternativas: ['', '', '', ''], correta: 0, pontos: 2 }
    : { tipo, enunciado: '', respostaEsperada: '', palavrasChave: [], pontos: 4 });
  function vNovaAtividade() {
    const ts = turmasDoProfessor(me.id);
    if (!ts.length) return `<h1>Publicar atividade</h1><section class="card">${empty('Você ainda não foi vinculado a nenhuma turma.')}</section>`;
    rascunho ||= { turmaId: ts[0].id, materiaId: materiasDoProfessor(me.id, ts[0].id)[0]?.id, titulo: '', instrucoes: '', prazo: '', questoes: [novaQuestao('objetiva')] };
    const r = rascunho;
    const ms = materiasDoProfessor(me.id, r.turmaId);
    return `<div class="top"><div><h1>Publicar atividade</h1><p class="sub">Objetivas são corrigidas pelo gabarito; dissertativas, pela IA com a resposta esperada como referência</p></div><button type="button" class="btn s" data-go="atividades">Cancelar</button></div>
      <form id="fAtv"><section class="card"><div class="fg">
        <div><label for="avTurma">Turma</label><select id="avTurma" data-r="turmaId">${ts.map((t) => `<option value="${t.id}" ${t.id === r.turmaId ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></div>
        <div><label for="avMat">Componente</label><select id="avMat" data-r="materiaId">${ms.map((m) => `<option value="${m.id}" ${m.id === r.materiaId ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
        <div><label for="avPrazo">Prazo</label><input type="date" id="avPrazo" data-r="prazo" value="${esc(r.prazo)}" required min="${today()}"></div>
        <div class="full"><label for="avTit">Título</label><input id="avTit" data-r="titulo" value="${esc(r.titulo)}" required maxlength="200"></div>
        <div class="full"><label for="avInst">Instruções para os alunos</label><textarea id="avInst" data-r="instrucoes" maxlength="1500">${esc(r.instrucoes)}</textarea></div>
      </div></section>
      ${r.questoes.map((q, i) => `<section class="card qed"><div class="qed-h"><h2>Questão ${i + 1} · ${q.tipo === 'objetiva' ? 'objetiva' : 'dissertativa'}</h2>${r.questoes.length > 1 ? `<button type="button" class="ib d" data-delq="${i}">Remover</button>` : ''}</div>
        <div class="fg"><div class="full"><label for="qe${i}">Enunciado</label><textarea id="qe${i}" data-q="${i}" data-k="enunciado" required maxlength="1500">${esc(q.enunciado)}</textarea></div>
        ${q.tipo === 'objetiva' ? `<fieldset class="full"><legend>Alternativas (marque a correta)</legend>${q.alternativas.map((alt, j) => `<div class="alt"><input type="radio" name="corr${i}" data-q="${i}" data-k="correta" value="${j}" ${q.correta === j ? 'checked' : ''} aria-label="Alternativa ${C.LETRAS[j]} é a correta"><b>${C.LETRAS[j]})</b><input data-q="${i}" data-alt="${j}" value="${esc(alt)}" required maxlength="300" aria-label="Texto da alternativa ${C.LETRAS[j]}"></div>`).join('')}</fieldset>`
          : `<div class="full"><label for="qr${i}">Resposta esperada (referência para a correção)</label><textarea id="qr${i}" data-q="${i}" data-k="respostaEsperada" required maxlength="2000">${esc(q.respostaEsperada)}</textarea></div>
             <div class="full"><label for="qk${i}">Palavras-chave da correção local <span class="muted">(separadas por vírgula; usadas se a IA estiver indisponível)</span></label><input id="qk${i}" data-q="${i}" data-k="palavrasChave" value="${esc(q.palavrasChave.join(', '))}" maxlength="400"></div>`}
        <div><label for="qp${i}">Pontos</label><input type="number" id="qp${i}" data-q="${i}" data-k="pontos" value="${q.pontos}" min="0.5" max="20" step="0.5" required></div></div></section>`).join('')}
      <div class="row-act"><button type="button" class="btn s" data-addq="objetiva">Adicionar questão objetiva</button><button type="button" class="btn s" data-addq="dissertativa">Adicionar questão dissertativa</button></div>
      <div class="row-act publish"><button class="btn" type="submit">Publicar para a turma</button><span class="muted">Total: ${num(r.questoes.reduce((s, q) => s + Number(q.pontos || 0), 0))} pontos</span></div></form>`;
  }

  function vCorrecoes() {
    const ats = minhasAtividades();
    return `<div class="top"><div><h1>Correções com IA</h1><p class="sub">A IA corrige as entregas e monta o relatório da turma: erros principais, erros recorrentes e taxa de acerto por questão</p></div></div>
      <section class="card">${ats.length ? `<ul class="list">${ats.map((a) => { const n = aguardando(a.id); const tot = db.entregas.filter((e) => e.atividadeId === a.id).length; return `<li><button type="button" class="row-link" data-go="correcao:${a.id}"><b>${esc(a.titulo)}</b><span>${esc(turma(a.turmaId)?.nome)} · ${esc(materia(a.materiaId)?.nome)} · ${tot} entrega(s)${n ? ` · <em>${n} aguardando correção</em>` : tot ? ' · todas corrigidas' : ''}</span></button></li>`; }).join('')}</ul>` : empty('Nenhuma atividade publicada.')}</section>`;
  }

  let corrigindo = null;
  function vCorrecao(id) {
    const at = db.atividades.find((x) => x.id === id && x.professorId === me.id);
    if (!at) return empty('Atividade não encontrada.');
    const entregas = db.entregas.filter((e) => e.atividadeId === id);
    const pend = entregas.filter((e) => !e.correcao).length;
    const rel = C.activityReport(db, id);
    const total = totalPontos(at);
    const alunosT = db.alunos.filter((a) => a.turmaId === at.turmaId);
    return `<div class="top"><div><h1>${esc(at.titulo)}</h1><p class="sub">${esc(turma(at.turmaId)?.nome)} · ${esc(materia(at.materiaId)?.nome)} · ${at.questoes.length} questões · ${num(total)} pontos</p></div><button type="button" class="btn s" data-go="correcoes">Voltar</button></div>
      <section class="card"><div class="row-act" style="margin:0">
        <button type="button" class="btn" id="btnCorrigir" ${pend && !corrigindo ? '' : 'disabled'}>${corrigindo ? 'Corrigindo…' : pend ? `Corrigir ${pend} entrega(s) com IA` : 'Todas as entregas corrigidas'}</button>
        <span class="muted" id="corrStatus">${corrigindo ? esc(corrigindo) : `${entregas.length} de ${alunosT.length} alunos entregaram`}</span></div>
        ${at.relatorioIA?.aviso ? `<p class="warnbox" style="margin-top:12px">${esc(at.relatorioIA.aviso)}</p>` : ''}</section>
      ${rel.entregas ? `<section class="card"><div class="qed-h"><h2>Relatório da turma</h2><div class="acts"><button type="button" class="btn s sm" data-relprint="${at.id}">Imprimir relatório</button><button type="button" class="btn s sm" data-reldown="${at.id}">Baixar (Word)</button></div></div>
        <div class="stats"><div><b>${rel.entregas}</b><span>Entregas corrigidas</span></div><div><b>${pct(rel.mediaPct)}</b><span>Aproveitamento médio</span></div><div><b>${(() => { const q = rel.questoes.filter((x) => x.taxaAcerto != null).sort((a, b) => a.taxaAcerto - b.taxaAcerto)[0]; return q ? `Questão ${q.indice + 1}` : '—'; })()}</b><span>Questão com mais erros</span></div></div>
        ${at.relatorioIA?.resumo ? `<p class="note"><b>Análise da IA:</b> ${esc(at.relatorioIA.resumo)}</p>` : ''}
        <h2 class="h-sec">Taxa de acerto por questão</h2>${bars(rel.questoes.map((q) => ({ l: `Questão ${q.indice + 1} · ${q.tipo === 'objetiva' ? 'objetiva' : 'dissertativa'}`, v: q.taxaAcerto })))}
        <h2 class="h-sec">Erros mais recorrentes na turma</h2>${rel.errosRecorrentes.length ? `<ol class="ops">${rel.errosRecorrentes.map((e) => `<li>${esc(e.erro)} <span class="muted">· ${e.qtd} aluno(s)</span></li>`).join('')}</ol>` : '<p class="muted">Nenhum erro se repetiu em mais de um aluno.</p>'}
        <h2 class="h-sec">Principais erros por questão</h2><div class="qerr">${rel.questoes.map((q) => `<details class="aiq"><summary><b>Questão ${q.indice + 1}</b> · ${pct(q.taxaAcerto)} de acerto · ${esc(q.enunciado)}</summary>${q.errosComuns.length ? `<ul class="ops">${q.errosComuns.slice(0, 5).map((e) => `<li>${esc(e.erro)} <span class="muted">· ${e.qtd}</span></li>`).join('')}</ul>` : '<p class="muted">Sem erros registrados.</p>'}</details>`).join('')}</div></section>` : ''}
      <section class="card"><h2>Entregas</h2>${entregas.length ? `<div class="tw"><table><thead><tr><th>Aluno</th><th>Enviada</th><th>Nota</th><th>Correção</th><th></th></tr></thead><tbody>
      ${entregas.map((e) => `<tr><td>${esc(aluno(e.alunoId)?.nome)}${e.enviadoPor === 'responsavel' ? '<div class="muted small">enviada pelo responsável</div>' : ''}</td><td>${dt(e.enviadaEm)}</td><td>${e.correcao ? chipNota((e.correcao.nota / total) * 10) + ` <span class="muted small">${num(e.correcao.nota)}/${num(total)}</span>` : '<span class="chip">Aguardando</span>'}</td><td>${e.correcao ? (e.correcao.fonteDissertativas === 'ia' ? 'Gabarito + IA' : 'Gabarito + correção local') : '—'}</td><td>${e.correcao ? `<button type="button" class="ib" data-ver="${e.id}">${verEntrega === e.id ? 'Fechar' : 'Ver correção'}</button>` : ''}</td></tr>
        ${verEntrega === e.id && e.correcao ? `<tr class="detail"><td colspan="5">${at.questoes.map((q, i) => { const c = e.correcao.porQuestao[i]; const r = e.respostas[i]; return `<div class="q"><p class="q-st"><b>Questão ${i + 1}.</b> ${esc(q.enunciado)}</p><p><span class="muted">Resposta:</span> ${q.tipo === 'objetiva' ? (r == null || r === '' ? '<i>em branco</i>' : `${C.LETRAS[r]}) ${esc(q.alternativas[r])}`) : (String(r || '').trim() ? esc(r) : '<i>em branco</i>')}</p><p>${c.correta ? '<span class="chip ok">Correta</span>' : '<span class="chip bad">Incorreta</span>'} <span class="muted">${num(c.pontos)} de ${num(q.pontos)} pt · ${c.fonte === 'ia' ? 'IA' : c.fonte === 'gabarito' ? 'gabarito' : 'correção local'}</span></p><p class="q-fb">${esc(c.comentario)}</p>${c.erros?.length ? `<p class="muted small">Erros: ${c.erros.map(esc).join('; ')}</p>` : ''}</div>`; }).join('')}
          <label for="fb-${e.id}">Comentário para o aluno</label><textarea id="fb-${e.id}" data-fb="${e.id}" maxlength="1000">${esc(e.feedbackProfessor)}</textarea><div class="row-act"><button type="button" class="btn s sm" data-salvafb="${e.id}">Salvar comentário</button></div></td></tr>` : ''}`).join('')}
      </tbody></table></div>` : empty('Nenhuma entrega ainda.')}</section>`;
  }
  let verEntrega = null;

  /* ===== relatório da turma para imprimir ou baixar (print-doc.js) ===== */
  function relDoc(atId) {
    const at = db.atividades.find((x) => x.id === atId);
    const rel = at && C.activityReport(db, atId);
    if (!rel || !rel.entregas) return null;
    const E = window.EducaPrint.esc;
    const total = totalPontos(at);
    const entregas = db.entregas.filter((e) => e.atividadeId === atId && e.correcao);
    const pior = rel.questoes.filter((x) => x.taxaAcerto != null).sort((a, b) => a.taxaAcerto - b.taxaAcerto)[0];
    const body = `<table class="stats"><tr><td><b>${rel.entregas}</b>entregas corrigidas</td><td><b>${E(pct(rel.mediaPct))}</b>aproveitamento médio</td><td><b>${pior ? 'Questão ' + (pior.indice + 1) : '—'}</b>questão com mais erros</td></tr></table>
      ${at.relatorioIA?.resumo ? `<h2>Análise da IA</h2><p>${E(at.relatorioIA.resumo)}</p>` : ''}
      ${at.relatorioIA?.aviso ? `<p class="muted">${E(at.relatorioIA.aviso)}</p>` : ''}
      <h2>Taxa de acerto por questão</h2><table><tr><th>Questão</th><th>Tipo</th><th class="n">Acerto</th><th>Principais erros</th></tr>
      ${rel.questoes.map((q) => `<tr><td>${q.indice + 1}. ${E(q.enunciado)}</td><td>${q.tipo === 'objetiva' ? 'Objetiva' : 'Dissertativa'}</td><td class="n">${E(pct(q.taxaAcerto))}</td><td>${q.errosComuns.slice(0, 3).map((e) => `${E(e.erro)} (${e.qtd})`).join('<br>') || '—'}</td></tr>`).join('')}</table>
      <h2>Erros mais recorrentes na turma</h2>${rel.errosRecorrentes.length ? `<ol>${rel.errosRecorrentes.map((e) => `<li>${E(e.erro)} <span class="muted">(${e.qtd} alunos)</span></li>`).join('')}</ol>` : '<p class="muted">Nenhum erro se repetiu em mais de um aluno.</p>'}
      <h2>Notas</h2><table><tr><th>Aluno</th><th class="n">Nota</th><th class="n">Pontos</th><th>Correção</th></tr>
      ${entregas.map((e) => `<tr><td>${E(aluno(e.alunoId)?.nome)}</td><td class="n">${num((e.correcao.nota / total) * 10)}</td><td class="n">${num(e.correcao.nota)} de ${num(total)}</td><td>${e.correcao.fonteDissertativas === 'ia' ? 'Gabarito + IA' : e.correcao.fonteDissertativas === 'gabarito' ? 'Gabarito' : 'Gabarito + correção local'}</td></tr>`).join('')}</table>`;
    return {
      title: `Relatório da turma: ${at.titulo}`, escola: db.escola.nome,
      meta: [['Turma', turma(at.turmaId)?.nome], ['Componente', materia(at.materiaId)?.nome], ['Professor', me.nome], ['Data', new Date().toLocaleDateString('pt-BR')]],
      body, rodape: 'Relatório gerado pelo EducaMente AI a partir das correções registradas. Revise antes de compartilhar.',
    };
  }

  /* ===== correção: objetivas no navegador, dissertativas pela IA ===== */
  async function corrigir(atId) {
    const at = db.atividades.find((x) => x.id === atId);
    const pend = db.entregas.filter((e) => e.atividadeId === atId && !e.correcao);
    if (!pend.length) return;
    const abertas = at.questoes.map((q, i) => ({ q, i })).filter((x) => x.q.tipo === 'dissertativa');
    corrigindo = abertas.length ? 'A IA está corrigindo as questões dissertativas…' : 'Corrigindo pelo gabarito…';
    render();
    let ia = null;
    let aviso = '';
    if (abertas.length) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 120000);
        const res = await fetch(AGENT_URL + '/api/demo/grade', {
          method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activity: { title: at.titulo, subject: materia(at.materiaId)?.nome || '', questions: abertas.map(({ q, i }) => ({ index: i, statement: q.enunciado, expected_answer: q.respostaEsperada || '', points: q.pontos })) },
            submissions: pend.map((e) => ({ id: e.id, answers: abertas.map(({ i }) => ({ index: i, answer: String(e.respostas[i] ?? '') })) })),
          }),
        });
        clearTimeout(timer);
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error?.message || `o serviço respondeu ${res.status}`);
        ia = body;
      } catch (err) {
        const msg = err?.name === 'AbortError' ? 'a IA demorou demais para responder' : /fetch|network|load failed/i.test(String(err?.message)) ? 'o serviço de IA (pasta agent/) não está rodando' : err.message;
        aviso = `Correção das dissertativas feita localmente, por palavras-chave, porque ${msg}. Revise as notas antes de devolver aos alunos.`;
      }
    }
    pend.forEach((e) => {
      const local = C.gradeSubmissionLocal(at, e);
      if (ia) {
        local.porQuestao = local.porQuestao.map((c, i) => {
          if (at.questoes[i].tipo !== 'dissertativa') return c;
          const g = ia.grades.find((x) => x.submission_id === e.id && x.index === i);
          return g ? { correta: g.correct, pontos: g.points, comentario: g.comment, erros: g.errors, fonte: 'ia' } : c;
        });
        Object.assign(local, C.finalizeCorrection(at, local.porQuestao));
      }
      local.fonteDissertativas = !abertas.length ? 'gabarito' : ia ? 'ia' : 'local';
      e.correcao = local;
      e.status = 'corrigida';
    });
    at.relatorioIA = { resumo: ia?.summary || at.relatorioIA?.resumo || '', provedor: ia ? `${ia.provider} · ${ia.model}` : null, em: new Date().toISOString(), aviso };
    save();
    corrigindo = null;
    render();
    toast(ia || !abertas.length ? `${pend.length} entrega(s) corrigida(s).` : 'Correção local concluída. Veja o aviso.');
  }

  /* ===== render e eventos ===== */
  const VIEWS = {
    aluno: { inicio: vInicioAluno, frequencia: vFrequencia, notas: vNotas, atividades: vAtividadesAluno, atividade: vAtividadeAluno, atestados: vAtestadosAluno, plano: vPlano, desempenho: () => vDesempenhoAluno(), ocorrencias: vOcorrenciasAluno },
    coordenacao: { inicio: vInicioCoord, turmas: vTurmas, turma: vTurma, alunos: vAlunos, aluno: (id) => (aluno(id) ? vDesempenhoAluno(aluno(id)) : empty('Aluno não encontrado.')), professores: vProfessores, desempenho: vDesempenhoCoord, ocorrencias: vOcorrenciasCoord, atestados: vAtestadosCoord },
    professor: { inicio: vInicioProf, chamada: vChamada, atividades: vAtividadesProf, 'nova-atividade': vNovaAtividade, correcoes: vCorrecoes, correcao: vCorrecao, plano: vPlano },
  };
  VIEWS.responsavel = VIEWS.aluno;

  let lastView = null;
  function render() {
    const { view, arg } = route();
    const fn = VIEWS[ROLE][view] || VIEWS[ROLE].inicio;
    renderNav(view);
    $('main').innerHTML = fn(arg);
    document.title = `${(menu.find(([k]) => k === (PARENT[view] || view)) || [, 'Portal'])[1]} — EducaMente AI`;
    if (lastView !== location.hash) { window.scrollTo(0, 0); lastView = location.hash; }
  }
  const go = (h) => {
    if (h === 'painel') { try { if (!localStorage.getItem('educamente.localMode')) localStorage.setItem('educamente.localMode', '1'); } catch { /* indisponível */ } location.href = 'dashboard.html'; return; }
    if (location.hash === '#' + h) render(); else location.hash = h;
    document.body.classList.remove('open');
    $('main').focus({ preventScroll: true });
  };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.go) { go(t.dataset.go); return; }
    if (t.id === 'todosP') { document.querySelectorAll('#fChamada input[value="P"]').forEach((i) => { i.checked = true; }); return; }
    if (t.id === 'btnCorrigir') { corrigir(route().arg); return; }
    if (t.dataset.relprint) { const d = relDoc(t.dataset.relprint); if (d) window.EducaPrint.print(d); return; }
    if (t.dataset.reldown) { const d = relDoc(t.dataset.reldown); if (d) { window.EducaPrint.download(d); toast('Relatório baixado.'); } return; }
    if (t.dataset.ver) { verEntrega = verEntrega === t.dataset.ver ? null : t.dataset.ver; render(); return; }
    if (t.dataset.salvafb) { const e2 = db.entregas.find((x) => x.id === t.dataset.salvafb); e2.feedbackProfessor = document.querySelector(`[data-fb="${e2.id}"]`).value.trim(); save(); toast('Comentário salvo. O aluno já pode ver.'); return; }
    if (t.dataset.addq) { syncRascunho(); rascunho.questoes.push(novaQuestao(t.dataset.addq)); render(); document.querySelector(`#qe${rascunho.questoes.length - 1}`)?.focus(); return; }
    if (t.dataset.delq) { syncRascunho(); rascunho.questoes.splice(Number(t.dataset.delq), 1); render(); return; }
    if (t.dataset.aprovar) {
      const x = db.atestados.find((a) => a.id === t.dataset.aprovar);
      const n = C.approveCertificate(db, x.id, me.id);
      save(); render(); toast(`Atestado aprovado: ${n} falta(s) passaram a FJ.`); return;
    }
    if (t.dataset.recusar) {
      const motivo = prompt('Motivo da recusa (o aluno e o responsável verão):', 'Documento ilegível ou sem assinatura do profissional.');
      if (motivo === null) return;
      Object.assign(db.atestados.find((a) => a.id === t.dataset.recusar), { status: 'recusado', motivoRecusa: motivo.trim(), avaliadoPor: me.id, avaliadoEm: new Date().toISOString() });
      save(); render(); toast('Atestado recusado.');
    }
  });

  function syncRascunho() {
    if (!rascunho) return;
    document.querySelectorAll('#fAtv [data-r]').forEach((el) => { rascunho[el.dataset.r] = el.value; });
    document.querySelectorAll('#fAtv [data-q]').forEach((el) => {
      const q = rascunho.questoes[Number(el.dataset.q)];
      if (!q) return;
      if (el.dataset.alt != null) q.alternativas[Number(el.dataset.alt)] = el.value;
      else if (el.dataset.k === 'correta') { if (el.checked) q.correta = Number(el.value); }
      else if (el.dataset.k === 'pontos') q.pontos = Number(el.value) || 0;
      else if (el.dataset.k === 'palavrasChave') q.palavrasChave = el.value.split(',').map((s) => s.trim()).filter(Boolean);
      else q[el.dataset.k] = el.value;
    });
  }

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'selPlano') { location.hash = 'plano:' + t.value; return; }
    if (t.id === 'selTurmaD') { location.hash = 'desempenho:' + t.value; return; }
    if (t.id === 'fTurmaAl') { location.hash = 'alunos:' + t.value; return; }
    if (['chTurma', 'chMat', 'chData', 'chAula'].includes(t.id)) {
      chamadaSel.turmaId = $('chTurma').value; chamadaSel.materiaId = $('chMat').value; chamadaSel.data = $('chData').value || today(); chamadaSel.aula = Number($('chAula').value);
      if (t.id === 'chTurma') chamadaSel.materiaId = null;
      render(); return;
    }
    if (t.id === 'avTurma') { syncRascunho(); rascunho.materiaId = materiasDoProfessor(me.id, t.value)[0]?.id; render(); return; }
    if (t.dataset.vinc) {
      const [tid, mid] = t.dataset.vinc.split('|');
      const tu = turma(tid);
      const v = tu.professores.find((x) => x.materiaId === mid);
      if (v) v.professorId = t.value || null; else tu.professores.push({ materiaId: mid, professorId: t.value || null });
      save(); toast(t.value ? `${prof(t.value).nome} agora leciona ${materia(mid).nome} na ${tu.nome}.` : `${materia(mid).nome} ficou sem professor na ${tu.nome}.`);
    }
  });

  const readFile = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(file); });

  document.addEventListener('submit', async (e) => {
    const f = e.target;
    e.preventDefault();
    if (!f.reportValidity()) return;
    if (f.id === 'fResp') {
      const at = db.atividades.find((x) => x.id === route().arg);
      const respostas = at.questoes.map((q, i) => (q.tipo === 'objetiva' ? (f.querySelector(`[name="q${i}"]:checked`)?.value ?? null) : f.querySelector(`[name="q${i}"]`).value.trim()))
        .map((v, i) => (at.questoes[i].tipo === 'objetiva' && v != null ? Number(v) : v));
      const brancas = respostas.filter((v) => v == null || v === '').length;
      if (!confirm((brancas ? `Há ${brancas} questão(ões) em branco. Enviar mesmo assim?` : 'Enviar as respostas? Depois de enviar, não é possível alterar.') + (leitura ? `
A entrega fica registrada como enviada pelo responsável de ${me.nome}.` : ''))) return;
      db.entregas.push({ id: uid('ent'), atividadeId: at.id, alunoId: me.id, enviadoPor: ROLE, respostas, enviadaEm: today(), status: 'enviada', correcao: null, feedbackProfessor: '' });
      save(); render(); toast(leitura ? `Respostas de ${me.nome.split(' ')[0]} enviadas ao professor.` : 'Respostas enviadas ao professor.');
    }
    if (f.id === 'fAtestado') {
      const ini = $('atIni').value; const fim = $('atFim').value; const file = $('atArq').files[0];
      if (fim < ini) { toast('O último dia não pode ser antes do primeiro.'); $('atFim').focus(); return; }
      if (!file) return;
      if (!/^(application\/pdf|image\/(jpeg|png))$/.test(file.type)) { toast('Envie um arquivo PDF, JPG ou PNG.'); return; }
      if (file.size > 2 * 1024 * 1024) { toast('O arquivo passa de 2 MB. Envie uma versão menor.'); return; }
      const arquivo = { nome: file.name, tipo: file.type, tamanho: file.size };
      if (file.size <= 700 * 1024) { try { arquivo.dataUrl = await readFile(file); } catch { /* guarda só o nome */ } }
      db.atestados.push({ id: uid('ate'), alunoId: me.id, enviadoPor: ROLE, inicio: ini, fim, motivo: $('atMot').value.trim(), arquivo, enviadoEm: today(), status: 'pendente' });
      save(); render(); toast('Atestado enviado para a coordenação.');
    }
    if (f.id === 'fChamada') {
      const { turmaId, materiaId, data, aula } = chamadaSel;
      db.alunos.filter((a) => a.turmaId === turmaId).forEach((a) => {
        const status = f.querySelector(`[name="ch-${a.id}"]:checked`)?.value || 'P';
        const x = db.aulas.find((r) => r.alunoId === a.id && r.materiaId === materiaId && r.data === data && r.aula === aula);
        if (x) Object.assign(x, { status, professorId: me.id }); else db.aulas.push({ id: uid('au'), turmaId, materiaId, alunoId: a.id, data, aula, status, professorId: me.id });
      });
      save(); render(); toast(`Chamada de ${dt(data)} salva.`);
    }
    if (f.id === 'fAtv') {
      syncRascunho();
      const r = rascunho;
      if (r.questoes.some((q) => q.tipo === 'objetiva' && new Set(q.alternativas.map((a) => a.trim().toLowerCase())).size < q.alternativas.length)) { toast('Há alternativas repetidas em uma questão objetiva.'); return; }
      db.atividades.push({ id: uid('atv'), turmaId: r.turmaId, materiaId: r.materiaId, professorId: me.id, titulo: r.titulo.trim(), instrucoes: r.instrucoes.trim(), prazo: r.prazo, publicadaEm: today(), questoes: r.questoes.map((q) => ({ ...q, pontos: Number(q.pontos) })) });
      rascunho = null;
      save(); go('atividades'); toast('Atividade publicada. Os alunos da turma já podem responder.');
    }
    if (f.id === 'fTurma') {
      const nome = $('tuNome').value.trim();
      if (db.turmas.some((t) => t.nome.toLowerCase() === nome.toLowerCase())) { toast('Já existe uma turma com esse nome.'); return; }
      const t = { id: uid('t'), nome, serie: $('tuSerie').value, turno: $('tuTurno').value, professores: C.materiasDaSerie(db, $('tuSerie').value).map((m) => ({ materiaId: m.id, professorId: null })) };
      db.turmas.push(t);
      const mesmoNivel = (p) => C.nivelDaSerie(turma(p.turmaId)?.serie) === C.nivelDaSerie(t.serie);
      C.materiasDaSerie(db, t.serie).forEach((m) => db.planos.push({ id: uid('pl'), turmaId: t.id, materiaId: m.id, professorId: null, bimestres: (db.planos.find((p) => p.materiaId === m.id && p.turmaId !== t.id && mesmoNivel(p))?.bimestres || []).map((b) => ({ ...b })) }));
      save(); go('turma:' + t.id); toast('Turma criada. Agora defina os professores.');
    }
    if (f.id === 'fAluno') {
      const a = { id: uid('a'), nome: $('alNome').value.trim().replace(/\s+/g, ' '), turmaId: $('alTurma').value, nascimento: $('alNasc').value, responsavel: $('alResp').value.trim(), email: $('alEmail').value.trim(), acesso: C.newAccessId(db, 'ALU'), matricula: C.newEnrollment(db) };
      db.alunos.push(a);
      ultimoCadastro = { tipo: 'aluno', ...a };
      save(); render(); $('cred')?.scrollIntoView({ block: 'start' }); toast('Aluno matriculado.');
    }
    if (f.id === 'fProf') {
      const p = { id: uid('p'), nome: $('prNome').value.trim(), email: $('prEmail').value.trim(), acesso: C.newAccessId(db, 'PRF') };
      db.professores.push(p);
      ultimoCadastro = { tipo: 'professor', ...p };
      save(); render(); $('cred')?.scrollIntoView({ block: 'start' }); toast('Professor liberado. Vincule-o às turmas.');
    }
    if (f.id === 'fOc') {
      const fim = $('ocFim').value;
      if (fim && fim < $('ocData').value) { toast('O fim não pode ser antes da data.'); return; }
      db.ocorrencias.push({ id: uid('oc'), alunoId: $('ocAluno').value, tipo: $('ocTipo').value, data: $('ocData').value, fim, descricao: $('ocDesc').value.trim(), coordId: me.id });
      save(); render(); toast('Ocorrência registrada.');
    }
  });

  $('burger').addEventListener('click', () => {
    if (matchMedia('(max-width: 900px)').matches) document.body.classList.toggle('open');
    else document.body.classList.toggle('collapsed');
  });
  $('sair').addEventListener('click', () => { S.session.clear(); location.replace('index.html'); });
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#correcao')) verEntrega = null; render(); });
  window.addEventListener('storage', (e) => { if (e.key === 'educamente.escola.v1') { db = S.reload(); render(); } });

  header();
  render();
})();
