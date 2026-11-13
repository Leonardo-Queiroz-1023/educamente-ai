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
  const VERSAO = 3; // muda quando a semente muda: o navegador recria os dados de demonstração
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
  // Público: ensino fundamental II (6º ao 9º ano, nível EF) e ensino médio (1ª a 3ª série, nível EM).
  // Cada matéria diz em quais níveis existe: o médio troca Ciências por Física, Química e Biologia
  // e ganha Filosofia e Sociologia.
  const MATERIAS = [
    ['por', 'Língua Portuguesa', ['EF', 'EM']], ['mat', 'Matemática', ['EF', 'EM']], ['cie', 'Ciências', ['EF']],
    ['fis', 'Física', ['EM']], ['qui', 'Química', ['EM']], ['bio', 'Biologia', ['EM']],
    ['his', 'História', ['EF', 'EM']], ['geo', 'Geografia', ['EF', 'EM']], ['fil', 'Filosofia', ['EM']], ['soc', 'Sociologia', ['EM']],
    ['ing', 'Inglês', ['EF', 'EM']], ['art', 'Arte', ['EF', 'EM']], ['edf', 'Educação Física', ['EF', 'EM']],
  ];
  const SERIES = {
    EF: ['6º ano', '7º ano', '8º ano', '9º ano'],
    EM: ['1ª série', '2ª série', '3ª série'],
  };
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
  const NOMES_T4 = ['Fernanda Queiroz Leal', 'Gustavo Pacheco Rios', 'Júlia Tavares Bastos', 'Lucas Moreira Sales', 'Manuela Farias Couto', 'Pedro Henrique Lacerda'];
  // 6º ano: transição dos anos iniciais para os finais.
  const PLANOS_6 = {
    por: [['Leitura de contos e lendas', 'Classes de palavras'], ['Notícia: estrutura e leitura crítica', 'Pontuação e discurso direto'], ['Poema e linguagem figurada', 'Acentuação gráfica'], ['Relato pessoal', 'Revisão e reescrita']],
    mat: [['Sistema de numeração decimal', 'Operações com números naturais'], ['Múltiplos e divisores', 'Frações: equivalência e comparação'], ['Números decimais e porcentagem', 'Problemas com as quatro operações'], ['Figuras geométricas planas', 'Perímetro e área']],
    cie: [['Misturas e separação de materiais', 'Transformações químicas do dia a dia'], ['Célula como unidade da vida', 'Níveis de organização dos seres vivos'], ['Sistema nervoso e sentidos', 'Lentes e visão'], ['Forma e estrutura da Terra', 'Movimentos da Terra']],
    his: [['Tempo histórico e fontes', 'Origem da humanidade'], ['Povos da América antes de 1500', 'Antiguidade: Egito e Mesopotâmia'], ['Grécia Antiga', 'Roma Antiga'], ['Mundo medieval', 'Feudalismo']],
    geo: [['Paisagem e lugar', 'Orientação e coordenadas'], ['Cartografia: escala e legenda', 'Relevo e hidrografia'], ['Clima e vegetação', 'Ciclo da água'], ['Campo e cidade', 'Atividades econômicas']],
    ing: [['Greetings and introductions', 'Verb to be'], ['Family and routines', 'Simple present'], ['School and objects', 'There is / there are'], ['Hobbies and free time', 'Can and can not']],
    art: [['Elementos da linguagem visual', 'Cor e forma'], ['Arte indígena e africana', 'Padrões e grafismos'], ['Teatro: jogos de improviso', 'Expressão corporal'], ['Música: ritmo e pulsação', 'Mostra de trabalhos']],
    edf: [['Jogos cooperativos', 'Brincadeiras populares'], ['Esportes de marca', 'Atletismo: corridas e saltos'], ['Ginástica geral', 'Equilíbrio e coordenação'], ['Danças regionais', 'Festival de jogos']],
  };
  // Ensino médio, 1ª série.
  const PLANOS_EM = {
    por: [['Literatura: Trovadorismo e Humanismo', 'Variação linguística'], ['Classicismo e Barroco', 'Gêneros argumentativos'], ['Arcadismo', 'Coesão e coerência'], ['Redação no modelo do Enem', 'Proposta de intervenção']],
    mat: [['Conjuntos numéricos', 'Função afim'], ['Função quadrática', 'Inequações'], ['Função exponencial', 'Logaritmos'], ['Progressões aritméticas e geométricas', 'Estatística básica']],
    fis: [['Grandezas e unidades', 'Movimento uniforme'], ['Movimento uniformemente variado', 'Queda livre'], ['Leis de Newton', 'Força de atrito'], ['Trabalho e energia', 'Conservação da energia']],
    qui: [['Matéria e suas propriedades', 'Separação de misturas'], ['Modelos atômicos', 'Tabela periódica'], ['Ligações químicas', 'Polaridade'], ['Funções inorgânicas', 'Reações químicas']],
    bio: [['Origem da vida', 'Bioquímica celular'], ['Citologia: membrana e organelas', 'Metabolismo energético'], ['Divisão celular', 'Ácidos nucleicos'], ['Ecologia: cadeias e teias', 'Ciclos biogeoquímicos']],
    his: [['Pré-história e primeiras civilizações', 'Antiguidade clássica'], ['Idade Média', 'Islã e Império Bizantino'], ['Renascimento e Reformas', 'Expansão marítima'], ['Brasil colonial', 'Escravidão e resistência']],
    geo: [['Cartografia e geotecnologias', 'Escalas e projeções'], ['Estrutura geológica e relevo', 'Climas do mundo'], ['Domínios morfoclimáticos do Brasil', 'Recursos hídricos'], ['Questões ambientais', 'Desenvolvimento sustentável']],
    fil: [['O que é filosofia', 'Mito e logos'], ['Filósofos pré-socráticos', 'Sócrates e os sofistas'], ['Platão', 'Aristóteles'], ['Ética: introdução', 'Argumentação e lógica']],
    soc: [['O que é sociologia', 'Indivíduo e sociedade'], ['Cultura e identidade', 'Etnocentrismo e relativismo'], ['Instituições sociais', 'Socialização'], ['Desigualdade social', 'Cidadania e direitos']],
    ing: [['Reading strategies: skimming and scanning', 'Simple past'], ['Present perfect', 'Vocabulary: technology'], ['Future forms', 'Writing: opinion paragraphs'], ['Conditionals', 'Enem-style reading']],
    art: [['Arte e patrimônio cultural', 'Arte pré-histórica'], ['Arte clássica e renascentista', 'Perspectiva'], ['Música brasileira', 'Linguagem do cinema'], ['Arte contemporânea', 'Projeto de exposição']],
    edf: [['Atividade física e saúde', 'Avaliação física'], ['Esportes coletivos: táticas', 'Regras e arbitragem'], ['Lutas', 'Práticas corporais de aventura'], ['Danças urbanas', 'Festival esportivo']],
  };
  const RESPONSAVEIS = ['Cláudia Souza', 'Marcos Alves', 'Patrícia Lopes', 'Ricardo Moura', 'Sandra Costa', 'Tiago Neves', 'Vanessa Pinto', 'Wagner Dias', 'Aline Melo', 'Roberto Martins', 'Juliana Teixeira', 'Fábio Freitas', 'Renata Prado', 'Sérgio Cunha', 'Mônica Ramos', 'Paulo Lima', 'Helena Reis', 'André Vaz', 'Carolina Brito', 'Rosana Queiroz', 'Eduardo Rios', 'Simone Tavares', 'Leandro Sales', 'Cristina Couto', 'Henrique Lacerda'];

  function seed() {
    const rand = rng(20261113);
    const db = {
      versao: VERSAO,
      escola: { id: 'esc1', nome: 'Escola de Demonstração EducaMente', municipio: 'Recife', anoLetivo: 2026 },
      materias: MATERIAS.map(([id, nome, niveis]) => ({ id, nome, niveis: [...niveis] })),
      coordenadores: [{ id: 'c1', nome: 'Marta Albuquerque', acesso: 'COORD-2026', email: 'coordenacao@escola-demo.invalid' }],
      professores: [
        { id: 'p1', nome: 'Carla Mendes', acesso: 'PRF-K7Q2', email: 'carla@escola-demo.invalid' },
        { id: 'p2', nome: 'Rafael Lima', acesso: 'PRF-M4TX', email: 'rafael@escola-demo.invalid' },
        { id: 'p3', nome: 'Joana Ribeiro', acesso: 'PRF-W9HD', email: 'joana@escola-demo.invalid' },
        { id: 'p4', nome: 'Luciana Pereira', acesso: 'PRF-R3NB', email: 'luciana@escola-demo.invalid' },
        { id: 'p5', nome: 'Eduardo Santana', acesso: 'PRF-B6VZ', email: 'eduardo@escola-demo.invalid' },
      ],
      turmas: [], alunos: [], aulas: [], notas: [], atividades: [], entregas: [], atestados: [], ocorrencias: [], planos: [],
    };
    const prof = { mat: 'p1', cie: 'p1', por: 'p2', ing: 'p2', art: 'p2', his: 'p3', geo: 'p3', edf: 'p3', fis: 'p5', qui: 'p5', bio: 'p5', fil: 'p4', soc: 'p4' };
    const vinculos = (serie, troca = {}) => materiasDaSerie(db, serie).map((m) => ({ materiaId: m.id, professorId: troca[m.id] || prof[m.id] }));
    db.turmas.push({ id: 't1', nome: '9º Ano A', serie: '9º ano', turno: 'Manhã', professores: vinculos('9º ano') });
    db.turmas.push({ id: 't2', nome: '8º Ano B', serie: '8º ano', turno: 'Tarde', professores: vinculos('8º ano') });
    // 6º ano: o responsável ainda pode responder e enviar atividades pelo filho.
    db.turmas.push({ id: 't3', nome: '6º Ano A', serie: '6º ano', turno: 'Manhã', professores: vinculos('6º ano', { por: 'p4' }) });
    db.turmas.push({ id: 't4', nome: '1ª Série A', serie: '1ª série', turno: 'Manhã', professores: vinculos('1ª série') });
    const profDe = (turmaId, m) => db.turmas.find((t) => t.id === turmaId).professores.find((v) => v.materiaId === m)?.professorId || null;

    const usados = new Set(['COORD-2026', 'PRF-K7Q2', 'PRF-M4TX', 'PRF-W9HD', 'PRF-R3NB', 'PRF-B6VZ']);
    const matriculas = new Set();
    let r = 0;
    [['t1', NOMES_T1], ['t2', NOMES_T2], ['t3', NOMES_T3], ['t4', NOMES_T4]].forEach(([turmaId, nomes]) => nomes.forEach((nome) => {
      let acesso;
      do acesso = 'ALU-' + randomPick(rand, 4); while (usados.has(acesso));
      usados.add(acesso);
      let matricula;
      do matricula = String(Math.floor(1e9 + rand() * 9e9)); while (matriculas.has(matricula));
      matriculas.add(matricula);
      db.alunos.push({ id: 'a' + (db.alunos.length + 1), nome, turmaId, acesso, matricula, responsavel: RESPONSAVEIS[r++], email: 'familia' + r + '@escola-demo.invalid', nascimento: turmaId === 't4' ? '2010-0' + (1 + (r % 9)) + '-1' + (r % 9) : turmaId === 't3' ? '2014-0' + (1 + (r % 9)) + '-0' + (1 + (r % 8)) : turmaId === 't1' ? '2011-0' + (1 + (r % 9)) + '-1' + (r % 9) : '2012-0' + (1 + (r % 9)) + '-2' + (r % 8) });
    }));

    // Frequência: 12 semanas, uma aula por matéria por semana.
    db.alunos.forEach((a, i) => {
      const risco = [0.03, 0.12, 0.05, 0.2, 0.02, 0.08, 0.04, 0.15][i % 8];
      materiasDaTurma(db, a.turmaId).forEach(({ id: m }, mi) => {
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
      materiasDaTurma(db, a.turmaId).forEach(({ id: m }, mi) => {
        for (let b = 1; b <= 3; b += 1) {
          const ajuste = (mi % 3 === 1 ? -0.8 : mi % 3 === 2 ? 0.5 : 0) + (b - 2) * 0.3 + (rand() - 0.5) * 1.6;
          const nota = Math.max(0, Math.min(10, Math.round((base + ajuste) * 2) / 2));
          db.notas.push({ alunoId: a.id, materiaId: m, bimestre: b, nota });
        }
      });
    });

    // Plano anual por turma e matéria.
    db.turmas.forEach((t) => materiasDaTurma(db, t.id).forEach(({ id: m }) => db.planos.push({
      id: `pl-${t.id}-${m}`, turmaId: t.id, materiaId: m, professorId: profDe(t.id, m),
      bimestres: planosDaSerie(t.serie)[m].map((conteudos, i) => ({ bimestre: i + 1, conteudos })),
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

    // 6º ano: o responsável pode responder e enviar pelo filho.
    db.atividades.push({
      id: 'atv3', turmaId: 't3', materiaId: 'mat', professorId: 'p1', titulo: 'Frações equivalentes',
      instrucoes: 'Responda com calma. Pode usar desenhos para pensar.', publicadaEm: '2026-11-11', prazo: '2026-11-28',
      questoes: [
        { tipo: 'objetiva', enunciado: 'Qual fração é equivalente a 1/2?', alternativas: ['2/3', '3/6', '1/4', '2/5'], correta: 1, pontos: 3 },
        { tipo: 'objetiva', enunciado: 'Qual fração é maior?', alternativas: ['3/4', '2/3', '1/2', '3/5'], correta: 0, pontos: 3 },
        { tipo: 'dissertativa', enunciado: 'Ana comeu 2 de 8 pedaços de um bolo. Que fração do bolo ela comeu? Escreva também a fração simplificada e explique como pensou.', respostaEsperada: 'Ela comeu 2/8 do bolo. Dividindo numerador e denominador por 2, a fração simplificada é 1/4.', palavrasChave: ['2/8', '1/4', 'dividindo'], pontos: 4 },
      ],
    });

    // Ensino médio: Física da 1ª série.
    db.atividades.push({
      id: 'atv4', turmaId: 't4', materiaId: 'fis', professorId: 'p5', titulo: 'Movimento uniforme',
      instrucoes: 'Nas dissertativas, mostre as contas.', publicadaEm: '2026-11-12', prazo: '2026-11-26',
      questoes: [
        { tipo: 'objetiva', enunciado: 'Um carro percorre 180 km em 2 h com velocidade constante. Sua velocidade média é:', alternativas: ['60 km/h', '90 km/h', '120 km/h', '360 km/h'], correta: 1, pontos: 3 },
        { tipo: 'objetiva', enunciado: '72 km/h equivalem a:', alternativas: ['7,2 m/s', '20 m/s', '72 m/s', '259,2 m/s'], correta: 1, pontos: 3 },
        { tipo: 'dissertativa', enunciado: 'Um ciclista parte da posição 10 m com velocidade constante de 5 m/s. Escreva a função horária da posição e calcule a posição em t = 8 s.', respostaEsperada: 'A função horária é s = 10 + 5t. Para t = 8 s, s = 10 + 40 = 50 m.', palavrasChave: ['10 + 5t', '50 m'], pontos: 4 },
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
  /** Número do ano do ensino fundamental ("6º ano" -> 6). Séries do ensino médio devolvem null. */
  function serieNumber(serie) {
    const m = /(\d+)\s*º?\s*ano/i.exec(String(serie ?? ''));
    return m ? Number(m[1]) : null;
  }
  /** Nível da série: "EF" (6º ao 9º ano), "EM" (1ª a 3ª série) ou null. */
  function nivelDaSerie(serie) {
    const s = String(serie ?? '');
    if (/\d+\s*ª?\s*s[ée]rie/i.test(s) || /m[ée]dio/i.test(s)) return 'EM';
    return serieNumber(s) != null ? 'EF' : null;
  }
  /** Matérias da série; sem nível reconhecido, as do fundamental II. */
  function materiasDaSerie(db, serie) {
    const nivel = nivelDaSerie(serie) || 'EF';
    return db.materias.filter((m) => !m.niveis || m.niveis.includes(nivel));
  }
  function materiasDaTurma(db, turmaId) {
    const t = db.turmas.find((x) => x.id === turmaId);
    return t ? materiasDaSerie(db, t.serie) : [];
  }
  function planosDaSerie(serie) {
    if (nivelDaSerie(serie) === 'EM') return PLANOS_EM;
    return serieNumber(serie) === 6 ? PLANOS_6 : PLANOS;
  }
  /* O responsável responde e envia atividades pelo filho só até o 6º ano do fundamental (no médio, nunca). */
  function guardianCanSubmit(db, alunoId) {
    const a = db.alunos.find((x) => x.id === alunoId);
    const t = a && db.turmas.find((x) => x.id === a.turmaId);
    const n = t && nivelDaSerie(t.serie) === 'EF' ? serieNumber(t.serie) : null;
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
  const materiasDoAluno = (db, alunoId) => materiasDaTurma(db, db.alunos.find((a) => a.id === alunoId)?.turmaId);

  function attendanceSummary(db, alunoId) {
    return materiasDoAluno(db, alunoId).map((m) => {
      const aulas = db.aulas.filter((x) => x.alunoId === alunoId && x.materiaId === m.id);
      const c = { P: 0, F: 0, FJ: 0 };
      aulas.forEach((x) => { c[x.status] = (c[x.status] || 0) + 1; });
      // Falta justificada não reduz a frequência (como no diário oficial).
      const freq = aulas.length ? round1(((aulas.length - c.F) / aulas.length) * 100) : null;
      return { materiaId: m.id, materia: m.nome, aulas: aulas.length, P: c.P, F: c.F, FJ: c.FJ, freq };
    });
  }

  function gradeSummary(db, alunoId) {
    return materiasDoAluno(db, alunoId).map((m) => {
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
    LETRAS, VERSAO, ULTIMO_ANO_RESPONSAVEL, SERIES, seed, serieNumber, nivelDaSerie, materiasDaSerie, materiasDaTurma, guardianCanSubmit, normalizeName, authenticate, attendanceSummary, gradeSummary,
    gradeObjective, gradeOpenLocal, gradeSubmissionLocal, finalizeCorrection, activityReport,
    approveCertificate, newAccessId, newEnrollment,
  };
});
