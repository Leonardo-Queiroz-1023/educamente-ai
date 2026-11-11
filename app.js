(async function () {
  // Aguarda o carregamento inicial dos dados remotos antes de montar a interface.
  try { await window.educamenteSync?.ready; } catch (error) { console.warn(error); }

/* ===== repositório local (trocável por Supabase) ===== */
const Repo={key:"educamente.v2",read(){try{return JSON.parse(localStorage.getItem(this.key))||{}}catch(e){return{}}},write(d){try{localStorage.setItem(this.key,JSON.stringify(d))}catch(e){}}};
const DB=Object.assign({turmas:[],alunos:[],avaliacoes:[],resultados:[],atividades:[],planejamentos:[],settings:{}},Repo.read());
const persist=()=>{Repo.write(DB);window.educamenteSync?.scheduleSync(DB)},uid=()=>crypto.randomUUID();
/* ===== serviços (classes, students, assessments, activities, planning) ===== */
const Svc={
 get:(n,id)=>DB[n].find(x=>x.id===id),
 save(n,o){if(o.id){const i=DB[n].findIndex(x=>x.id===o.id);DB[n][i]={...DB[n][i],...o}}else{o={...o,id:uid(),criadoEm:new Date().toISOString()};DB[n].push(o)}persist();return o},
 remove(n,id){
  const snapshot=JSON.parse(JSON.stringify(DB));
  if(n==="turmas"){
   const studentIds=DB.alunos.filter(a=>a.turmaId===id).map(a=>a.id);
   const assessmentIds=DB.avaliacoes.filter(a=>a.turmaId===id).map(a=>a.id);
   DB.resultados=DB.resultados.filter(r=>!assessmentIds.includes(r.avaliacaoId)&&!studentIds.includes(r.alunoId));
   DB.alunos=DB.alunos.filter(a=>a.turmaId!==id);
   DB.avaliacoes=DB.avaliacoes.filter(a=>a.turmaId!==id);
   DB.atividades=DB.atividades.filter(x=>x.turmaId!==id);
   DB.planejamentos=DB.planejamentos.filter(x=>x.turmaId!==id);
  }
  if(n==="alunos")DB.resultados=DB.resultados.filter(r=>r.alunoId!==id);
  if(n==="avaliacoes")DB.resultados=DB.resultados.filter(r=>r.avaliacaoId!==id);
  DB[n]=DB[n].filter(x=>x.id!==id);
  window.educamenteSync?.scheduleDelete(n,id,snapshot);
  persist()}};
/* ===== análises de desempenho (base para a futura IA) ===== */
const pct=r=>{const a=Svc.get("avaliacoes",r.avaliacaoId);return a&&a.total?r.pontos/a.total*100:null};
const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const res=f=>DB.resultados.filter(f).map(pct).filter(p=>p!=null);
const turmaAvg=id=>avg(res(r=>Svc.get("avaliacoes",r.avaliacaoId)?.turmaId===id)),alunoAvg=id=>avg(res(r=>r.alunoId===id)),avAvg=id=>avg(res(r=>r.avaliacaoId===id));
const groupAvg=(avs,key)=>{const g={};avs.forEach(a=>(g[a[key]]??=[]).push(a.id));return Object.entries(g).map(([l,ids])=>({l,v:avg(res(r=>ids.includes(r.avaliacaoId)))}))};
/* ===== analysesService: pontos de acesso para a futura IA (sem IA nesta versão) ===== */
const AnalysesService={listAssessments:()=>DB.avaliacoes.slice(),
 studentResults:id=>DB.resultados.filter(r=>r.alunoId===id).map(r=>({...r,percentual:pct(r),avaliacao:Svc.get("avaliacoes",r.avaliacaoId)})),
 performanceHistory:id=>AnalysesService.studentResults(id).filter(x=>x.avaliacao).sort((a,b)=>a.avaliacao.data<b.avaliacao.data?-1:1),
 weakestContents:(turmaId,n=3)=>groupAvg(DB.avaliacoes.filter(a=>!turmaId||a.turmaId===turmaId),"conteudo").filter(c=>c.v!=null).sort((a,b)=>a.v-b.v).slice(0,n),
 saveActivity:o=>Svc.save("atividades",{status:"Rascunho",...o})};
const notifs=()=>{const h=new Date().toISOString().slice(0,10),n=[];
 DB.atividades.filter(a=>a.status!=="Concluída"&&a.prazo&&a.prazo<h).forEach(a=>n.push("Atividade com prazo vencido: "+a.titulo));
 DB.avaliacoes.forEach(a=>{const t=DB.alunos.filter(x=>x.turmaId===a.turmaId).length,r=DB.resultados.filter(x=>x.avaliacaoId===a.id).length;if(t&&r<t)n.push(`Resultados pendentes em "${a.nome}" (${r}/${t})`)});return n};
/* ===== utilidades ===== */
const $=id=>document.getElementById(id),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>n==null?"—":(Math.round(n*10)/10).toString().replace(".",",")+"%",dt=d=>d?d.split("-").reverse().join("/"):"—";
const bc=p=>p==null?"pr":p>=70?"":p>=50?"wn":"bad",chipP=p=>`<span class="chip ${p==null?"":p>=70?"ok":p>=50?"wn":"bad"}">${fmt(p)}</span>`;
const nm=(c,id,k="nome")=>Svc.get(c,id)?.[k]??"—";
const bars=it=>it.length?it.map(i=>`<div class="ln"><span>${esc(i.l)}</span><div class="bar ${bc(i.v)}"><i style="width:${i.v||0}%"></i></div><b>${fmt(i.v)}</b></div>`).join(""):'<div class="empty">Sem dados.</div>';
const toast=m=>{$("toast").innerHTML=`<div class="toast">${esc(m)}</div>`;setTimeout(()=>$("toast").innerHTML="",2600)};
const ANOS=["1º ano","2º ano","3º ano","4º ano","5º ano","6º ano","7º ano","8º ano","9º ano"],COMPS=["Matemática","Língua Portuguesa","Ciências","História","Geografia","Arte","Educação Física","Inglês"];
const O=a=>()=>a.map(x=>[x,x]),turmaO=()=>DB.turmas.map(t=>[t.id,t.nome]);
/* ===== módulos (esquemas de formulário, colunas e filtros) ===== */
const ST=["Rascunho","Planejada","Em andamento","Concluída"];
const MOD={
turmas:{t:"Turmas",s:"turma",fields:[{k:"nome",l:"Nome",r:1},{k:"ano",l:"Ano escolar",t:"select",o:O(ANOS),r:1},{k:"turno",l:"Turno",t:"select",o:O(["Manhã","Tarde","Integral"]),r:1},{k:"escola",l:"Escola",r:1},{k:"anoLetivo",l:"Ano letivo",t:"number",min:2000,max:2100,r:1},{k:"descricao",l:"Descrição (opcional)",t:"textarea",w:1}],
 search:["nome","escola"],flt:[["ano","Ano escolar",O(ANOS)]],
 cols:[["Turma",t=>`<b>${esc(t.nome)}</b><br><span class="muted">${esc(t.escola)}</span>`],["Ano",t=>esc(t.ano)],["Turno",t=>esc(t.turno)],["Alunos",t=>DB.alunos.filter(a=>a.turmaId===t.id).length],["Aproveitamento",t=>chipP(turmaAvg(t.id))],["Avaliações",t=>DB.avaliacoes.filter(a=>a.turmaId===t.id).length]]},
alunos:{t:"Alunos",s:"aluno",fields:[{k:"nome",l:"Nome (fictício)",r:1},{k:"turmaId",l:"Turma",t:"select",o:turmaO,r:1},{k:"obs",l:"Observações pedagógicas (opcional)",t:"textarea",w:1}],
 search:["nome"],flt:[["turmaId","Turma",turmaO]],
 cols:[["Aluno",a=>`<b>${esc(a.nome)}</b>`],["Turma",a=>esc(nm("turmas",a.turmaId))],["Ano",a=>esc(nm("turmas",a.turmaId,"ano"))],["Avaliações",a=>DB.resultados.filter(r=>r.alunoId===a.id).length],["Aproveitamento",a=>chipP(alunoAvg(a.id))]]},
avaliacoes:{t:"Avaliações",s:"avaliação",fields:[{k:"nome",l:"Nome da avaliação",r:1},{k:"turmaId",l:"Turma",t:"select",o:turmaO,r:1},{k:"componente",l:"Componente curricular",t:"select",o:O(COMPS),r:1},{k:"conteudo",l:"Conteúdo ou habilidade",r:1},{k:"data",l:"Data",t:"date",r:1},{k:"total",l:"Total de questões ou pontos",t:"number",min:1,r:1},{k:"descricao",l:"Descrição (opcional)",t:"textarea",w:1}],
 search:["nome","conteudo"],flt:[["turmaId","Turma",turmaO],["componente","Componente",O(COMPS)]],
 chk:(o,id)=>id&&DB.resultados.some(r=>r.avaliacaoId===id&&r.pontos>o.total)?{total:"Há resultados acima deste total. Ajuste-os antes."}:{},
 extra:a=>`<button class="ib" data-act="res:${a.id}">Resultados</button>`,
 cols:[["Avaliação",a=>`<b>${esc(a.nome)}</b><br><span class="muted">${esc(a.conteudo)}</span>`],["Turma",a=>esc(nm("turmas",a.turmaId))],["Componente",a=>esc(a.componente)],["Data",a=>dt(a.data)],["Total",a=>a.total],["Registrados",a=>`${DB.resultados.filter(r=>r.avaliacaoId===a.id).length}/${DB.alunos.filter(x=>x.turmaId===a.turmaId).length}`],["Média",a=>chipP(avAvg(a.id))]]},
atividades:{t:"Atividades",s:"atividade",fields:[{k:"titulo",l:"Título",r:1},{k:"turmaId",l:"Turma",t:"select",o:turmaO,r:1},{k:"componente",l:"Componente curricular",t:"select",o:O(COMPS),r:1},{k:"conteudo",l:"Conteúdo",r:1},{k:"tipo",l:"Tipo de atividade",t:"select",o:O(["Exercícios","Questionário","Atividade prática","Revisão","Trabalho","Atividade avaliativa"]),r:1},{k:"status",l:"Status",t:"select",o:O(ST),r:1},{k:"aplicacao",l:"Data de aplicação",t:"date"},{k:"prazo",l:"Prazo",t:"date"},{k:"descricao",l:"Descrição",t:"textarea",w:1},{k:"objetivo",l:"Objetivo pedagógico",t:"textarea",w:1},{k:"habilidade",l:"Habilidade trabalhada",w:1},{k:"instrucoes",l:"Instruções",t:"textarea",w:1},{k:"questoes",l:"Questões ou exercícios",t:"textarea",w:1},{k:"gabarito",l:"Gabarito ou orientação (opcional)",t:"textarea",w:1}],
 search:["titulo","conteudo"],flt:[["turmaId","Turma",turmaO],["componente","Componente",O(COMPS)],["status","Status",O(ST)]],
 chk:o=>o.aplicacao&&o.prazo&&o.prazo<o.aplicacao?{prazo:"O prazo não pode ser anterior à aplicação."}:{},
 cols:[["Atividade",a=>`<b>${esc(a.titulo)}</b><br><span class="muted">${esc(a.conteudo)}</span>`],["Turma",a=>esc(nm("turmas",a.turmaId))],["Componente",a=>esc(a.componente)],["Tipo",a=>esc(a.tipo)],["Aplicação",a=>dt(a.aplicacao)],["Prazo",a=>dt(a.prazo)],["Status",a=>`<span class="chip ${a.status==="Concluída"?"ok":a.status==="Em andamento"?"wn":""}">${esc(a.status)}</span>`]]},
planejamentos:{t:"Planejamento pedagógico",s:"planejamento",fields:[{k:"turmaId",l:"Turma",t:"select",o:turmaO,r:1},{k:"componente",l:"Componente curricular",t:"select",o:O(COMPS),r:1},{k:"conteudo",l:"Conteúdo",r:1},{k:"habilidade",l:"Habilidade"},{k:"avaliacaoId",l:"Avaliação relacionada (opcional)",t:"select",o:()=>DB.avaliacoes.map(a=>[a.id,a.nome])},{k:"inicio",l:"Início",t:"date",r:1},{k:"fim",l:"Fim",t:"date"},{k:"objetivo",l:"Objetivo de aprendizagem",t:"textarea",w:1},{k:"obs",l:"Observações",t:"textarea",w:1}],
 search:["conteudo","objetivo"],flt:[["turmaId","Turma",turmaO],["componente","Componente",O(COMPS)]],
 chk:o=>o.inicio&&o.fim&&o.fim<o.inicio?{fim:"O fim não pode ser anterior ao início."}:{},
 cols:[["Conteúdo",p=>`<b>${esc(p.conteudo)}</b><br><span class="muted">${esc(p.habilidade)}</span>`],["Turma",p=>esc(nm("turmas",p.turmaId))],["Componente",p=>esc(p.componente)],["Período",p=>`${dt(p.inicio)} a ${dt(p.fim)}`],["Objetivo",p=>esc(p.objetivo)]]}
};
/* ===== listagens com busca e filtros ===== */
const FL={};
function rowsOf(m){const M=MOD[m],F=FL[m]||{},q=(F.q||"").toLowerCase();
 return DB[m].filter(r=>(!q||M.search.some(k=>String(r[k]||"").toLowerCase().includes(q)))&&M.flt.every(([k])=>!F[k]||r[k]===F[k])).slice().reverse()}
function tableHtml(m){const M=MOD[m],rows=rowsOf(m);
 if(!rows.length)return`<div class="empty">${DB[m].length?"Nenhum registro encontrado com estes filtros.":`Nenhum(a) ${M.s} cadastrado(a) ainda.`}</div>`;
 return`<div class="tw"><table><tr>${M.cols.map(c=>`<th>${c[0]}</th>`).join("")}<th></th></tr>${rows.map(r=>`<tr>${M.cols.map(c=>`<td>${c[1](r)}</td>`).join("")}<td style="white-space:nowrap">${M.extra?M.extra(r):""}<button class="ib" data-act="view:${m}:${r.id}">Ver</button><button class="ib" data-act="edit:${m}:${r.id}">Editar</button><button class="ib d" data-act="del:${m}:${r.id}">Excluir</button></td></tr>`).join("")}</table></div>`}
function listView(m){const M=MOD[m],F=FL[m]||{};
 return`<div class="top"><div><h1>${M.t}</h1><p class="sub" style="margin:2px 0 0">${DB[m].length} registro(s)</p></div><div>${m==="atividades"?'<span class="chip" title="Será liberada em uma próxima versão">Geração inteligente: em breve</span> ':""}<button class="btn" data-act="new:${m}">+ Nova ${M.s}</button></div></div>
 <div class="card"><div class="flt"><input placeholder="Pesquisar…" data-flt="${m}|q" value="${esc(F.q||"")}">${M.flt.map(([k,l,o])=>`<select data-flt="${m}|${k}"><option value="">${l}: todos</option>${o().map(([a,b])=>`<option value="${esc(a)}" ${F[k]===a?"selected":""}>${esc(b)}</option>`).join("")}</select>`).join("")}</div><div id="tbl">${tableHtml(m)}</div></div>`}
/* ===== modal, formulários e validação ===== */
const openM=h=>$("modal").innerHTML=`<div class="ov"><div class="md">${h}</div></div>`,closeM=()=>$("modal").innerHTML="";
function fieldHtml(f,v){const id="f_"+f.k;let c;
 if(f.t==="select")c=`<select id="${id}"><option value="">Selecione…</option>${f.o().map(([a,b])=>`<option value="${esc(a)}" ${a===v?"selected":""}>${esc(b)}</option>`).join("")}</select>`;
 else if(f.t==="textarea")c=`<textarea id="${id}">${esc(v)}</textarea>`;
 else c=`<input id="${id}" type="${f.t||"text"}" ${f.t==="number"?'step="any"':""} value="${esc(v)}">`;
 return`<div class="${f.w?"full":""}"><label for="${id}">${f.l}${f.r?" *":""}</label>${c}<span class="err" id="e_${f.k}"></span></div>`}
function formM(m,id,pre){const M=MOD[m],r=id?Svc.get(m,id):{status:"Rascunho",anoLetivo:2026,...pre};
 if(m!=="turmas"&&!DB.turmas.length)return openM(`<h2>Cadastre uma turma primeiro</h2><p class="muted">Este registro precisa estar vinculado a uma turma.</p><button class="btn" data-act="close">Entendi</button>`);
 openM(`<h2>${id?"Editar":"Nova"} ${M.s}</h2><div class="fg">${M.fields.map(f=>fieldHtml(f,r[f.k])).join("")}</div><p style="text-align:right;margin:16px 0 0"><button class="btn s" data-act="close">Cancelar</button> <button class="btn" data-act="submit:${m}:${id||""}">Salvar</button></p>`)}
function submit(m,id){const M=MOD[m],o={},er={};
 M.fields.forEach(f=>{let v=$("f_"+f.k).value.trim();
  if(f.r&&!v)er[f.k]="Campo obrigatório.";
  else if(f.t==="number"&&v!==""){v=+v;if(isNaN(v)||v<(f.min??0)||(f.max&&v>f.max))er[f.k]="Informe um valor válido."}
  o[f.k]=v});
 if(!Object.keys(er).length&&M.chk)Object.assign(er,M.chk(o,id));
 document.querySelectorAll(".err").forEach(e=>e.textContent="");Object.entries(er).forEach(([k,t])=>$("e_"+k).textContent=t);
 if(Object.keys(er).length)return;
 if(id){o.id=id;if(m==="avaliacoes"&&Svc.get(m,id).turmaId!==o.turmaId)DB.resultados=DB.resultados.filter(r=>r.avaliacaoId!==id)}
 const sv=Svc.save(m,o);closeM();render();toast("Salvo com sucesso.");if(m==="avaliacoes"&&!id)resM(sv.id)}
/* ===== detalhes ===== */
const show=(f,r)=>f.k==="turmaId"?nm("turmas",r.turmaId):f.k==="avaliacaoId"?nm("avaliacoes",r.avaliacaoId):f.t==="date"?dt(r[f.k]):r[f.k]||"—";
const kv=(m,r)=>`<dl class="kv">${MOD[m].fields.map(f=>`<dt>${f.l.replace(" (opcional)","")}</dt><dd>${esc(show(f,r))}</dd>`).join("")}</dl>`;
const sec=(t,h)=>`<h2 style="margin-top:18px">${t}</h2>${h}`;
const mini=(rows,fn)=>rows.length?`<div class="tw"><table>${rows.map(fn).join("")}</table></div>`:'<p class="muted">Nenhum registro.</p>';
const DET={
 turmas:t=>{const av=DB.avaliacoes.filter(a=>a.turmaId===t.id);return kv("turmas",t)+`<p><b>Aproveitamento médio:</b> ${chipP(turmaAvg(t.id))}</p>`+sec("Alunos",mini(DB.alunos.filter(a=>a.turmaId===t.id),a=>`<tr><td>${esc(a.nome)}</td><td>${chipP(alunoAvg(a.id))}</td><td><button class="ib" data-act="view:alunos:${a.id}">Perfil</button></td></tr>`))+sec("Desempenho por disciplina",bars(groupAvg(av,"componente")))+sec("Avaliações",mini(av,a=>`<tr><td>${esc(a.nome)}</td><td>${dt(a.data)}</td><td>${chipP(avAvg(a.id))}</td><td><button class="ib" data-act="res:${a.id}">Resultados</button></td></tr>`))+sec("Atividades",mini(DB.atividades.filter(x=>x.turmaId===t.id),x=>`<tr><td>${esc(x.titulo)}</td><td>${esc(x.status)}</td></tr>`))},
 alunos:a=>{const rs=DB.resultados.filter(r=>r.alunoId===a.id).map(r=>({r,a:Svc.get("avaliacoes",r.avaliacaoId)})).filter(x=>x.a).sort((x,y)=>x.a.data<y.a.data?-1:1);
  const cont=groupAvg(rs.map(x=>x.a),"conteudo").map(g=>({l:g.l,v:avg(rs.filter(x=>x.a.conteudo===g.l).map(x=>pct(x.r)))}));
  return kv("alunos",a)+`<p><b>Ano escolar:</b> ${esc(nm("turmas",a.turmaId,"ano"))}</p><p><b>Média geral:</b> ${chipP(alunoAvg(a.id))}</p>`+sec("Evolução nas avaliações",rs.length?bars(rs.map(x=>({l:x.a.nome,v:pct(x.r)}))):'<p class="muted">Sem resultados.</p>')+sec("Desempenho por conteúdo",bars(cont))+sec("Histórico",mini(rs,x=>`<tr><td>${esc(x.a.nome)}</td><td>${dt(x.a.data)}</td><td>${x.r.pontos}/${x.a.total}</td><td>${chipP(pct(x.r))}</td><td>${esc(x.r.obs)}</td></tr>`))+sec("Atividades da turma",mini(DB.atividades.filter(x=>x.turmaId===a.turmaId),x=>`<tr><td>${esc(x.titulo)}</td><td>${esc(x.status)}</td></tr>`))},
 avaliacoes:a=>kv("avaliacoes",a)+`<p><b>Média da turma:</b> ${chipP(avAvg(a.id))}</p>`+sec("Resultados",mini(DB.alunos.filter(x=>x.turmaId===a.turmaId),x=>{const r=DB.resultados.find(y=>y.avaliacaoId===a.id&&y.alunoId===x.id);return`<tr><td>${esc(x.nome)}</td><td>${r?`${r.pontos}/${a.total}`:"—"}</td><td>${r?chipP(pct(r)):"—"}</td><td>${esc(r?.obs)}</td></tr>`})),
 atividades:a=>`<p><label>Alterar status</label><select data-qs="${a.id}" style="max-width:220px">${ST.map(s=>`<option ${s===a.status?"selected":""}>${s}</option>`).join("")}</select></p>`+kv("atividades",a),
 planejamentos:p=>kv("planejamentos",p)};
function viewM(m,id){const r=Svc.get(m,id);if(!r)return;openM(`<h2 style="font-size:18px">${esc(r.nome||r.titulo||r.conteudo)}</h2>${DET[m](r)}<p style="text-align:right;margin:16px 0 0"><button class="btn" data-act="close">Fechar</button></p>`)}
/* ===== registro de resultados ===== */
function resM(id){const a=Svc.get("avaliacoes",id),al=DB.alunos.filter(x=>x.turmaId===a.turmaId);
 if(!al.length)return openM(`<h2>${esc(a.nome)}</h2><p class="muted">A turma ainda não tem alunos. Cadastre alunos antes de registrar resultados.</p><button class="btn" data-act="close">Fechar</button>`);
 openM(`<h2>Resultados: ${esc(a.nome)}</h2><p class="muted">Total possível: ${a.total}. Preencha apenas os alunos que fizeram a avaliação; você pode salvar parcialmente.</p><div class="tw"><table><tr><th>Aluno</th><th>Pontuação</th><th>Total</th><th>%</th><th>Observação</th></tr>${al.map(x=>{const r=DB.resultados.find(y=>y.avaliacaoId===id&&y.alunoId===x.id);return`<tr><td>${esc(x.nome)}</td><td><input type="number" min="0" max="${a.total}" step="any" data-pt="${x.id}" data-tot="${a.total}" id="p_${x.id}" value="${r?r.pontos:""}"></td><td>${a.total}</td><td id="c_${x.id}">${r?fmt(pct(r)):"—"}</td><td><input style="width:100%" id="o_${x.id}" value="${esc(r?.obs)}"></td></tr>`}).join("")}</table></div><p class="err" id="reserr"></p><p style="text-align:right;margin:12px 0 0"><button class="btn s" data-act="close">Cancelar</button> <button class="btn" data-act="saveres:${id}">Salvar resultados</button></p>`)}
function saveRes(id){const a=Svc.get("avaliacoes",id),al=DB.alunos.filter(x=>x.turmaId===a.turmaId),out=[];
 for(const x of al){const v=$("p_"+x.id).value.trim();if(v==="")continue;const n=+v;
  if(isNaN(n)||n<0||n>a.total)return $("reserr").textContent=`Pontuação inválida para ${x.nome}: use um valor de 0 a ${a.total}.`;
  out.push({id:DB.resultados.find(r=>r.avaliacaoId===id&&r.alunoId===x.id)?.id||uid(),avaliacaoId:id,alunoId:x.id,pontos:n,obs:$("o_"+x.id).value.trim()})}
 DB.resultados=DB.resultados.filter(r=>r.avaliacaoId!==id).concat(out);persist();closeM();render();toast("Resultados salvos.")}
/* ===== dashboard ===== */
function dash(){
 const all=DB.resultados.map(pct).filter(p=>p!=null),av=DB.avaliacoes;
 const qa=`<div class="card"><h2>Ações rápidas</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="quick:turmas">Nova turma</button><button class="btn s" data-act="quick:alunos">Novo aluno</button><button class="btn s" data-act="quick:avaliacoes">Registrar avaliação</button><button class="btn s" data-act="quick:atividades">Criar atividade</button><button class="btn s" data-act="go:historico">Consultar histórico</button></div></div>`;
 if(!DB.turmas.length)return`<h1>Dashboard</h1><p class="sub">Visão geral da sua atividade pedagógica.</p><div class="card empty"><h2>Comece por aqui</h2><p>Cadastre sua primeira turma, depois os alunos, e registre avaliações para ver indicadores e gráficos.<br>Prefere explorar antes? Carregue dados fictícios de demonstração.</p><button class="btn g" data-act="demo">Carregar dados de demonstração</button></div>`+qa;
 const ord=av.slice().sort((a,b)=>a.data<b.data?-1:1),pts=ord.map(a=>({l:a.nome,v:avAvg(a.id)})).filter(p=>p.v!=null);
 const W=360,H=150,px=i=>pts.length>1?30+i*(W-50)/(pts.length-1):W/2,py=v=>H-25-v/100*(H-45);
 const line=pts.length?`<svg viewBox="0 0 ${W} ${H}" style="width:100%"><g stroke="var(--bd)">${[0,50,100].map(v=>`<line x1="24" x2="${W}" y1="${py(v)}" y2="${py(v)}"/>`).join("")}</g><polyline fill="none" stroke="var(--pr)" stroke-width="2.5" points="${pts.map((p,i)=>px(i)+","+py(p.v)).join(" ")}"/>${pts.map((p,i)=>`<circle cx="${px(i)}" cy="${py(p.v)}" r="4" fill="var(--pr)"/><text x="${px(i)}" y="${py(p.v)-9}" font-size="10" text-anchor="middle" fill="var(--tx)">${Math.round(p.v)}%</text><text x="${px(i)}" y="${H-6}" font-size="9" text-anchor="middle" fill="var(--mt)">${esc(p.l.slice(0,10))}</text>`).join("")}</svg>`:'<div class="empty">Registre resultados para ver a evolução.</div>';
 const bands=[["Abaixo de 50%",p=>p<50,"bad"],["50% a 69%",p=>p>=50&&p<70,"wn"],["70% a 89%",p=>p>=70&&p<90,""],["90% a 100%",p=>p>=90,""]];
 const dist=bands.map(([l,f])=>({l,n:all.filter(f).length}));const mx=Math.max(1,...dist.map(d=>d.n));
 const cont=groupAvg(av,"conteudo").filter(c=>c.v!=null).sort((a,b)=>a.v-b.v).slice(0,4);
 const pend=DB.atividades.filter(a=>a.status!=="Concluída").sort((a,b)=>(a.prazo||"9")<(b.prazo||"9")?-1:1).slice(0,4);
 return`<h1>Dashboard</h1><p class="sub">Visão geral calculada a partir dos seus registros.</p>
 <div class="kp">${[["Turmas",DB.turmas.length],["Alunos",DB.alunos.length],["Avaliações",av.length],["Aproveitamento médio",fmt(avg(all))],["Atividades",DB.atividades.length]].map(([l,v])=>`<div class="card"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
 <div class="g2" style="margin-bottom:16px"><div class="card"><h2>Desempenho por componente</h2>${bars(groupAvg(av,"componente").filter(c=>c.v!=null))}</div><div class="card"><h2>Evolução do desempenho</h2>${line}</div></div>
 <div class="g2" style="margin-bottom:16px"><div class="card"><h2>Distribuição de aproveitamento</h2>${dist.map((d,i)=>`<div class="ln"><span>${d.l}</span><div class="bar ${bands[i][2]}"><i style="width:${d.n/mx*100}%"></i></div><b>${d.n}</b></div>`).join("")}<p class="muted" style="font-size:12px;margin:8px 0 0">Faixas descritivas dos resultados registrados; não são diagnósticos.</p></div>
 <div class="card"><h2>Atenção pedagógica: menores médias por conteúdo</h2>${bars(cont)}</div></div>
 <div class="g2" style="margin-bottom:16px"><div class="card"><h2>Avaliações recentes</h2>${mini(ord.slice(-4).reverse(),a=>`<tr><td>${esc(a.nome)}</td><td>${dt(a.data)}</td><td>${chipP(avAvg(a.id))}</td></tr>`)}</div>
 <div class="card"><h2>Atividades pendentes</h2>${mini(pend,a=>`<tr><td>${esc(a.titulo)}</td><td>${esc(a.status)}</td><td>${dt(a.prazo)}</td></tr>`)}</div></div>`+qa}
/* ===== histórico ===== */
const H={};
function histRows(){const e=[],t=id=>nm("turmas",id);
 DB.avaliacoes.forEach(a=>{e.push({tipo:"Avaliação",d:a.data,t:a.nome,tu:a.turmaId,c:a.componente,x:`${a.conteudo}, média ${fmt(avAvg(a.id))}`});const n=DB.resultados.filter(r=>r.avaliacaoId===a.id).length;if(n)e.push({tipo:"Resultados",d:a.data,t:"Resultados: "+a.nome,tu:a.turmaId,c:a.componente,x:`${n} aluno(s) com resultado`})});
 DB.atividades.forEach(a=>e.push({tipo:"Atividade",d:a.aplicacao||a.criadoEm?.slice(0,10),t:a.titulo,tu:a.turmaId,c:a.componente,x:`${a.tipo}, ${a.status}`}));
 DB.planejamentos.forEach(p=>e.push({tipo:"Planejamento",d:p.inicio,t:p.conteudo,tu:p.turmaId,c:p.componente,x:p.objetivo}));
 DB.alunos.filter(a=>a.obs).forEach(a=>e.push({tipo:"Registro pedagógico",d:a.criadoEm?.slice(0,10),t:a.nome,tu:a.turmaId,c:"",x:a.obs}));
 return e.filter(r=>(!H.tu||r.tu===H.tu)&&(!H.c||r.c===H.c)&&(!H.tipo||r.tipo===H.tipo)&&(!H.de||(r.d||"")>=H.de)&&(!H.ate||(r.d||"")<=H.ate)).sort((a,b)=>(b.d||"")<(a.d||"")?-1:1)}
const histTbl=()=>{const r=histRows();return r.length?`<div class="tw"><table><tr><th>Data</th><th>Tipo</th><th>Registro</th><th>Turma</th><th>Componente</th><th>Detalhe</th></tr>${r.map(x=>`<tr><td>${dt(x.d)}</td><td><span class="chip">${x.tipo}</span></td><td>${esc(x.t)}</td><td>${esc(nm("turmas",x.tu))}</td><td>${esc(x.c)}</td><td>${esc(x.x)}</td></tr>`).join("")}</table></div>`:'<div class="empty">Nenhum registro encontrado.</div>'};
const histView=()=>`<h1>Histórico</h1><p class="sub">Todos os registros pedagógicos em um só lugar.</p><div class="card"><div class="flt"><select data-h="tu"><option value="">Turma: todas</option>${turmaO().map(([a,b])=>`<option value="${a}" ${H.tu===a?"selected":""}>${esc(b)}</option>`).join("")}</select><select data-h="c"><option value="">Componente: todos</option>${COMPS.map(c=>`<option ${H.c===c?"selected":""}>${c}</option>`).join("")}</select><select data-h="tipo"><option value="">Tipo: todos</option>${["Avaliação","Resultados","Atividade","Planejamento","Registro pedagógico"].map(c=>`<option ${H.tipo===c?"selected":""}>${c}</option>`).join("")}</select><div><label>De</label><input type="date" data-h="de" value="${H.de||""}"></div><div><label>Até</label><input type="date" data-h="ate" value="${H.ate||""}"></div></div><div id="htbl">${histTbl()}</div></div>`;
/* ===== configurações e dados de demonstração ===== */
function demoData(){const T="demo_t1",ids=n=>"demo_"+n,c="2026-09-01T10:00:00.000Z";
 DB.turmas.push({id:T,nome:"5º Ano A",ano:"5º ano",turno:"Manhã",escola:"Escola Municipal Exemplo",anoLetivo:2026,descricao:"Turma fictícia de demonstração.",criadoEm:c});
 "ABCDE".split("").forEach((l,i)=>DB.alunos.push({id:ids("a"+i),nome:"Aluno "+l,turmaId:T,obs:i===2?"Participa bem de atividades em grupo (dado fictício).":"",criadoEm:c}));
 const av=[["Multiplicação","2026-09-15",10,[9,4,6,10,3]],["Divisão","2026-10-06",10,[8,5,7,9,4]],["Frações","2026-10-27",20,[16,9,12,18,7]]];
 av.forEach(([n,d,t,s],j)=>{DB.avaliacoes.push({id:ids("v"+j),nome:n,turmaId:T,componente:"Matemática",conteudo:n,data:d,total:t,descricao:"",criadoEm:c});s.forEach((p,i)=>DB.resultados.push({id:ids("r"+j+i),avaliacaoId:ids("v"+j),alunoId:ids("a"+i),pontos:p,obs:""}))});
 [["Lista de exercícios de multiplicação","Multiplicação","Exercícios","Concluída","2026-09-18","2026-09-25"],["Questionário de divisão","Divisão","Questionário","Em andamento","2026-11-09","2026-11-16"],["Revisão de frações","Frações","Revisão","Planejada","2026-11-18","2026-11-20"]].forEach(([titulo,conteudo,tipo,status,aplicacao,prazo],i)=>DB.atividades.push({id:ids("x"+i),titulo,turmaId:T,componente:"Matemática",conteudo,tipo,status,aplicacao,prazo,descricao:"",objetivo:"Praticar "+conteudo.toLowerCase()+".",habilidade:"",instrucoes:"Resolver individualmente, com apoio do professor.",questoes:"1) ...\n2) ...",gabarito:"",criadoEm:c}));
 [["Multiplicação","2026-09-01","2026-09-20"],["Frações","2026-10-15","2026-11-20"]].forEach(([conteudo,inicio,fim],i)=>DB.planejamentos.push({id:ids("p"+i),turmaId:T,componente:"Matemática",conteudo,habilidade:"Resolver problemas com "+conteudo.toLowerCase(),inicio,fim,objetivo:"Consolidar "+conteudo.toLowerCase()+" ao longo do período.",obs:"",criadoEm:c}));
 DB.settings.demo=true;persist()}
function clearDemo(){const d=x=>String(x.id||"").startsWith("demo_")||String(x.turmaId||"").startsWith("demo_");["alunos","avaliacoes","resultados","atividades","planejamentos","turmas"].forEach(k=>DB[k]=DB[k].filter(x=>!d(x)&&!String(x.avaliacaoId||"").startsWith("demo_")));DB.settings.demo=false;persist()}
const cfgView=()=>{const cloud=window.educamenteSync?.state;return `<h1>Configurações</h1><p class="sub">Perfil e armazenamento da EducaMente AI.</p>
<div class="card"><h2>Perfil</h2><dl class="kv"><dt>Professor</dt><dd>${esc(cloud?.teacher?.name||"Conta local")}</dd><dt>Escola</dt><dd>${esc(cloud?.schoolName||DB.turmas[0]?.escola||"—")}</dd><dt>Acesso</dt><dd>${cloud?.authenticated?"Conectado ao Supabase":"Modo local (sem sessão autenticada)"}</dd></dl></div>
<div class="card"><h2>Armazenamento</h2><p class="note">${cloud?.authenticated?"As alterações são sincronizadas com o Supabase. O navegador mantém um cache local de apoio.":"O aplicativo está usando o armazenamento local. Para sincronizar com a nuvem, entre no Supabase pelo importador neste mesmo navegador e recarregue esta página."}</p>
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn g" data-act="demo">Carregar dados fictícios</button><button class="btn s" data-act="cdemo">Limpar dados de demonstração</button><button class="btn d" data-act="call">Apagar dados deste navegador</button></div></div>
<div class="card"><h2>Inteligência artificial</h2><p class="muted" style="margin:0">A sincronização com o banco está preparada. Os agentes de IA ainda não estão ativos nesta versão.</p></div>`};
/* ===== navegação, render e eventos ===== */
const NAV=[["dashboard","Dashboard","▦"],["turmas","Turmas","⌂"],["alunos","Alunos","☺"],["avaliacoes","Avaliações","✔"],["atividades","Atividades","✎"],["planejamentos","Planejamento pedagógico","☷"],["historico","Histórico","↺"],["configuracoes","Configurações","⚙"]];
let view="dashboard";
function render(){const v=NAV.some(n=>n[0]===view)?view:"dashboard";
 $("nav").innerHTML=NAV.map(([k,l,i])=>`<button class="${k===v?"on":""}" data-act="go:${k}"><span>${i}</span><span>${l}</span></button>`).join("");
 $("nb").textContent=notifs().length||"";$("escola").textContent=DB.turmas[0]?.escola||window.educamenteSync?.state?.schoolName||"Escola";
 const professor=window.educamenteSync?.state?.teacher?.name||"Professor";
 if($("profileName"))$("profileName").textContent=professor;
 if($("avatarInitial"))$("avatarInitial").textContent=(professor.trim()[0]||"P").toUpperCase();
 $("main").innerHTML=v==="dashboard"?dash():v==="historico"?histView():v==="configuracoes"?cfgView():listView(v)}
const conf=(msg,act)=>openM(`<h2>Confirmação</h2><p>${msg}</p><p style="text-align:right;margin:16px 0 0"><button class="btn s" data-act="close">Cancelar</button> <button class="btn d" data-act="${act}">Confirmar</button></p>`);
const ACT={
 go:v=>{location.hash=v;document.body.classList.remove("open")},close:closeM,notif(){const n=notifs();openM(`<h2>Notificações</h2>${n.length?"<ul>"+n.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>":'<p class="muted">Nenhuma pendência.</p>'}<p style="text-align:right;margin:16px 0 0"><button class="btn" data-act="close">Fechar</button></p>`)},
 menu(){document.body.classList.toggle(matchMedia("(max-width:900px)").matches?"open":"collapsed")},
 new:m=>formM(m),edit:(m,id)=>formM(m,id),quick(m){location.hash=m;formM(m)},view:viewM,res:resM,submit,saveres:saveRes,
 del:(m,id)=>conf(`Excluir este registro? ${m==="turmas"?"Alunos, avaliações, atividades e planejamentos da turma também serão excluídos.":m==="alunos"||m==="avaliacoes"?"Os resultados vinculados também serão excluídos.":""}`,`del2:${m}:${id}`),
 del2(m,id){Svc.remove(m,id);closeM();render();toast("Registro excluído.")},
 demo(){if(DB.settings.demo||DB.turmas.some(t=>t.id==="demo_t1"))return toast("Os dados de demonstração já foram carregados.");demoData();render();toast("Dados fictícios carregados.")},
 cdemo:()=>conf("Remover apenas os dados fictícios de demonstração?","cdemo2"),cdemo2(){clearDemo();closeM();render();toast("Dados de demonstração removidos.")},
 call:()=>conf("Apagar TODOS os dados armazenados neste navegador?","call2"),call2(){["turmas","alunos","avaliacoes","resultados","atividades","planejamentos"].forEach(k=>DB[k]=[]);DB.settings={};persist();closeM();render();toast("Todos os dados foram apagados.")}};
document.addEventListener("click",e=>{if(e.target.classList.contains("ov"))return closeM();const t=e.target.closest("[data-act]");if(!t)return;const[a,...r]=t.dataset.act.split(":");ACT[a]?.(...r)});
document.addEventListener("input",e=>{const t=e.target,d=t.dataset;
 if(d.flt){const[m,k]=d.flt.split("|");(FL[m]??={})[k]=t.value;$("tbl").innerHTML=tableHtml(m)}
 else if(d.h){H[d.h]=t.value;$("htbl").innerHTML=histTbl()}
 else if(d.pt){const n=parseFloat(t.value);$("c_"+d.pt).textContent=t.value!==""&&n>=0&&n<=+d.tot?fmt(n/d.tot*100):t.value===""?"—":"inválido"}});
document.addEventListener("change",e=>{const t=e.target;if(t.dataset.qs){const a=Svc.get("atividades",t.dataset.qs);a.status=t.value;persist();render();toast("Status atualizado.")}});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeM()});
function route(){view=location.hash.slice(1)||"dashboard";render()}
addEventListener("hashchange",route);route();

})();
