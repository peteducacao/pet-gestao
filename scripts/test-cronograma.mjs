import assert from "node:assert/strict";
import fs from "node:fs";
const code=fs.readFileSync("worker/src/annual-schedule.js","utf8");
const api=await import("data:text/javascript,"+encodeURIComponent(code));
const user={id:"u1",role:"petiano",must_change_password:0};
const noRole={id:"guest",role:"usuario",must_change_password:0};
const admin={id:"adm",role:"admin",session_admin_scope:1,must_change_password:0};
const calls=[];
let scheduleRows=[];
const db={prepare(sql){
 const query={args:[],bind(...args){this.args=args;return this},
  async first(){if(sql.startsWith("SELECT COUNT("))return {n:0};return null},
  async all(){return {results:sql.includes('FROM schedule_entries')?scheduleRows:[]}},
  async run(){calls.push({sql,args:this.args});return {meta:{changes:1}}}};
 return query;
},async batch(rows){for(const row of rows)await row.run();return []}};
await assert.rejects(api.listSchedule(db,null,2026),/Entre/);
await assert.rejects(api.listSchedule(db,noRole,2026),/Somente PETianos/);
await assert.rejects(api.listSchedule(db,user,1999),/Ano inválido/);
assert.deepEqual((await api.listSchedule(db,user,2026)).items,[]);
scheduleRows=[
 {id:"terminada",title:"Atividade antiga",description:"",start_date:"2020-01-01",end_date:"2020-01-01",start_time:"09:00",end_time:"10:00",time_note:null,location:"",completed_at:null},
 {id:"futura",title:"Atividade futura",description:"",start_date:"2099-01-01",end_date:"2099-01-01",start_time:"09:00",end_time:"10:00",time_note:null,location:"",completed_at:"2020-01-01T00:00:00.000Z"}
];
const classified=(await api.listSchedule(db,user,2026)).items;
assert.ok(classified.find(x=>x.id==="terminada").completedAt,"Evento passado conclui sozinho, mesmo sem marcação armazenada.");
assert.equal(classified.find(x=>x.id==="futura").completedAt,null,"Evento futuro não é concluído por marcação manual antiga.");
scheduleRows=[];
const valid={title:"Oficina de fotografia",description:"Formação",startDate:"2026-12-12",endDate:"2026-12-12",startTime:"14:00",endTime:"18:00",location:"Sala do PET"};
const minimal={title:"Atividade com apenas nome e data",startDate:"2026-12-12"};
assert.ok((await api.saveSchedule(db,user,minimal)).id,"Criar evento apenas com nome e início deve funcionar");
const minimalInsert=calls.filter(x=>x.sql.startsWith("INSERT INTO schedule_entries")).at(-1);
assert.equal(minimalInsert.args[4],"2026-12-12","Sem término, a API usa a data inicial como término técnico");
assert.equal(minimalInsert.args[5],null,"Horário inicial não é obrigatório");
assert.equal(minimalInsert.args[6],null,"Horário final não é obrigatório");
assert.ok((await api.saveSchedule(db,user,{...minimal,startTime:"14:00"})).id,
 "Apenas o horário inicial é aceito");
assert.ok((await api.saveSchedule(db,user,{...minimal,endTime:"17:00"})).id,
 "Apenas o horário final é aceito");
await assert.rejects(api.saveSchedule(db,user,{...valid,title:""}),/nome da atividade/);
await assert.rejects(api.saveSchedule(db,user,{...valid,startDate:""}),/período válido/);
await assert.rejects(api.saveSchedule(db,user,{...valid,startTime:"19:00",endTime:"18:00"}),/término deve/);
await assert.rejects(api.saveSchedule(db,user,{...valid,startDate:"2026-02-30"}),/período válido/);
await assert.rejects(api.saveSchedule(db,noRole,valid),/Somente PETianos/);
assert.ok((await api.saveSchedule(db,user,valid)).id,"Nova atividade gerou identificador");
assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO schedule_entries")&&x.args.includes("14:00")&&x.args.includes("18:00")));
assert.equal(typeof api.scheduleCompletion,"undefined","Não existe conclusão manual do cronograma.");
assert.equal((await api.deleteSchedule(db,user,"e")).ok,true);
await assert.rejects(api.quickNavSave(db,noRole,{enabled:true,items:["admin"]}),/permissão/);
await assert.rejects(api.quickNavSave(db,user,{enabled:true,items:["inicio","inicio"]}),/duplicado/);
await assert.rejects(api.quickNavSave(db,user,{enabled:true,items:["inicio","cronograma","demandas","conta","comissoes","reunioes"]}),/1 a 5/);
assert.equal((await api.quickNavSave(db,user,{enabled:false,items:["inicio","cronograma"]})).enabled,true,"Stub retorna padrão após escrita");
await assert.rejects(api.annualReport(db,user,2026),/Administração/);
const report=await api.annualReport(db,admin,2026);
assert.equal(report.months.length,12);
assert.equal(report.demands,0);
await assert.rejects(api.adminOverview(db,user,2026),/Administração/);
await assert.rejects(api.adminOverview(db,admin,1999),/Ano inválido/);
const overviewEmpty=await api.adminOverview(db,admin,2026);
assert.equal(overviewEmpty.userCount,0);
assert.equal(overviewEmpty.commissionCount,0);
assert.equal(overviewEmpty.totals.registered,0);
const testRows={
 commissions:[{id:"videos",name:"Vídeos"},{id:"site",name:"Site"}],
 users:[{id:"u1",name:"Pessoa",role:"petiano"},{id:"u2",name:"Tutoria",role:"tutor"}],
 members:[{commission_id:"videos",user_id:"u1"},{commission_id:"site",user_id:"u1"}],
 tasks:[{id:"d1",registered_at:"2026-11-01",archived_at:"2026-11-19T12:00:00Z",closure_outcome:"concluida",
   completed_late:1,commission_ids:'["videos","site"]',assignee_ids:'["u1"]',
   user_done:'{"u1":{"at":"2026-11-19T11:00:00Z"}}',deadlines:"[]"}]
};
const overviewDb={prepare(sql){return {bind(){return this},
 async all(){return {results:sql.includes("FROM commissions")?testRows.commissions:
  sql.includes("FROM users")?testRows.users:
  sql.includes("FROM commission_members")?testRows.members:
  sql.includes("FROM tasks")?testRows.tasks:[]}},
 async first(){return {n:3}}}}};
