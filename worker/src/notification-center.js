// PET Gestão — preferências individuais dos seis avisos por e-mail/Android/PC.
export const NOTICE_KINDS=["create","review","due_soon","overdue","event_soon","event_today"];
const stamp=()=>new Date().toISOString();
const mapping={create:"new_demands",review:"new_demands",due_soon:"deadlines",event_soon:"deadlines",event_today:"deadlines",overdue:"overdue"};
const flag=v=>v===1||v===true;
function fail(message,status=400){const e=new Error(message);e.status=status;throw e}
const unique=items=>[...new Set((Array.isArray(items)?items:[]).filter(Boolean).map(String))].slice(0,300);
export async function preferencesForUser(db,userId){
 const [stored,android,pc]=await Promise.all([
  db.prepare("SELECT kind,email_enabled,android_enabled,pc_enabled FROM notification_preferences WHERE user_id=?").bind(userId).all(),
  db.prepare("SELECT new_demands,deadlines,overdue FROM push_preferences WHERE user_id=?").bind(userId).first(),
  db.prepare("SELECT new_demands,deadlines,overdue FROM web_push_preferences WHERE user_id=?").bind(userId).first()
 ]);
 const byKind=new Map(stored.results.map(r=>[r.kind,r]));
 return Object.fromEntries(NOTICE_KINDS.map(kind=>{
  const row=byKind.get(kind),field=mapping[kind];
  return [kind,{email:row?flag(row.email_enabled):true,
   android:row?flag(row.android_enabled):android?flag(android[field]):true,
   pc:row?flag(row.pc_enabled):pc?flag(pc[field]):true}];
 }));
}
export async function saveNotificationPreferences(db,user,payload){
 if(!payload||typeof payload!=="object"||Array.isArray(payload))fail("Configurações inválidas.");
 const keys=Object.keys(payload);
 if(keys.length!==NOTICE_KINDS.length||keys.some(k=>!NOTICE_KINDS.includes(k)))fail("Informe as seis notificações.");
 const commands=[];
 for(const kind of NOTICE_KINDS){
  const row=payload[kind];
  if(!row||typeof row!=="object"||["email","android","pc"].some(k=>typeof row[k]!=="boolean")||
     Object.keys(row).some(k=>!["email","android","pc"].includes(k)))fail("Escolha os três canais de cada aviso.");
  commands.push(db.prepare("INSERT INTO notification_preferences(user_id,kind,email_enabled,android_enabled,pc_enabled,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,kind) DO UPDATE SET email_enabled=excluded.email_enabled,android_enabled=excluded.android_enabled,pc_enabled=excluded.pc_enabled,updated_at=excluded.updated_at")
   .bind(user.id,kind,+row.email,+row.android,+row.pc,stamp()));
 }
 // batch é uma transação: nunca salvar metade das opções.
 await db.batch(commands);
 return {preferences:await preferencesForUser(db,user.id)};
}
export async function notificationRecipients(db,rawIds,kind){
 if(!NOTICE_KINDS.includes(kind))fail("Tipo de aviso inválido.");
 const ids=unique(rawIds);
 if(!ids.length)return {email:[],android:[],pc:[],users:[]};
 // Uma consulta com JOINs substitui três consultas por participante e evita
 // sobrecarga do D1 ao rodar alarmes a cada minuto.
 const column=mapping[kind],sql="SELECT u.id,u.email,u.role,u.role_override,"+
  "np.email_enabled,np.android_enabled,np.pc_enabled,"+
  "ap."+column+" AS legacy_android,wp."+column+" AS legacy_pc "+
  "FROM users u "+
  "LEFT JOIN notification_preferences np ON np.user_id=u.id AND np.kind=? "+
  "LEFT JOIN push_preferences ap ON ap.user_id=u.id "+
  "LEFT JOIN web_push_preferences wp ON wp.user_id=u.id "+
  "WHERE u.id IN ("+ids.map(()=>"?").join(",")+")";
 const list=(await db.prepare(sql).bind(kind,...ids).all()).results;
 const recipients={email:[],android:[],pc:[],users:list};
 for(const person of list){
  if(!["petiano","tutor","admin"].includes(person.role_override||person.role))continue;
  const rowPresent=person.email_enabled!==null&&person.email_enabled!==undefined;
  const allowed={
   email:rowPresent?flag(person.email_enabled):true,
   android:rowPresent?flag(person.android_enabled):
    person.legacy_android===null||person.legacy_android===undefined||flag(person.legacy_android),
   pc:rowPresent?flag(person.pc_enabled):
    person.legacy_pc===null||person.legacy_pc===undefined||flag(person.legacy_pc)
  };
  for(const channel of ["email","android","pc"])if(allowed[channel])recipients[channel].push(person);
 }
 return recipients;
}
const pushFallbacks={
 create:{title:"Nova demanda atribuída",body:"{demanda}"},
 review:{title:"Texto para revisão",body:"{demanda} foi atualizado para revisão."},
 due_soon:{title:"Prazo vencendo",body:"{demanda} · {etapa} · {prazo}"},
 overdue:{title:"Prazo vencido",body:"{demanda} · {etapa} · {prazo}"},
 event_soon:{title:"Evento se aproximando",body:"{demanda} · {prazo}"},
 event_today:{title:"Evento hoje",body:"{demanda}"}
};
export const defaultPushModels=pushFallbacks;
export async function notificationPushModel(db,kind,values){
 const row=await db.prepare("SELECT value FROM app_settings WHERE key='notificationPushTemplates'").first();
 let models={};try{models=JSON.parse(row?.value||"{}")}catch{}
 const template=models[kind]||pushFallbacks[kind]||pushFallbacks.create;
 const render=(s,max)=>String(s||"").replace(/\{(autor|acao|tipo|demanda|etapa|prazo|dias|link)\}/g,(_,key)=>String(values[key]??"")).replace(/<[^>]*>/g,"").slice(0,max);
 return {title:render(template.title||pushFallbacks[kind]?.title,90),body:render(template.body||pushFallbacks[kind]?.body,220)};
}
