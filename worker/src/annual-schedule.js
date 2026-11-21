// Cronograma PET: atividades institucionais independentes de Demandas.
// Autorização repetida no Worker; usuários sem cargo não recebem esses dados.
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
const text=(x,max=250)=>String(x??"").trim().slice(0,max);
const dateValid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T12:00:00Z"))&&new Date(s+"T12:00:00Z").toISOString().slice(0,10)===s;
const timeValid=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const staff=user=>{if(!user)fail("Entre na sua conta.",401);if(user.must_change_password)fail("Troque sua senha temporária.",403);if(!["petiano","tutor","admin"].includes(user.role_override||user.role))fail("Somente PETianos(as), Tutoria e Administração podem acessar o cronograma.",403)};
const admin=user=>{staff(user);if((user.role_override||user.role)!=="admin"||user.session_admin_scope!==1)fail("Acesso exclusivo da Administração.",403)};
const key=row=>({id:row.id,title:row.title,description:row.description,startDate:row.start_date,endDate:row.end_date,startTime:row.start_time,endTime:row.end_time,timeNote:row.time_note,location:row.location,completedAt:row.completed_at,source:row.source,createdAt:row.created_at,updatedAt:row.updated_at});
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
export async function scheduleCompletion(db,user,id,completed){
 staff(user);if(typeof completed!=="boolean")fail("Estado de conclusão inválido.");
 const r=await db.prepare("UPDATE schedule_entries SET completed_at=?,updated_by=?,updated_at=? WHERE id=?").bind(completed?new Date().toISOString():null,user.id,new Date().toISOString(),id).run();
 if(!r.meta?.changes)fail("Atividade não encontrada.",404);
 return {ok:true};
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
