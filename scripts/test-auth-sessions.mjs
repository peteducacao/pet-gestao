// Testes de sessão do PET Gestão sem acessar contas, e-mails ou banco de produção.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const worker=fs.readFileSync("worker/src/index.js","utf8");
const front=fs.readFileSync("app-live.js","utf8");

// Exercitar a implementação real do emissor de sessões com banco simulado.
const start=worker.indexOf("  async function createSession(");
const end=worker.indexOf("  async function resetRate(",start);
assert.ok(start>=0&&end>start,"Não foi possível localizar createSession");
const commands=[];
const mockDb={
  prepare(sql){return{bind(...params){return{async run(){commands.push({sql,params})}}}}}
};
const context={
  randomToken:()=>"token-de-teste",
  sha:async()=>"hash-de-teste",
  now:()=>"2026-11-10T00:00:00.000Z",
  isoAfter:minutes=>"expira-em-"+minutes+"-minutos",
  userPublic:user=>({id:user.id,role:user.role}),
};
vm.createContext(context);
vm.runInContext(worker.slice(start,end)+"\nthis.makeSession=createSession;",context);
const admin={id:"admin-test",role:"admin"};
const petiano={id:"member-test",role:"petiano"};
const permanent=await context.makeSession(mockDb,admin,true,true);
assert.equal(permanent.expiresAt,"9999-12-31T23:59:59.999Z");
assert.equal(permanent.user.adminSession,true);
assert.equal(commands.at(-1).params.at(-2),1);
const temporary=await context.makeSession(mockDb,petiano,false,false);
assert.equal(temporary.expiresAt,"expira-em-10080-minutos");
assert.equal(temporary.user.adminSession,false);
assert.equal(commands.at(-1).params.at(-2),0);
const sharedBrowser="b31a4111-9999-4333-8aaa-123456789abc";
const priorOps=commands.length;
await context.makeSession(mockDb,admin,true,true,sharedBrowser);
assert.equal(commands.length,priorOps+2,"Substituir login no mesmo navegador revoga sessão anterior");
assert.ok(commands.at(-2).sql.includes("DELETE FROM sessions WHERE browser_id"));
assert.equal(commands.at(-1).params.at(-1),sharedBrowser);


// Ao reabrir, o token persistido tem prioridade sobre uma sessão temporária antiga.
const match=front.match(/^const readSessionToken=.*;$/m);
assert.ok(match,"Função de recuperação de sessão ausente");
const storageContext={
  tokenKey:"pet-gestao:session-token",
  localStorage:{getItem:()=>"persistente"},
  sessionStorage:{getItem:()=>"temporario"},
};
vm.createContext(storageContext);
vm.runInContext(match[0]+"\nthis.saved=readSessionToken('pet-gestao:session-token');",storageContext);
assert.equal(storageContext.saved,"persistente");
// Sem permanência, a aba nova lê a mesma sessão temporária do navegador.
const temporaryTab={
 tokenKey:"pet-gestao:session-token",
 localStorage:{getItem:()=>null},
 sessionStorage:{getItem:()=>null},
 readSessionCookie:()=>"token-temporario-compartilhado"
};
vm.createContext(temporaryTab);
vm.runInContext(match[0]+"\nthis.saved=readSessionToken('pet-gestao:session-token');",temporaryTab);
assert.equal(temporaryTab.saved,"token-temporario-compartilhado");

// A tela pública não anuncia a existência da Administração.
const login=front.slice(front.indexOf("function renderLogin(){"),front.indexOf("function passwordStrength(password){"));
assert.ok(login.includes("Digite seu e-mail"));
assert.ok(login.includes("Manter-me conectado"));
assert.ok(login.includes("até você sair da conta"));
assert.ok(!/\badmin\b|painel administrativo|30 dias/i.test(login),"Login público expõe Administração ou prazo antigo");
assert.ok(front.includes('const adminVisible=adminRole(me)&&!me.mustChangePassword;'),"Painel Admin deve ser restrito ao cargo autorizado");
assert.ok(front.includes('cancelLabel:"Salvar sem enviar"'),"Salvar sem enviar não pode ser confundido com Cancelar");
assert.ok(front.includes('confirmLabel:"Salvar e enviar"'),"Salvar e enviar é opção explícita");
assert.ok(front.includes('noticeAutoCloseTimer=setTimeout(()=>closeNotice(false),3000)'),"Avisos informativos fecham após 3s");
assert.ok(front.includes('data-do="mail-toggle-schedule"'),"Agendamento usa botão, não checkbox");
assert.ok(front.includes('class="demand-header-actions"'),"Excluir fica ao lado de Registrar");
assert.ok(!front.includes('["geral","Geral"]'),"Filtro Geral foi removido");
console.log("Sessões, e-mails, avisos, agendamento e filtro simplificado: OK.");


// Avaliação de força: apenas um aviso no navegador, sem mínimo de 10 caracteres.
const strengthBegin=front.indexOf("function passwordStrength(password){");
const strengthEnd=front.indexOf("function passwordStrengthMarkup(){",strengthBegin);
assert.ok(strengthBegin>=0&&strengthEnd>strengthBegin,"Indicador de força de senha presente");
const meterContext={};
vm.createContext(meterContext);
vm.runInContext(front.slice(strengthBegin,strengthEnd)+"\nthis.passwordStrength=passwordStrength;",meterContext);
assert.equal(meterContext.passwordStrength("1234").level,0,"1234 deve alertar como muito fraca");
assert.equal(meterContext.passwordStrength("7").level,0,"Senha de um caractere permitida com aviso");
assert.equal(meterContext.passwordStrength("Vento!Correnteza76").level,3,"Senha complexa tem avaliação forte");
assert.ok(front.includes('confirmLabel:"Continuar mesmo assim"'),"Senha fraca permite continuar após confirmação");
assert.ok(!/minlength=["']10/.test(front.slice(front.indexOf("function renderRegisterAccount()"),front.indexOf("function renderForgot()"))),"Cadastro não exige 10 caracteres");
console.log("Força de senha e confirmação de senha fraca: OK.");

// Confirmação no novo endereço: interface não muda o e-mail local antes da validação.
assert.ok(front.includes('data-do="account-email-toggle"'),"O perfil oferece alteração de e-mail");
assert.ok(front.includes('id="change-email-form"'),"Há formulário para novo endereço");
assert.ok(front.includes('data-do="confirm-account-email"'),"O link pede confirmação por clique");
assert.ok(front.includes('Carregando painel administrativo...'),"A entrada na Administração tem carregamento");
console.log("Troca de e-mail e carregamento de Administração: estrutura presente.");
