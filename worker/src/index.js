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
    return hex(await crypto.subtle.deriveBits({name:"PBKDF2",salt:utf8.encode(salt),iterations:160000,hash:"SHA-256"},key,256));
  }
  const json=(payload,status=200,origin="")=>new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":origin,"Vary":"Origin"}});
  const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
  const str=(v,max=1000)=>String(v??"").trim().slice(0,max);
  const email=v=>str(v,254).toLowerCase();
  const validEmail=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const isArr=v=>Array.isArray(v)?v:[];
  const unique=v=>[...new Set(isArr(v).map(String).filter(Boolean))];
  const idName=row=>({id:row.id,name:row.name,role:row.role});
  const userPublic=u=>({id:u.id,name:u.name,email:u.email,role:u.role,notificationEnabled:!!u.notification_enabled,mustChangePassword:!!u.must_change_password});
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
    const exists=await db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
    if(exists)return;
    const mail=email(env.ADMIN_EMAIL),pw=String(env.ADMIN_INITIAL_PASSWORD);
    if(!validEmail(mail)||pw.length<10)throw new Error("ADMIN_EMAIL ou ADMIN_INITIAL_PASSWORD inválido.");
    const collision=await db.prepare("SELECT id FROM users WHERE email=?").bind(mail).first();
    if(collision)throw new Error("O endereço do administrador pertence a uma conta não administrativa.");
    const salt=randomToken(),hash=await pwHash(pw,salt),stamp=now();
    await db.prepare("INSERT INTO users (id,name,email,pass_hash,pass_salt,role,created_at,updated_at) VALUES (?,?,?,?,?,'admin',?,?)").bind(uid(),"Admin",mail,hash,salt,stamp,stamp).run();
  }
  async function currentUser(req,db){
    const header=req.headers.get("authorization")||"";
    const token=header.match(/^Bearer ([A-Za-z0-9_-]{20,})$/);
    if(!token)return null;
    const digest=await sha(token[1]);
    return db.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(digest,now()).first();
  }
  function ensure(user,admin=false){
    if(!user)fail("Entre na sua conta para continuar.",401);
    if(user.must_change_password)fail("Troque sua senha temporária antes de continuar.",403);
    if(admin&&user.role!=="admin")fail("Acesso restrito à Administração.",403);
  }
  function requireLogin(user){if(!user)fail("É necessário entrar na sua conta.",401)}
  async function audit(db,taskId,user,action,details=""){
    await db.prepare("INSERT INTO task_history (id,task_id,actor_id,actor_name,action,details,created_at) VALUES (?,?,?,?,?,?,?)").bind(uid(),taskId,user.id,user.name,action,details,now()).run();
  }
  async function createSession(db,user){
    const token=randomToken(),digest=await sha(token);
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(digest,user.id,isoAfter(7*24*60),now()).run();
    return {token,user:userPublic(user)};
  }
  async function resetRate(db,mail){await db.prepare("DELETE FROM auth_attempts WHERE email=?").bind(mail).run()}
  async function rateFail(db,mail){
    const prev=await db.prepare("SELECT * FROM auth_attempts WHERE email=?").bind(mail).first();
    const recent=prev&&Date.now()-Date.parse(prev.started_at)<15*60000,attempts=recent?prev.attempts+1:1;
    await db.prepare("INSERT INTO auth_attempts(email,attempts,started_at,blocked_until) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET attempts=excluded.attempts,started_at=excluded.started_at,blocked_until=excluded.blocked_until").bind(mail,attempts,recent?prev.started_at:now(),attempts>=6?isoAfter(15):null).run();
  }
  const privateTask=t=>{
    const o={...t,commissionIds:asJson(t.commission_ids,[]),assigneeIds:asJson(t.assignee_ids,[]),commissionDone:asJson(t.commission_done,{}),deadlines:asJson(t.deadlines,[])};
    return {id:o.id,title:o.title,description:o.description,captionText:o.caption_text,registeredAt:o.registered_at,assigneeIds:o.assigneeIds,commissionIds:o.commissionIds,commissionDone:o.commissionDone,deadlines:o.deadlines,status:o.status,archivedAt:o.archived_at,createdAt:o.created_at,updatedAt:o.updated_at,updatedBy:o.updated_by,version:o.version};
  };
  const publicTask=t=>({id:t.id,title:t.title,registeredAt:t.registered_at,commissionIds:asJson(t.commission_ids,[]),commissionDone:asJson(t.commission_done,{}),status:t.status,archivedAt:t.archived_at,deadlines:asJson(t.deadlines,[]).map(d=>({label:d.label,dueAt:d.dueAt,completedAt:d.completedAt||null}))});
  async function bootstrap(db,user){
    const committees=(await db.prepare("SELECT c.*, (SELECT COUNT(*) FROM commission_members m WHERE m.commission_id=c.id) AS member_count FROM commissions c ORDER BY sort_order,name").all()).results;
    const members=(await db.prepare("SELECT commission_id,user_id FROM commission_members").all()).results;
    const rawTasks=(await db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 1000").all()).results;
    const settings=Object.fromEntries((await db.prepare("SELECT key,value FROM app_settings").all()).results.map(x=>[x.key,asJson(x.value,x.value)]));
    let meetings=[],users=[],history=[];
    if(user){
      meetings=(await db.prepare("SELECT * FROM meetings ORDER BY meeting_date DESC LIMIT 250").all()).results.map(m=>({id:m.id,title:m.title,date:m.meeting_date,rawNotes:m.raw_notes,theme:m.theme,colorA:m.color_a,colorB:m.color_b,updatedAt:m.updated_at}));
      users=(await db.prepare("SELECT id,name,role FROM users ORDER BY name").all()).results.map(idName);
      history=(await db.prepare("SELECT h.task_id,h.actor_name,h.action,h.details,h.created_at,u.role AS actor_role FROM task_history h LEFT JOIN users u ON u.id=h.actor_id ORDER BY h.created_at DESC LIMIT 800").all()).results;
    }else{
      meetings=(await db.prepare("SELECT id,title,meeting_date AS date FROM meetings ORDER BY meeting_date DESC LIMIT 100").all()).results;
    }
    const counts=Object.create(null);
    for(const m of members){(counts[m.commission_id]??=[]).push(m.user_id)}
    return {session:user?{user:userPublic(user)}:null,users,committees:committees.map(c=>({id:c.id,name:c.name,description:c.description,backgroundColor:c.background_color,imageData:c.image_data,maxMembers:c.max_members,sortOrder:c.sort_order,memberCount:c.member_count,memberIds:user?(counts[c.id]||[]):[]})),
      tasks:rawTasks.map(t=>user?privateTask(t):publicTask(t)),meetings,events:history.filter(x=>["tutor","admin"].includes(x.actor_role)&&/observa|corrig|praz|aprov|liber|conclu/i.test(x.action)).slice(0,12).map(x=>({taskId:x.task_id,summary:x.action,actorName:x.actor_name,createdAt:x.created_at})),history:user?history:[],settings};
  }
  async function authorizedMail(env,recipients,subject,message,attachments=[]){
    if(!env.MAIL_BRIDGE_URL||!env.MAIL_BRIDGE_TOKEN)throw new Error("Integração do e-mail não configurada.");
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(env.MAIL_BRIDGE_URL))throw new Error("URL do Apps Script inválida.");
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
      const res=await fetch(env.MAIL_BRIDGE_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({acao:"enviar",token:env.MAIL_BRIDGE_TOKEN,para:emailList.slice(i,i+45),assunto:subject,mensagem:message,tipo:"imediato",anexos:attachments}),redirect:"follow"});
      const text=await res.text();const reply=asJson(text,null);
      if(!res.ok||!reply?.ok)throw new Error("Falha no serviço de e-mail: "+(reply?.erro||"resposta inválida"));
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
  async function askNotify(db,env,ctx,user,payload,task,title,action){
    if(user.role!=="tutor"&&user.role!=="admin")return;
    if(!user.notification_enabled||payload.notify!==true)return;
    const ids=new Set(unique(task.assigneeIds));
    for(const cId of task.commissionIds){
      const members=(await db.prepare("SELECT user_id FROM commission_members WHERE commission_id=?").bind(cId).all()).results;
      members.forEach(m=>ids.add(m.user_id));
    }
    ids.delete(user.id);
    const recipients=await recipientEmails(db,{userIds:[...ids]});
    if(!recipients.length)return;
    await enqueue(db,user.id,"automatica",recipients,"PET Gestão — "+title,"Olá!\n\n"+user.name+" "+action+" na demanda \""+task.title+"\".\n\nAcesse o PET Gestão para consultar as informações.\n\nPET Educação",now());
    ctx.waitUntil(processQueue(env,2));
  }
  function validateTask(payload,old=null){
    const title=str(payload.title,180);
    if(!title)fail("Informe o título da demanda.");
    const assigneeIds=unique(payload.assigneeIds),commissionIds=unique(payload.commissionIds);
    if(!assigneeIds.length&&!commissionIds.length)fail("Selecione responsáveis ou uma comissão.");
    const stages=isArr(payload.deadlines).slice(0,40).map(d=>({id:str(d.id||uid(),60),label:str(d.label,20),dueAt:standardTime(d.dueAt),assigneeIds:unique(d.assigneeIds),commissionCompleted:d.commissionCompleted&&typeof d.commissionCompleted==="object"?d.commissionCompleted:{},completedAt:d.completedAt||null}));
    if(!stages.some(d=>d.label==="Prazo"&&d.dueAt))fail("Informe pelo menos uma etapa Prazo com data.");
    if(stages.some(d=>!["Prazo","Correção","Postagem"].includes(d.label)||!d.dueAt))fail("Etapa inválida ou sem data.");
    if(!old&&stages.some(d=>Number(d.dueAt.slice(0,4))<currentYear()))fail("Não é permitido cadastrar datas de anos anteriores.");
    const limits=["Prazo","Correção","Postagem"].map(s=>stages.filter(d=>d.label===s).map(x=>x.dueAt).sort());
    if(limits[0].length&&limits[1].length&&limits[1][0]<limits[0][limits[0].length-1])fail("A correção não pode acontecer antes do prazo.");
    if(limits[2].length&&((limits[1].length&&limits[2][0]<limits[1][limits[1].length-1])||(!limits[1].length&&limits[2][0]<limits[0][limits[0].length-1])))fail("A postagem não pode acontecer antes da etapa anterior.");
    return {title,description:str(payload.description,12000),captionText:String(payload.captionText??old?.captionText??"").slice(0,30000),assigneeIds,commissionIds,deadlines:stages};
  }
  function fullAfter(t,patch){return {...t,...patch}};
  async function readTask(db,id){const t=await db.prepare("SELECT * FROM tasks WHERE id=?").bind(id).first();if(!t)fail("Demanda não encontrada.",404);return privateTask(t)}
  async function fetchApi(req,env,ctx){
    const url=new URL(req.url),path=url.pathname.replace(/\/+$/,""),method=req.method,db=env.DB,origin=req.headers.get("Origin")||"";
    const allowed=["https://peteducacao.github.io", "http://localhost:8000", "http://127.0.0.1:8000",new URL(req.url).origin];
    if(origin&&!allowed.includes(origin))return json({error:"Origem não autorizada."},403,"");
    if(method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Access-Control-Max-Age":"3600","Vary":"Origin"}});
    const answer=(data,status=200)=>json(data,status,origin);
    try{
      if(path==="/api/v1/health")return answer({ok:true,service:"PET Gestão",database:!!db,now:now()});
      if(!db)fail("Banco D1 não conectado.",503);
      await seedAdmin(db,env);
      const user=await currentUser(req,db);
      if(path==="/api/v1/bootstrap"&&method==="GET")return answer(await bootstrap(db,user));
      if(path==="/api/v1/auth/register"&&method==="POST"){
        const b=await body(req),name=str(b.name,120),mail=email(b.email),pw=String(b.password||"");
        if(name.length<2||!validEmail(mail)||pw.length<10||pw.length>200)fail("Informe nome, e-mail válido e senha com pelo menos 10 caracteres.");
        if(await db.prepare("SELECT id FROM users WHERE email=?").bind(mail).first())fail("E-mail já cadastrado.",409);
        const salt=randomToken(),stamp=now();
        await db.prepare("INSERT INTO users(id,name,email,pass_hash,pass_salt,role,created_at,updated_at) VALUES(?,?,?,?,?,'petiano',?,?)").bind(uid(),name,mail,await pwHash(pw,salt),salt,stamp,stamp).run();
        return answer({ok:true},201);
      }
      if(path==="/api/v1/auth/login"&&method==="POST"){
        const b=await body(req),mail=email(b.email),pw=String(b.password||"");
        const attempts=await db.prepare("SELECT * FROM auth_attempts WHERE email=?").bind(mail).first();
        if(attempts?.blocked_until&&attempts.blocked_until>now())fail("Muitas tentativas. Tente novamente mais tarde.",429);
        const u=await db.prepare("SELECT * FROM users WHERE email=?").bind(mail).first();
        if(!u||await pwHash(pw,u.pass_salt)!==u.pass_hash){await rateFail(db,mail);fail("Credenciais inválidas.",401)}
        await resetRate(db,mail);return answer(await createSession(db,u));
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
      if(path==="/api/v1/account"&&method==="PATCH"){
        ensure(user);const b=await body(req);
        await db.prepare("UPDATE users SET notification_enabled=?,updated_at=? WHERE id=?").bind(b.notificationEnabled?1:0,now(),user.id).run();
        return answer({ok:true});
      }
      if(path==="/api/v1/admin/users"&&method==="GET"){
        ensure(user,true);return answer({users:(await db.prepare("SELECT id,name,email,role,notification_enabled,must_change_password,created_at FROM users ORDER BY name").all()).results.map(userPublic)});
      }
      let match=path.match(/^\/api\/v1\/admin\/users\/([^/]+)$/);
      if(match&&method==="PATCH"){
        ensure(user,true);const b=await body(req),target=await db.prepare("SELECT * FROM users WHERE id=?").bind(match[1]).first();
        if(!target)fail("Usuário não encontrado.",404);
        const role=["petiano","tutor","admin"].includes(b.role)?b.role:target.role;
        if(target.role==="admin"&&role!=="admin"){
          const count=await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
          if(count.n<=1)fail("Não é possível remover o último administrador.");
        }
        const name=b.name!==undefined?str(b.name,120):target.name;
        if(name.length<2)fail("Nome inválido.");
        await db.prepare("UPDATE users SET name=?,role=?,notification_enabled=?,updated_at=? WHERE id=?").bind(name,role,b.notificationEnabled===undefined?target.notification_enabled:b.notificationEnabled?1:0,now(),target.id).run();
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
      if(path==="/api/v1/admin/settings"&&method==="PUT"){
        ensure(user,true);const b=await body(req);
        await db.batch(["autoMonth","autoWeek"].map(k=>db.prepare("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k,JSON.stringify(Boolean(b[k])))));
        return answer({ok:true});
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
        const max=user.role==="admin"&&Number.isInteger(b.maxMembers)&&b.maxMembers>=0?b.maxMembers:c.max_members;
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
        // Inserção com condição atômica para não ultrapassar vagas concorrentes.
        const result=await db.prepare("INSERT OR IGNORE INTO commission_members(commission_id,user_id,created_at) SELECT ?,?,? WHERE (SELECT max_members FROM commissions WHERE id=?)=0 OR (SELECT COUNT(*) FROM commission_members WHERE commission_id=?) < (SELECT max_members FROM commissions WHERE id=?)").bind(c.id,user.id,now(),c.id,c.id,c.id).run();
        if(!result.meta.changes)fail("Esta comissão está com todas as vagas preenchidas.",409);
        return answer({ok:true});
      }
      if(path==="/api/v1/tasks"&&method==="POST"){
        ensure(user);const b=await body(req),t=validateTask(b),id=uid(),stamp=now(),start=stamp.slice(0,10);
        const allC=(await db.prepare("SELECT id FROM commissions").all()).results.map(c=>c.id),allU=(await db.prepare("SELECT id FROM users").all()).results.map(c=>c.id);
        if(t.commissionIds.some(x=>!allC.includes(x))||t.assigneeIds.some(x=>!allU.includes(x)))fail("Responsáveis ou comissões não encontrados.");
        await db.prepare("INSERT INTO tasks(id,title,description,caption_text,registered_at,assignee_ids,commission_ids,commission_done,deadlines,status,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'{}',?,'pendente',?,?,?,?)").bind(id,t.title,t.description,t.captionText,start,JSON.stringify(t.assigneeIds),JSON.stringify(t.commissionIds),JSON.stringify(t.deadlines),user.id,user.id,stamp,stamp).run();
        await audit(db,id,user,"Cadastrou a demanda");
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
        const gone=Object.keys(old.commissionDone||{}).some(id=>!t.commissionIds.includes(id));
        if(gone)fail("Não remova comissões que já concluíram a demanda.");
        const oldStages=new Map(old.deadlines.map(d=>[d.id,d]));
        t.deadlines=t.deadlines.map(d=>{const previous=oldStages.get(d.id);return previous&&previous.label===d.label&&previous.dueAt===d.dueAt?{...d,completedAt:previous.completedAt||null,commissionCompleted:previous.commissionCompleted||{}}:{...d,completedAt:null,commissionCompleted:{}}});
        const changed=await db.prepare("UPDATE tasks SET title=?,description=?,caption_text=?,assignee_ids=?,commission_ids=?,deadlines=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND version=?").bind(t.title,t.description,t.captionText,JSON.stringify(t.assigneeIds),JSON.stringify(t.commissionIds),JSON.stringify(t.deadlines),user.id,stamp,old.id,old.version).run();
        if(!changed.meta.changes)fail("A demanda foi alterada por outra pessoa. Atualize a página e tente novamente.",409);
        await audit(db,old.id,user,"Atualizou dados, prazos ou responsáveis");
        await askNotify(db,env,ctx,user,b,fullAfter(t,{title:t.title}),"Alteração de demanda","alterou dados e prazos");
        return answer({ok:true});
      }
      match=path.match(/^\/api\/v1\/tasks\/([^/]+)\/(status|notes|finish)$/);
      if(match&&method==="PATCH"){
        ensure(user);const old=await readTask(db,match[1]),b=await body(req),stamp=now();
        if(old.archivedAt)fail("A demanda já está arquivada.",409);
        if(match[2]==="notes"){
          const value=String(b.captionText||"").slice(0,30000);
          await db.prepare("UPDATE tasks SET caption_text=?,updated_by=?,updated_at=?,version=version+1 WHERE id=?").bind(value,user.id,stamp,old.id).run();
          await audit(db,old.id,user,"Atualizou observações");
          await askNotify(db,env,ctx,user,b,old,"Observações","atualizou as observações");
          return answer({ok:true});
        }
        if(match[2]==="status"){
          if(!["pendente","aprovada"].includes(b.status))fail("Situação inválida.");
          await db.prepare("UPDATE tasks SET status=?,updated_by=?,updated_at=?,version=version+1 WHERE id=?").bind(b.status,user.id,stamp,old.id).run();
          await audit(db,old.id,user,b.status==="aprovada"?"Aprovou e liberou para postagem":"Marcou como pendente");
          await askNotify(db,env,ctx,user,b,old,"Situação","alterou a situação");
          return answer({ok:true});
        }
        const ids=old.commissionIds,commissionId=str(b.commissionId,100);
        if(ids.length&&!ids.includes(commissionId))fail("Selecione uma comissão vinculada.");
        if(!ids.length&&commissionId)fail("Esta demanda não tem comissão vinculada.");
        const done={...old.commissionDone};if(commissionId&&done[commissionId])return answer({ok:true,alreadyDone:true});
        if(!commissionId&&old.status==="concluida")return answer({ok:true,alreadyDone:true});
        if(commissionId)done[commissionId]={at:stamp,by:user.id,byName:user.name};
        const finished=ids.length?ids.every(x=>Boolean(done[x])):true;
        const stages=old.deadlines.map(d=>{
          const copy={...d,commissionCompleted:{...(d.commissionCompleted||{})}};
          if(commissionId)copy.commissionCompleted[commissionId]={at:stamp,by:user.id};
          if(finished)copy.completedAt=stamp;
          return copy;
        });
        // Controle de versão para duas comissões concluídas simultaneamente.
        const result=await db.prepare("UPDATE tasks SET commission_done=?,deadlines=?,status=?,archived_at=?,updated_by=?,updated_at=?,version=version+1 WHERE id=? AND version=?").bind(JSON.stringify(done),JSON.stringify(stages),finished?"concluida":old.status,finished?stamp:null,user.id,stamp,old.id,old.version).run();
        if(!result.meta.changes)fail("Outra pessoa atualizou a atividade. Atualize e confirme novamente.",409);
        await audit(db,old.id,user,commissionId?"Concluiu participação da comissão "+(await db.prepare("SELECT name FROM commissions WHERE id=?").bind(commissionId).first())?.name:"Concluiu a demanda",b.early?"Conclusão antecipada confirmada":"");
        await askNotify(db,env,ctx,user,b,old,"Conclusão","concluiu a atividade");
        return answer({ok:true,archived:finished,remaining:ids.filter(x=>!done[x])});
      }
      if(match&&method==="DELETE"){
        ensure(user);const old=await readTask(db,match[1]);
        if(!old.archivedAt)fail("Somente demandas arquivadas podem ser excluídas definitivamente.");
        await db.prepare("DELETE FROM tasks WHERE id=?").bind(old.id).run();
        return answer({ok:true});
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
        await db.prepare("UPDATE email_queue SET status='pendente',scheduled_at=?,error_message=NULL WHERE id=? AND status='falhou' AND kind!='manual-attachment' AND body NOT LIKE '[Envio com anexos%'").bind(now(),str(b.id,100)).run();
        ctx.waitUntil(processQueue(env,2));return answer({ok:true});
      }
      fail("Rota não encontrada.",404);
    }catch(err){
      if((err.status||500)>=500)console.error("PET Gestão Worker:",err.message);
      return answer({error:err.status?err.message:"Erro no servidor. Verifique a configuração e tente novamente."},err.status||500);
    }
  }
export default {fetch:fetchApi,scheduled:(event,env,ctx)=>ctx.waitUntil(processQueue(env,15))};
