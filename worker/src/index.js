"use strict";

  "use strict";
  const MAX_BODY=18*1024*1024, MAX_EMAIL_FILE=10*1024*1024;
  const asJson=(v,f)=>{try{return JSON.parse(v||"")}catch{return f}};
  const now=()=>new Date().toISOString();
  const uid=()=>crypto.randomUUID();
  const randomToken=()=>{const x=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...x)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")};
  const utf8=new TextEncoder();
  const hex=b=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
  const sha=async s=>hex(await crypto.subtle.digest("SHA-256",utf8.encode(s)));
  async function pwHash(password,salt){
    const key=await crypto.subtle.importKey("raw",utf8.encode(password),"PBKDF2",false,["deriveBits"]);
    return hex(await crypto.subtle.deriveBits({name:"PBKDF2",salt:utf8.encode(salt),iterations:100000,hash:"SHA-256"},key,256));
  }
  const json=(payload,status=200,origin="")=>new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":origin,"Vary":"Origin"}});
  const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
  const str=(v,max=1000)=>String(v??"").trim().slice(0,max);
  const email=v=>str(v,254).toLowerCase();
  const validEmail=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&!/@example\.invalid$/i.test(s);
  const isArr=v=>Array.isArray(v)?v:[];
  const unique=v=>[...new Set(isArr(v).map(String).filter(Boolean))];
  const idName=row=>({id:row.id,name:row.name,role:row.role_override||row.role});
  const userPublic=u=>({id:u.id,name:u.name,email:u.email,role:u.role_override||u.role,notificationEnabled:!!u.notification_enabled,mustChangePassword:!!u.must_change_password,adminSession:u.session_admin_scope===1});
  const color=s=>/^#[0-9a-fA-F]{6}$/.test(String(s))?s:"#f7f3ff";
  const arrayToJson=v=>JSON.stringify(v);
  const standardTime=d=>/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(String(d||""))?String(d):"";
  const currentYear=()=>new Date().getUTCFullYear();
  const isoAfter=minutes=>new Date(Date.now()+minutes*60000).toISOString();
  async function body(req){
    const size=Number(req.headers.get("content-length")||0);
    if(size>MAX_BODY)fail("Requisição muito grande.",413);
    let raw;try{raw=await req.text()}catch{fail("Não foi possível ler a requisição.")};
    if(raw.length>MAX_BODY)fail("Requisição muito grande.",413);
    try{return JSON.parse(raw||"{}")}catch{fail("JSON inválido.")};
  }
  async function seedAdmin(db,env){
    if(!env.ADMIN_EMAIL||!env.ADMIN_INITIAL_PASSWORD)return;
    let phase="check-admin";
    try {
      const exists=await db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
      if(exists)return;
      phase="validate-admin";
      const mail=email(env.ADMIN_EMAIL),pw=String(env.ADMIN_INITIAL_PASSWORD);
      if(!validEmail(mail)||pw.length<10||pw.length>200)throw new Error("Credenciais iniciais inválidas.");
      phase="check-email";
      const collision=await db.prepare("SELECT id FROM users WHERE email=?").bind(mail).first();
      if(collision)throw new Error("O endereço do administrador pertence a uma conta não administrativa.");
      phase="hash-password";
      const salt=randomToken(),hash=await pwHash(pw,salt),stamp=now();
      phase="insert-admin";
      await db.prepare("INSERT INTO users (id,name,email,pass_hash,pass_salt,role,created_at,updated_at) VALUES (?,?,?,?,?,'admin',?,?)").bind(uid(),"Admin",mail,hash,salt,stamp,stamp).run();
    }catch(err){
      err.safeStage="admin-"+phase;
      throw err;
    }
  }
  async function currentUser(req,db){
    const header=req.headers.get("authorization")||"";
    const token=header.match(/^Bearer ([A-Za-z0-9_-]{20,})$/);
    if(!token)return null;
    const digest=await sha(token[1]);
    const u=await db.prepare("SELECT u.*,s.admin_scope AS session_admin_scope FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(digest,now()).first();
    if(u)u.role=u.role_override||u.role;
    return u;
  }
  function ensure(user,admin=false){
    if(!user)fail("Entre na sua conta para continuar.",401);
    if(user.must_change_password)fail("Troque sua senha temporária antes de continuar.",403);
    if((user.role_override||user.role)==="usuario")fail("Usuários possuem acesso somente à visualização.",403);
    if(admin&&(user.role!=="admin"||user.session_admin_scope!==1))fail("Acesso exclusivo à sessão da Administração.",403);
  }
  function requireLogin(user){if(!user)fail("É necessário entrar na sua conta.",401)}
  async function audit(db,taskId,user,action,details=""){
    await db.prepare("INSERT INTO task_history (id,task_id,actor_id,actor_name,action,details,created_at) VALUES (?,?,?,?,?,?,?)").bind(uid(),taskId,user.id,user.name,action,details,now()).run();
  }
  async function createSession(db,user,rememberMe=false,adminScope=false){
    // A sessão comum dura 7 dias; a opção explícita permite até 30 dias.
    const token=randomToken(),digest=await sha(token);
    const expiresAt=isoAfter((rememberMe===true?30:7)*24*60);
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at,admin_scope) VALUES(?,?,?,?,?)").bind(digest,user.id,expiresAt,now(),adminScope&&user.role==="admin"?1:0).run();
    return {token,user:{...userPublic(user),adminSession:adminScope===true&&user.role==="admin"},expiresAt};
  }
  async function resetRate(db,mail){await db.prepare("DELETE FROM auth_attempts WHERE email=?").bind(mail).run()}
  async function rateFail(db,mail){
    const prev=await db.prepare("SELECT * FROM auth_attempts WHERE email=?").bind(mail).first();
    const recent=prev&&Date.now()-Date.parse(prev.started_at)<15*60000,attempts=recent?prev.attempts+1:1;
    await db.prepare("INSERT INTO auth_attempts(email,attempts,started_at,blocked_until) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET attempts=excluded.attempts,started_at=excluded.started_at,blocked_until=excluded.blocked_until").bind(mail,attempts,recent?prev.started_at:now(),attempts>=6?isoAfter(15):null).run();
  }
  const privateTask=t=>{
    const o={...t,commissionIds:asJson(t.commission_ids,[]),assigneeIds:asJson(t.assignee_ids,[]),commissionDone:asJson(t.commission_done,{}),userDone:asJson(t.user_done,{}),deadlines:asJson(t.deadlines,[])};
    return {id:o.id,title:o.title,description:o.description,captionText:o.caption_text,registeredAt:o.registered_at,assigneeIds:o.assigneeIds,commissionIds:o.commissionIds,commissionDone:o.commissionDone,userDone:o.userDone,deadlines:o.deadlines,status:o.status,overviewVisible:o.overview_visible!==0,assignmentScope:o.assignment_scope||null,createdBy:o.created_by,archivedAt:o.archived_at,createdAt:o.created_at,updatedAt:o.updated_at,updatedBy:o.updated_by,version:o.version};
  };
  const publicTask=t=>({id:t.id,title:t.title,registeredAt:t.registered_at,commissionIds:asJson(t.commission_ids,[]),commissionDone:asJson(t.commission_done,{}),status:t.status,overviewVisible:t.overview_visible!==0,archivedAt:t.archived_at,deadlines:asJson(t.deadlines,[]).map(d=>({label:d.label,dueAt:d.dueAt,completedAt:d.completedAt||null}))});
  async function bootstrap(db,user){
    const committees=(await db.prepare("SELECT c.*, (SELECT COUNT(*) FROM commission_members m WHERE m.commission_id=c.id) AS member_count FROM commissions c ORDER BY sort_order,name").all()).results;
    const members=(await db.prepare("SELECT commission_id,user_id FROM commission_members").all()).results;
    const privateView=!!user&&user.role!=="usuario"&&!user.must_change_password;
    const rawTasks=(await db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 1000").all()).results;
    const tutorReviewedIds=user?.role==="tutor"?new Set(
      (await db.prepare("SELECT task_id FROM task_tutor_reviews WHERE user_id=?").bind(user.id).all()).results.map(row=>row.task_id)
    ):new Set();
    const settings=Object.fromEntries((await db.prepare("SELECT key,value FROM app_settings").all()).results.map(x=>[x.key,asJson(x.value,x.value)]));
    let meetings=[],users=[],history=[];
    if(privateView){
      meetings=(await db.prepare("SELECT * FROM meetings ORDER BY meeting_date DESC LIMIT 250").all()).results.map(m=>({id:m.id,title:m.title,date:m.meeting_date,rawNotes:m.raw_notes,theme:m.theme,colorA:m.color_a,colorB:m.color_b,updatedAt:m.updated_at}));
      users=(await db.prepare("SELECT id,name,role,role_override FROM users ORDER BY name").all()).results.map(idName);
      history=(await db.prepare("SELECT h.task_id,h.actor_name,h.action,h.details,h.created_at,u.role AS actor_role FROM task_history h LEFT JOIN users u ON u.id=h.actor_id ORDER BY h.created_at DESC LIMIT 800").all()).results;
    }else{
      meetings=(await db.prepare("SELECT id,title,meeting_date AS date FROM meetings ORDER BY meeting_date DESC LIMIT 100").all()).results;
    }
    const counts=Object.create(null);
    for(const m of members){(counts[m.commission_id]??=[]).push(m.user_id)}
    return {session:user?{user:userPublic(user)}:null,users,committees:committees.map(c=>({id:c.id,name:c.name,description:c.description,backgroundColor:c.background_color,imageData:c.image_data,maxMembers:c.max_members,sortOrder:c.sort_order,memberCount:c.member_count,memberIds:privateView?(counts[c.id]||[]):[]})),
      tasks:rawTasks.map(t=>privateView?{...privateTask(t),tutorReviewedByMe:tutorReviewedIds.has(t.id)}:publicTask(t)),meetings,events:history.filter(x=>["tutor","admin"].includes(x.actor_role)&&/observa|corrig|praz|aprov|liber|conclu/i.test(x.action)).slice(0,12).map(x=>({taskId:x.task_id,summary:x.action,actorName:x.actor_name,createdAt:x.created_at})),history:privateView?history:[],settings};
  }
  const bridgeUrlOk=url=>/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url||"");
  const bridgePost=async(env,payload)=>{
    const response=await fetch(env.MAIL_BRIDGE_URL,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...payload,token:env.MAIL_BRIDGE_TOKEN}),redirect:"follow"});
    const body=await response.text();
    const data=asJson(body,null);
    if(!response.ok||!data?.ok){
      const reason=String(data?.erro||data?.error||"").slice(0,160);
      if(/n[aã]o autorizado|unauthori[sz]ed|token|chave inv[aá]lida/i.test(reason)||data?.codigo==="NAO_AUTORIZADO"){
        throw new Error("Autorização do Gmail recusada. Confira se MAIL_BRIDGE_TOKEN no Worker é igual a PET_GESTAO_MAIL_TOKEN no Google Apps Script e se a implantação está atualizada.");
      }
      if(!data)throw new Error("O Apps Script não retornou JSON válido. Confira o acesso público da implantação e a URL /exec.");
      throw new Error("Ponte Gmail: "+(reason||"solicitação recusada pelo serviço"));
    }
    return data;
  };
  async function mailBridgeStatus(env){
    if(!env.MAIL_BRIDGE_URL||!env.MAIL_BRIDGE_TOKEN)return {connected:false,code:"UNCONFIGURED",message:"Integração Gmail ainda não configurada no Worker."};
    if(!bridgeUrlOk(env.MAIL_BRIDGE_URL))return {connected:false,code:"INVALID_URL",message:"URL do Google Apps Script inválida."};
    try{
      const result=await bridgePost(env,{acao:"status"});
      if(result.acao!=="status"||result.servico!=="pet-gestao"){
        return {connected:false,code:"INCOMPATIBLE",message:"O Apps Script respondeu, mas não é a ponte de envio do PET Gestão. Publique a versão própria do Gestão."};
      }
      return {connected:true,code:"READY",message:"Ponte Gmail autenticada e pronta para receber envios.",quota:typeof result.quota==="number"?result.quota:null};
    }catch(error){return {connected:false,code:"ERROR",message:error.message};}
  }
  const plainMail=s=>String(s||"").replace(/<br\s*\/?\s*>/gi,"\n").replace(/<\/p\s*>/gi,"\n\n").replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const mailHasFormatting=s=>/<\/?(?:p|div|br|strong|em|b|i|u|span|ul|ol|li)\b/i.test(String(s||""));
  const mailEscape=s=>String(s||"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
  const safeMailHtml=s=>String(s||"").replace(/<([^>]*)>/g,(match,raw)=>{
    const parsed=/^\s*(\/?)\s*(b|strong|i|em|u|p|div|br|ul|ol|li|span)\b([^>]*)$/i.exec(raw);
    if(!parsed)return "";
    const name=parsed[2].toLowerCase();
    if(parsed[1])return name==="br"?"":"</"+name+">";
    if(name==="br")return "<br>";
    if(name==="span"){
      const c=/color\s*:\s*(#[0-9a-f]{3,8}|rgb\([\d\s,.%]+\))/i.exec(parsed[3]);
      return "<span"+(c?' style="color:'+c[1]+'"':"")+">";
    }
    return "<"+name+">";
  });
  async function authorizedMail(env,recipients,subject,message,attachments=[]){
    if(!env.MAIL_BRIDGE_URL||!env.MAIL_BRIDGE_TOKEN)throw new Error("Integração do e-mail não configurada.");
    if(!bridgeUrlOk(env.MAIL_BRIDGE_URL))throw new Error("URL do Apps Script inválida.");
    const emailList=unique(recipients.map(email)).filter(validEmail);
    if(!emailList.length)throw new Error("Nenhum destinatário válido.");
    if(attachments.length&&emailList.length>50)throw new Error("Anexos exigem no máximo 50 destinatários por envio.");
    let total=0;
    for(const a of attachments){
      if(!a||typeof a.base64!=="string")throw new Error("Anexo inválido.");
      const base64=a.base64.replace(/\s/g,"");
      if(!/^[a-zA-Z0-9+/]*={0,2}$/.test(base64))throw new Error("Anexo inválido.");
      const length=Math.floor(base64.length*3/4)-(base64.endsWith("==")?2:base64.endsWith("=")?1:0);
      if(length>MAX_EMAIL_FILE)throw new Error("Anexo excede 10 MB.");
      total+=length;
    }
    if(total>14*1024*1024)throw new Error("O tamanho total de anexos excede o limite deste envio.");
    for(let i=0;i<emailList.length;i+=45){
      const response=await bridgePost(env,{acao:"enviar",para:emailList.slice(i,i+45),assunto:subject,mensagem:mailHasFormatting(message)?plainMail(message):message,html:mailHasFormatting(message)?safeMailHtml(message):"",tipo:"imediato",anexos:attachments});
      if(response.servico!=="pet-gestao")throw new Error("Ponte de e-mail incompatível com o PET Gestão. Atualize o Apps Script antes de reenviar.");
    }
  }
  async function recipientEmails(db,data){
    const all=(await db.prepare("SELECT id,email FROM users").all()).results;
    const ids=new Set(unique(data.userIds));
    const targets=unique(data.committeeIds);
    if(targets.length){
      const members=(await db.prepare("SELECT commission_id,user_id FROM commission_members").all()).results;
      for(const m of members)if(targets.includes(m.commission_id))ids.add(m.user_id);
    }
    return unique((data.all?all:all.filter(x=>ids.has(x.id))).map(x=>x.email)).filter(validEmail);
  }
  async function enqueue(db,creatorId,kind,emails,subject,message,when){
    const id=uid(),stamp=now();
    await db.prepare("INSERT INTO email_queue (id,creator_id,kind,recipient_emails,subject,body,scheduled_at,status,created_at) VALUES(?,?,?,?,?,?,?,'pendente',?)").bind(id,creatorId,kind,JSON.stringify(unique(emails)),subject,message,when||stamp,stamp).run();
    return id;
  }
  async function processQueue(env,limit=10){
    // Envios interrompidos não são reenviados automaticamente: evita duplicar e-mails.
    await env.DB.prepare("UPDATE email_queue SET status='falhou',error_message='Processamento interrompido; verificar antes de reenviar' WHERE status='processando' AND scheduled_at<?").bind(isoAfter(-60)).run();
    const list=(await env.DB.prepare("SELECT * FROM email_queue WHERE status='pendente' AND scheduled_at<=? ORDER BY scheduled_at LIMIT ?").bind(now(),limit).all()).results;
    for(const item of list){
      const claimed=await env.DB.prepare("UPDATE email_queue SET status='processando',attempts=attempts+1 WHERE id=? AND status='pendente'").bind(item.id).run();
      if(!claimed.meta.changes)continue;
      try{
        await authorizedMail(env,asJson(item.recipient_emails,[]),item.subject,item.body);
        await env.DB.prepare("UPDATE email_queue SET status='enviado',sent_at=?,error_message=NULL WHERE id=?").bind(now(),item.id).run();
      }catch(err){
        await env.DB.prepare("UPDATE email_queue SET status='falhou',error_message=? WHERE id=?").bind(str(err.message,500),item.id).run();
      }
    }
    // Recuperar registros de processamentos interrompidos; a entrega pode ter sido realizada
    // antes da queda. Exigem verificação manual para evitar duplicidade.
  }

  // Lembretes automáticos: opção desativada até a Administração habilitar.
  // Usa a data civil de Sergipe (UTC-3) e uma chave única por etapa/prazo/tipo.
  const defaultReminderSettings={dueSoonEnabled:false,daysBefore:3,overdueEnabled:false,overdueAudience:"pending"};
  const deadlineMailTemplates={
    due_soon:{
      subject:"PET Gestão — Prazo vencendo: {demanda}",
      body:"Olá!\n\nA etapa {etapa} da demanda {demanda} vence em {dias} dia(s), em {prazo}.\n\nConfira a atividade no PET Gestão: {link}\n\nPET Educação"
    },
    overdue:{
      subject:"PET Gestão — Prazo vencido: {demanda}",
      body:"Olá!\n\nO prazo da etapa {etapa} da demanda {demanda} venceu em {prazo}.\n\nConfira a atividade no PET Gestão: {link}\n\nPET Educação"
    }
  };
  const reminderDateKey=date=>{
    const bits=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
      timeZone:"America/Maceio",year:"numeric",month:"2-digit",day:"2-digit"
    }).formatToParts(date).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
    return bits.year+"-"+bits.month+"-"+bits.day;
  };

  // Arquivamento de eventos coletivos ao fim do dia em Sergipe (UTC−3).
  // Idempotente: uma mudança de versão concorrente impede atualização duplicada.
  // Registros antigos de Todos(as) também encerram no fim da data mais recente.
  // Sem data, nenhum evento será arquivado automaticamente.
  async function autoCompleteCollectiveEvents(env,taskId=null){
    const db=env.DB,stamp=now(),clock=Date.now();
    const sql="SELECT id,assignee_ids,commission_ids,user_done,deadlines,version FROM tasks WHERE archived_at IS NULL AND assignment_scope='todos'";
    const pending=(await (taskId?
      db.prepare(sql+" AND id=?").bind(taskId):
      db.prepare(sql)).all()).results;
    for(const task of pending){
      const stages=asJson(task.deadlines,[]);
      const days=stages.map(stage=>String(stage?.dueAt||"").slice(0,10))
        .filter(day=>/^\d{4}-\d{2}-\d{2}$/.test(day));
      if(!days.length)continue;
      // Para dados legados com várias etapas, considerar a data final.
      const day=days.sort().at(-1);
      const end=Date.parse(day+"T23:59:59-03:00");
      if(!Number.isFinite(end)||clock<end)continue;
      const people=unique(asJson(task.assignee_ids,[]));
      const done={...asJson(task.user_done,{})};
      for(const personId of people)if(!done[personId])
        done[personId]={at:stamp,by:null,byName:"PET Gestão — automático"};
      const completed=stages.map(stage=>({...stage,completedAt:stage.completedAt||stamp}));
      const nextVersion=Number(task.version)+1;
      // A auditoria é gravada na mesma transação que o arquivamento.
      await db.batch([
        db.prepare("UPDATE tasks SET user_done=?,deadlines=?,status='concluida',archived_at=?,updated_at=?,version=version+1 WHERE id=? AND archived_at IS NULL AND version=?")
          .bind(JSON.stringify(done),JSON.stringify(completed),stamp,stamp,task.id,task.version),
        db.prepare("INSERT INTO task_history(id,task_id,actor_id,actor_name,action,details,created_at) SELECT ?,id,NULL,?,?,? ,? FROM tasks WHERE id=? AND version=? AND archived_at=?")
          .bind(uid(),"PET Gestão — automático","Concluiu o evento coletivo para Todos(as)","Arquivamento automático após a data do evento (horário de Sergipe).",stamp,task.id,nextVersion,stamp)
      ]);
    }
  }

  async function queueDeadlineReminders(env){
    const db=env.DB;
    const stored=await db.prepare("SELECT value FROM app_settings WHERE key='reminderSettings'").first();
    const config={...defaultReminderSettings,...asJson(stored?.value,{})};
    const daysBefore=Number(config.daysBefore);
    if(!Number.isInteger(daysBefore)||daysBefore<1||daysBefore>30)return;
    if(!config.dueSoonEnabled&&!config.overdueEnabled)return;
    const savedModels=await db.prepare("SELECT value FROM app_settings WHERE key='notificationTemplates'").first();
    const models=asJson(savedModels?.value,{});
    const people=(await db.prepare("SELECT id,email,role,role_override FROM users").all()).results;
    const peopleById=new Map(people.filter(p=>p.role_override!=="usuario"&&["petiano","tutor","admin"].includes(p.role)).map(p=>[p.id,p]));
    const commissionMembers=(await db.prepare("SELECT commission_id,user_id FROM commission_members").all()).results;
    const membersByCommission=new Map();
    for(const member of commissionMembers){
      if(!membersByCommission.has(member.commission_id))membersByCommission.set(member.commission_id,[]);
      membersByCommission.get(member.commission_id).push(member.user_id);
    }
    const tasks=(await db.prepare("SELECT id,title,assignee_ids,commission_ids,commission_done,user_done,deadlines,archived_at,assignment_scope FROM tasks WHERE archived_at IS NULL").all()).results;
    const clock=new Date(),today=reminderDateKey(clock),todayUTC=Date.parse(today+"T00:00:00Z");
    let registered=0;
    for(const task of tasks){
      // Os cenários fictícios usam e-mails próprios de teste e não entram em lembretes regulares.
      if(String(task.title||"").startsWith("[TESTE]"))continue;
      // Avisos de prazo valem para tarefas com etapas, não para eventos coletivos.
      if(task.assignment_scope==="todos")continue;
      const stages=asJson(task.deadlines,[]);
      const donePeople=asJson(task.user_done,{}),doneCommissions=asJson(task.commission_done,{});
      const allTaskAssignees=asJson(task.assignee_ids,[]);
      const allPeople=new Set(allTaskAssignees),activePeople=new Set(allTaskAssignees.filter(userId=>!donePeople[userId]));
      for(const commissionId of asJson(task.commission_ids,[])){
        for(const memberId of membersByCommission.get(commissionId)||[]){
          allPeople.add(memberId);
          if(!doneCommissions[commissionId]&&!donePeople[memberId])activePeople.add(memberId);
        }
      }
      for(let stageIndex=0;stageIndex<stages.length;stageIndex++){
        const stage=stages[stageIndex];
        // Eventos de Todos(as) não são prazos de entrega e não recebem alertas de atraso.
        if(!stage||stage.label==="Evento"||stage.completedAt||!stage.dueAt)continue;
        const rawDue=String(stage.dueAt);
        if(!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(rawDue))continue;
        const isoDue=rawDue.length===10?rawDue+"T23:59:00":rawDue.length===16?rawDue+":00":rawDue;
        const dueMs=Date.parse(isoDue+"-03:00");
        if(!Number.isFinite(dueMs))continue;
        const diffDays=Math.round((Date.parse(rawDue.slice(0,10)+"T00:00:00Z")-todayUTC)/86400000);
        let kind=null;
        if(config.dueSoonEnabled&&diffDays===daysBefore&&clock.getTime()<dueMs)kind="due_soon";
        // Avisar ao vencer, sem enviar uma enxurrada de alertas antigos ao habilitar.
        else if(config.overdueEnabled&&diffDays<=0&&diffDays>=-1&&clock.getTime()>dueMs)kind="overdue";
        if(!kind)continue;
        const stageOwners=unique(stage.assigneeIds);
        // O Admin pode enviar o aviso de prazo vencido para TODOS os participantes
        // (incluindo integrantes de comissões concluídas), sem duplicar e-mails.
        // Os demais avisos preservam o comportamento de apenas pendências.
        const notifyEveryone=kind==="overdue"&&config.overdueAudience==="all";
        const recipientIds=notifyEveryone?[...new Set([...allPeople,...stageOwners])]:
          stageOwners.length?stageOwners.filter(id=>!donePeople[id]):[...activePeople];
        const recipients=unique(recipientIds.map(id=>peopleById.get(id)?.email).filter(validEmail));
        if(!recipients.length)continue;
        const template=models?.[kind]||deadlineMailTemplates[kind];
        const deadlineText=new Intl.DateTimeFormat("pt-BR",{
          timeZone:"America/Maceio",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"
        }).format(new Date(dueMs));
        const values={
          autor:"PET Gestão",acao:kind==="due_soon"?"avisa que o prazo está vencendo":"avisa que o prazo venceu",
          tipo:kind==="due_soon"?"Prazo vencendo":"Prazo vencido",
          demanda:task.title,etapa:String(stage.label||"Prazo"),prazo:deadlineText,
          dias:String(daysBefore),
          link:"https://peteducacao.github.io/pet-gestao/#/atividade/"+encodeURIComponent(task.id)
        };
        const substitute=(txt,html=false)=>String(txt||"").replace(/\{(autor|acao|tipo|demanda|etapa|prazo|dias|link)\}/g,(_,key)=>html?mailEscape(values[key]):values[key]);
        const subject=substitute(template.subject||deadlineMailTemplates[kind].subject).slice(0,200);
        const bodyTemplate=String(template.body||deadlineMailTemplates[kind].body).slice(0,10000);
        const text=substitute(bodyTemplate,mailHasFormatting(bodyTemplate));
        const stageId=String(stage.id||stage.label+"-"+stageIndex);
        const dedupeKey=[task.id,stageId,rawDue,kind].join("|");
        const queueId=uid(),stamp=now();
        const noticeBatch=await db.batch([
          db.prepare("INSERT OR IGNORE INTO deadline_notice_log(dedupe_key,task_id,stage_id,notice_kind,stage_due_at,queue_id,created_at) VALUES(?,?,?,?,?,?,?)")
            .bind(dedupeKey,task.id,stageId,kind,rawDue,queueId,stamp),
          db.prepare("INSERT INTO email_queue(id,creator_id,kind,recipient_emails,subject,body,scheduled_at,status,created_at) SELECT ?,NULL,?,?,?,?,?,'pendente',? WHERE EXISTS (SELECT 1 FROM deadline_notice_log WHERE dedupe_key=? AND queue_id=?)")
            .bind(queueId,kind,JSON.stringify(recipients),subject,text,stamp,stamp,dedupeKey,queueId)
        ]);
        if(noticeBatch[0]?.meta?.changes)registered++;
        if(registered>=30)return;
      }
    }
  }

  async function askNotify(db,env,ctx,user,payload,task,title,action){
    if(user.role!=="tutor"&&user.role!=="admin")return;
    if(!user.notification_enabled||payload.notify!==true)return;
    const ids=new Set(unique(task.assigneeIds));
    for(const cId of task.commissionIds){
      const members=(await db.prepare("SELECT user_id FROM commission_members WHERE commission_id=?").bind(cId).all()).results;
      members.forEach(m=>ids.add(m.user_id));
    }
    const recipients=await recipientEmails(db,{userIds:[...ids]});
    if(!recipients.length)return;
    const saved=await db.prepare("SELECT key,value FROM app_settings WHERE key IN ('notificationTemplate','notificationTemplates')").all();
    const configs=Object.fromEntries(saved.results.map(row=>[row.key,asJson(row.value,{})]));
    const kind=title==="Nova demanda"?"create":"review";
    const config=configs.notificationTemplates?.[kind]||configs.notificationTemplate||{};
    const subjectTemplate=str(config.subject||"PET Gestão — {tipo}",200);
    const bodyTemplate=String(config.body||"Olá!\n\n{autor} {acao} na demanda \"{demanda}\".\n\nAcesse o PET Gestão para consultar as informações.\n\nPET Educação").slice(0,10000);
    const values={autor:user.name,acao:action,demanda:task.title,tipo:title};
    const merge=(tpl,html=false)=>tpl.replace(/\{(autor|acao|demanda|tipo)\}/g,(_,key)=>html?mailEscape(values[key]):values[key]);
    await enqueue(db,user.id,"automatica",recipients,merge(subjectTemplate),merge(bodyTemplate,mailHasFormatting(bodyTemplate)),now());
    ctx.waitUntil(processQueue(env,2));
  }
  function validateTask(payload,old=null){
    const title=str(payload.title,180);
    if(!title)fail("Informe o título da demanda.");
    const assigneeIds=unique(payload.assigneeIds),commissionIds=unique(payload.commissionIds);
    const assignmentScope=payload.assignmentScope===undefined?(old?.assignmentScope||null):String(payload.assignmentScope||"");
    if(assignmentScope!==null&&!["usuarios","comissoes","todos"].includes(assignmentScope))fail("Seleção de responsáveis inválida.");
    if(assignmentScope==="todos"&&commissionIds.length)fail("Todos(as) não permite comissões selecionadas.");
    if(!assigneeIds.length&&!commissionIds.length)fail("Selecione responsáveis ou uma comissão.");
    if(payload.overviewVisible!==undefined&&typeof payload.overviewVisible!=="boolean")fail("Opção de exibição inválida.");
    const overviewVisible=payload.overviewVisible===undefined?old?.overviewVisible!==false:payload.overviewVisible;
    if(!overviewVisible&&!commissionIds.length)fail("Para exibir somente nas comissões, selecione uma comissão.");
    const providedStages=isArr(payload.deadlines);
    // Em Todos(as) há um único evento coletivo com data, nunca uma sequência de etapas.
    // A API também valida a estrutura, mesmo que outro cliente tente enviar etapas antigas.
    let stages;
    if(assignmentScope==="todos"){
      if(providedStages.length!==1||providedStages[0]?.label!=="Evento")
        fail("Em Todos(as), informe apenas a data do evento coletivo.");
      const raw=str(providedStages[0].dueAt,30),day=raw.slice(0,10);
      const dateIsValid=/^\d{4}-\d{2}-\d{2}$/.test(day)&&
        Number.isFinite(Date.parse(day+"T12:00:00Z"))&&
        new Date(day+"T12:00:00Z").toISOString().slice(0,10)===day;
      if(!dateIsValid)fail("Informe uma data válida para o evento coletivo.");
      // Eventos coletivos aceitam datas de qualquer ano, inclusive já passado.
      stages=[{id:str(providedStages[0].id||"evento-data",60),label:"Evento",
        dueAt:day+"T23:59:59",assigneeIds:[],commissionCompleted:{},completedAt:null}];
    }else if(assignmentScope==="usuarios"&&assigneeIds.length===1&&!commissionIds.length&&
      providedStages.some(d=>d?.label==="Atividade")){
      // Uma tarefa para uma pessoa tem só a data, mas NÃO se conclui sozinha.
      // Mantém /finish como confirmação individual do responsável.
      if(providedStages.length!==1||providedStages[0].label!=="Atividade")
        fail("A atividade individual deve conter apenas sua data.",400);
      const day=str(providedStages[0].dueAt,30).slice(0,10);
      const valid=/^\d{4}-\d{2}-\d{2}$/.test(day)&&
        Number.isFinite(Date.parse(day+"T12:00:00Z"))&&
        new Date(day+"T12:00:00Z").toISOString().slice(0,10)===day;
      if(!valid)fail("Informe uma data válida para a atividade individual.",400);
      stages=[{id:str(providedStages[0].id||"atividade-data",60),label:"Atividade",
        dueAt:day+"T23:59:59",assigneeIds:[],commissionCompleted:{},completedAt:null}];
    }else{
      stages=providedStages.slice(0,40).map(d=>({id:str(d.id||uid(),60),label:str(d.label,20),dueAt:standardTime(d.dueAt),assigneeIds:unique(d.assigneeIds),commissionCompleted:d.commissionCompleted&&typeof d.commissionCompleted==="object"?d.commissionCompleted:{},completedAt:d.completedAt||null}));
      // Sem etapas é permitido para tarefas antigas e demandas com mais responsáveis.
      if(stages.some(d=>!["Prazo","Correção","Postagem"].includes(d.label)||!d.dueAt))fail("Etapa inválida ou sem data.");
      if(!old&&stages.some(d=>Number(d.dueAt.slice(0,4))<currentYear()))fail("Não é permitido cadastrar datas de anos anteriores.");
    }
    const limits=["Prazo","Correção","Postagem"].map(s=>stages.filter(d=>d.label===s).map(x=>x.dueAt).sort());
    if(limits[0].length&&limits[1].length&&limits[1][0]<limits[0][limits[0].length-1])fail("A correção não pode acontecer antes do prazo.");
    if(limits[2].length&&((limits[1].length&&limits[2][0]<limits[1][limits[1].length-1])||(!limits[1].length&&limits[2][0]<limits[0][limits[0].length-1])))fail("A postagem não pode acontecer antes da etapa anterior.");
    return {title,description:str(payload.description,12000),captionText:String(payload.captionText??old?.captionText??"").slice(0,30000),assigneeIds,commissionIds,assignmentScope,deadlines:stages,overviewVisible};
  }
  async function verifyEveryoneScope(db,t){
    if(t.assignmentScope!=="todos")return;
    const eligible=(await db.prepare("SELECT id FROM users WHERE role IN ('petiano','tutor','admin') AND COALESCE(role_override,'')!='usuario'").all()).results.map(x=>x.id);
    if(!eligible.length||eligible.length!==t.assigneeIds.length||eligible.some(id=>!t.assigneeIds.includes(id)))
      fail("Para Todos(as), a demanda deve incluir todas as pessoas elegíveis.");
  }
  function fullAfter(t,patch){return {...t,...patch}};
  async function markTutorReviewAfterCorrection(db,task,user,stamp){
    if(user.role!=="tutor"||task.archivedAt||task.assignmentScope==="todos")return;
    let isParticipant=(task.assigneeIds||[]).includes(user.id);
    if(!isParticipant&&(task.commissionIds||[]).length){
      const memberships=(await db.prepare("SELECT commission_id FROM commission_members WHERE user_id=?").bind(user.id).all()).results;
      isParticipant=memberships.some(row=>task.commissionIds.includes(row.commission_id));
    }
    if(!isParticipant)return;
    await db.prepare("INSERT INTO task_tutor_reviews(task_id,user_id,reviewed_at) VALUES(?,?,?) ON CONFLICT(task_id,user_id) DO UPDATE SET reviewed_at=excluded.reviewed_at")
      .bind(task.id,user.id,stamp).run();
  }
  async function readTask(db,id){const t=await db.prepare("SELECT * FROM tasks WHERE id=?").bind(id).first();if(!t)fail("Demanda não encontrada.",404);return privateTask(t)}
  async function fetchApi(req,env,ctx){
    const url=new URL(req.url),path=url.pathname.replace(/\/+$/,""),method=req.method,db=env.DB,origin=req.headers.get("Origin")||"";
    const allowed=["https://peteducacao.github.io", "http://localhost:8000", "http://127.0.0.1:8000",new URL(req.url).origin];
    if(origin&&!allowed.includes(origin))return json({error:"Origem não autorizada."},403,"");
    if(method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Access-Control-Max-Age":"3600","Vary":"Origin"}});
    const answer=(data,status=200)=>json(data,status,origin);
    let diagnosticStage="request";
    try{
      if(path==="/api/v1/health")return answer({ok:true,service:"PET Gestão",database:!!db,now:now()});
      if(!db)fail("Banco D1 não conectado.",503);
      diagnosticStage="admin-initialization";
      await seedAdmin(db,env);
      diagnosticStage="session";
      const user=await currentUser(req,db);
      if(path==="/api/v1/bootstrap"&&method==="GET"){
        // Corrige também eventos antigos já salvos com a data vencida,
        // mesmo se o agendador ainda não tiver executado.
        await autoCompleteCollectiveEvents(env);
        diagnosticStage="bootstrap-query";
        return answer(await bootstrap(db,user));
      }
      diagnosticStage="request";
      if(path==="/api/v1/auth/register"&&method==="POST"){
        const b=await body(req),name=str(b.name,120),mail=email(b.email),pw=String(b.password||"");
        if(name.length<2||!validEmail(mail)||pw.length<10||pw.length>200)fail("Informe nome, e-mail válido e senha com pelo menos 10 caracteres.");
        if(await db.prepare("SELECT id FROM users WHERE email=?").bind(mail).first())fail("E-mail já cadastrado.",409);
        const salt=randomToken(),stamp=now();
        await db.prepare("INSERT INTO users(id,name,email,pass_hash,pass_salt,role,role_override,created_at,updated_at) VALUES(?,?,?,?,?,'petiano','usuario',?,?)").bind(uid(),name,mail,await pwHash(pw,salt),salt,stamp,stamp).run();
        return answer({ok:true},201);
      }
      if(path==="/api/v1/auth/login"&&method==="POST"){
        const b=await body(req),mail=email(b.email),pw=String(b.password||"");
        // "Admin" é um identificador opcional da primeira conta administrativa.
        const loginKey=mail==="admin"?"admin":mail;
        const attempts=await db.prepare("SELECT * FROM auth_attempts WHERE email=?").bind(loginKey).first();
        if(attempts?.blocked_until&&attempts.blocked_until>now())fail("Muitas tentativas. Tente novamente mais tarde.",429);
        const u=loginKey==="admin"
          ?await db.prepare("SELECT * FROM users WHERE role=\'admin\' ORDER BY created_at ASC LIMIT 1").first()
          :await db.prepare("SELECT * FROM users WHERE email=?").bind(loginKey).first();
        if(!u||await pwHash(pw,u.pass_salt)!==u.pass_hash){await rateFail(db,loginKey);fail("Credenciais inválidas.",401)}
        await resetRate(db,loginKey);
        // O login normal também autentica Admin, sem exigir uma segunda entrada.
        // O servidor só concede privilégios administrativos a cargo Admin validado.
        return answer(await createSession(db,u,b.rememberMe===true,(u.role_override||u.role)==="admin"));
      }
      if(path==="/api/v1/auth/admin-login"&&method==="POST"){
        const b=await body(req),identifier=String(b.identifier||b.email||"").trim().toLowerCase(),pw=String(b.password||"");
        if(!identifier||identifier.length>250||!pw||pw.length>200)fail("Credenciais administrativas inválidas.",401);
        const key=identifier==="admin"?"admin":email(identifier);
        const attempts=await db.prepare("SELECT * FROM auth_attempts WHERE email=?").bind(key).first();
        if(attempts?.blocked_until&&attempts.blocked_until>now())fail("Muitas tentativas. Tente novamente mais tarde.",429);
        const admin=identifier==="admin"
          ?await db.prepare("SELECT * FROM users WHERE role='admin' ORDER BY created_at ASC LIMIT 1").first()
          :await db.prepare("SELECT * FROM users WHERE email=? AND role='admin'").bind(key).first();
        if(!admin||await pwHash(pw,admin.pass_salt)!==admin.pass_hash){
          await rateFail(db,key);fail("Credenciais administrativas inválidas.",401);
        }
        await resetRate(db,key);
        return answer(await createSession(db,admin,b.rememberMe===true,true));
      }
      if(path==="/api/v1/auth/logout"&&method==="POST"){
        if(user){const token=(req.headers.get("authorization")||"").slice(7);await db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha(token)).run()}
        return answer({ok:true});
      }
      if(path==="/api/v1/auth/me"&&method==="GET"){requireLogin(user);return answer({user:userPublic(user)})}
      if(path==="/api/v1/auth/change-password"&&method==="POST"){
        requireLogin(user);
        const b=await body(req),pw=String(b.password||""),next=String(b.newPassword||"");
        if(await pwHash(pw,user.pass_salt)!==user.pass_hash)fail("Senha atual incorreta.",401);
        if(next.length<10||next.length>200)fail("A nova senha deve conter pelo menos 10 caracteres.");
        const salt=randomToken();
        await db.prepare("UPDATE users SET pass_hash=?,pass_salt=?,must_change_password=0,updated_at=? WHERE id=?").bind(await pwHash(next,salt),salt,now(),user.id).run();
        await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id).run();
        return answer({ok:true,logout:true});
      }
      if(path==="/api/v1/auth/forgot"&&method==="POST"){
        const b=await body(req),mail=email(b.email),u=await db.prepare("SELECT id,email FROM users WHERE email=?").bind(mail).first();
        if(u){
          const recent=await db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE user_id=? AND created_at>?").bind(u.id,isoAfter(-30)).first();
          if(recent.n<3){
            const token=randomToken(),digest=await sha(token);
            await db.prepare("INSERT INTO password_resets(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(digest,u.id,isoAfter(30),now()).run();
            const link=(env.PUBLIC_SITE_URL||"https://peteducacao.github.io/pet-gestao/")+"#/redefinir/"+encodeURIComponent(token);
            try{await authorizedMail(env,[u.email],"PET Gestão — redefinir sua senha","Para redefinir sua senha, acesse o link válido por 30 minutos (uso único):\n\n"+link+"\n\nSe você não solicitou, ignore esta mensagem.");}
            catch(err){console.error("Falha de envio para redefinição:",err.message)}
          }
        }
        return answer({ok:true,message:"Se o e-mail estiver cadastrado, enviaremos as instruções."});
      }
      if(path==="/api/v1/auth/reset"&&method==="POST"){
        const b=await body(req),pw=String(b.password||""),token=str(b.token,100);
        if(pw.length<10||pw.length>200)fail("A nova senha precisa conter pelo menos 10 caracteres.");
        const digest=await sha(token);
        const r=await db.prepare("SELECT * FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?").bind(digest,now()).first();
        if(!r)fail("Link expirado ou já utilizado.",400);
        const changed=await db.prepare("UPDATE password_resets SET used_at=? WHERE token_hash=? AND used_at IS NULL").bind(now(),digest).run();
        if(!changed.meta.changes)fail("Este link já foi utilizado.");
        const salt=randomToken();
        await db.prepare("UPDATE users SET pass_hash=?,pass_salt=?,must_change_password=0,updated_at=? WHERE id=?").bind(await pwHash(pw,salt),salt,now(),r.user_id).run();
        await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(r.user_id).run();
        return answer({ok:true});
      }
      if(path==="/api/v1/account"&&method==="DELETE"){
        // Exclusão da PRÓPRIA conta: disponível inclusive ao perfil Usuário.
        // Nunca aceitar o ID de outra pessoa como parâmetro.
        requireLogin(user);
        const b=await body(req);
        if(String(b.confirmation||"").trim()!=="EXCLUIR MINHA CONTA")
          fail("Digite EXCLUIR MINHA CONTA para confirmar a exclusão.",400);
        const password=String(b.password||"");
        if(!password||await pwHash(password,user.pass_salt)!==user.pass_hash)
          fail("Senha atual incorreta.",401);
        // Uma conta de Administração precisa permanecer como responsável
        // institucional pelas demandas e pelo acesso administrativo.
        const caretaker=await db.prepare(
          "SELECT id FROM users WHERE role='admin' AND id!=? ORDER BY created_at LIMIT 1"
        ).bind(user.id).first();
        if(!caretaker){
          if(user.role==="admin")fail("A última conta de Administração não pode ser excluída. Cadastre outra conta administrativa antes de prosseguir.",409);
          fail("Não é possível excluir a conta sem uma Administração ativa para preservar as demandas. Procure a Administração.",409);
        }
        const anonymous="Conta excluída";
        const stamp=now(),updates=[];
        // Responsabilidades e conclusões são campos JSON; devem perder o ID
        // da pessoa excluída, sem apagar as tarefas dos demais.
        const tasks=(await db.prepare(
          "SELECT id,created_by,updated_by,assignee_ids,user_done,commission_done,deadlines FROM tasks"
        ).all()).results;
        const scrubAttribution=original=>{
          if(!original||typeof original!=="object")return original;
          const copy={...original};
          if(copy.by===user.id)copy.by=null;
          if(copy.byName===user.name||copy.byName===user.email||copy.byName&&copy.by===null)
            copy.byName=anonymous;
          return copy;
        };
        for(const task of tasks){
          const assigneeIds=asJson(task.assignee_ids,[]).filter(id=>id!==user.id);
          const userDone=Object.fromEntries(Object.entries(asJson(task.user_done,{}))
            .filter(([id])=>id!==user.id).map(([id,state])=>[id,scrubAttribution(state)]));
          const commissionDone=Object.fromEntries(Object.entries(asJson(task.commission_done,{}))
            .map(([id,state])=>[id,scrubAttribution(state)]));
          const deadlines=asJson(task.deadlines,[]).map(stage=>({
            ...stage,
            assigneeIds:(stage.assigneeIds||[]).filter(id=>id!==user.id),
            commissionCompleted:Object.fromEntries(Object.entries(stage.commissionCompleted||{})
              .map(([id,state])=>[id,scrubAttribution(state)]))
          }));
          const createdBy=task.created_by===user.id?caretaker.id:task.created_by;
          const updatedBy=task.updated_by===user.id?caretaker.id:task.updated_by;
          if(createdBy!==task.created_by||updatedBy!==task.updated_by||
             JSON.stringify(assigneeIds)!==JSON.stringify(asJson(task.assignee_ids,[]))||
             JSON.stringify(userDone)!==JSON.stringify(asJson(task.user_done,{}))||
             JSON.stringify(commissionDone)!==JSON.stringify(asJson(task.commission_done,{}))||
             JSON.stringify(deadlines)!==JSON.stringify(asJson(task.deadlines,[]))){
            updates.push(db.prepare(
              "UPDATE tasks SET created_by=?,updated_by=?,assignee_ids=?,user_done=?,commission_done=?,deadlines=?,updated_at=?,version=version+1 WHERE id=?"
            ).bind(createdBy,updatedBy,JSON.stringify(assigneeIds),JSON.stringify(userDone),
              JSON.stringify(commissionDone),JSON.stringify(deadlines),stamp,task.id));
          }
        }
        // Os registros institucionais permanecem, mas sem nome/e-mail do titular.
        updates.push(db.prepare(
          "UPDATE task_history SET actor_name=CASE WHEN actor_id=? THEN ? ELSE actor_name END,action=REPLACE(REPLACE(action,?,?),?,?),details=REPLACE(REPLACE(details,?,?),?,?) WHERE actor_id=? OR instr(action,?)>0 OR instr(action,?)>0 OR instr(details,?)>0 OR instr(details,?)>0"
        ).bind(user.id,anonymous,user.name,anonymous,user.email,anonymous,
          user.name,anonymous,user.email,anonymous,user.id,
          user.name,user.email,user.name,user.email));
        // E-mails pendentes não devem continuar endereçados à pessoa excluída;
        // registros antigos são redigidos na base local (envios anteriores são irrecuperáveis).
        const queued=(await db.prepare(
          "SELECT id,recipient_emails,subject,body,status FROM email_queue"
        ).all()).results;
        for(const row of queued){
          const recipients=asJson(row.recipient_emails,[]).filter(e=>String(e).toLowerCase()!==user.email.toLowerCase());
          const subject=String(row.subject||"").replaceAll(user.name,anonymous).replaceAll(user.email,anonymous);
          const message=String(row.body||"").replaceAll(user.name,anonymous).replaceAll(user.email,anonymous);
          const status=recipients.length?"":(["pendente","processando"].includes(row.status)?"cancelado":"");
          if(JSON.stringify(recipients)!==JSON.stringify(asJson(row.recipient_emails,[]))||
             subject!==row.subject||message!==row.body||status){
            updates.push(db.prepare(
              "UPDATE email_queue SET recipient_emails=?,subject=?,body=?,status=? WHERE id=?"
            ).bind(JSON.stringify(recipients),subject,message,status||row.status,row.id));
          }
        }
        updates.push(db.prepare("DELETE FROM auth_attempts WHERE email=?").bind(user.email));
        // FK CASCADE apaga todas as sessões, resets de senha, participações em
        // comissões e indicadores pessoais de revisão; atas têm FK SET NULL.
        updates.push(db.prepare("DELETE FROM users WHERE id=?").bind(user.id));
        await db.batch(updates);
        return answer({ok:true,deleted:true});
      }
      if(path==="/api/v1/account"&&method==="PATCH"){
        ensure(user);const b=await body(req);
        await db.prepare("UPDATE users SET notification_enabled=?,updated_at=? WHERE id=?").bind(b.notificationEnabled?1:0,now(),user.id).run();
        return answer({ok:true});
      }
      if(path==="/api/v1/admin/users"&&method==="GET"){
        ensure(user,true);return answer({users:(await db.prepare("SELECT id,name,email,role,role_override,notification_enabled,must_change_password,created_at FROM users ORDER BY name").all()).results.map(userPublic)});
      }
      let match=path.match(/^\/api\/v1\/admin\/users\/([^/]+)$/);
      if(match&&method==="PATCH"){
        ensure(user,true);const b=await body(req),target=await db.prepare("SELECT * FROM users WHERE id=?").bind(match[1]).first();
        if(!target)fail("Usuário não encontrado.",404);
        const desired=["usuario","petiano","tutor","admin"].includes(b.role)?b.role:(target.role_override||target.role);
        if(desired==="admin"&&target.role!=="admin")fail("A conta Administração é exclusiva e não pode ser atribuída a outro usuário.",403);
        if(target.role==="admin"&&desired!=="admin")fail("Não é permitido alterar o cargo da conta Administração.",403);
        const role=desired==="usuario"?"petiano":desired;
        const override=desired==="usuario"?"usuario":null;
        if(target.role==="admin"&&role!=="admin"){
          const count=await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
          if(count.n<=1)fail("Não é possível remover o último administrador.");
        }
        const name=b.name!==undefined?str(b.name,120):target.name;
        if(name.length<2)fail("Nome inválido.");
        await db.prepare("UPDATE users SET name=?,role=?,role_override=?,notification_enabled=?,updated_at=? WHERE id=?").bind(name,role,override,b.notificationEnabled===undefined?target.notification_enabled:b.notificationEnabled?1:0,now(),target.id).run();
        return answer({ok:true});
      }
      match=path.match(/^\/api\/v1\/admin\/users\/([^/]+)\/temporary-password$/);
      if(match&&method==="POST"){
        ensure(user,true);const target=await db.prepare("SELECT id FROM users WHERE id=?").bind(match[1]).first();
        if(!target)fail("Pessoa não encontrada.",404);
        const pw=randomToken().slice(0,18)+"!Aa9",salt=randomToken();
        await db.prepare("UPDATE users SET pass_hash=?,pass_salt=?,must_change_password=1,updated_at=? WHERE id=?").bind(await pwHash(pw,salt),salt,now(),target.id).run();
        await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id).run();
        return answer({temporaryPassword:pw});
      }
      if(path==="/api/v1/admin/notification-template"&&method==="PUT"){
        ensure(user,true);const b=await body(req);
        const subject=str(b.subject,200),message=String(b.message??"").trim().slice(0,10000);
        if(!subject||!message)fail("Informe assunto e mensagem do modelo.");
        if(b.kind===undefined){
          // Compatibilidade com o modelo único anterior.
          await db.prepare("INSERT INTO app_settings(key,value) VALUES('notificationTemplate',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({subject,body:message})).run();
        }else{
          if(!["create","review","due_soon","overdue"].includes(b.kind))fail("Tipo de notificação inválido.");
          const saved=await db.prepare("SELECT value FROM app_settings WHERE key='notificationTemplates'").first();
          const models=asJson(saved?.value,{});
          models[b.kind]={subject,body:message};
          await db.prepare("INSERT INTO app_settings(key,value) VALUES('notificationTemplates',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(models)).run();
        }
        return answer({ok:true});
      }
      if(path==="/api/v1/admin/reminder-settings"&&method==="PUT"){
        ensure(user,true);
        const b=await body(req);
        const daysBefore=Number(b.daysBefore);
        if(typeof b.dueSoonEnabled!=="boolean"||typeof b.overdueEnabled!=="boolean"||
           !Number.isInteger(daysBefore)||daysBefore<1||daysBefore>30)
          fail("Configure os avisos e a antecedência entre 1 e 30 dias.");
        const existing=await db.prepare("SELECT value FROM app_settings WHERE key='reminderSettings'").first();
        const previously=asJson(existing?.value,{});
        const overdueAudience=b.overdueAudience??previously.overdueAudience??"pending";
        if(!["pending","all"].includes(overdueAudience))fail("Escolha destinatários válidos para os avisos de prazo vencido.");
        const config={dueSoonEnabled:b.dueSoonEnabled,daysBefore,overdueEnabled:b.overdueEnabled,overdueAudience};
        await db.prepare("INSERT INTO app_settings(key,value) VALUES('reminderSettings',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(config)).run();
        return answer({ok:true,reminderSettings:config});
      }
      if(path==="/api/v1/admin/settings"&&method==="PUT"){
        ensure(user,true);const b=await body(req);
        await db.batch(["autoMonth","autoWeek"].map(k=>db.prepare("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k,JSON.stringify(Boolean(b[k])))));
        return answer({ok:true});
      }
      if(path==="/api/v1/admin/commissions-batch"&&method==="PUT"){
        ensure(user,true);
        const b=await body(req),incoming=isArr(b.commissions);
        const existing=(await db.prepare("SELECT id,max_members,sort_order FROM commissions").all()).results;
        if(!existing.length||incoming.length!==existing.length||incoming.length>100)
          fail("A lista de comissões foi alterada. Atualize o painel e tente novamente.",409);
        const currentById=new Map(existing.map(c=>[c.id,c]));
        const ids=new Set();
        for(const row of incoming){
          if(!row||typeof row.id!=="string"||!currentById.has(row.id)||ids.has(row.id)||
             !Number.isInteger(row.maxMembers)||row.maxMembers<0||row.maxMembers>999)
            fail("Revise as vagas e a lista de comissões. Nenhuma alteração foi salva.");
          ids.add(row.id);
        }
        // Validar todas as comissões ANTES de atualizar uma única linha.
        const counts=(await db.prepare("SELECT commission_id,COUNT(*) AS n FROM commission_members GROUP BY commission_id").all()).results;
        const memberCounts=new Map(counts.map(c=>[c.commission_id,Number(c.n)]));
        for(const item of incoming){
          const min=memberCounts.get(item.id)||0;
          if(item.maxMembers>0&&item.maxMembers<min)
            fail("Vagas insuficientes na comissão. Revise os limites antes de salvar todas as alterações.");
        }
        await db.batch(incoming.map((c,index)=>
          db.prepare("UPDATE commissions SET max_members=?,sort_order=? WHERE id=?")
            .bind(c.maxMembers,index+1,c.id)));
        return answer({ok:true,updated:incoming.length});
      }
      if(path==="/api/v1/admin/commission-order"&&method==="PUT"){
        ensure(user,true);const b=await body(req),ids=unique(b.ids);
        const current=(await db.prepare("SELECT id FROM commissions").all()).results.map(x=>x.id);
        if(ids.length!==current.length||ids.some(id=>!current.includes(id)))fail("Lista de comissões incompleta.");
        await db.batch(ids.map((id,i)=>db.prepare("UPDATE commissions SET sort_order=? WHERE id=?").bind(i+1,id)));
        return answer({ok:true});
      }
      if(path==="/api/v1/commissions"&&method==="POST"){
        ensure(user);const b=await body(req),name=str(b.name,90);
        if(!name)fail("Informe o nome da comissão.");
        const image=String(b.imageData||"");
        if(image.length>950000||image&&!/^data:image\/(png|jpeg|webp);base64,/.test(image))fail("Imagem inválida ou muito grande.");
        await db.prepare("INSERT INTO commissions(id,name,description,background_color,image_data,max_members,sort_order,created_at) VALUES(?,?,?,?,?,0,(SELECT COALESCE(MAX(sort_order),0)+1 FROM commissions),?)").bind(uid(),name,str(b.description,2000),color(b.backgroundColor),image,now()).run();
        return answer({ok:true});
      }
      match=path.match(/^\/api\/v1\/commissions\/([^/]+)$/);
      if(match&&method==="PUT"){
        ensure(user);const b=await body(req),c=await db.prepare("SELECT * FROM commissions WHERE id=?").bind(match[1]).first();
        if(!c)fail("Comissão não encontrada.",404);
        const image=b.imageData===undefined?c.image_data:String(b.imageData);
        if(image.length>950000||image&&!/^data:image\/(png|jpeg|webp);base64,/.test(image))fail("Imagem inválida ou muito grande.");
        const mayManageVacancies=user.role==="admin"&&user.session_admin_scope===1;
        if(b.maxMembers!==undefined&&Number(b.maxMembers)!==Number(c.max_members)&&!mayManageVacancies)fail("Somente a Administração altera vagas das comissões.",403);
        const max=mayManageVacancies&&Number.isInteger(b.maxMembers)&&b.maxMembers>=0?b.maxMembers:c.max_members;
        if(max>0){const count=await db.prepare("SELECT COUNT(*) AS n FROM commission_members WHERE commission_id=?").bind(c.id).first();if(count.n>max)fail("O limite não pode ser inferior à quantidade de integrantes atuais.")}
        await db.prepare("UPDATE commissions SET name=?,description=?,background_color=?,image_data=?,max_members=? WHERE id=?").bind(str(b.name||c.name,90),str(b.description??c.description,2000),color(b.backgroundColor||c.background_color),image,max,c.id).run();
        return answer({ok:true});
      }
      if(match&&method==="DELETE"){
        ensure(user,true);
        const linked=await db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE commission_ids LIKE ?").bind("%"+match[1]+"%").first();
        if(linked.n)fail("A comissão possui demandas vinculadas. Remova o vínculo antes de excluir.");
        await db.prepare("DELETE FROM commissions WHERE id=?").bind(match[1]).run();
        return answer({ok:true});
      }
      match=path.match(/^\/api\/v1\/commissions\/([^/]+)\/(join|leave)$/);
      if(match&&method==="POST"){
        ensure(user);const c=await db.prepare("SELECT * FROM commissions WHERE id=?").bind(match[1]).first();
        if(!c)fail("Comissão não encontrada.",404);
        if(match[2]==="leave"){await db.prepare("DELETE FROM commission_members WHERE commission_id=? AND user_id=?").bind(c.id,user.id).run();return answer({ok:true})}
        const existing=await db.prepare("SELECT 1 AS n FROM commission_members WHERE commission_id=? AND user_id=?").bind(c.id,user.id).first();
        if(existing)return answer({ok:true});
        // 0 significa que a Administração ainda NÃO definiu as vagas; jamais tratar como ilimitado.
        if(!Number.isInteger(c.max_members)||c.max_members<=0)fail("Esta comissão ainda não possui vagas definidas pela Administração.",409);
        // Condição atômica: respeita as vagas mesmo com duas inscrições simultâneas.
        const result=await db.prepare("INSERT OR IGNORE INTO commission_members(commission_id,user_id,created_at) SELECT ?,?,? WHERE (SELECT max_members FROM commissions WHERE id=?)>0 AND (SELECT COUNT(*) FROM commission_members WHERE commission_id=?) < (SELECT max_members FROM commissions WHERE id=?)").bind(c.id,user.id,now(),c.id,c.id,c.id).run();
        if(!result.meta.changes)fail("Esta comissão está com todas as vagas preenchidas.",409);
        return answer({ok:true});
      }
      if(path==="/api/v1/admin/tasks/bulk-delete"&&method==="POST"){
        ensure(user,true);
        const b=await body(req);
        if(!Array.isArray(b.taskIds)||!b.taskIds.length||b.taskIds.length>100)
          fail("Selecione de 1 a 100 demandas concluídas para excluir.",400);
        if(b.taskIds.some(id=>typeof id!=="string"||!id||id.length>100))
          fail("Os identificadores das demandas devem ser textos válidos.",400);
        const ids=unique(b.taskIds);
        if(ids.length!==b.taskIds.length)
          fail("A seleção contém demandas repetidas.",400);
        const placeholders=ids.map(()=>"?").join(",");
        // Nenhuma remoção ocorre caso haja demandas pendentes, inexistentes ou alteradas.
        const rows=(await db.prepare("SELECT id,archived_at FROM tasks WHERE id IN ("+placeholders+")")
          .bind(...ids).all()).results;
        if(rows.length!==ids.length||rows.some(t=>!t.archived_at))
          fail("A seleção contém uma demanda que não está concluída. Atualize a listagem e tente novamente.",409);
        await db.batch([
          db.prepare("DELETE FROM email_queue WHERE id IN (SELECT queue_id FROM deadline_notice_log WHERE task_id IN ("+placeholders+"))").bind(...ids),
          db.prepare("DELETE FROM deadline_notice_log WHERE task_id IN ("+placeholders+")").bind(...ids),
          db.prepare("DELETE FROM task_history WHERE task_id IN ("+placeholders+")").bind(...ids),
          db.prepare("DELETE FROM tasks WHERE id IN ("+placeholders+") AND archived_at IS NOT NULL").bind(...ids)
        ]);
        return answer({ok:true,deletedCount:ids.length});
      }
      if(path==="/api/v1/tasks"&&method==="POST"){
        ensure(user);const b=await body(req),t=validateTask(b),id=uid(),stamp=now(),start=stamp.slice(0,10);
        const allC=(await db.prepare("SELECT id FROM commissions").all()).results.map(c=>c.id),allU=(await db.prepare("SELECT id FROM users").all()).results.map(c=>c.id);
        if(t.commissionIds.some(x=>!allC.includes(x))||t.assigneeIds.some(x=>!allU.includes(x)))fail("Responsáveis ou comissões não encontrados.");
        await verifyEveryoneScope(db,t);
        await db.prepare("INSERT INTO tasks(id,title,description,caption_text,registered_at,assignee_ids,commission_ids,commission_done,deadlines,status,created_by,updated_by,created_at,updated_at,overview_visible,assignment_scope) VALUES(?,?,?,?,?,?,?,'{}',?,'pendente',?,?,?,?,?,?)").bind(id,t.title,t.description,t.captionText,start,JSON.stringify(t.assigneeIds),JSON.stringify(t.commissionIds),JSON.stringify(t.deadlines),user.id,user.id,stamp,stamp,t.overviewVisible?1:0,t.assignmentScope).run();
        await audit(db,id,user,"Cadastrou a demanda");
        if(t.assignmentScope==="todos")await autoCompleteCollectiveEvents(env,id);
        await askNotify(db,env,ctx,user,b,fullAfter(t,{title:t.title}),"Nova demanda","cadastrou");
        return answer({ok:true,id},201);
      }
      match=path.match(/^\/api\/v1\/tasks\/([^/]+)$/);
      if(match&&method==="PUT"){
        ensure(user);const old=await readTask(db,match[1]),b=await body(req);
        if(old.archivedAt)fail("Demandas arquivadas não podem ser editadas.",409);
        const t=validateTask(b,old),stamp=now();
        const validC=(await db.prepare("SELECT id FROM commissions").all()).results.map(x=>x.id);
        const validU=(await db.prepare("SELECT id FROM users").all()).results.map(x=>x.id);
        if(t.commissionIds.some(x=>!validC.includes(x))||t.assigneeIds.some(x=>!validU.includes(x)))fail("Comissão ou responsável inválido.");
        await verifyEveryoneScope(db,t);
        const gone=Object.keys(old.commissionDone||{}).some(id=>!t.commissionIds.includes(id));
        if(gone)fail("Não remova comissões que já concluíram a demanda.");
        if(Object.keys(old.userDone||{}).some(id=>!t.assigneeIds.includes(id)))fail("Não remova pessoas que já concluíram sua participação.");
        const oldStages=new Map(old.deadlines.map(d=>[d.id,d]));
        t.deadlines=t.deadlines.map(d=>{const previous=oldStages.get(d.id);return previous&&previous.label===d.label&&previous.dueAt===d.dueAt?{...d,completedAt:previous.completedAt||null,commissionCompleted:previous.commissionCompleted||{}}:{...d,completedAt:null,commissionCompleted:{}}});
        const changed=await db.prepare("UPDATE tasks SET title=?,description=?,caption_text=?,assignee_ids=?,commission_ids=?,deadlines=?,overview_visible=?,assignment_scope=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND version=?").bind(t.title,t.description,t.captionText,JSON.stringify(t.assigneeIds),JSON.stringify(t.commissionIds),JSON.stringify(t.deadlines),t.overviewVisible?1:0,t.assignmentScope,user.id,stamp,old.id,old.version).run();
        if(!changed.meta.changes)fail("A demanda foi alterada por outra pessoa. Atualize a página e tente novamente.",409);
        await audit(db,old.id,user,"Atualizou dados, prazos ou responsáveis");
        if(t.assignmentScope==="todos")await autoCompleteCollectiveEvents(env,old.id);
        if(t.captionText!==old.captionText){
          await markTutorReviewAfterCorrection(db,old,user,stamp);
          await askNotify(db,env,ctx,user,b,fullAfter(t,{title:t.title}),"Texto para revisão","atualizou o texto para revisão");
        }
        return answer({ok:true});
      }
      if(match&&method==="DELETE"){
        ensure(user);const old=await readTask(db,match[1]);
        if(old.archivedAt)ensure(user,true);
        else {
          // As permissões de exclusão de demandas ativas independem de quem as criou.
          // A sessão deve ter cargo de edição; contas comuns continuam bloqueadas.
          const allowed=user.role==="petiano"||user.role==="tutor"||
            (user.role==="admin"&&user.session_admin_scope===1);
          if(!allowed)fail("Somente PETianos(as), Tutoria ou Administração podem excluir demandas ativas.",403);
        }
        // Apagar de forma atômica, inclusive os avisos de prazo pendentes e o histórico.
        // A autorização é validada no Worker, não por campos enviados pelo navegador.
        await db.batch([
          db.prepare("DELETE FROM email_queue WHERE id IN (SELECT queue_id FROM deadline_notice_log WHERE task_id=?)").bind(old.id),
          db.prepare("DELETE FROM deadline_notice_log WHERE task_id=?").bind(old.id),
          db.prepare("DELETE FROM task_history WHERE task_id=?").bind(old.id),
          db.prepare("DELETE FROM tasks WHERE id=?").bind(old.id)
        ]);
        return answer({ok:true});
      }
      match=path.match(/^\/api\/v1\/tasks\/([^/]+)\/(status|notes|finish)$/);
      if(match&&method==="PATCH"){
        ensure(user);const old=await readTask(db,match[1]),b=await body(req),stamp=now();
        if(old.archivedAt)fail("A demanda já está arquivada.",409);
        if(match[2]==="finish"&&old.assignmentScope==="todos")
          fail("Eventos coletivos são concluídos automaticamente após a data do evento.",409);
        if(match[2]==="notes"){
          const value=String(b.captionText||"").slice(0,30000);
          await db.prepare("UPDATE tasks SET caption_text=?,updated_by=?,updated_at=?,version=version+1 WHERE id=?").bind(value,user.id,stamp,old.id).run();
          await audit(db,old.id,user,"Atualizou observações");
          if(value!==old.captionText){
            await markTutorReviewAfterCorrection(db,old,user,stamp);
            await askNotify(db,env,ctx,user,b,old,"Texto para revisão","atualizou o texto para revisão");
          }
          return answer({ok:true});
        }
        if(match[2]==="status")fail("Utilize apenas a opção Concluir, sem estados de pendência ou aprovação.",410);
        // Conclusão individual ou conjunta: pessoas e comissões vinculadas, uma única gravação.
        const commissionIds=old.commissionIds||[],assigneeIds=old.assigneeIds||[];
        const selectedCommissions=unique(b.commissionIds),selectedUsers=unique(b.userIds);
        if(!selectedCommissions.length&&!selectedUsers.length){
          if(b.commissionId)selectedCommissions.push(str(b.commissionId,100));
          else selectedUsers.push(user.id);
        }
        if(selectedCommissions.some(id=>!commissionIds.includes(id))||selectedUsers.some(id=>!assigneeIds.includes(id)))
          fail("Selecione apenas responsáveis vinculados à demanda.",403);
        const done={...old.commissionDone},userDone={...(old.userDone||{})};
        const changedCommissions=[],changedUsers=[];
        for(const id of selectedCommissions)if(!done[id]){done[id]={at:stamp,by:user.id,byName:user.name};changedCommissions.push(id);}
        for(const id of selectedUsers)if(!userDone[id]){userDone[id]={at:stamp,by:user.id,byName:user.name};changedUsers.push(id);}
        if(!changedCommissions.length&&!changedUsers.length)return answer({ok:true,alreadyDone:true,archived:false});
        const finished=commissionIds.every(id=>Boolean(done[id]))&&assigneeIds.every(id=>Boolean(userDone[id]));
        const stages=old.deadlines.map(d=>{
          const copy={...d,commissionCompleted:{...(d.commissionCompleted||{})}};
          for(const id of changedCommissions)copy.commissionCompleted[id]={at:stamp,by:user.id};
          if(finished)copy.completedAt=stamp;
          return copy;
        });
        const result=await db.prepare("UPDATE tasks SET commission_done=?,user_done=?,deadlines=?,status=?,archived_at=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND version=?").bind(JSON.stringify(done),JSON.stringify(userDone),JSON.stringify(stages),finished?"concluida":old.status,finished?stamp:null,user.id,stamp,old.id,old.version).run();
        if(!result.meta.changes)fail("Outra pessoa atualizou a atividade. Atualize e tente novamente.",409);
        const names=[];
        for(const id of changedUsers){const row=await db.prepare("SELECT name FROM users WHERE id=?").bind(id).first();names.push(row?.name||"Usuário");}
        for(const id of changedCommissions){const row=await db.prepare("SELECT name FROM commissions WHERE id=?").bind(id).first();names.push("Comissão "+(row?.name||id));}
        const action="Registrou conclusão de: "+names.join(", ");
        await audit(db,old.id,user,action,b.early?"Conclusão antecipada confirmada":"");
        return answer({ok:true,archived:finished,remainingCommissions:commissionIds.filter(id=>!done[id]),remainingUsers:assigneeIds.filter(id=>!userDone[id])});
      }
      if(path==="/api/v1/meetings"&&method==="POST"){
        ensure(user);const b=await body(req),title=str(b.title,180),date=standardTime(b.date);
        if(!title||!date)fail("Informe título e data.");
        await db.prepare("INSERT INTO meetings(id,title,meeting_date,raw_notes,theme,color_a,color_b,created_by,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(uid(),title,date,String(b.rawNotes||"").slice(0,50000),str(b.theme,30),color(b.colorA),color(b.colorB),user.id,user.id,now()).run();
        return answer({ok:true});
      }
      match=path.match(/^\/api\/v1\/meetings\/([^/]+)$/);
      if(match&&method==="PUT"){
        ensure(user);const b=await body(req),title=str(b.title,180),date=standardTime(b.date);
        if(!title||!date)fail("Informe título e data.");
        await db.prepare("UPDATE meetings SET title=?,meeting_date=?,raw_notes=?,theme=?,color_a=?,color_b=?,updated_by=?,updated_at=? WHERE id=?").bind(title,date,String(b.rawNotes||"").slice(0,50000),str(b.theme,30),color(b.colorA),color(b.colorB),user.id,now(),match[1]).run();
        return answer({ok:true});
      }
      if(match&&method==="DELETE"){
        ensure(user);await db.prepare("DELETE FROM meetings WHERE id=?").bind(match[1]).run();return answer({ok:true});
      }
      if(path==="/api/v1/mail/status"&&method==="GET"){
        ensure(user,true);
        return answer(await mailBridgeStatus(env));
      }
      if(path==="/api/v1/mail"&&method==="GET"){
        ensure(user,true);
        const items=(await db.prepare("SELECT id,kind,recipient_emails,subject,body,scheduled_at,status,attempts,error_message,created_at,sent_at FROM email_queue ORDER BY created_at DESC LIMIT 250").all()).results;
        return answer({items:items.map(x=>({...x,recipientEmails:asJson(x.recipient_emails,[])}))});
      }
      if(path==="/api/v1/mail"&&method==="POST"){
        ensure(user,true);const b=await body(req),subject=str(b.subject,200),message=str(b.message,30000);
        if(!subject||!message)fail("Informe assunto e mensagem.");
        const when=b.scheduledAt?new Date(b.scheduledAt):new Date();
        if(Number.isNaN(when.getTime()))fail("Data ou horário inválido.");
        const scheduled=when.getTime()>Date.now()+60000;
        const attachments=isArr(b.attachments);
        if(scheduled&&attachments.length)fail("E-mails agendados não aceitam anexos.");
        const recipients=await recipientEmails(db,b);
        if(!recipients.length)fail("Nenhum destinatário selecionado.");
        // Evita registrar um envio imediato em uma fila que já sabemos que será recusada.
        // Um agendamento futuro permanece possível enquanto a integração é configurada.
        if(!scheduled){
          const health=await mailBridgeStatus(env);
          if(!health.connected)fail("Gmail indisponível: "+health.message,503);
        }
        if(attachments.length){
          // Anexos via ponte Gmail, sem persistir conteúdo dos arquivos em D1 ou no GitHub.
          const logId=uid(),stamp=now();
          try{
            await authorizedMail(env,recipients,subject,message,attachments);
            await db.prepare("INSERT INTO email_queue(id,creator_id,kind,recipient_emails,subject,body,scheduled_at,status,created_at,sent_at) VALUES(?,?,'manual',?,?,?,?,'enviado',?,?)").bind(logId,user.id,JSON.stringify(recipients),subject,"[Mensagem enviada com anexos; conteúdo não persistido]",stamp,stamp,stamp).run();
          }catch(err){await db.prepare("INSERT INTO email_queue(id,creator_id,kind,recipient_emails,subject,body,scheduled_at,status,created_at,error_message) VALUES(?,?,'manual',?,?,?,?,'falhou',?,?)").bind(logId,user.id,JSON.stringify(recipients),subject,"[Envio com anexos não persistidos]",stamp,stamp,str(err.message,400)).run();fail("Falha no envio: "+err.message,502)}
          return answer({ok:true,id:logId,status:"enviado"});
        }
        const id=await enqueue(db,user.id,scheduled?"agendado":"manual",recipients,subject,message,when.toISOString());
        if(!scheduled)ctx.waitUntil(processQueue(env,3));
        return answer({ok:true,id,status:scheduled?"agendado":"pendente"},201);
      }
      if(path==="/api/v1/mail/clear"&&method==="POST"){
        ensure(user,true);
        const res=await db.prepare("DELETE FROM email_queue WHERE status IN ('enviado','falhou')").run();
        return answer({ok:true,deleted:res.meta.changes});
      }
      if(path==="/api/v1/mail/retry"&&method==="POST"){
        ensure(user,true);const b=await body(req);
        const health=await mailBridgeStatus(env);
        if(!health.connected)fail("Não é possível tentar novamente: "+health.message,503);
        await db.prepare("UPDATE email_queue SET status='pendente',scheduled_at=?,error_message=NULL WHERE id=? AND status='falhou' AND kind!='manual-attachment' AND body NOT LIKE '[Envio com anexos%'").bind(now(),str(b.id,100)).run();
        ctx.waitUntil(processQueue(env,2));return answer({ok:true});
      }
      fail("Rota não encontrada.",404);
    }catch(err){
      if((err.status||500)>=500)console.error("PET Gestão Worker:",diagnosticStage,err.message);
      const safeCode=err.message==="ADMIN_EMAIL ou ADMIN_INITIAL_PASSWORD inválido."?"ADMIN_SETUP_INVALID":(/D1_ERROR|no such table|SQLITE_|constraint failed/i.test(err.message)?"DATABASE_FAILURE":"SERVER_FAILURE");
      return answer({error:err.status?err.message:"Erro no servidor. Verifique a configuração e tente novamente.",code:safeCode,stage:err.safeStage||diagnosticStage},err.status||500);
    }
  }
export default {fetch:fetchApi,scheduled:(event,env,ctx)=>ctx.waitUntil((async()=>{await autoCompleteCollectiveEvents(env);await queueDeadlineReminders(env);await processQueue(env,15)})())};
