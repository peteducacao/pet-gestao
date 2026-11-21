// Cronograma PET: atividades institucionais independentes de Demandas.
// Autorização repetida no Worker; usuários sem cargo não recebem esses dados.
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
const text=(x,max=250)=>String(x??"").trim().slice(0,max);
const dateValid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T12:00:00Z"))&&new Date(s+"T12:00:00Z").toISOString().slice(0,10)===s;
const timeValid=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const staff=user=>{if(!user)fail("Entre na sua conta.",401);if(user.must_change_password)fail("Troque sua senha temporária.",403);if(!["petiano","tutor","admin"].includes(user.role_override||user.role))fail("Somente PETianos(as), Tutoria e Administração podem acessar o cronograma.",403)};
const admin=user=>{staff(user);if((user.role_override||user.role)!=="admin"||user.session_admin_scope!==1)fail("Acesso exclusivo da Administração.",403)};
// Conclusão automática no horário local de Sergipe (UTC-3).
// O antigo completed_at persistido não controla mais atividades.
const scheduleEndedAt=row=>{
 const hour=timeValid(String(row.end_time||""))?row.end_time+":00":"23:59:59";
 const ms=Date.parse(row.end_date+"T"+hour+"-03:00");
 return Number.isFinite(ms)&&ms<=Date.now()?new Date(ms).toISOString():null;
};
const key=row=>({id:row.id,title:row.title,description:row.description,startDate:row.start_date,endDate:row.end_date,startTime:row.start_time,endTime:row.end_time,timeNote:row.time_note,location:row.location,completedAt:scheduleEndedAt(row),source:row.source,createdAt:row.created_at,updatedAt:row.updated_at});
function validate(input,old=null){
 const title=text(input?.title,180),description=text(input?.description,1800),location=text(input?.location,240);
 const startDate=text(input?.startDate,10),endDate=text(input?.endDate||startDate,10);
 const startTime=text(input?.startTime,5)||null,endTime=text(input?.endTime,5)||null,timeNote=text(input?.timeNote,100)||null;
 if(!title)fail("Informe o nome da atividade.");
 if(!dateValid(startDate)||!dateValid(endDate)||endDate<startDate)fail("Informe um período válido.");
 if((startTime&&!timeValid(startTime))||(endTime&&!timeValid(endTime)))fail("Horário inválido.");
 if((startTime&&!endTime)||(!startTime&&endTime)){
  // A importação do Word contém horários sem hora final; não obrigar a inventá-la na edição.
  if(!old?.time_note||!timeNote)fail("Selecione os horários de início e término.");
 }
 if(!startTime&&!endTime&&!timeNote)fail("Selecione o início e o término da atividade.");
 if(startTime&&endTime&&startDate===endDate&&endTime<=startTime)fail("O término deve ser após o início.");
 return {title,description,location,startDate,endDate,startTime,endTime,timeNote};
}
export async function listSchedule(db,user,year){
 staff(user);const y=Number(year);
 if(!Number.isInteger(y)||y<2000||y>2100)fail("Ano inválido.");
 const rows=(await db.prepare("SELECT * FROM schedule_entries WHERE start_date<=? AND end_date>=? ORDER BY start_date,COALESCE(start_time,'99:99'),title LIMIT 1500").bind(y+"-12-31",y+"-01-01").all()).results;
 return {year:y,items:rows.map(key)};
}
export async function saveSchedule(db,user,input,id=null){
 staff(user);
 const old=id?await db.prepare("SELECT * FROM schedule_entries WHERE id=?").bind(id).first():null;
 if(id&&!old)fail("Atividade não encontrada.",404);
 const b=validate(input,old),now=new Date().toISOString(),eventId=id||crypto.randomUUID();
 if(id){
  await db.batch([
   db.prepare("UPDATE schedule_entries SET title=?,description=?,start_date=?,end_date=?,start_time=?,end_time=?,time_note=?,location=?,updated_by=?,updated_at=? WHERE id=?")
    .bind(b.title,b.description,b.startDate,b.endDate,b.startTime,b.endTime,b.timeNote,b.location,user.id,now,id),
   db.prepare("UPDATE personal_reminders SET title=?,updated_at=? WHERE schedule_entry_id=?").bind(b.title,now,id)
  ]);
 }else{
  await db.prepare("INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'manual',?,?,?,?)")
   .bind(eventId,b.title,b.description,b.startDate,b.endDate,b.startTime,b.endTime,b.timeNote,b.location,user.id,user.id,now,now).run();
 }
 return {ok:true,id:eventId};
}
export async function deleteSchedule(db,user,id){
 staff(user);const r=await db.prepare("DELETE FROM schedule_entries WHERE id=?").bind(id).run();
 if(!r.meta?.changes)fail("Atividade não encontrada.",404);
 return {ok:true};
}
const OPTIONS=["inicio","cronograma","demandas","minhas-pendencias","meus-lembretes","comissoes","reunioes","conta","admin"];
const available=user=>{const role=user.role_override||user.role;return OPTIONS.filter(v=>(role!=="usuario"||!["cronograma","minhas-pendencias","meus-lembretes","reunioes"].includes(v))&&(v!=="admin"||role==="admin"))};
const defaults=user=>{const availableIds=available(user);return ["inicio","cronograma","demandas","meus-lembretes","conta"].filter(id=>availableIds.includes(id));};
export async function quickNavGet(db,user){
 if(!user)fail("Entre na sua conta.",401);
 const row=await db.prepare("SELECT enabled,items FROM user_quicknav WHERE user_id=?").bind(user.id).first();
 let items;try{items=JSON.parse(row?.items||"null")}catch{items=null}
 if(!Array.isArray(items))items=defaults(user);
 const allowed=new Set(available(user));items=[...new Set(items)].filter(x=>allowed.has(x)).slice(0,5);
 return {enabled:row?!!row.enabled:true,items,available:[...allowed]};
}
export async function quickNavSave(db,user,input){
 if(!user)fail("Entre na sua conta.",401);
 if(user.must_change_password)fail("Atualize sua senha antes de personalizar a navegação.",403);
 const allowed=new Set(available(user));
 if(typeof input?.enabled!=="boolean"||!Array.isArray(input?.items)||input.items.length>5||input.items.length<1)fail("Escolha de 1 a 5 atalhos.");
 if(new Set(input.items).size!==input.items.length||input.items.some(v=>typeof v!=="string"||!allowed.has(v)))fail("Atalho sem permissão ou duplicado.");
 await db.prepare("INSERT INTO user_quicknav(user_id,enabled,items,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,items=excluded.items,updated_at=excluded.updated_at")
  .bind(user.id,input.enabled?1:0,JSON.stringify(input.items),new Date().toISOString()).run();
 return quickNavGet(db,user);
}
export async function annualReport(db,user,year){
 admin(user);const y=Number(year);
 if(!Number.isInteger(y)||y<2000||y>2100)fail("Ano inválido.");
 const strYear=String(y);
 const [tasks,activities,monthlyTasks,monthlySchedule]=await Promise.all([
  db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE substr(registered_at,1,4)=?").bind(strYear).first(),
  db.prepare("SELECT COUNT(*) AS n FROM schedule_entries WHERE substr(start_date,1,4)=?").bind(strYear).first(),
  db.prepare("SELECT substr(registered_at,6,2) AS m,COUNT(*) AS n FROM tasks WHERE substr(registered_at,1,4)=? GROUP BY m").bind(strYear).all(),
  db.prepare("SELECT substr(start_date,6,2) AS m,COUNT(*) AS n FROM schedule_entries WHERE substr(start_date,1,4)=? GROUP BY m").bind(strYear).all()
 ]);
 const taskMap=new Map(monthlyTasks.results.map(x=>[Number(x.m),Number(x.n)])),activityMap=new Map(monthlySchedule.results.map(x=>[Number(x.m),Number(x.n)]));
 return {year:y,demands:Number(tasks.n),activities:Number(activities.n),months:Array.from({length:12},(_,i)=>({month:i+1,demands:taskMap.get(i+1)||0,activities:activityMap.get(i+1)||0}))};
}


