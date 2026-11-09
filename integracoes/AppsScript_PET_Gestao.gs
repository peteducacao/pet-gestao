/**
 * PET Gestão · Ponte própria de e-mail para Google Apps Script.
 * Configure em Configurações do projeto → Propriedades do script:
 * PET_GESTAO_MAIL_TOKEN = mesmo segredo MAIL_BRIDGE_TOKEN no Cloudflare Worker.
 *
 * Implantar como aplicativo da Web, executado por você e acessível a "Qualquer pessoa".
 * A chave nunca deve ser publicada no HTML, repositório ou resposta do serviço.
 * O endpoint aceita "status" sem enviar mensagem, e "enviar" quando autenticado.
 */
function respostaPETGestao_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  var b;
  try {
    b=JSON.parse((e&&e.postData&&e.postData.contents)||"{}");
  } catch(_e) {
    return respostaPETGestao_({ok:false,codigo:"INVALID_BODY",erro:"Conteúdo JSON inválido."});
  }
  var expected=PropertiesService.getScriptProperties().getProperty("PET_GESTAO_MAIL_TOKEN")||"";
  if(expected.length<32||typeof b.token!=="string"||b.token!==expected){
    return respostaPETGestao_({ok:false,codigo:"NAO_AUTORIZADO",erro:"Não autorizado."});
  }
  if(b.acao==="status"){
    return respostaPETGestao_({ok:true,acao:"status",servico:"pet-gestao",quota:MailApp.getRemainingDailyQuota()});
  }
  if(b.acao!=="enviar"){
    return respostaPETGestao_({ok:false,codigo:"INVALID_ACTION",erro:"Ação não reconhecida."});
  }
  var recipients=Array.isArray(b.para)?b.para:[];
  if(!recipients.length||recipients.length>45||recipients.some(function(x){
    return typeof x!=="string"||x.length>180||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
  })){
    return respostaPETGestao_({ok:false,codigo:"INVALID_RECIPIENTS",erro:"Destinatários inválidos."});
  }
  var subject=String(b.assunto||"").trim();
  var message=String(b.mensagem||"");
  if(!subject||subject.length>200||/[\r\n]/.test(subject)||!message.trim()||message.length>30000){
    return respostaPETGestao_({ok:false,codigo:"INVALID_CONTENT",erro:"Assunto ou mensagem inválidos."});
  }
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000)){
    return respostaPETGestao_({ok:false,codigo:"BUSY",erro:"Serviço ocupado. Tente novamente."});
  }
  try{
    if(MailApp.getRemainingDailyQuota()<recipients.length){
      return respostaPETGestao_({ok:false,codigo:"QUOTA",erro:"Limite diário de envios do Gmail atingido."});
    }
    var sourceFiles=Array.isArray(b.anexos)?b.anexos:[];
    if(sourceFiles.length>10)throw new Error("Quantidade de anexos excedida.");
    var total=0;
    var attachments=sourceFiles.map(function(a){
      var base64=String(a.base64||"");
      if(!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error("Anexo em formato inválido.");
      var bytes=Utilities.base64Decode(base64);
      if(bytes.length>10*1024*1024)throw new Error("Anexo maior que 10 MB.");
      total+=bytes.length;
      if(total>14*1024*1024)throw new Error("Anexos excedem o limite total.");
      return Utilities.newBlob(bytes,String(a.mimeType||"application/octet-stream").slice(0,100),String(a.nome||"anexo").slice(0,150));
    });
    var options={to:recipients.join(","),subject:subject,body:message,name:"PET Educação · Gestão"};
    if(attachments.length)options.attachments=attachments;
    MailApp.sendEmail(options);
    return respostaPETGestao_({ok:true,acao:"enviar",servico:"pet-gestao",aceito:true});
  }catch(error){
    return respostaPETGestao_({ok:false,codigo:"SEND_FAILURE",erro:String(error.message||error).slice(0,180)});
  }finally{lock.releaseLock();}
}
