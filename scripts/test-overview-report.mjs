import assert from "node:assert/strict";
import fs from "node:fs";

// Dados inteiramente sintéticos: testa contagem única e permissão sem consultar produção.
const code=fs.readFileSync("worker/src/annual-schedule.js","utf8");
const api=await import("data:text/javascript,"+encodeURIComponent(code));
const administrator={id:"admin",role:"admin",session_admin_scope:1,must_change_password:0};
const nonAdmin={id:"p1",role:"petiano",must_change_password:0};
const sampleTasks=[
 {id:"t1",commission_ids:'["a","b"]',archived_at:null,closure_outcome:null},
 {id:"t2",commission_ids:'["a"]',archived_at:"2026-08-01",closure_outcome:"concluida"},
 {id:"t3",commission_ids:"[]",archived_at:"2026-09-01",closure_outcome:"nao_concluida"},
 {id:"t4",commission_ids:'["b"]',archived_at:null,closure_outcome:null}
];
const calls=[];
const db={prepare(sql){
 return {
  args:[],bind(...args){this.args=args;return this},
  async first(){
   calls.push({sql,args:this.args});
   if(sql.includes("FROM tasks"))return {n:4};
   if(sql.includes("FROM schedule_entries"))return {n:5};
   if(sql.includes("FROM meetings"))return {n:3};
   if(sql.includes("FROM email_queue"))return {n:6};
   return {n:0};
  },
  async all(){
   calls.push({sql,args:this.args});
   if(sql.includes("FROM commissions ORDER BY"))return {results:[{id:"a",name:"Vídeos"},{id:"b",name:"Cards"}]};
   if(sql.includes("FROM commission_members"))return {results:[
    {commission_id:"a",user_id:"p1"},{commission_id:"b",user_id:"p1"},
    {commission_id:"b",user_id:"p2"}]};
   if(sql.includes("SELECT role,role_override FROM users"))return {results:[
    {role:"admin",role_override:null},{role:"petiano",role_override:null},
    {role:"petiano",role_override:null},{role:"petiano",role_override:"tutor"}]};
   if(sql.includes("FROM tasks WHERE substr(registered_at,1,4)"))return {results:sampleTasks};
   if(sql.includes("SELECT substr(registered_at"))return {results:[{m:"11",n:4}]};
   if(sql.includes("SELECT substr(start_date"))return {results:[{m:"11",n:5}]};
   return {results:[]};
  }
 };
}};
await assert.rejects(api.adminOverviewReport(db,nonAdmin,2026),/Administração/);
await assert.rejects(api.adminOverviewReport(db,administrator,1999),/Ano inválido/);
const result=await api.adminOverviewReport(db,administrator,2026);
assert.equal(result.year,2026);
assert.equal(result.users,4,"Usuários distintos, não posições em comissões.");
assert.equal(result.commissionCount,2);
assert.equal(result.activeMembers,2,"Pessoa em duas comissões só é contada uma vez.");
assert.equal(result.demands,4,"Não duplica demanda associada a várias equipes.");
assert.equal(result.demandsWithoutCommission,1);
assert.equal(result.concluded,1);
assert.equal(result.pending,2);
assert.equal(result.notConcluded,1);
assert.equal(result.activities,5);
assert.equal(result.meetings,3);
assert.equal(result.emails,6);
assert.equal(result.roles.tutor,1);
assert.equal(result.roles.petiano,2);
assert.equal(result.roles.admin,1);
assert.equal(result.commissions.find(c=>c.id==="a").demands,2);
assert.equal(result.commissions.find(c=>c.id==="b").demands,2);
assert.equal(result.commissions.reduce((n,c)=>n+c.demands,0),4,
 "Soma das comissões inclui demanda compartilhada; total global continua 4.");
assert.equal(result.months.length,12);
assert.ok(calls.some(x=>x.args.includes("2026")),"O filtro de ano chega às consultas.");
assert.ok(calls.every(x=>x.sql.trim().startsWith("SELECT")),"Relatório somente leitura.");
console.log("OK: visão geral Admin, usuários únicos, todas as comissões, período e indicadores.");
