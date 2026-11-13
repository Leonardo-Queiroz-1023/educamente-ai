// Testes do núcleo do portal da escola. Rode com: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const C = require('../escola-core.js');

test('a semente tem os quatro perfis com credenciais de demonstração', () => {
  const db = C.seed();
  const aluno = db.alunos[0];
  assert.ok(db.coordenadores.length >= 1 && db.professores.length >= 2 && db.alunos.length >= 10);
  assert.deepEqual(C.authenticate(db, 'aluno', { id: aluno.acesso.toLowerCase() }), { role: 'aluno', id: aluno.id });
  assert.deepEqual(C.authenticate(db, 'professor', { id: db.professores[0].acesso }), { role: 'professor', id: db.professores[0].id });
  assert.deepEqual(C.authenticate(db, 'coordenacao', { id: db.coordenadores[0].acesso }), { role: 'coordenacao', id: db.coordenadores[0].id });
  assert.equal(C.authenticate(db, 'aluno', { id: 'NAO-EXISTE' }), null);
});

test('o responsável entra com nome em qualquer caixa, acento ou espaçamento', () => {
  const db = C.seed();
  const a = db.alunos[0];
  const bagunçado = '  ' + C.normalizeName(a.nome).toUpperCase().split(' ').join('   ') + ' ';
  assert.deepEqual(C.authenticate(db, 'responsavel', { nome: bagunçado, matricula: ` ${a.matricula} ` }), { role: 'responsavel', id: a.id });
  assert.equal(C.authenticate(db, 'responsavel', { nome: a.nome, matricula: '0000000000' }), null);
  assert.equal(C.normalizeName('  Ána   BEATRIZ  Souza'), 'ana beatriz souza');
});

test('frequência por matéria conta P, F e FJ e não divide por zero', () => {
  const db = C.seed();
  const a = db.alunos[0];
  db.aulas = [
    { id: 'x1', turmaId: a.turmaId, materiaId: 'mat', alunoId: a.id, data: '2026-09-01', aula: 1, status: 'P' },
    { id: 'x2', turmaId: a.turmaId, materiaId: 'mat', alunoId: a.id, data: '2026-09-02', aula: 1, status: 'F' },
    { id: 'x3', turmaId: a.turmaId, materiaId: 'mat', alunoId: a.id, data: '2026-09-03', aula: 1, status: 'FJ' },
    { id: 'x4', turmaId: a.turmaId, materiaId: 'mat', alunoId: a.id, data: '2026-09-04', aula: 1, status: 'P' },
  ];
  const linhas = C.attendanceSummary(db, a.id);
  const mat = linhas.find((l) => l.materiaId === 'mat');
  assert.deepEqual([mat.aulas, mat.P, mat.F, mat.FJ], [4, 2, 1, 1]);
  assert.equal(mat.freq, 75); // FJ não conta como falta para a frequência
  const semAulas = linhas.find((l) => l.materiaId === 'por');
  assert.equal(semAulas.aulas, 0);
  assert.equal(semAulas.freq, null);
});

test('notas por bimestre: média só com bimestres lançados', () => {
  const db = C.seed();
  const a = db.alunos[0];
  db.notas = [
    { alunoId: a.id, materiaId: 'mat', bimestre: 1, nota: 6 },
    { alunoId: a.id, materiaId: 'mat', bimestre: 2, nota: 8 },
  ];
  const mat = C.gradeSummary(db, a.id).find((l) => l.materiaId === 'mat');
  assert.deepEqual(mat.bimestres, [6, 8, null, null]);
  assert.equal(mat.media, 7);
  assert.equal(C.gradeSummary(db, a.id).find((l) => l.materiaId === 'por').media, null);
});

test('objetiva: certa, errada (registra a alternativa) e em branco', () => {
  const q = { tipo: 'objetiva', enunciado: '2+2', alternativas: ['3', '4', '5'], correta: 1, pontos: 2 };
  assert.deepEqual(C.gradeObjective(q, 1), { correta: true, pontos: 2, erro: null });
  assert.deepEqual(C.gradeObjective(q, 2), { correta: false, pontos: 0, erro: 'Marcou C) 5' });
  assert.deepEqual(C.gradeObjective(q, null), { correta: false, pontos: 0, erro: 'Em branco' });
});

test('dissertativa local: palavras-chave e resposta em branco', () => {
  const q = { tipo: 'dissertativa', enunciado: 'O que é fotossíntese?', palavrasChave: ['luz', 'glicose', 'oxigênio'], pontos: 3 };
  const boa = C.gradeOpenLocal(q, 'A planta usa a LUZ para produzir glicose e libera oxigenio.');
  assert.equal(boa.correta, true);
  assert.equal(boa.pontos, 3);
  const parcial = C.gradeOpenLocal(q, 'Usa luz do sol.');
  assert.equal(parcial.correta, false);
  assert.ok(parcial.pontos > 0 && parcial.pontos < 3);
  assert.ok(parcial.erros.some((e) => /glicose/.test(e)));
  const branco = C.gradeOpenLocal(q, '   ');
  assert.deepEqual([branco.correta, branco.pontos, branco.erros], [false, 0, ['Resposta em branco']]);
});