// Relatório administrativo integrado. Uma demanda associada a múltiplas
// comissões conta uma vez no total do PET e uma vez em cada comissão vinculada.
export async function adminOverview(db,user,year){
 admin(user);
 const y=Number(year);
 if(!Number.isInteger(y)||y<2000||y>2100)fail("Ano inválido.");
 const strYear=String(y);
 const [commissionRows,userRows,membershipRows,taskRows,scheduleCount]=await Promise.all([
  db.prepare("SELECT id,name FROM commissions ORDER BY sort_order,name").all(),
  db.prepare("SELECT id,name,COALESCE(role_override,role) AS role FROM users ORDER BY name").all(),
  db.prepare("SELECT commission_id,user_id FROM commission_members").all(),
  db.prepare("SELECT id,registered_at,archived_at,closure_outcome,completed_late,commission_ids,assignee_ids,user_done,deadlines FROM tasks WHERE substr(registered_at,1,4)=? OR substr(archived_at,1,4)=?").bind(strYear,strYear).all(),
  db.prepare("SELECT COUNT(*) AS n FROM schedule_entries WHERE substr(start_date,1,4)=?").bind(strYear).first()
 ]);
 const parse=v=>{try{return JSON.parse(v||"null")}catch{return null}};
 const localDate=value=>String(value||"").slice(0,10);
 const yearOf=value=>localDate(value).slice(0,4)===strYear;
 const dueInstant=value=>{
  const v=String(value||"");
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v)?v+"T23:59:59-03:00":
   /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(v)?v+(v.length===16?":00":"")+"-03:00":v);
 };
 const metrics=()=>({registered:0,concluded:0,concludedLate:0,notConcluded:0});
 const update=(metric,task)=>{
  if(yearOf(task.registered_at))metric.registered++;
  if(yearOf(task.archived_at)){
   if(task.closure_outcome==="nao_concluida")metric.notConcluded++;
   else if(task.archived_at){
    metric.concluded++;
    if(task.late)metric.concludedLate++;
   }
  }
 };
 const memberships=new Map();
 for(const member of membershipRows.results||[]){
  const list=memberships.get(member.commission_id)||new Set();
  list.add(member.user_id);memberships.set(member.commission_id,list);
 }
 const commissions=(commissionRows.results||[]).map(c=>({
  id:c.id,name:c.name,members:memberships.get(c.id)?.size||0,...metrics()
 }));
 const users=(userRows.results||[]).map(u=>({
  id:u.id,name:u.name,role:u.role,commissions:0,assigned:0,completed:0,notCompleted:0
 }));
 const byCommission=new Map(commissions.map(c=>[c.id,c]));
 const byUser=new Map(users.map(u=>[u.id,u]));
 for(const [cid,members] of memberships)
  for(const uid of members){const u=byUser.get(uid);if(u)u.commissions++;}
 const totals=metrics();
 for(const row of taskRows.results||[]){
  const done=parse(row.user_done)||{};
  const deadlines=parse(row.deadlines)||[];
  const late=row.completed_late!==null&&row.completed_late!==undefined?Boolean(row.completed_late):
   Boolean(row.archived_at&&deadlines.some(d=>d?.dueAt&&d?.label!=="Evento"&&
    Number.isFinite(dueInstant(d.dueAt))&&dueInstant(d.dueAt)<dueInstant(row.archived_at)));
  const task={...row,late};
  update(totals,task);
  for(const cid of parse(row.commission_ids)||[]){
   const c=byCommission.get(cid);
   if(c)update(c,task);
  }
  for(const uid of parse(row.assignee_ids)||[]){
   const u=byUser.get(uid);if(!u)continue;
   if(yearOf(row.registered_at))u.assigned++;
   const completion=done[uid];
   const completedAt=typeof completion==="string"?completion:completion?.at;
   if(completedAt&&yearOf(completedAt))u.completed++;
   if(row.closure_outcome==="nao_concluida"&&yearOf(row.archived_at)&&!completion)u.notCompleted++;
  }
 }
 return {year:y,totals,activities:Number(scheduleCount?.n||0),
  commissions,users,commissionCount:commissions.length,userCount:users.length};
}
