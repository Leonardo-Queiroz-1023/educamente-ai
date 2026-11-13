/*
 * EducaMente AI — núcleo do portal da escola (MVP demonstrativo).
 * Dados de demonstração e regras puras (login demonstrativo, frequência, notas,
 * correção, relatório da turma, atestados). Sem DOM e sem armazenamento: o
 * portal (portal.js) e os testes (tests/escola-core.test.mjs) usam estas funções.
 * ATENÇÃO: o login aqui é só demonstrativo, conferido no navegador. Não use com
 * dados reais.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EscolaCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I
  const LETRAS = 'ABCDEFGH';
  const VERSAO = 2; // muda quando a semente muda: o navegador recria os dados de demonstração
  const ULTIMO_ANO_RESPONSAVEL = 6;

  /* ===== utilidades ===== */
  function normalizeName(s) {
    return String(s ?? '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const round1 = (n) => Math.round(n * 10) / 10;
  function rng(seedNum) { // mulberry32: semente determinística, mesma demonstração sempre
    let a = seedNum >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function randomPick(rand, n) {
    let s = '';
    for (let i = 0; i < n; i += 1) s += ALFABETO[Math.floor(rand() * ALFABETO.length)];
    return s;
  }

  /* ===== dados de demonstração ===== */
  const MATERIAS = [
    ['por', 'Língua Portuguesa'], ['mat', 'Matemática'], ['cie', 'Ciências'], ['his', 'História'],
    ['geo', 'Geografia'], ['ing', 'Inglês'], ['art', 'Arte'], ['edf', 'Educação Física'],
  ];
  const PLANOS = {
    por: [['Gêneros textuais: notícia e reportagem', 'Coesão e coerência'], ['Orações subordinadas', 'Artigo de opinião'], ['Crônica e conto', 'Concordância verbal e nominal'], ['Texto dissertativo-argumentativo', 'Revisão e reescrita']],
    mat: [['Números reais e potências', 'Notação científica'], ['Equações do 1º grau', 'Sistemas de equações'], ['Equações do 2º grau', 'Funções: noção e gráficos'], ['Teorema de Pitágoras', 'Probabilidade e estatística']],
    cie: [['Estrutura da matéria e modelos atômicos', 'Tabela periódica'], ['Reações químicas', 'Fotossíntese e respiração'], ['Genética: hereditariedade', 'Evolução das espécies'], ['Sistema Solar e universo', 'Sustentabilidade']],
    his: [['Primeira República no Brasil', 'Primeira Guerra Mundial'], ['Era Vargas', 'Segunda Guerra Mundial'], ['Guerra Fria', 'Ditadura civil-militar no Brasil'], ['Redemocratização', 'Mundo contemporâneo']],
    geo: [['Globalização e redes', 'Blocos econômicos'], ['Europa: aspectos físicos e humanos', 'Ásia e Oceania'], ['África: diversidade regional', 'Conflitos territoriais'], ['Questões ambientais globais', 'Cartografia e geotecnologias']],
    ing: [['Present perfect', 'Reading strategies'], ['Past continuous', 'Vocabulary: technology'], ['Future forms', 'Writing: e-mails'], ['Conditionals', 'Listening practice']],
    art: [['Arte moderna brasileira', 'Semana de 22'], ['Linguagem do teatro', 'Improvisação'], ['Música e cultura popular', 'Ritmos regionais'], ['Arte urbana', 'Projeto de exposição']],
    edf: [['Esportes de invasão', 'Regras e fair play'], ['Ginástica e condicionamento', 'Saúde e qualidade de vida'], ['Esportes de rede', 'Jogos cooperativos'], ['Danças urbanas', 'Festival esportivo']],
  };
  const NOMES_T1 = ['Ana Beatriz Souza', 'Bruno Henrique Alves', 'Camila Ferreira Lopes', 'Davi Santos Moura', 'Eduarda Lima Costa', 'Felipe Araújo Neves', 'Gabriela Rocha Pinto', 'Heitor Barbosa Dias'];
  const NOMES_T2 = ['Isabela Cardoso Melo', 'João Pedro Martins', 'Larissa Gomes Teixeira', 'Mateus Ribeiro Freitas', 'Nicole Azevedo Prado', 'Otávio Mendes Cunha'];
  const NOMES_T3 = ['Alice Carvalho Ramos', 'Benício Duarte Lima', 'Cecília Monteiro Reis', 'Daniel Fonseca Vaz', 'Elisa Nogueira Brito'];
  // Anos iniciais: conteúdos do 5º ano.
  const PLANOS_INICIAIS = {
    por: [['Leitura e interpretação de fábulas', 'Ortografia: uso de R e RR'], ['Pontuação e discurso direto', 'Produção de bilhetes e cartas'], ['Substantivos e adjetivos', 'Leitura de notícias para crianças'], ['Produção de texto narrativo', 'Revisão coletiva de textos']],
    mat: [['Sistema de numeração até centenas de milhar', 'Adição e subtração'], ['Multiplicação e divisão', 'Problemas com as quatro operações'], ['Frações: metade, terço e quarto', 'Números decimais e dinheiro'], ['Medidas de comprimento e massa', 'Gráficos e tabelas simples']],
    cie: [['Ciclo da água', 'Estados físicos da matéria'], ['Alimentação saudável', 'Sistema digestório'], ['Plantas e fotossíntese', 'Cadeias alimentares'], ['Sistema Solar', 'Lixo e reciclagem']],
    his: [['Povos indígenas do Brasil', 'Diversidade cultural'], ['Formação das cidades', 'Patrimônio histórico'], ['Cidadania e direitos', 'Documentos e registros'], ['História do nosso município', 'Linha do tempo da família']],
    geo: [['Paisagem natural e modificada', 'Mapas e legendas'], ['Regiões do Brasil', 'Clima e vegetação'], ['Campo e cidade', 'Trabalho e produção'], ['Preservação ambiental', 'Pontos cardeais']],
    ing: [['Greetings and colors', 'Numbers 1 to 20'], ['Family members', 'Animals'], ['Food and fruits', 'Days of the week'], ['My school', 'Songs and games']],
    art: [['Cores primárias e secundárias', 'Desenho de observação'], ['Brincadeiras cantadas', 'Instrumentos de sucata'], ['Teatro de fantoches', 'Dramatização de histórias'], ['Arte indígena e africana', 'Mostra de trabalhos']],
    edf: [['Brincadeiras populares', 'Jogos de roda'], ['Circuitos motores', 'Equilíbrio e coordenação'], ['Jogos pré-desportivos', 'Cooperação em equipe'], ['Danças folclóricas', 'Festival de jogos']],
  };
  const RESPONSAVEIS = ['Cláudia Souza', 'Marcos Alves', 'Patrícia Lopes', 'Ricardo Moura', 'Sandra Costa', 'Tiago Neves', 'Vanessa Pinto', 'Wagner Dias', 'Aline Melo', 'Roberto Martins', 'Juliana Teixeira', 'Fábio Freitas', 'Renata Prado', 'Sérgio Cunha', 'Mônica Ramos', 'Paulo Lima', 'Helena Reis', 'André Vaz', 'Carolina Brito'];

  function seed() {
    const rand = rng(20261113);
    const db = {
      versao: VERSAO,
      escola: { id: 'esc1', nome: 'Escola de Demonstração EducaMente', municipio: 'Recife', anoLetivo: 2026 },
      materias: MATERIAS.map(([id, nome]) => ({ id, nome })),
      coordenadores: [{ id: 'c1', nome: 'Marta Albuquerque', acesso: 'COORD-2026', email: 'coordenacao@escola-demo.invalid' }],
      professores: [
        { id: 'p1', nome: 'Carla Mendes', acesso: 'PRF-K7Q2', email: 'carla@escola-demo.invalid' },
        { id: 'p2', nome: 'Rafael Lima', acesso: 'PRF-M4TX', email: 'rafael@escola-demo.invalid' },
        { id: 'p3', nome: 'Joana Ribeiro', acesso: 'PRF-W9HD', email: 'joana@escola-demo.invalid' },
        { id: 'p4', nome: 'Luciana Pereira', acesso: 'PRF-R3NB', email: 'luciana@escola-demo.invalid' },
      ],
      turmas: [], alunos: [], aulas: [], notas: [], atividades: [], entregas: [], atestados: [], ocorrencias: [], planos: [],
    };
    const prof = { mat: 'p1', cie: 'p1', por: 'p2', ing: 'p2', art: 'p2', his: 'p3', geo: 'p3', edf: 'p3' };
    const vinculos = MATERIAS.map(([m]) => ({ materiaId: m, professorId: prof[m] }));
    db.turmas.push({ id: 't1', nome: '9º Ano A', serie: '9º ano', turno: 'Manhã', professores: vinculos.map((v) => ({ ...v })) });
    db.turmas.push({ id: 't2', nome: '8º Ano B', serie: '8º ano', turno: 'Tarde', professores: vinculos.map((v) => ({ ...v })) });
    // Anos iniciais: professora polivalente, com Inglês e Educação Física à parte.
    db.turmas.push({ id: 't3', nome: '5º Ano A', serie: '5º ano', turno: 'Manhã', professores: MATERIAS.map(([m]) => ({ materiaId: m, professorId: m === 'ing' ? 'p2' : m === 'edf' ? 'p3' : 'p4' })) });
    const profDe = (turmaId, m) => db.turmas.find((t) => t.id === turmaId).professores.find((v) => v.materiaId === m)?.professorId || null;

    const usados = new Set(['COORD-2026', 'PRF-K7Q2', 'PRF-M4TX', 'PRF-W9HD', 'PRF-R3NB']);
    const matriculas = new Set();
    let r = 0;
    [['t1', NOMES_T1], ['t2', NOMES_T2], ['t3', NOMES_T3]].forEach(([turmaId, nomes]) => nomes.forEach((nome) => {
      let acesso;
      do acesso = 'ALU-' + randomPick(rand, 4); while (usados.has(acesso));
      usados.add(acesso);
      let matricula;
      do matricula = String(Math.floor(1e9 + rand() * 9e9)); while (matriculas.has(matricula));
      matriculas.add(matricula);
      db.alunos.push({ id: 'a' + (db.alunos.length + 1), nome, turmaId, acesso, matricula, responsavel: RESPONSAVEIS[r++], email: 'familia' + r + '@escola-demo.invalid', nascimento: turmaId === 't3' ? '2015-0' + (1 + (r % 9)) + '-0' + (1 + (r % 8)) : turmaId === 't1' ? '2011-0' + (1 + (r % 9)) + '-1' + (r % 9) : '2012-0' + (1 + (r % 9)) + '-2' + (r % 8) });
    }));

    // Frequência: 12 semanas, uma aula por matéria por semana.
    db.alunos.forEach((a, i) => {
      const risco = [0.03, 0.12, 0.05, 0.2, 0.02, 0.08, 0.04, 0.15][i % 8];
      MATERIAS.forEach(([m], mi) => {
        for (let w = 0; w < 12; w += 1) {
          const data = addDays('2026-08-17', w * 7 + (mi % 5));
          const x = rand();
          const status = x < risco ? (x < risco * 0.25 ? 'FJ' : 'F') : 'P';
          db.aulas.push({ id: `au-${a.id}-${m}-${w}`, turmaId: a.turmaId, materiaId: m, alunoId: a.id, data, aula: 1, status, professorId: profDe(a.turmaId, m) });
        }
      });
    });

    // Notas: 1º a 3º bimestre lançados; 4º em andamento.
    db.alunos.forEach((a, i) => {
      const base = [7.8, 5.6, 8.6, 4.9, 9.1, 6.7, 7.2, 5.9][i % 8];
      MATERIAS.forEach(([m], mi) => {
        for (let b = 1; b <= 3; b += 1) {
          const ajuste = (mi % 3 === 1 ? -0.8 : mi % 3 === 2 ? 0.5 : 0) + (b - 2) * 0.3 + (rand() - 0.5) * 1.6;
          const nota = Math.max(0, Math.min(10, Math.round((base + ajuste) * 2) / 2));
          db.notas.push({ alunoId: a.id, materiaId: m, bimestre: b, nota });
        }
      });
    });

    // Plano anual por turma e matéria.
    db.turmas.forEach((t) => MATERIAS.forEach(([m]) => db.planos.push({
      id: `pl-${t.id}-${m}`, turmaId: t.id, materiaId: m, professorId: profDe(t.id, m),
      bimestres: (serieNumber(t.serie) <= 5 ? PLANOS_INICIAIS : PLANOS)[m].map((conteudos, i) => ({ bimestre: i + 1, conteudos })),
    })));

    // Atividades publicadas.
    db.atividades.push({
      id: 'atv1', turmaId: 't1', materiaId: 'mat', professorId: 'p1', titulo: 'Equações do 1º grau',
      instrucoes: 'Resolva as questões. Nas dissertativas, mostre o raciocínio.', publicadaEm: '2026-11-03', prazo: '2026-11-10',
      questoes: [
        { tipo: 'objetiva', enunciado: 'Qual é a solução de 2x + 6 = 14?', alternativas: ['x = 3', 'x = 4', 'x = 10', 'x = 8'], correta: 1, pontos: 2 },
        { tipo: 'objetiva', enunciado: 'Se 3x − 5 = 10, então x vale:', alternativas: ['5', '15', '3', '−5'], correta: 0, pontos: 2 },
        { tipo: 'objetiva', enunciado: 'Qual equação representa "o dobro de um número somado a 7 é 19"?', alternativas: ['x + 7 = 19', '2(x + 7) = 19', '2x + 7 = 19', '2x = 19 + 7'], correta: 2, pontos: 2 },
        { tipo: 'dissertativa', enunciado: 'Explique, passo a passo, como resolver 5x − 3 = 2x + 9.', respostaEsperada: 'Passar os termos com x para um lado e os números para o outro: 5x − 2x = 9 + 3, logo 3x = 12 e x = 4.', palavrasChave: ['3x', '12', 'x = 4'], pontos: 4 },
      ],
    });
    db.atividades.push({
      id: 'atv2', turmaId: 't1', materiaId: 'cie', professorId: 'p1', titulo: 'Fotossíntese',
      instrucoes: 'Leia o capítulo 7 antes de responder.', publicadaEm: '2026-11-10', prazo: '2026-11-21',
      questoes: [
        { tipo: 'objetiva', enunciado: 'Em qual organela ocorre a fotossíntese?', alternativas: ['Mitocôndria', 'Cloroplasto', 'Ribossomo', 'Núcleo'], correta: 1, pontos: 2 },
        { tipo: 'objetiva', enunciado: 'Qual gás é liberado na fotossíntese?', alternativas: ['Gás carbônico', 'Nitrogênio', 'Oxigênio', 'Metano'], correta: 2, pontos: 2 },
        { tipo: 'dissertativa', enunciado: 'Explique o que a planta produz na fotossíntese e o que ela precisa para isso.', respostaEsperada: 'A planta usa luz, água e gás carbônico para produzir glicose (alimento) e libera oxigênio.', palavrasChave: ['luz', 'água', 'gás carbônico', 'glicose', 'oxigênio'], pontos: 6 },
      ],
    });

    // Anos iniciais: o responsável pode responder e enviar pelo filho.
    db.atividades.push({
      id: 'atv3', turmaId: 't3', materiaId: 'mat', professorId: 'p4', titulo: 'Frações no dia a dia',
      instrucoes: 'Responda junto com um adulto, se precisar. Pode usar desenhos para pensar.', publicadaEm: '2026-11-11', prazo: '2026-11-28',
      questoes: [
        { tipo: 'objetiva', enunciado: 'Uma pizza foi dividida em 4 pedaços iguais. Cada pedaço é:', alternativas: ['Metade da pizza', 'Um terço da pizza', 'Um quarto da pizza', 'A pizza inteira'], correta: 2, pontos: 3 },
        { tipo: 'objetiva', enunciado: 'Qual fração é maior?', alternativas: ['1/2', '1/4', '1/8', '1/10'], correta: 0, pontos: 3 },
        { tipo: 'dissertativa', enunciado: 'Ana comeu 2 de 8 pedaços de um bolo. Que fração do bolo ela comeu? Explique como pensou.', respostaEsperada: 'Ela comeu 2/8 do bolo, que é o mesmo que 1/4: são 2 pedaços de um total de 8 pedaços iguais.', palavrasChave: ['2/8', '8', 'pedaços'], pontos: 4 },
      ],
    });

    // Entregas da atividade de Matemática (aguardando correção), com erros típicos.
    const respMat = [
      [1, 0, 2, 'Passo os x para a esquerda e os números para a direita: 5x - 2x = 9 + 3, fica 3x = 12, então x = 4.'],
      [0, 0, 1, 'Eu somei tudo: 5x + 2x = 9 - 3, 7x = 6.'],
      [1, 0, 2, 'Isolar o x: 3x = 12 e x = 4.'],
      [3, 1, 1, 'x = 2'],
      [1, 0, 2, '5x - 2x = 3x e 9 + 3 = 12, portanto x = 4.'],
      [1, 1, 2, 'Juntei os x: 3x = 6, x = 2.'],
      [0, 0, 1, ''],
    ];
    respMat.forEach((rr, i) => db.entregas.push({
      id: 'ent' + (i + 1), atividadeId: 'atv1', alunoId: 'a' + (i + 1), respostas: rr,
      enviadaEm: addDays('2026-11-04', i % 5), status: 'enviada', correcao: null, feedbackProfessor: '',
    }));

    // Atestados e ocorrências.
    const faltaA2 = db.aulas.find((x) => x.alunoId === 'a2' && x.status === 'F');
    db.atestados.push({ id: 'ate1', alunoId: 'a2', enviadoPor: 'responsavel', inicio: faltaA2.data, fim: faltaA2.data, motivo: 'Consulta médica', arquivo: { nome: 'atestado-consulta.pdf', tipo: 'application/pdf', tamanho: 182400 }, enviadoEm: addDays(faltaA2.data, 1), status: 'pendente' });
    db.ocorrencias.push({ id: 'oc1', alunoId: 'a4', tipo: 'Advertência', descricao: 'Uso de celular durante a avaliação de Matemática, após dois avisos.', data: '2026-09-22', fim: '', coordId: 'c1' });
    db.ocorrencias.push({ id: 'oc2', alunoId: 'a4', tipo: 'Suspensão', descricao: 'Desrespeito a funcionário da cantina. Suspensão de um dia, com conversa com o responsável.', data: '2026-10-15', fim: '2026-10-15', coordId: 'c1' });
    return db;
  }

  /* ===== séries ===== */
  function serieNumber(serie) {
    const m = /(\d+)\s*º?\s*ano/i.exec(String(serie ?? ''));
    return m ? Number(m[1]) : null;
  }
  /* O responsável responde e envia atividades pelo filho só até o 6º ano do fundamental. */
  function guardianCanSubmit(db, alunoId) {
    const a = db.alunos.find((x) => x.id === alunoId);
    const t = a && db.turmas.find((x) => x.id === a.turmaId);
    const n = t ? serieNumber(t.serie) : null;
    return n != null && n <= ULTIMO_ANO_RESPONSAVEL;
  }

  /* ===== login demonstrativo ===== */
  function authenticate(db, role, creds = {}) {
    const id = String(creds.id ?? '').trim().toUpperCase();
    if (role === 'aluno') { const a = db.alunos.find((x) => x.acesso === id); return a ? { role, id: a.id } : null; }
    if (role === 'professor') { const p = db.professores.find((x) => x.acesso === id); return p ? { role, id: p.id } : null; }
    if (role === 'coordenacao') { const c = db.coordenadores.find((x) => x.acesso === id); return c ? { role, id: c.id } : null; }
    if (role === 'responsavel') {
      const nome = normalizeName(creds.nome);
      const matricula = String(creds.matricula ?? '').replace(/\D/g, '');
      if (!nome || !matricula) return null;
      const a = db.alunos.find((x) => x.matricula === matricula && normalizeName(x.nome) === nome);
      return a ? { role, id: a.id } : null;
    }
    return null;
  }

  /* ===== frequência e notas ===== */
  function attendanceSummary(db, alunoId) {
    return db.materias.map((m) => {
      const aulas = db.aulas.filter((x) => x.alunoId === alunoId && x.materiaId === m.id);
      const c = { P: 0, F: 0, FJ: 0 };
      aulas.forEach((x) => { c[x.status] = (c[x.status] || 0) + 1; });
      // Falta justificada não reduz a frequência (como no diário oficial).
      const freq = aulas.length ? round1(((aulas.length - c.F) / aulas.length) * 100) : null;
      return { materiaId: m.id, materia: m.nome, aulas: aulas.length, P: c.P, F: c.F, FJ: c.FJ, freq };
    });
  }

  function gradeSummary(db, alunoId) {
    return db.materias.map((m) => {
      const bimestres = [1, 2, 3, 4].map((b) => {
        const n = db.notas.find((x) => x.alunoId === alunoId && x.materiaId === m.id && x.bimestre === b);
        return n && n.nota != null ? n.nota : null;
      });
      const lancadas = bimestres.filter((n) => n != null);
      const media = lancadas.length ? round1(avg(lancadas)) : null;
      return { materiaId: m.id, materia: m.nome, bimestres, media };
    });
  }

  /* ===== correção ===== */
  function gradeObjective(q, resposta) {
    if (resposta == null || resposta === '' || Number.isNaN(Number(resposta))) return { correta: false, pontos: 0, erro: 'Em branco' };
    const i = Number(resposta);
    if (i === q.correta) return { correta: true, pontos: q.pontos, erro: null };
    return { correta: false, pontos: 0, erro: `Marcou ${LETRAS[i] || '?'}) ${q.alternativas?.[i] ?? ''}`.trim() };
  }

  function gradeOpenLocal(q, resposta) {
    const texto = normalizeName(resposta);
    if (!texto) return { correta: false, pontos: 0, comentario: 'Questão não respondida.', erros: ['Resposta em branco'] };
    const chaves = q.palavrasChave || [];
    const faltando = chaves.filter((k) => !texto.includes(normalizeName(k)));
    const fracao = chaves.length ? (chaves.length - faltando.length) / chaves.length : 0.5;
    const pontos = Math.round(q.pontos * fracao * 2) / 2;
    const correta = fracao >= 0.6;
    const erros = faltando.map((k) => `Não mencionou "${k}"`);
    const comentario = correta
      ? 'Resposta adequada: contempla os pontos principais esperados.'
      : `Resposta incompleta: faltaram ${faltando.length} de ${chaves.length} elementos esperados.`;
    return { correta, pontos, comentario, erros };
  }

  /* Corrige as objetivas pelo gabarito e as dissertativas localmente (reserva quando a IA não responde). */
  function gradeSubmissionLocal(atividade, entrega) {
    const porQuestao = atividade.questoes.map((q, i) => {
      if (q.tipo === 'objetiva') {
        const g = gradeObjective(q, entrega.respostas[i]);
        return { correta: g.correta, pontos: g.pontos, comentario: g.correta ? 'Correta pelo gabarito.' : `Gabarito: ${LETRAS[q.correta]}) ${q.alternativas[q.correta]}.`, erros: g.erro ? [g.erro] : [], fonte: 'gabarito' };
      }
      return { ...gradeOpenLocal(q, entrega.respostas[i]), fonte: 'local' };
    });
    return finalizeCorrection(atividade, porQuestao);
  }

  function finalizeCorrection(atividade, porQuestao) {
    const total = atividade.questoes.reduce((s, q) => s + q.pontos, 0);
    const nota = porQuestao.reduce((s, c) => s + (c.pontos || 0), 0);
    return { porQuestao, nota, total, corrigidaEm: new Date().toISOString() };
  }

  function tally(list) {
    const m = new Map();
    list.forEach((e) => m.set(e, (m.get(e) || 0) + 1));
    return [...m.entries()].map(([erro, qtd]) => ({ erro, qtd })).sort((a, b) => b.qtd - a.qtd || a.erro.localeCompare(b.erro));
  }

  function activityReport(db, atividadeId) {
    const at = db.atividades.find((x) => x.id === atividadeId);
    if (!at) return null;
    const corrigidas = db.entregas.filter((e) => e.atividadeId === atividadeId && e.correcao);
    const total = at.questoes.reduce((s, q) => s + q.pontos, 0);
    const questoes = at.questoes.map((q, i) => {
      const cs = corrigidas.map((e) => e.correcao.porQuestao[i]).filter(Boolean);
      return {
        indice: i, enunciado: q.enunciado, tipo: q.tipo,
        taxaAcerto: cs.length ? (cs.filter((c) => c.correta).length / cs.length) * 100 : null,
        errosComuns: tally(cs.flatMap((c) => c.erros || [])),
      };
    });
    const errosRecorrentes = tally(questoes.flatMap((q) => q.errosComuns.flatMap((e) => Array(e.qtd).fill(`Questão ${q.indice + 1}: ${e.erro}`))))
      .filter((e) => e.qtd >= 2).slice(0, 6);
    const notas = corrigidas.map((e) => {
      const n = e.correcao.nota ?? e.correcao.porQuestao.reduce((s, c) => s + (c.pontos || 0), 0);
      return total ? (n / total) * 100 : 0;
    });
    return { entregas: corrigidas.length, mediaPct: notas.length ? avg(notas) : null, questoes, errosRecorrentes };
  }

  /* ===== atestados ===== */
  function approveCertificate(db, atestadoId, coordId) {
    const at = db.atestados.find((x) => x.id === atestadoId);
    if (!at) return 0;
    let n = 0;
    db.aulas.forEach((x) => {
      if (x.alunoId === at.alunoId && x.status === 'F' && x.data >= at.inicio && x.data <= at.fim) {
        x.status = 'FJ'; x.atestadoId = at.id; n += 1;
      }
    });
    at.status = 'aprovado'; at.avaliadoPor = coordId; at.avaliadoEm = new Date().toISOString(); at.faltasJustificadas = n;
    return n;
  }

  /* ===== novos acessos ===== */
  function allAccess(db) {
    return new Set([...db.alunos, ...db.professores, ...db.coordenadores].map((x) => x.acesso));
  }
  function newAccessId(db, prefixo) {
    const usados = allAccess(db);
    const rand = Math.random;
    let id;
    do id = `${prefixo}-${randomPick(rand, 4)}`; while (usados.has(id));
    return id;
  }
  function newEnrollment(db) {
    const usadas = new Set(db.alunos.map((a) => a.matricula));
    let m;
    do m = String(Math.floor(1e9 + Math.random() * 9e9)); while (usadas.has(m));
    return m;
  }

  return {
    LETRAS, VERSAO, ULTIMO_ANO_RESPONSAVEL, seed, serieNumber, guardianCanSubmit, normalizeName, authenticate, attendanceSummary, gradeSummary,
    gradeObjective, gradeOpenLocal, gradeSubmissionLocal, finalizeCorrection, activityReport,
    approveCertificate, newAccessId, newEnrollment,
  };
});
