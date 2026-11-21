import assert from "node:assert/strict";
import fs from "node:fs";
const code=fs.readFileSync("worker/src/annual-schedule.js","utf8");
const api=await import("data:text/javascript,"+encodeURIComponent(code));
const user={id:"u1",role:"petiano",must_change_password:0};
const noRole={id:"guest",role:"usuario",must_change_password:0};
const admin={id:"adm",role:"admin",session_admin_scope:1,must_change_password:0};
const calls=[];
const db={prepare(sql){
 const query={args:[],bind(...args){this.args=args;return this},
  async first(){if(sql.startsWith("SELECT COUNT("))return {n:0};return null},
  async all(){return {results:[]}},
  async run(){calls.push({sql,args:this.args});return {meta:{changes:1}}}};
 return query;
},async batch(rows){for(const row of rows)await row.run();return []}};
await assert.rejects(api.listSchedule(db,null,2026),/Entre/);
await assert.rejects(api.listSchedule(db,noRole,2026),/Somente PETianos/);
await assert.rejects(api.listSchedule(db,user,1999),/Ano inválido/);
assert.deepEqual((await api.listSchedule(db,user,2026)).items,[]);
const valid={title:"Oficina de fotografia",description:"Formação",startDate:"2026-12-12",endDate:"2026-12-12",startTime:"14:00",endTime:"18:00",location:"Sala do PET"};
await assert.rejects(api.saveSchedule(db,user,{...valid,startTime:"14:00",endTime:null}),/início e término/);
await assert.rejects(api.saveSchedule(db,user,{...valid,startTime:"19:00",endTime:"18:00"}),/término deve/);
await assert.rejects(api.saveSchedule(db,user,{...valid,startDate:"2026-02-30"}),/período válido/);
await assert.rejects(api.saveSchedule(db,noRole,valid),/Somente PETianos/);
assert.ok((await api.saveSchedule(db,user,valid)).id,"Nova atividade gerou identificador");
assert.ok(calls.some(x=>x.sql.startsWith("INSERT INTO schedule_entries")&&x.args.includes("14:00")&&x.args.includes("18:00")));
await assert.rejects(api.scheduleCompletion(db,user,"e", "sim"),/inválido/);
assert.equal((await api.scheduleCompletion(db,user,"e",true)).ok,true);
assert.equal((await api.deleteSchedule(db,user,"e")).ok,true);
await assert.rejects(api.quickNavSave(db,noRole,{enabled:true,items:["admin"]}),/permissão/);
await assert.rejects(api.quickNavSave(db,user,{enabled:true,items:["inicio","inicio"]}),/duplicado/);
await assert.rejects(api.quickNavSave(db,user,{enabled:true,items:["inicio","cronograma","demandas","conta","comissoes","reunioes"]}),/1 a 5/);
assert.equal((await api.quickNavSave(db,user,{enabled:false,items:["inicio","cronograma"]})).enabled,true,"Stub retorna padrão após escrita");
await assert.rejects(api.annualReport(db,user,2026),/Administração/);
const report=await api.annualReport(db,admin,2026);
assert.equal(report.months.length,12);
assert.equal(report.demands,0);
console.log("OK: permissões, horário inicial/final, CRUD, atalhos e relatório anual sem dados reais.");
