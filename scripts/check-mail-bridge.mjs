// Verifica o Apps Script real sem enviar e-mails; não registra chaves ou URLs secretas.
const url=process.env.MAIL_BRIDGE_URL||"";
const token=process.env.MAIL_BRIDGE_TOKEN||"";
const warning=text=>console.log("::warning::Gmail PET Gestão: "+text);
if(!url||!token){
 warning("URL ou chave da ponte não configurada no GitHub.");
}else{
 try{
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({acao:"status",token}),redirect:"follow",signal:AbortSignal.timeout(15000)});
  const body=await r.text();
  let result;
  try{result=JSON.parse(body)}catch{}
  if(r.ok&&result?.ok===true&&result.acao==="status"&&result.servico==="pet-gestao"){
   console.log("Gmail PET Gestão: ponte autenticada. Nenhuma mensagem foi enviada.");
  }else if(result?.codigo==="NAO_AUTORIZADO"||/n[aã]o autorizado|unauthori[sz]ed/i.test(String(result?.erro||result?.error||""))){
   warning("o Apps Script recusou a chave. É necessário alinhar PET_GESTAO_MAIL_TOKEN e MAIL_BRIDGE_TOKEN e publicar a implantação correta.");
  }else if(!result){
   warning("o endereço retornou HTML ou conteúdo não JSON. Confira permissões do aplicativo da Web e a URL /exec.");
  }else{
   warning("o Apps Script atual não confirmou compatibilidade com a ponte PET Gestão. Atualize o script e a URL /exec.");
  }
 }catch{
  warning("não foi possível consultar a ponte Gmail. Confirme a URL e a disponibilidade do Apps Script.");
 }
}
