// PET Gestão — preparação auditável do deploy. Nunca imprime credenciais.
import fs from "node:fs";
import path from "node:path";
const id=(process.env.CLOUDFLARE_ACCOUNT_ID||"").trim();
const token=(process.env.CLOUDFLARE_API_TOKEN||"").trim();
if(!id||!token)throw Error("Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN como GitHub Secrets.");
if(!/^[a-f0-9]{32}$/i.test(id))throw Error("CLOUDFLARE_ACCOUNT_ID deve ser o identificador da conta Cloudflare (32 caracteres hexadecimais), não um link ou ID de banco.");
async function cloudflare(endpoint){
 const response=await fetch("https://api.cloudflare.com/client/v4"+endpoint,{
   headers:{"Authorization":"Bearer "+token,"Accept":"application/json"}});
 const payload=await response.json();
 if(!response.ok||!payload.success){
   const codes=(payload.errors||[]).map(x=>x.code).filter(x=>x!==undefined);
   if(codes.includes(10000)||response.status===401||response.status===403){
     const service=endpoint.includes("/d1/database")?"D1":endpoint.includes("/workers/subdomain")?"Workers":"recurso solicitado";
     throw Error("Cloudflare negou o acesso ao "+service+" (HTTP "+response.status+", códigos "+codes.join(",")+"). Confira em GitHub → Settings → Secrets and variables → Actions: CLOUDFLARE_API_TOKEN (token válido, não ID de token nem Global API Key), CLOUDFLARE_ACCOUNT_ID (conta correta) e permissões da mesma conta: D1 Write/Edit para migrações e Workers Scripts Write/Editor para publicação. Confira também restrições de IP e validade do token. Não compartilhe credenciais em conversas nem commits.");
   }
   throw Error("Cloudflare falhou ao consultar "+(endpoint.includes("/d1/database")?"D1":"Workers")+" (HTTP "+response.status+", códigos "+codes.join(",")+"). Verifique o painel da Cloudflare.");
 }
 return payload.result;
}
let databases=[];
for(let page=1;page<=10;page++){
 const r=await cloudflare("/accounts/"+encodeURIComponent(id)+"/d1/database?per_page=100&page="+page);
 databases=databases.concat(Array.isArray(r)?r:r?.result||[]);
 if(!Array.isArray(r)||r.length<100)break;
}
const db=databases.find(x=>x.name==="pet-gestao-db");
if(!db)throw Error("Banco pet-gestao-db não encontrado na conta. Confirme o token D1 e o nome.");
let apiBaseUrl=process.env.PET_GESTAO_API_URL||"";
if(!apiBaseUrl){
 const result=await cloudflare("/accounts/"+encodeURIComponent(id)+"/workers/subdomain");
 if(!result?.subdomain)throw Error("Subdomínio workers.dev indisponível. Configure a variável PET_GESTAO_API_URL no repositório.");
 apiBaseUrl="https://pet-gestao."+result.subdomain+".workers.dev";
}
if(!/^https:\/\/[a-z0-9.-]+$/i.test(apiBaseUrl))throw Error("PET_GESTAO_API_URL não é uma URL https válida.");
const config={
 name:"pet-gestao",
 main:"worker/src/index.js",
 compatibility_date:"2026-11-09",
 d1_databases:[{binding:"DB",database_name:"pet-gestao-db",database_id:db.uuid||db.id,migrations_dir:"worker/migrations"}],
 triggers:{crons:["*/5 * * * *"]},
 vars:{PUBLIC_SITE_URL:"https://peteducacao.github.io/pet-gestao/"}
};
fs.writeFileSync("wrangler.json",JSON.stringify(config,null,2));
const out="_site";
fs.mkdirSync(out,{recursive:true});
for(const file of ["index.html","styles.css","live.css","app-live.js"]){
 fs.copyFileSync(file,path.join(out,file));
}
fs.cpSync("assets",path.join(out,"assets"),{recursive:true});
fs.copyFileSync("site.webmanifest",path.join(out,"site.webmanifest"));
fs.writeFileSync(path.join(out,"config.js"),"window.PET_GESTAO_CONFIG=Object.freeze("+JSON.stringify({apiBaseUrl,appName:"PET Gestão",demoMode:false,locale:"pt-BR"})+");\n");
fs.writeFileSync("api-url.txt",apiBaseUrl+"\n");
console.log("D1 encontrado; Worker configurado; site preparado para "+new URL(apiBaseUrl).host);