test('relatório da turma: taxa de acerto por questão e erros recorrentes', () => {
  const db = C.seed();
  const q = [
    { tipo: 'objetiva', enunciado: 'A', alternativas: ['x', 'y'], correta: 0, pontos: 1 },
    { tipo: 'objetiva', enunciado: 'B', alternativas: ['x', 'y'], correta: 1, pontos: 1 },
  ];
  db.atividades = [{ id: 'at', turmaId: 't', materiaId: 'mat', titulo: 'T', questoes: q }];
  const corr = (r) => ({ porQuestao: q.map((qq, i) => { const g = C.gradeObjective(qq, r[i]); return { correta: g.correta, pontos: g.pontos, comentario: '', erros: g.erro ? [g.erro] : [] }; }) });
  db.entregas = [
    { id: 'e1', atividadeId: 'at', alunoId: 'a1', respostas: [0, 0], status: 'corrigida', correcao: corr([0, 0]) },
    { id: 'e2', atividadeId: 'at', alunoId: 'a2', respostas: [0, 0], status: 'corrigida', correcao: corr([0, 0]) },
    { id: 'e3', atividadeId: 'at', alunoId: 'a3', respostas: [1, 1], status: 'corrigida', correcao: corr([1, 1]) },
  ];
  const r = C.activityReport(db, 'at');
  assert.equal(r.entregas, 3);
  assert.equal(Math.round(r.questoes[0].taxaAcerto), 67);
  assert.equal(Math.round(r.questoes[1].taxaAcerto), 33);
  assert.deepEqual(r.questoes[1].errosComuns[0], { erro: 'Marcou A) x', qtd: 2 });
  assert.equal(r.errosRecorrentes[0].qtd, 2);
  assert.equal(Math.round(r.mediaPct), 50);
});

test('relatório sem entregas corrigidas não quebra', () => {
  const db = C.seed();
  const at = db.atividades[0];
  db.entregas = [];
  const r = C.activityReport(db, at.id);
  assert.equal(r.entregas, 0);
  assert.equal(r.mediaPct, null);
  assert.ok(r.questoes.every((x) => x.taxaAcerto === null));
});

test('atestado aprovado converte só as faltas F do período em FJ', () => {
  const db = C.seed();
  const a = db.alunos[0];
  db.aulas = [
    { id: 'f1', turmaId: a.turmaId, materiaId: 'mat', alunoId: a.id, data: '2026-09-10', aula: 1, status: 'F' },
    { id: 'f2', turmaId: a.turmaId, materiaId: 'por', alunoId: a.id, data: '2026-09-11', aula: 1, status: 'F' },
    { id: 'p1', turmaId: a.turmaId, materiaId: 'mat', alunoId: a.id, data: '2026-09-11', aula: 2, status: 'P' },
    { id: 'f3', turmaId: a.turmaId, materiaId: 'mat', alunoId: a.id, data: '2026-09-20', aula: 1, status: 'F' },
    { id: 'o1', turmaId: a.turmaId, materiaId: 'mat', alunoId: 'outro', data: '2026-09-10', aula: 1, status: 'F' },
  ];
  db.atestados = [{ id: 'at1', alunoId: a.id, inicio: '2026-09-10', fim: '2026-09-11', status: 'pendente' }];
  assert.equal(C.approveCertificate(db, 'at1', 'c1'), 2);
  const st = Object.fromEntries(db.aulas.map((x) => [x.id, x.status]));
  assert.deepEqual(st, { f1: 'FJ', f2: 'FJ', p1: 'P', f3: 'F', o1: 'F' });
  assert.equal(db.atestados[0].status, 'aprovado');
  assert.equal(db.atestados[0].avaliadoPor, 'c1');
});

test('responsável envia atividades só até o 6º ano', () => {
  const db = C.seed();
  const anosIniciais = db.alunos.find((a) => db.turmas.find((t) => t.id === a.turmaId).serie === '5º ano');
  const nono = db.alunos.find((a) => a.turmaId === 't1');
  assert.ok(anosIniciais, 'a semente precisa de uma turma até o 6º ano');
  assert.equal(C.guardianCanSubmit(db, anosIniciais.id), true);
  assert.equal(C.guardianCanSubmit(db, nono.id), false);
  assert.equal(C.serieNumber('6º ano'), 6);
  assert.equal(C.serieNumber('1º Ano'), 1);
  assert.equal(C.serieNumber('Turma especial'), null);
  db.turmas.push({ id: 'tx', nome: '6º Ano B', serie: '6º ano', professores: [] }, { id: 'ty', nome: '7º Ano A', serie: '7º ano', professores: [] });
  db.alunos.push({ id: 'x6', turmaId: 'tx' }, { id: 'x7', turmaId: 'ty' });
  assert.equal(C.guardianCanSubmit(db, 'x6'), true);
  assert.equal(C.guardianCanSubmit(db, 'x7'), false);
  assert.equal(C.guardianCanSubmit(db, 'nao-existe'), false);
});

test('a turma de anos iniciais tem atividade aberta para o responsável responder', () => {
  const db = C.seed();
  const t = db.turmas.find((x) => x.serie === '5º ano');
  const at = db.atividades.find((x) => x.turmaId === t.id);
  assert.ok(at && at.prazo >= '2026-11-13');
  assert.ok(db.planos.some((p) => p.turmaId === t.id));
});

test('novos IDs de acesso e matrículas são únicos e no formato', () => {
  const db = C.seed();
  const ids = new Set();
  for (let i = 0; i < 50; i += 1) {
    const id = C.newAccessId(db, 'ALU');
    assert.match(id, /^ALU-[A-HJ-NP-Z2-9]{4}$/);
    ids.add(id);
    db.alunos.push({ id: 'n' + i, acesso: id, matricula: C.newEnrollment(db) });
  }
  assert.equal(ids.size, 50);
  assert.match(db.alunos.at(-1).matricula, /^\d{10}$/);
});
