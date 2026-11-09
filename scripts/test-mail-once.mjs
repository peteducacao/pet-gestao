// Teste pontual e autorizado de Gmail, apenas para o e-mail administrativo.
// Este programa roda no GitHub Actions com os segredos; nunca imprime os valores.
const env=process.env;
const url=env.MAIL_BRIDGE_URL||"",token=env.MAIL_BRIDGE_TOKEN||"",to=env.ADMIN_EMAIL||"";
if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)||token.length<32||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)){
 console.error("Dados de teste do Gmail ausentes ou mal configurados.");
 process.exitCode=1;
}else{
 const post=async payload=>{
  const res=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({...payload,token}),redirect:"follow",signal:AbortSignal.timeout(20000)});
  const raw=await res.text();let result;
  try{result=JSON.parse(raw)}catch{throw Error("Ponte Gmail retornou resposta não JSON.");}
  if(!res.ok||result.ok!==true||result.servico!=="pet-gestao")throw Error("Ponte recusou solicitação (código: "+String(result.codigo||res.status||"desconhecido").slice(0,55)+").");
  return result;
 };
 try{
  const status=await post({acao:"status"});
  if(status.acao!=="status")throw Error("Status da integração não foi confirmado.");
  console.log("Autorização com Gmail confirmada, enviando 1 mensagem de teste.");
  const sent=await post({
   acao:"enviar",tipo:"imediato",para:[to],
   assunto:"PET Gestão — teste de integração Gmail",
   mensagem:"Olá!\n\nEste é um e-mail de teste autorizado para confirmar a integração do PET Gestão com o Gmail.\n\nSe você recebeu esta mensagem, a ponte de envio está funcionando.\n\nPET Educação — UFS",
   anexos:[]
  });
  if(sent.acao!=="enviar"||sent.aceito!==true)throw Error("A ponte não confirmou a aceitação da mensagem.");
  console.log("TESTE GMAIL APROVADO: 1 mensagem aceita pela ponte PET Gestão. Verifique a caixa de entrada do e-mail administrativo. Nenhum outro endereço foi utilizado.");
 }catch(error){
  console.error("TESTE GMAIL FALHOU: "+error.message);
  process.exitCode=1;
 }
}