const overview=await api.adminOverview(overviewDb,admin,2026);
assert.equal(overview.commissionCount,2);
assert.equal(overview.userCount,2);
assert.equal(overview.activities,3);
assert.equal(overview.totals.registered,1,"Demanda vinculada a duas comissões conta uma vez no total.");
assert.equal(overview.totals.concludedLate,1);
assert.equal(overview.commissions[0].registered,1);
assert.equal(overview.commissions[1].registered,1);
assert.equal(overview.users[0].commissions,2);
assert.equal(overview.users[0].completed,1);
// Contrato entre o identificador interno de Demandas e o seletor único do Cronograma.
const front=fs.readFileSync("app-live.js","utf8");
// A sugestão do botão Lembrar usa o início do evento, e não a hora em que a janela foi aberta.
const remindStart=front.indexOf("const cronReminderSuggestedAt=item=>");
const remindEnd=front.indexOf("// A atividade institucional conclui ao terminar",remindStart);
assert.ok(remindStart>0&&remindEnd>remindStart,"Regra da sugestão deve existir no Cronograma.");
const remindDefault=new Function("reminderLocalValue",front.slice(remindStart,remindEnd)+
 "\nreturn cronReminderSuggestedAt;")(()=>"FUTURO");
assert.equal(remindDefault({startDate:"2099-11-23",startTime:"10:30"}),"2099-11-23T10:30",
 "O lembrete acompanha data e hora exatas do evento.");
assert.equal(remindDefault({date:"2099-11-23",startTime:"15:40"}),"2099-11-23T15:40",
 "Prazos projetados de demandas também podem sugerir a hora cadastrada.");
assert.equal(remindDefault({startDate:"2099-11-23",timeNote:"10h30"}),"2099-11-23T10:30",
 "Registros importados com hora textual recebem sugestão correta.");
assert.equal(remindDefault({startDate:"2099-11-23"}),"2099-11-23T09:00",
 "Sem horário exato, mantém a data do evento e sugere um horário editável.");
assert.equal(remindDefault({startDate:"2001-11-23",startTime:"10:30"}),"FUTURO",
 "Não pré-selecionar um horário já passado.");
const sourceBegin=front.indexOf("const cronEndInstant=entry=>"),sourceEnd=front.indexOf("async function loadCronYear",sourceBegin);
assert.ok(sourceBegin>0&&sourceEnd>sourceBegin,"Cronograma mantém projeção independente das Demandas.");
const projection=new Function("data","state","stages","taskDate","cronIso","taskStatus",front.slice(sourceBegin,sourceEnd)+"\nreturn {source:cronSources(),visible:cronVisible()};");
const today=new Date(),year=today.getFullYear(),month=today.getMonth();
const iso=(y,m,d)=>y+"-"+String(m+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");
const due=iso(year,month,Math.min(today.getDate(),new Date(year,month+1,0).getDate()))+"T16:00:00";
const demand={id:"d-ci",title:"Demanda dentro do cronograma",deadlines:[{id:"p-ci",dueAt:due,label:"Apresentação"}]};
const args=[{tasks:[demand]},{cronItems:[],cronFilter:"demandas",cronYear:year,cronMonth:month},t=>t.deadlines,t=>t.registeredAt,iso,()=> "atrasada"];
const projected=projection(...args);
assert.equal(projected.visible.length,1,"Selecionar Demandas mostra o prazo projetado.");
assert.equal(projected.visible[0].kind,"demandas","Nome interno e seletor devem coincidir.");
assert.equal(projected.visible[0].status,"atrasada","Cronograma respeita atraso vindo de Demandas.");
assert.equal(projected.visible[0].done,false,"Demanda atrasada não pode concluir automaticamente.");
assert.ok(!front.includes('data-do="cron-toggle"'),"Nenhum botão de conclusão manual.");
args[1].cronFilter="cronograma";
assert.equal(projection(...args).visible.length,0,"Filtro Cronograma exclui Demandas.");
args[1].cronFilter="todos";
assert.equal(projection(...args).visible.length,1,"Filtro Todos inclui Demandas.");

console.log("OK: permissões, horário inicial/final, CRUD, atalhos e relatório anual sem dados reais.");
