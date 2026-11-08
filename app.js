/* PET Educação — protótipo com dados de demonstração; edições apenas locais até implantação de backend e autenticação. */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const config = window.PET_GESTAO_CONFIG || {};
  const API = String(config.apiBaseUrl || '').replace(/\/+$/, '');
  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const WEEKDAYS = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const TODAY = new Date();
  const STORAGE_KEY = 'pet-gestao:prefs:v1';
  const DEMO_EDITS_KEY = 'pet-educacao:preview-edits:v1';
  const routeTitles = {
    inicio:'Visão geral', demandas:'Demandas', registrar:'Registrar demandas', cronograma:'Cronograma',
    comissoes:'Comissões', reunioes:'Reuniões',
    'minhas-pendencias':'Minhas pendências', atividade:'Atividade'
  };
  const emptyData = () => ({tasks:[],committees:[],meetings:[],users:[],events:[],session:null});
  const prefs = readPrefs();
  const state = {
    data:emptyData(), connected:false, loading:false, demo:false,
    year:!prefs.autoMonth&&Number.isInteger(prefs.savedYear)&&prefs.savedYear>=2000&&prefs.savedYear<=2100?prefs.savedYear:TODAY.getFullYear(),
    month:!prefs.autoMonth&&Number.isInteger(prefs.savedMonth)&&prefs.savedMonth>=0&&prefs.savedMonth<=11?prefs.savedMonth:TODAY.getMonth(), week:1,
    selectedDay:TODAY.getDate(),
    demandMode:'mensal', committeeId:null, commissionWeek:'all', assignmentScope:'usuarios', assignmentPicked:[], assignmentTaskId:null, demoActor:'petiano', demoEditing:false, formDeadlineCount:1, ...prefs
  };
  state.week = !prefs.autoWeek&&Number.isInteger(prefs.savedWeek)?Math.min(Math.max(1,prefs.savedWeek),getWeeks(state.year,state.month).length) : (state.year===TODAY.getFullYear()&&state.month===TODAY.getMonth()?weekForDay(state.year,state.month,TODAY.getDate()):1);
  let toastTimer;

  function readPrefs(){
    try{ const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
      return {autoMonth:data.autoMonth!==false,autoWeek:data.autoWeek!==false,savedYear:Number(data.savedYear),savedMonth:Number(data.savedMonth),savedWeek:Number(data.savedWeek)};
    }catch{return {autoMonth:true,autoWeek:true,savedYear:NaN,savedMonth:NaN,savedWeek:NaN};}
  }
  function savePrefs(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({autoMonth:state.autoMonth,autoWeek:state.autoWeek,savedYear:state.year,savedMonth:state.month,savedWeek:state.week}));}catch{}}
  function icon(id,extra=''){return `<svg ${extra} aria-hidden="true"><use href="#i-${id}"></use></svg>`;}
  function escapeText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function dateFrom(value){
    if(!value)return null;
    if(value instanceof Date)return Number.isNaN(value.getTime())?null:value;
    const s=String(value);
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const [y,m,d]=s.split('-').map(Number);const dt=new Date(y,m-1,d,12);return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d?dt:null;}
    const dt=new Date(s);return Number.isNaN(dt.getTime())?null:dt;
  }
  function formatDate(value, opts={day:'2-digit',month:'2-digit',year:'numeric'}){const d=dateFrom(value);return d?new Intl.DateTimeFormat('pt-BR',opts).format(d):'Data não informada';}
  function dateKey(date){const d=dateFrom(date);return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';}
  function periodTitle(){return `${MONTHS[state.month]} de ${state.year}`;}
  function getWeeks(y,m){
    const days=new Date(y,m+1,0).getDate();
    const firstDay=new Date(y,m,1).getDay();
    const firstMonday=1+((8-firstDay)%7);
    const weeks=[];
    let start=1;
    let end=Math.min(days,firstMonday+6);
    while(start<=days){
      weeks.push({n:weeks.length+1,start,end,label:`${String(start).padStart(2,'0')}–${String(end).padStart(2,'0')}/${String(m+1).padStart(2,'0')}`});
      start=end+1;end=Math.min(days,start+6);
    }
    return weeks;
  }
  function weekForDay(y,m,day){return getWeeks(y,m).find(w=>day>=w.start&&day<=w.end)?.n||1;}
  function currentWeek(){return getWeeks(state.year,state.month).find(w=>w.n===state.week)||getWeeks(state.year,state.month)[0];}
  function isCompleted(task){return Boolean(task?.completedAt||task?.closedAt||['concluida','concluído','done','completed','arquivada'].includes(String(task?.status||'').toLowerCase()));}

  function commissionIds(t){return [...new Set([...(Array.isArray(t?.commissionIds)?t.commissionIds:[]),t?.committeeId].filter(v=>v!==null&&v!==undefined&&v!=='').map(String))];}
  function linkedToCommission(t,id){return commissionIds(t).includes(String(id));}
  function stageUserId(d){
    if(d?.assigneeId&&state.data.users.some(u=>String(u.id)===String(d.assigneeId)))return String(d.assigneeId);
    const raw=String(d?.assigneeName||'').trim().toLocaleLowerCase('pt-BR');
    return state.data.users.find(u=>String(u.name||'').trim().toLocaleLowerCase('pt-BR')===raw)?.id||null;
  }
  function assignedUserIds(t){return [...new Set([...(Array.isArray(t?.assigneeIds)?t.assigneeIds:[]),...taskDeadlines(t).map(stageUserId)].filter(Boolean).map(String))];}
  function isAssigned(t,userId){return Boolean(userId&&assignedUserIds(t).includes(String(userId)));}
  function taskDate(t){return dateFrom(t.registeredAt||t.meetingDate||t.createdAt);}
  function committeeName(id){return state.data.committees.find(c=>String(c.id)===String(id))?.name||'Sem comissão';}
  function tasks(){return state.data.tasks;}
  function taskDeadlines(t){return Array.isArray(t.deadlines)?t.deadlines:[];}
  function isApproved(t){return !isCompleted(t)&&t.reviewStatus==='liberado';}
  function taskClosestDeadline(t){return taskDeadlines(t).filter(d=>!d.completedAt&&dateFrom(d.dueAt)).map(d=>dateFrom(d.dueAt)).sort((a,b)=>a-b)[0]||null;}
  function taskPriority(t){return isApproved(t)?0:isCompleted(t)?3:taskDeadlines(t).some(d=>deadlineOverdue(d))?1:2;}
  function comparePriorityTasks(a,b){
    return taskPriority(a)-taskPriority(b)
      ||((taskClosestDeadline(a)||dateFrom(a.postingAt)||taskDate(a)||new Date(2100,0,1))-(taskClosestDeadline(b)||dateFrom(b.postingAt)||taskDate(b)||new Date(2100,0,1)))
      ||String(a.title||'').localeCompare(String(b.title||''),'pt-BR');
  }
  function displayTaskState(t){
    if(isCompleted(t))return tag('Concluída','mint');
    if(isApproved(t))return tag('APROVADO','approved-pill');
    if(t.reviewStatus==='ajustes')return tag('Ajustes necessários','review-pill');
    if(t.reviewStatus==='nao_liberado')return tag('Não liberado','review-pill');
    if(taskDeadlines(t).some(d=>deadlineOverdue(d)))return tag('Atrasada','overdue-pill');
    return tag(t.stageName==='Programada'?'Programada':'Pendente','soft');
  }
  function taskDateBadge(t){
    const deadline=taskClosestDeadline(t),date=deadline||dateFrom(t.postingAt)||taskDate(t);
    return date?`<span class="task-date-badge">${icon('calendar')} ${deadline?'Prazo':t.postingAt?'Previsão':'Cadastro'}: ${formatDate(date)}</span>`:'';
  }
  function taskNames(t){return [...new Set(assignedUserIds(t).map(id=>state.data.users.find(u=>String(u.id)===id)?.name).filter(Boolean))];}
  function taskResponsibleChip(t){
    const names=taskNames(t);
    return `<span class="task-assignee-label" title="${escapeText(names.join(', ')||'A definir')}"><strong>${names.length===1?'Responsável':'Responsáveis'}:</strong> ${escapeText(names.join(', ')||'A definir')}</span>`;
  }
  function upcomingDeadlines(){
    const now=new Date();
    return tasks().filter(t=>!isCompleted(t)).map(task=>{
      const deadlines=taskDeadlines(task).filter(d=>!d.completedAt&&dateFrom(d.dueAt))
        .map(deadline=>({deadline,date:dateFrom(deadline.dueAt)}))
        .filter(x=>x.date.getTime()>=now.getTime()-86400000).sort((a,b)=>a.date-b.date);
      return deadlines.length?{task,deadline:deadlines[0].deadline,date:deadlines[0].date}:null;
    }).filter(Boolean).sort((a,b)=>taskPriority(a.task)-taskPriority(b.task)||a.date-b.date).slice(0,5);
  }
  function taskCountDay(date){const key=dateKey(date);return tasks().filter(t=>taskDeadlines(t).some(d=>dateKey(d.dueAt)===key)||dateKey(t.postingAt)===key).length;}
  function available(){return state.connected;}
  function sessionUser(){return state.data.session?.user||null;}
  function safeHref(id){return encodeURIComponent(String(id));}
  function getRoute(){const raw=decodeURIComponent((location.hash||'#/inicio').replace(/^#\/?/,''));const [base,...sub]=raw.split('/');return {base:routeTitles[base]?base:'inicio',id:sub.join('/')};}
  function empty(iconName,title,detail,small=false){return `<div class="empty${small?' small':''}"><span class="empty-icon">${icon(iconName)}</span><h3>${escapeText(title)}</h3><p>${escapeText(detail)}</p></div>`;}
  function tag(label,kind=''){return `<span class="pill${kind?' '+kind:''}">${escapeText(label)}</span>`;}
  function header(eyebrow,title,subtitle,actions=''){
    return `<div class="page-header"><div><div class="eyebrow">${escapeText(eyebrow)}</div><h1 class="page-title">${escapeText(title)}</h1><p class="page-subtitle">${escapeText(subtitle)}</p></div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;
  }
  function connectNotice(){return state.demo?'<div class="status-note demo-banner">'+icon('info')+'<div><strong>Prévia de demonstração</strong> — cronograma de novembro e memória de 22/10 carregados apenas para apresentar o layout. Nenhuma alteração ou e-mail é enviado.</div></div>':available()?'':`<div class="status-note">${icon('info')}<div><strong>Dados institucionais ainda não conectados.</strong> A estrutura das telas está disponível; registros, acessos e ações compartilhadas serão ativados após a integração segura.</div></div>`;}
  function newButton(label){return `<button class="button primary" type="button" disabled title="Disponível após a implantação do acesso seguro">${icon('plus')}${escapeText(label)}</button>`;}
  function monthsSelector(){return `<div class="filter-item"><label for="filter-month">MÊS</label><select class="select" id="filter-month" data-field="month" aria-label="Selecionar mês">${MONTHS.map((m,i)=>`<option value="${i}" ${i===state.month?'selected':''}>${m}</option>`).join('')}</select></div>`;}
  function yearsSelector(){const low=Math.min(2024,state.year-3),high=Math.max(2030,state.year+3);return `<div class="filter-item"><label for="filter-year">ANO</label><select class="select" id="filter-year" data-field="year" aria-label="Selecionar ano">${Array.from({length:high-low+1},(_,i)=>low+i).map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y}</option>`).join('')}</select></div>`;}
  function weekSelector(){const weeks=getWeeks(state.year,state.month);return `<div class="filter-item"><label for="filter-week">SEMANA</label><select class="select" id="filter-week" data-field="week" aria-label="Selecionar semana">${weeks.map(w=>`<option value="${w.n}" ${state.week===w.n?'selected':''}>Semana ${w.n} · ${w.label}</option>`).join('')}</select></div>`;}
  function periodSelector(includeWeek=false){return `<div class="filters">${monthsSelector()}${yearsSelector()}${includeWeek?weekSelector():''}<div class="filter-item"><label>&nbsp;</label><button type="button" class="button ghost" data-action="today">${icon('calendar')}Hoje</button></div></div>`;}
  function stats(){
    const all=tasks();const pending=all.filter(t=>!isCompleted(t));const thisMonth=all.filter(isTaskInMonth);
    const overdue=pending.filter(t=>taskDeadlines(t).some(d=>deadlineOverdue(d)));
    const mine=sessionUser()?pending.filter(t=>isAssigned(t,sessionUser().id)):[];
    return [
      {label:'Demandas do mês',value:available()?thisMonth.length:'—',icon:'list',tone:'purple'},
      {label:'Pendências gerais',value:available()?pending.length:'—',icon:'clock',tone:'orange'},
      {label:'Prazos vencidos',value:available()?overdue.length:'—',icon:'alert',tone:'blue'},
      {label:'Minhas pendências',value:available()&&sessionUser()?mine.length:'—',icon:'checklist',tone:'green'}
    ];
  }
  function renderStats(){return `<div class="stat-grid">${stats().map(s=>`<div class="card stat"><div class="stat-icon ${s.tone}">${icon(s.icon)}</div><div class="stat-copy"><span>${s.label}</span><strong>${s.value}</strong></div></div>`).join('')}</div>`;}
  function renderUpcomingCompact(){const items=upcomingDeadlines();return items.length?items.map(({task,date})=>`
    <div class="placeholder-row upcoming-row"><div><strong>${escapeText(task.title)}</strong><a class="activity-details-link" href="#/atividade/${safeHref(task.id)}">Ver detalhes ${icon('arrow')}</a></div>${tag(formatDate(date,{day:'2-digit',month:'short'}),'soft')}</div>`).join('')
    :empty('clock','Nenhum prazo para exibir','Os prazos registrados aparecerão aqui, organizados pela data de entrega.',true);
  }
  function renderFeed(){const updates=state.data.events.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,4);
    return updates.length?updates.map(e=>`<div class="placeholder-row"><div><strong>${escapeText(e.summary||'Atualização registrada')}</strong><small>${escapeText(e.actorName||'Equipe')} · ${formatDate(e.createdAt)}</small></div></div>`).join('')
    :empty('bell','Sem atualizações para exibir','As alterações e revisões aparecerão aqui quando houver registros.',true);
  }

  function taskOrigin(t) {
    if(t.committeeId) return committeeName(t.committeeId);
    if(t.meetingId) {
      const m=state.data.meetings.find(x=>String(x.id)===String(t.meetingId));
      return m?'Memória de '+formatDate(m.date):'Reunião';
    }
    return 'Demanda geral';
  }
  function taskActivityDates(t){
    const posting=dateFrom(t.postingAt);
    const deadlines=taskDeadlines(t).map(d=>dateFrom(d.dueAt)).filter(Boolean);
    // A data de cadastro não deve deslocar todas as postagens para a semana em que o cronograma foi inserido.
    // Memórias também podem ser consultadas na semana da própria reunião e na semana dos prazos derivados.
    const origin=(!posting&&(t.meetingId||!deadlines.length))?taskDate(t):null;
    return [posting,...deadlines,origin].filter(Boolean);
  }
  function isTaskInMonth(t){
    return taskActivityDates(t).some(d=>d.getFullYear()===state.year&&d.getMonth()===state.month);
  }
  function isTaskInWeek(t){
    const w=currentWeek();
    return taskActivityDates(t).some(d=>d.getFullYear()===state.year&&d.getMonth()===state.month&&d.getDate()>=w.start&&d.getDate()<=w.end);
  }
  function taskSortDate(t){
    return dateFrom(t.postingAt)||taskDeadlines(t).map(d=>dateFrom(d.dueAt)).filter(Boolean).sort((a,b)=>a-b)[0]||taskDate(t)||new Date(2100,0,1);
  }
  function weeklyTasks(){
    return tasks().filter(isTaskInWeek).sort((a,b)=>taskSortDate(a)-taskSortDate(b));
  }
  function weeklyMeetings(){
    const w=currentWeek();
    return state.data.meetings.filter(m=>{const d=dateFrom(m.date);return d&&d.getFullYear()===state.year&&d.getMonth()===state.month&&d.getDate()>=w.start&&d.getDate()<=w.end;});
  }
  function renderWeeklyFocus(){
    const weekTasks=weeklyTasks().sort(comparePriorityTasks),meetings=weeklyMeetings();
    const open=weekTasks.filter(t=>!isCompleted(t)),done=weekTasks.filter(isCompleted);
    // Conserve links para memórias de semanas anteriores que originaram tarefas com prazo neste período.
    const linkedIds=new Set(weekTasks.map(t=>String(t.meetingId||'')).filter(Boolean));
    const sourceMeetings=state.data.meetings.filter(m=>linkedIds.has(String(m.id))&&!meetings.some(x=>String(x.id)===String(m.id)));
    const info=[...meetings,...sourceMeetings];
    const meta=available()?`<div class="weekly-counts"><span class="weekly-pending">${open.length} pendentes</span><span class="weekly-done">${done.length} concluídas</span></div>`:'';
    const entries=weekTasks.length?weekTasks.slice(0,7).map(t=>`<div class="weekly-item"><span class="weekly-symbol ${isCompleted(t)?'success':'open'}">${icon(isCompleted(t)?'check':'clock')}</span><span class="weekly-description"><strong>${escapeText(t.title)}</strong><a href="#/atividade/${safeHref(t.id)}" class="activity-details-link">Ver detalhes ${icon('arrow')}</a></span>${tag(isCompleted(t)?'Concluída':'Pendente',isCompleted(t)?'mint':'soft')}</div>`).join('')+(weekTasks.length>7?`<a class="activity-details-link weekly-more" href="#/demandas">Ver outras ${weekTasks.length-7} atividades ${icon('arrow')}</a>`:''):empty('checklist','Nenhuma atividade nesta semana','Escolha outra semana para consultar demandas, prazos e postagens.',true);
    const references=info.length?`<div class="weekly-meetings"><strong>${icon('book')} Memórias relacionadas</strong>${info.map(m=>`<a href="#/reunioes/${safeHref(m.id)}">${escapeText(displayMeetingTitle(m))} · ${formatDate(m.date)} ${icon('arrow')}</a>`).join('')}</div>`:'';
    return `<section class="card card-pad weekly-focus"><div class="section-head"><div><h2>Pendências semanais</h2><p>${escapeText(periodTitle())} · Semana ${state.week} (${currentWeek().label})</p></div><button class="link-action" data-action="go" data-to="cronograma">Ver cronograma ${icon('arrow')}</button></div><div class="weekly-controls">${weekSelector()}${meta}</div><div class="weekly-list">${entries}</div>${references}</section>`;
  }
  function renderHome(){
    return `
      ${connectNotice()}${renderStats()}
      <div class="dashboard-grid"><div class="stack">
        <section class="card card-pad upcoming-spotlight"><div class="upcoming-spotlight-head"><div class="upcoming-title"><span class="upcoming-badge">${icon('clock')}</span><div><h2>Próximos prazos</h2><p>Atividades que precisam de atenção</p></div></div><button class="link-action" data-action="go" data-to="cronograma">Ver cronograma ${icon('arrow')}</button></div><div class="upcoming-spotlight-body">${renderUpcomingCompact()}</div></section>
        <section class="card card-pad"><div class="section-head"><div><h2>Memórias recentes</h2><p>Últimas reuniões registradas</p></div></div>
        ${state.data.meetings.length?state.data.meetings.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,4).map(m=>`<a href="#/reunioes/${safeHref(m.id)}" class="placeholder-row"><div><strong>${escapeText(displayMeetingTitle(m))}</strong><small>${formatDate(m.date)}</small></div>${icon('arrow')}</a>`).join(''):empty('book','Nenhuma reunião registrada','As memórias recentes aparecerão aqui quando forem cadastradas.',true)}
        </section>
      </div><div class="stack">
        ${renderWeeklyFocus()}
        <section class="card card-pad"><div class="section-head"><div><h2>Últimas atualizações</h2><p>Histórico das atividades</p></div>${icon('bell')}</div>${renderFeed()}</section>
      </div></div>`;
  }
  function renderTaskCard(t){
    return `<div class="placeholder-row task-list-row"><div class="task-list-body"><div class="task-title-row"><strong>${escapeText(t.title)}</strong>${taskDateBadge(t)}</div>
      <a href="#/atividade/${safeHref(t.id)}" class="activity-details-link">Ver detalhes ${icon('arrow')}</a></div>
      <div class="task-row-meta">${taskResponsibleChip(t)}${displayTaskState(t)}</div></div>`;
  }
  function visibleDemandCount(){
    const mode=state.demandMode;
    if(mode==='mensal')return tasks().filter(t=>!isCompleted(t)&&isTaskInMonth(t)).length;
    if(mode==='semanal')return tasks().filter(t=>!isCompleted(t)&&isTaskInWeek(t)).length;
    if(mode==='pendentes')return tasks().filter(t=>!isCompleted(t)).length;
    return tasks().filter(isCompleted).length;
  }
  function renderDemandList(){const all=tasks();const mode=state.demandMode;let filtered=[];
    if(mode==='mensal'||mode==='semanal')filtered=all.filter(t=>!isCompleted(t)&&(mode==='mensal'?isTaskInMonth(t):isTaskInWeek(t)));
    if(mode==='pendentes')filtered=all.filter(t=>!isCompleted(t));
    if(mode==='arquivo')filtered=all.filter(isCompleted);
    filtered.sort(comparePriorityTasks);
    if(!filtered.length){const titles={mensal:'Nenhuma demanda neste mês',semanal:'Nenhuma demanda nesta semana',pendentes:'Nenhuma pendência registrada',arquivo:'Nenhuma atividade arquivada'};
      return empty(mode==='arquivo'?'archive':'list',titles[mode],'As atividades cadastradas aparecerão aqui, vinculadas aos responsáveis e às comissões.');}
    return filtered.map(renderTaskCard).join('');
  }
  function renderDemandas(){
    const modes=[['mensal','Mensal'],['semanal','Semanal'],['pendentes','Pendentes'],['arquivo','Arquivadas']];
    return `${header('Acompanhamento','Demandas','Uma lista única de atividades, organizada por período, responsáveis e situação.',`<a class="button primary" href="#/registrar">${icon('plus')} Registrar demanda</a>`)}${connectNotice()}
      <div class="card card-pad"><div class="list-toolbar"><div class="segmented" role="group" aria-label="Visualizar demandas">${modes.map(([val,label])=>`<button type="button" data-action="demand-mode" data-value="${val}" class="${state.demandMode===val?'active':''}" aria-pressed="${state.demandMode===val}">${label}</button>`).join('')}</div></div>
        ${(state.demandMode==='mensal'||state.demandMode==='semanal')?`<div class="list-toolbar">${periodSelector(state.demandMode==='semanal')}</div>`:'<p class="notice-line">Esta visualização reúne registros de todos os meses e anos.</p>'}
        <hr class="divider"/><div class="table-head"><div class="section-head" style="margin-bottom:0"><div><h2>${state.demandMode==='mensal'?periodTitle():state.demandMode==='semanal'?'Semana '+state.week+' · '+periodTitle():state.demandMode==='arquivo'?'Arquivadas':'Pendências acumuladas'}</h2></div></div>${available()?tag(String(visibleDemandCount())+' registros','soft'):''}</div>
        ${renderDemandList()}
      </div>`;
  }
  function calendarCells(){
    const first=new Date(state.year,state.month,1),offset=(first.getDay()+6)%7;
    const max=new Date(state.year,state.month+1,0).getDate();
    const total=Math.ceil((offset+max)/7)*7;const week=currentWeek();const output=[];
    for(let i=0;i<total;i++){
      const d=i-offset+1;const inMonth=d>=1&&d<=max;const day=new Date(state.year,state.month,d);
      const today=inMonth&&dateKey(day)===dateKey(TODAY);
      const selected=inMonth&&d>=week.start&&d<=week.end;
      const count=inMonth?taskCountDay(day):0;
      output.push(`<div class="day-cell${inMonth?'':' outside'}${selected?' selected-week':''}${today?' today':''}" ${inMonth?`aria-label="${d} de ${MONTHS[state.month]}${count?', '+count+' atividades':''}"`:''}><span class="day-num">${inMonth?d:dateFrom(day).getDate()}</span>${count?`<div class="day-dot" title="${count} atividades"></div>`:''}</div>`);
    }
    return output.join('');
  }
  function calendarWeekDetails(){// O mesmo registro pode ter prazo de revisão e data de postagem, mas aparece uma vez.
    const byWeek=weeklyTasks();
    return byWeek.length?byWeek.map(renderTaskCard).join(''):empty('calendar','Sem atividades para esta semana','Os prazos, eventos e postagens registrados aparecerão neste período.',true);
  }
  function renderPrefs(){return `<details class="prefs-panel"><summary>${icon('sliders')} Preferências de navegação ${icon('chevron-down')}</summary><div class="prefs-content">
    <div class="switch-row"><div><strong>Atualizar mês e ano automaticamente</strong><small>Ao abrir o sistema, selecionar o mês e o ano atuais.</small></div><label class="switch"><input type="checkbox" data-field="autoMonth" ${state.autoMonth?'checked':''} aria-label="Atualizar mês e ano automaticamente"><span class="track"></span></label></div>
    <div class="switch-row"><div><strong>Atualizar semana automaticamente</strong><small>Ao abrir o sistema, selecionar a semana atual do período.</small></div><label class="switch"><input type="checkbox" data-field="autoWeek" ${state.autoWeek?'checked':''} aria-label="Atualizar semana automaticamente"><span class="track"></span></label></div>
    <p class="notice-line" style="margin:0">Os seletores manuais sempre ficam disponíveis. Alterar o período não modifica nem exclui atividades anteriores.</p>
  </div></details>`;}
  function renderCronograma(){const weeks=getWeeks(state.year,state.month);
    return `${header('Planejamento','Cronograma','Mês, ano e semana podem ser consultados livremente. Os registros de outros períodos permanecem preservados.',`<a class="button primary" href="#/registrar">${icon('plus')} Registrar demanda</a>`)}${connectNotice()}
    <section class="card card-pad"><div class="list-toolbar">${periodSelector(true)}</div><hr class="divider"/><div class="section-head"><div><h2>${escapeText(periodTitle())}</h2><p>Calendário de atividades e prazos</p></div><div class="page-actions"><button class="icon-button" data-action="prev-month" title="Mês anterior" aria-label="Mês anterior">${icon('chevron-left')}</button><button class="icon-button" data-action="next-month" title="Próximo mês" aria-label="Próximo mês">${icon('chevron-right')}</button></div></div>
      <div class="calendar-wrap"><div class="calendar-grid">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(n=>`<div class="day-name">${n}</div>`).join('')}${calendarCells()}</div></div>
      <div class="calendar-legend"><span class="legend-mark"></span> Semana selecionada</div>
      <hr class="divider"/><div class="section-head"><div><h2>Semanas de ${escapeText(MONTHS[state.month])}</h2><p>Selecione para ver as atividades do período</p></div></div>
      <div class="week-strip">${weeks.map(w=>`<button type="button" class="week-chip ${state.week===w.n?'active':''}" data-action="select-week" data-value="${w.n}" aria-pressed="${state.week===w.n}">Semana ${w.n}</button>`).join('')}</div>
      <div class="day-summary">${icon('calendar')} Semana ${state.week} · ${currentWeek().label}</div>${calendarWeekDetails()}
      ${renderPrefs()}</section>`;
  }

  function deadlineOverdue(deadline, now = new Date()){
    if(!deadline || deadline.completedAt || !deadline.dueAt) return false;
    const due = dateFrom(deadline.dueAt);
    if(!due) return false;
    if(String(deadline.dueAt).length === 10) due.setHours(23,59,59,999);
    return due.getTime() < now.getTime();
  }
  function commissionMetrics(id){
    const own=tasks().filter(t=>linkedToCommission(t,id));
    const open=own.filter(t=>!isCompleted(t));
    return {pending:open.length,late:open.filter(t=>taskDeadlines(t).some(d=>deadlineOverdue(d))).length,completed:own.length-open.length};
  }
  function commissionCounters(id){
    if(!available()) return '<div class="commission-counters"><span>Pendentes <strong>—</strong></span><span>Atrasadas <strong>—</strong></span><span>Concluídas <strong>—</strong></span></div>';
    const m=commissionMetrics(id);
    return `<div class="commission-counters"><span>Pendentes <strong>${m.pending}</strong></span><span>Atrasadas <strong>${m.late}</strong></span><span>Concluídas <strong>${m.completed}</strong></span></div>`;
  }
  function renderComissoes(){const all=state.data.committees;
    return `${header('Trabalho em equipe','Comissões','Todas utilizam a mesma estrutura de atividades, prazos, responsáveis, cronogramas e histórico.',newButton('Nova comissão'))}${connectNotice()}
      <div class="committee-info"><div class="info-tile">${icon('users')}<strong>Integrantes vinculados</strong><p>Responsáveis da comissão aparecem primeiro no seletor, sem impedir a escolha de outros integrantes.</p></div><div class="info-tile">${icon('calendar')}<strong>Mesmo cronograma</strong><p>Mês, ano, semanas, etapas e múltiplos prazos seguem a mesma estrutura em todas as comissões.</p></div><div class="info-tile">${icon('book')}<strong>Registro centralizado</strong><p>Atividades podem ser relacionadas a reuniões sem duplicar informações.</p></div></div>
      <section class="card card-pad"><div class="section-head"><div><h2>Comissões cadastradas</h2><p>Organização por equipes</p></div>${available()?tag(all.length+' comissões','soft'):''}</div>${all.length?all.map(c=>`<a class="placeholder-row" href="#/comissoes/${safeHref(c.id)}"><div><strong>${escapeText(c.name)}</strong><small>${Array.isArray(c.memberIds)?c.memberIds.length:0} integrantes</small>${commissionCounters(c.id)}</div>${icon('arrow')}</a>`).join(''):empty('users','Nenhuma comissão cadastrada','Assim que as equipes forem cadastradas, todas aparecerão aqui com a mesma organização.')}</section>`;
  }

  function dateRangeForWeek(date){
    const d=dateFrom(date);
    if(!d)return '';
    const w=getWeeks(d.getFullYear(),d.getMonth()).find(w=>d.getDate()>=w.start&&d.getDate()<=w.end);
    if(!w)return '';
    const month=String(d.getMonth()+1).padStart(2,'0'),year=d.getFullYear();
    return `${String(w.start).padStart(2,'0')}/${month}/${year} a ${String(w.end).padStart(2,'0')}/${month}/${year}`;
  }

  function commissionPeriodTasks(id){
    return tasks().filter(t=>{
      if(!linkedToCommission(t,id)||isCompleted(t))return false;
      const date=dateFrom(t.postingAt)||taskSortDate(t);
      return date&&date.getFullYear()===state.year&&date.getMonth()===state.month;
    }).sort((a,b)=>taskSortDate(a)-taskSortDate(b));
  }
  function commissionWeekSelector(){
    return `<div class="filter-item commission-week-filter"><label for="commission-filter-week">SEMANA</label>
      <select class="select" id="commission-filter-week" data-field="commissionWeek" aria-label="Selecionar semana da comissão">
      <option value="all" ${state.commissionWeek==='all'?'selected':''}>Todas as semanas</option>
      ${getWeeks(state.year,state.month).map(w=>`<option value="${w.n}" ${String(state.commissionWeek)===String(w.n)?'selected':''}>Semana ${w.n} (${String(w.start).padStart(2,'0')}/${String(state.month+1).padStart(2,'0')} a ${String(w.end).padStart(2,'0')}/${String(state.month+1).padStart(2,'0')})</option>`).join('')}
      </select></div>`;
  }
  function commissionPeriodFilters(){
    return `<div class="commission-filter-bar"><div class="commission-filter-title">${icon('calendar')}<strong>Selecionar período</strong></div>
      <div class="commission-filter-row">${monthsSelector()}${yearsSelector()}${commissionWeekSelector()}
      <button type="button" class="button ghost commission-current-btn" data-action="commission-current">${icon('calendar')} Mês atual</button></div></div>`;
  }
  function renderCommissionGroups(records){
    const groups=new Map();
    records.forEach(t=>{
      const date=dateFrom(t.postingAt)||taskSortDate(t);
      if(!date)return;
      const n=weekForDay(date.getFullYear(),date.getMonth(),date.getDate());
      if(!groups.has(n))groups.set(n,[]);
      groups.get(n).push(t);
    });
    return [...groups].sort(([a],[b])=>a-b).map(([number,items])=>{
      const w=getWeeks(state.year,state.month).find(w=>w.n===number);
      const date=w?new Date(state.year,state.month,w.start):null;
      const label=date?`${MONTHS[state.month]} de ${state.year} · Semana ${number} (${dateRangeForWeek(date)})`:'Semana '+number;
      return `<section class="committee-group"><h3 class="committee-group-label">${escapeText(label)}</h3>
        <div class="committee-group-items">${items.map(renderTaskCard).join('')}</div></section>`;
    }).join('');
  }
  function renderCommitteeDetail(id){
    const c=state.data.committees.find(c=>String(c.id)===String(id));
    if(!c)return notFound();
    const period=commissionPeriodTasks(c.id).sort(comparePriorityTasks);
    const shown=state.commissionWeek==='all'?period:period.filter(t=>{
      const d=dateFrom(t.postingAt)||taskSortDate(t);
      return d&&weekForDay(d.getFullYear(),d.getMonth(),d.getDate())===Number(state.commissionWeek);
    });
    const count=shown.length;
    return `${header('Comissões',c.name,'',newButton('Nova atividade'))}${connectNotice()}
      <section class="card card-pad committee-summary"><div class="section-head"><h2>Resumo da comissão</h2></div>${commissionCounters(c.id)}</section>
      <section class="card card-pad committee-activities">
        <div class="section-head"><h2>Cronograma e atividades</h2>${tag(count+' '+(count===1?'registro':'registros'),'soft')}</div>
        ${commissionPeriodFilters()}
        <div class="commission-period-result">
        ${shown.length?renderCommissionGroups(shown):empty('calendar','Nenhuma atividade neste período','Escolha outro mês ou semana para consultar as atividades.',true)}
        </div>
      </section>`;
  }
  function displayMeetingTitle(m){
    const title=String(m.title||'').trim();
    if(!title || /^Memória do encontro(?: de quinta-feira)?$/i.test(title))
      return 'Reunião de '+formatDate(m.date,{day:'2-digit',month:'long',year:'numeric'});
    return title;
  }
  function renderReunioes(){
    const all=state.data.meetings.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    const count=all.length;
    return `${header('Reuniões','Memórias registradas','',`<a href="#/reunioes/nova" class="button primary">${icon('plus')} Nova memória</a>`)}${connectNotice()}
      <section class="card card-pad memory-list">${count?`<div class="memory-list-meta">${tag(count+' '+(count===1?'reunião':'reuniões'),'soft')}</div>`:''}
      ${count?all.map(m=>`<article class="memory-list-item"><span class="memory-list-icon">${icon('book')}</span>
        <div class="memory-list-content"><h2>${escapeText(displayMeetingTitle(m))}</h2><p class="memory-summary">${escapeText(String(m.rawNotes||'').replace(/[\r\n*•→]/g,' ').replace(/\s+/g,' ').trim().slice(0,160))}${String(m.rawNotes||'').length>160?'…':''}</p><span class="memory-list-date">${formatDate(m.date,{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</span>
          <div class="memory-actions"><a href="#/reunioes/${safeHref(m.id)}" class="activity-details-link">Ver memória ${icon('arrow')}</a><a href="#/reunioes/editar/${safeHref(m.id)}" class="button ghost small-action">${icon('settings')} Editar</a><button class="button subtle-danger small-action" data-action="delete-meeting" data-id="${escapeText(m.id)}" type="button">${icon('close')} Excluir</button></div>
        </div></article>`).join(''):empty('book','Nenhuma memória registrada','Cadastre a primeira memória para consultar os encontros aqui.')}
      </section>`;
  }
  function renderMeetingDetail(id){
    const m=state.data.meetings.find(m=>String(m.id)===String(id));
    if(!m)return notFound();
    return `${header('Reuniões',displayMeetingTitle(m),formatDate(m.date),`<a class="button ghost" href="#/reunioes/editar/${safeHref(m.id)}">${icon('settings')} Editar memória</a>`)}${connectNotice()}
      <div class="card card-pad memory-reading"><div class="memory-reading-head">${icon('book')} <strong>Registro completo</strong></div><p>${escapeText(m.rawNotes||'Sem texto cadastrado.')}</p></div>`;
  }
  function renderMemoryEditor(id){
    const existing=id?state.data.meetings.find(m=>String(m.id)===String(id)):null;
    if(id&&!existing)return notFound();
    const title=existing?'Editar memória':'Nova memória';
    return `${header('Reuniões',title,'',`<a href="#/reunioes" class="button ghost">${icon('chevron-left')} Voltar</a>`)}${connectNotice()}
      <section class="card card-pad register-page memory-editor"><form id="register-memory-form" data-id="${escapeText(existing?.id||'')}" class="register-form">
        <label>Título da reunião<input name="title" maxlength="150" placeholder="Ex.: Reunião semanal do PET" value="${escapeText(existing?.title||'')}"></label>
        <label>Data da reunião<input type="date" name="date" value="${escapeText(existing?.date||dateKey(new Date()))}" required></label>
        <label>Memória da reunião<textarea name="rawNotes" rows="12" required placeholder="Cole aqui o registro da reunião...">${escapeText(existing?.rawNotes||'')}</textarea></label>
        <div class="form-actions memory-form-actions">${existing?`<button type="button" class="button subtle-danger" data-action="delete-meeting" data-id="${escapeText(existing.id)}">${icon('close')} Excluir memória</button>`:''}<button type="submit" class="button primary">${icon('check')} ${existing?'Salvar alterações':'Salvar memória'}</button></div>
      </form><p class="assignment-preview-note">As alterações são demonstrativas e ficam somente neste navegador.</p></section>`;
  }
  function renderMyTasks(){const user=sessionUser(),mine=user?tasks().filter(t=>!isCompleted(t)&&isAssigned(t,user.id)):[];
    return `${header('Área pessoal','Minhas pendências','Todas as atividades atribuídas a você, reunidas de diferentes comissões e períodos.')}${!user?`<div class="private-lock">${icon('lock')}<div><strong>Acesso pessoal ainda não ativado</strong><p>A identificação por conta e as pendências individuais serão disponibilizadas após a implantação da autenticação segura.</p></div></div>`:`<section class="card card-pad"><div class="section-head"><h2>Atividades atribuídas</h2>${tag(String(mine.length)+' abertas','soft')}</div>${mine.length?mine.map(renderTaskCard).join(''):empty('checklist','Nenhuma pendência em seu nome','As atividades concluídas permanecem disponíveis no histórico geral.')}</section>`}`;
  }

  function getAssigneeNames(t){
    const ids=Array.isArray(t.assigneeIds)?t.assigneeIds:[];
    return [...new Set(ids.map(id=>state.data.users.find(u=>String(u.id)===String(id))?.name).filter(Boolean))];
  }
  function deadlineParts(d){
    const label=String(d.label||d.kind||'Prazo');
    const separated=label.split(' — ');
    const step=separated[0]||'Prazo';
    const person=String(d.assigneeName||separated.slice(1).join(' — ')||'').trim();
    return {step,person:person||'A definir'};
  }

  // Somente demonstração: o estado destas alterações é local ao navegador.
  function readLocalDemoWrites(){
    try{
      const raw=JSON.parse(localStorage.getItem(DEMO_EDITS_KEY)||'{}');
      return raw&&typeof raw==='object'?raw:{};
    }catch{return {};}
  }

  function saveLocalDemoWrites(){
    if(!state.demo)return false;
    try{
      const originalTasks=window.PET_GESTAO_DEMO?.tasks||[];
      const originalMeetings=window.PET_GESTAO_DEMO?.meetings||[];
      const originalIds=new Set(originalTasks.map(t=>String(t.id)));
      const originalMeetingIds=new Set(originalMeetings.map(m=>String(m.id)));
      const currentTasks=new Set(state.data.tasks.map(t=>String(t.id)));
      const currentMeetings=new Set(state.data.meetings.map(m=>String(m.id)));
      const patches=state.data.tasks.filter(t=>originalIds.has(String(t.id))&&(t.revisions?.length||t.observations?.length||t.reviewStatus||t.captionText));
      const additions=state.data.tasks.filter(t=>!originalIds.has(String(t.id)));
      const memoryPatches=state.data.meetings.filter(m=>originalMeetingIds.has(String(m.id)) && !originalMeetings.some(x=>String(x.id)===String(m.id)&&x.title===m.title&&x.date===m.date&&x.rawNotes===m.rawNotes));
      const newMeetings=state.data.meetings.filter(m=>!originalMeetingIds.has(String(m.id)));
      const deletedTaskIds=[...originalIds].filter(id=>!currentTasks.has(id));
      const deletedMeetingIds=[...originalMeetingIds].filter(id=>!currentMeetings.has(id));
      localStorage.setItem(DEMO_EDITS_KEY,JSON.stringify({patches,additions,memoryPatches,newMeetings,deletedTaskIds,deletedMeetingIds}));
      return true;
    }catch(e){console.warn('Não foi possível salvar alterações locais:',e);return false;}
  }
  function mergeLocalDemoWrites(){
    if(!state.demo)return;
    const edits=readLocalDemoWrites();
    const removedTasks=new Set(Array.isArray(edits.deletedTaskIds)?edits.deletedTaskIds.map(String):[]);
    const removedMeetings=new Set(Array.isArray(edits.deletedMeetingIds)?edits.deletedMeetingIds.map(String):[]);
    const byId=new Map((Array.isArray(edits.patches)?edits.patches:[]).map(x=>[String(x.id),x]));
    const memoriesById=new Map((Array.isArray(edits.memoryPatches)?edits.memoryPatches:[]).map(x=>[String(x.id),x]));
    state.data.tasks=state.data.tasks.filter(t=>!removedTasks.has(String(t.id))).map(t=>byId.has(String(t.id))?{...t,...byId.get(String(t.id))}:t);
    const original=new Set(state.data.tasks.map(t=>String(t.id)));
    (Array.isArray(edits.additions)?edits.additions:[]).forEach(t=>{if(t&&t.id&&!original.has(String(t.id))){state.data.tasks.push(t);original.add(String(t.id));}});
    state.data.meetings=state.data.meetings.filter(m=>!removedMeetings.has(String(m.id))).map(m=>memoriesById.has(String(m.id))?{...m,...memoriesById.get(String(m.id))}:m);
    const meetings=new Set(state.data.meetings.map(m=>String(m.id)));
    (Array.isArray(edits.newMeetings)?edits.newMeetings:[]).forEach(m=>{if(m&&m.id&&!meetings.has(String(m.id))){state.data.meetings.push(m);meetings.add(String(m.id));}});
    // Exclusão de uma reunião não remove suas demandas. Elas permanecem acessíveis, sem vínculo.
    state.data.tasks.forEach(t=>{if(t.meetingId&&removedMeetings.has(String(t.meetingId)))t.meetingId=null;});
    state.data.meetings.forEach(m=>{if(Array.isArray(m.taskIds))m.taskIds=m.taskIds.filter(id=>!removedTasks.has(String(id)));});
  }

  function actorDemo(){
    if(!state.demo){
      const user=sessionUser();
      if(!user)return null;
      const roles=Array.isArray(user.roles)?user.roles.map(r=>String(r).toLowerCase()):[];
      const role=roles.some(r=>r==='tutor'||r==='tutora')?'tutora':roles.some(r=>r==='admin'||r==='administracao'||r==='administração')?'administracao':'petiano';
      return {name:user.name||'Integrante',role};
    }
    if(state.demoActor==='lene')return {name:'Lene',role:'tutora'};
    if(state.demoActor==='admin')return {name:'Administração',role:'administracao'};
    return {name:'PETiano(a) — teste',role:'petiano'};
  }
  function canReview(actor){return Boolean(actor&&['tutora','administracao'].includes(actor.role));}
  const REVIEW_OPTIONS=[
    ['aguardando','Aguardando revisão'],
    ['ajustes','Ajustes necessários'],
    ['nao_liberado','Não liberado para uso/postagem'],
    ['liberado','Liberado para uso/postagem']
  ];
  function reviewLabel(value){return REVIEW_OPTIONS.find(r=>r[0]===value)?.[1]||'Aguardando revisão';}
  function demoActorSelect(){
    if(!state.demo)return '';
    return `<div class="demo-actor-compact"><div class="demo-actor-copy"><span class="demo-dot"></span><div><strong>Perfil para testar a tela</strong><small>Simulação — não substitui o login real.</small></div></div>
      <label for="demo-actor" class="visually-hidden">Visualizar como</label>
      <select class="select" id="demo-actor" data-field="demoActor" aria-label="Visualizar como">
        <option value="petiano" ${state.demoActor==='petiano'?'selected':''}>PETiano(a)</option>
        <option value="lene" ${state.demoActor==='lene'?'selected':''}>Lene · Tutora</option>
        <option value="admin" ${state.demoActor==='admin'?'selected':''}>Administração</option>
      </select></div>`;
  }
  function renderAssignmentPreview(){
    const scope=state.assignmentScope;
    const opts=[['todos','Todos'],['comissoes','Comissões'],['usuarios','Usuários']];
    const commissionId=state.regCommitteeId||'';
    const group=state.data.committees.find(c=>String(c.id)===String(commissionId));
    const members=new Set((group?.memberIds||[]).map(String));
    const users=state.data.users.slice().sort((a,b)=>{
      const p=Number(members.has(String(b.id)))-Number(members.has(String(a.id)));
      return p||String(a.name).localeCompare(String(b.name),'pt-BR');
    });
    const choices=scope==='comissoes'?state.data.committees.map(c=>({id:c.id,name:c.name})):users.map(u=>({id:u.id,name:u.name}));
    const list=scope==='todos'
      ?`<div class="assignment-all">${icon('users')} Todos os ${state.data.users.length} usuários incluídos.</div>`
      :choices.length?`<div class="assignment-options">${choices.map(c=>`<label class="assignment-option"><input type="checkbox" data-assign-target="${escapeText(c.id)}" ${state.assignmentPicked.includes(String(c.id))?'checked':''}><span>${escapeText(c.name)}</span>${scope==='usuarios'&&members.has(String(c.id))?tag('Da comissão','mint'):''}</label>`).join('')}</div>`
      :'<p class="notice-line">Nenhum cadastro disponível.</p>';
    return `<div class="register-assignment"><h3>Responsáveis</h3><div class="segmented assignment-modes" role="group" aria-label="Escolher responsáveis">${opts.map(([v,title])=>`<button type="button" data-action="assignment-scope" data-value="${v}" class="${scope===v?'active':''}" aria-pressed="${scope===v}">${title}</button>`).join('')}</div>${list}</div>`;
  }

  function registerDeadlineRow(i,deadline){
    const raw=deadline||{};
    const parsed=deadlineParts(raw);
    const name=raw.assigneeName||(parsed.person==='A definir'?'':parsed.person);
    const dateString=String(raw.dueAt||''),day=dateString.slice(0,10),time=dateString.includes('T')?dateString.slice(11,16):'23:59';
    const options=['Prazo','Produção','Correção','Entrega','Publicação','Outro prazo'];
    if(parsed.step&&!options.includes(parsed.step))options.push(parsed.step);
    return `<div class="register-deadline" data-deadline-index="${i}"><label>Etapa<select class="select" name="deadline-step-${i}">${options.map(o=>`<option ${o===parsed.step?'selected':''}>${escapeText(o)}</option>`).join('')}</select></label>
      <label>Para quem<input name="deadline-assignee-${i}" value="${escapeText(name)}" placeholder="Integrante, tutoria ou comissão"></label>
      <label>Data<input type="date" name="deadline-date-${i}" value="${escapeText(day)}"></label>
      <label>Horário<input type="time" name="deadline-time-${i}" value="${escapeText(time||'23:59')}"></label><button type="button" class="remove-deadline-button" data-action="remove-deadline" data-index="${i}" aria-label="Remover este prazo" title="Remover prazo">${icon('close')} Remover prazo</button></div>`;
  }

  function renderReviewEditor(t){
    const actor=actorDemo();
    const editable=canReview(actor);
    const current=reviewLabel(t.reviewStatus||'aguardando');
    const notes=`<div class="edit-panel-card ${editable?'':'edit-panel-locked'}"><div class="edit-panel-heading">
      <span class="edit-panel-icon">${icon(editable?'book':'lock')}</span><div><h3>Observação da tutoria</h3>
      <p>${editable?'Registre orientações ou correções para os responsáveis.':'Somente a Tutoria e a Administração podem escrever observações.'}</p></div>
      ${editable?'<span class="edit-access-label">Autorizado</span>':'<span class="edit-access-label locked">Bloqueado</span>'}</div>
      <label for="edit-new-observation">Nova observação (opcional)</label>
      <textarea id="edit-new-observation" name="observation" rows="3" placeholder="${editable?'Ex.: Ajustar as informações antes de publicar.':'Disponível somente para Tutoria e Administração'}" ${editable?'':'disabled aria-disabled="true"'}></textarea>
      </div>`;
    const options=`<div class="edit-panel-card ${editable?'':'edit-panel-locked'}"><div class="edit-panel-heading">
      <span class="edit-panel-icon">${icon(editable?'check':'lock')}</span><div><h3>Liberação da atividade</h3>
      <p>Situação atual: <strong>${escapeText(current)}</strong></p></div>
      ${editable?'<span class="edit-access-label">Autorizado</span>':'<span class="edit-access-label locked">Bloqueado</span>'}</div>
      <label for="edit-review-status">Decisão sobre o uso ou postagem</label>
      <select class="select" id="edit-review-status" name="reviewStatus" ${editable?'':'disabled aria-disabled="true"'}><option value="">Sem nova decisão</option>${REVIEW_OPTIONS.map(([v,title])=>`<option value="${v}">${escapeText(title)}</option>`).join('')}</select>
      <small>${editable?'A liberação só será registrada se você escolher explicitamente “Liberado para uso/postagem”.':'A decisão é exclusiva da Tutoria e da Administração.'}</small>
      </div>`;
    return `<section class="edit-revision-section"><div class="edit-section-title"><h2>Revisão e observações</h2><p>As orientações não liberam automaticamente a atividade.</p></div>
      ${demoActorSelect()}<div class="edit-revision-grid">${notes}${options}</div></section>`;
  }
  function renderRegister(){
    const id=getRoute().id||'';
    const task=id?tasks().find(t=>String(t.id)===String(id)):null;
    if(id&&!task)return notFound();
    if(state.registerCurrentId!==id){
      state.registerCurrentId=id;
      state.registerType='demanda';
      state.regCommitteeId=task?.committeeId||'';
      state.assignmentScope='usuarios';
      state.assignmentPicked=(task?.assigneeIds||[]).map(String);
      state.formDeadlineCount=Math.max(1,task?.deadlines?.length||1);
    }
    const opt=state.data.committees.map(c=>`<option value="${escapeText(c.id)}" ${String(state.regCommitteeId)===String(c.id)?'selected':''}>${escapeText(c.name)}</option>`).join('');
    const meetings=state.data.meetings.map(m=>`<option value="${escapeText(m.id)}" ${String(task?.meetingId||'')===String(m.id)?'selected':''}>${escapeText(displayMeetingTitle(m))} · ${formatDate(m.date)}</option>`).join('');
    const taskForm=`<form id="register-task-form" data-id="${escapeText(task?.id||'')}" class="register-form"><label>Título da demanda<input name="title" required maxlength="180" value="${escapeText(task?.title||'')}" placeholder="Ex.: Produzir banner da Lixeira"></label>
    <label>Descrição (opcional)<textarea name="description" rows="4" placeholder="O que precisa ser feito?">${escapeText(task?.description||'')}</textarea></label>
    <div class="register-two"><label>Comissão<select name="committeeId" class="select" data-field="regCommitteeId"><option value="">Sem comissão</option>${opt}</select></label><label>Memória vinculada (opcional)<select name="meetingId" class="select"><option value="">Nenhuma</option>${meetings}</select></label></div>
    <div class="register-two"><label>Data de postagem (opcional)<input type="date" name="postingAt" value="${escapeText(String(task?.postingAt||'').slice(0,10))}"></label>
      <label>Situação da demanda<select name="status" class="select"><option value="pendente" ${!task||!isCompleted(task)?'selected':''}>Pendente</option><option value="concluida" ${task&&isCompleted(task)?'selected':''}>Concluída / Arquivada</option></select></label></div>
    ${renderAssignmentPreview()}
    <div class="register-deadlines"><div class="section-head"><h3>Prazos por etapa</h3><button class="button ghost" type="button" data-action="add-deadline">${icon('plus')} Adicionar prazo</button></div>
    ${Array.from({length:state.formDeadlineCount},(_,i)=>registerDeadlineRow(i,task?.deadlines?.[i])).join('')}</div>
    ${task?`<section class="edit-copy-section"><div class="edit-section-title"><h2>Texto da atividade</h2><p>Atualize a legenda ou o conteúdo que será utilizado.</p></div>
      <label for="edit-caption-text">Texto (opcional)</label><textarea name="captionText" id="edit-caption-text" rows="5" placeholder="Escreva ou edite o texto da atividade...">${escapeText(task.captionText||'')}</textarea></section>
      ${renderReviewEditor(task)}`:''}
    <div class="form-actions demand-form-actions">${task?`<button type="button" class="button subtle-danger" data-action="delete-task" data-id="${escapeText(task.id)}">${icon('close')} Excluir demanda</button>`:'' }<button type="submit" class="button primary">${icon('check')} ${task?'Salvar demanda':'Registrar demanda'}</button></div></form>`;
    return `${header('Cadastros',task?'Editar demanda':'Registrar demandas',task?'Altere prazos, responsáveis, comissão ou situação da atividade.':'Crie uma demanda com prazos, comissão e responsáveis.')}${connectNotice()}
      <section class="card card-pad register-page">${taskForm}
      <p class="assignment-preview-note">${state.demo?'Demonstração: as alterações ficam somente neste navegador e não enviam e-mails.':'A edição exigirá autorização quando o backend estiver integrado.'}</p></section>`;
  }
  function registeredAssigneeIds(){
    if(state.assignmentScope==='todos')return state.data.users.map(u=>String(u.id));
    if(state.assignmentScope==='usuarios')return state.assignmentPicked.slice();
    const selected=new Set(state.assignmentPicked.map(String));
    return [...new Set(state.data.committees.filter(c=>selected.has(String(c.id))).flatMap(c=>(c.memberIds||[]).map(String)))];
  }


  function saveRegisteredTask(form){
    if(!state.demo){showToast('Cadastro disponível após a integração segura.');return;}
    const x=new FormData(form),title=String(x.get('title')||'').trim();
    if(!title){showToast('Informe o título da demanda.');return;}
    const deadlines=[];
    const id=String(form.dataset.id||'');
    const existing=id?tasks().find(t=>String(t.id)===id):null;
    if(id&&!existing){showToast('Demanda não encontrada.');return;}
    for(let i=0;i<state.formDeadlineCount;i++){
      const day=String(x.get('deadline-date-'+i)||''),hour=String(x.get('deadline-time-'+i)||'23:59');
      if(day){
        const step=String(x.get('deadline-step-'+i)||'Prazo'),who=String(x.get('deadline-assignee-'+i)||'').trim();
        deadlines.push({label:step,assigneeName:who,dueAt:day+'T'+(hour||'23:59')+':00',completedAt:existing?.deadlines?.[i]?.completedAt||null});
      }
    }
    const status=String(x.get('status')||'pendente');
    const values={title,description:String(x.get('description')||'').trim(),postingAt:String(x.get('postingAt')||'')||null,
      meetingId:String(x.get('meetingId')||'')||null,committeeId:String(x.get('committeeId')||'')||null,
      deadlines,assigneeIds:registeredAssigneeIds(),status,stageName:status==='concluida'?'Concluída':'Pendente'};
    const now=new Date().toISOString(),actor=actorDemo()||{name:'Demonstração',role:'petiano'};
    if(existing){
      const before=JSON.stringify(Object.fromEntries(Object.keys(values).map(key=>[key,existing[key]])));
      const wasCompleted=isCompleted(existing);
      const priorReview=existing.reviewStatus||'aguardando';
      const priorText=String(existing.captionText||'');
      const newText=String(x.get('captionText')??priorText);
      // A observação e o seletor de liberação são exclusivos da tutoria e administração.
      const obs=canReview(actor)?String(x.get('observation')||'').trim():'';
      const requestedReview=canReview(actor)?String(x.get('reviewStatus')||''):'';
      const choice=REVIEW_OPTIONS.some(([v])=>v===requestedReview)?requestedReview:null;
      const textChanged=newText!==priorText;
      const observationsChanged=Boolean(obs);
      const edits=[];
      Object.assign(existing,values);
      if(status==='concluida')existing.completedAt=existing.completedAt||now;
      else {delete existing.completedAt;delete existing.closedAt;}
      if(before!==JSON.stringify(values))edits.push('Dados da demanda atualizados');
      if(wasCompleted!==isCompleted(existing))edits.push(isCompleted(existing)?'Concluiu demanda':'Reabriu demanda');
      if(textChanged){existing.captionText=newText;edits.push(canReview(actor)?'Texto corrigido':'Texto editado');}
      if(observationsChanged){
        existing.observations=[...(existing.observations||[]),{body:obs,authorName:actor.name,createdAt:now}];
        edits.push('Observação registrada');
      }
      // Nenhuma alteração textual ou observação aprova automaticamente a publicação.
      // Mudanças em material já liberado exigem nova liberação explícita.
      let updatedReview=priorReview;
      if((textChanged||observationsChanged)&&priorReview==='liberado')updatedReview=observationsChanged?'ajustes':'aguardando';
      if(choice)updatedReview=choice;
      if(updatedReview!==priorReview){existing.reviewStatus=updatedReview;edits.push('Revisão: '+reviewLabel(updatedReview));}
      if(edits.length){
        existing.revisions=[...(existing.revisions||[]),...edits.map(action=>({action,actorName:actor.name,at:now}))];
        existing.lastEditedBy=actor.name;existing.lastEditedAt=now;
      }
    }else{
      const id='local-task-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
      state.data.tasks.push({id,registeredAt:dateKey(new Date()),reviewStatus:'aguardando',revisions:[],observations:[],...values,...(status==='concluida'?{completedAt:now}:{})});
    }
    if(saveLocalDemoWrites()){
      state.registerCurrentId=null;state.assignmentPicked=[];state.formDeadlineCount=1;state.demandMode=status==='concluida'?'arquivo':'pendentes';
      location.hash='#/demandas';render();
      showToast(existing?'Demanda atualizada com autoria e horário nesta demonstração.':'Demanda registrada neste navegador.');
    }else showToast('Não foi possível salvar os dados locais.');
  }
  function saveRegisteredMemory(form){
    if(!state.demo){showToast('Cadastro disponível após a integração segura.');return;}
    const x=new FormData(form),title=String(x.get('title')||'').trim(),rawNotes=String(x.get('rawNotes')||'').trim(),date=String(x.get('date')||'');
    if(!rawNotes||!date){showToast('Informe a data e o texto da memória.');return;}
    const id=String(form.dataset.id||'');
    const existing=id?state.data.meetings.find(m=>String(m.id)===id):null;
    if(id&&!existing){showToast('Memória não encontrada.');return;}
    const now=new Date().toISOString(),who=actorDemo()?.name||'Demonstração';
    if(existing){
      existing.title=title;
      existing.date=date;
      existing.rawNotes=rawNotes;
      existing.lastEditedBy=who;
      existing.lastEditedAt=now;
    }else{
      state.data.meetings.push({id:'local-meeting-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),title,date,rawNotes,taskIds:[],lastEditedBy:who,lastEditedAt:now});
    }
    if(saveLocalDemoWrites()){location.hash='#/reunioes';render();showToast(existing?'Memória atualizada neste navegador.':'Memória registrada neste navegador.');}
    else showToast('Não foi possível salvar os dados locais.');
  }
  function deleteDemoRecord(kind,id){
    if(!state.demo){showToast('Exclusão indisponível sem autenticação.');return;}
    const isMeeting=kind==='meeting';
    const list=isMeeting?state.data.meetings:state.data.tasks;
    const entry=list.find(x=>String(x.id)===String(id));
    if(!entry)return;
    const name=isMeeting?displayMeetingTitle(entry):entry.title||'Demanda';
    const message=isMeeting
      ?`Excluir a memória "${name}"? As demandas relacionadas serão preservadas, mas deixarão de estar vinculadas a esta reunião. Essa exclusão vale apenas nesta demonstração.`
      :`Excluir a demanda "${name}" e seus prazos? Essa exclusão vale apenas nesta demonstração.`;
    if(!window.confirm(message))return;
    if(isMeeting){
      state.data.meetings=state.data.meetings.filter(m=>String(m.id)!==String(id));
      state.data.tasks.forEach(t=>{if(String(t.meetingId)===String(id))t.meetingId=null;});
      location.hash='#/reunioes';
    }else{
      state.data.tasks=state.data.tasks.filter(t=>String(t.id)!==String(id));
      state.data.meetings.forEach(m=>{if(Array.isArray(m.taskIds))m.taskIds=m.taskIds.filter(x=>String(x)!==String(id));});
      state.demandMode='pendentes';
      location.hash='#/demandas';
    }
    if(saveLocalDemoWrites()){render();showToast(isMeeting?'Memória excluída nesta demonstração.':'Demanda excluída nesta demonstração.');}
    else showToast('Não foi possível salvar a exclusão no navegador.');
  }

  function renderActivityDetail(id){
    const t=tasks().find(t=>String(t.id)===String(id));
    if(!t)return notFound();
    const d=taskDeadlines(t),notes=Array.isArray(t.observations)?t.observations:[];
    const assignees=getAssigneeNames(t),review=t.reviewStatus||'aguardando';
    const statusBadge=review==='liberado'?tag('Liberado para uso/postagem','mint'):review==='ajustes'?tag('Ajustes necessários','soft'):review==='nao_liberado'?tag('Não liberado','soft'):tag('Aguardando revisão','soft');
    const deadlines=d.length?d.map(x=>{
      const {step,person}=deadlineParts(x),date=dateFrom(x.dueAt);
      const due=date?formatDate(date,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'A definir';
      return `<div class="deadline-record"><div class="deadline-step">${icon('clock')}<strong>${escapeText(step)}</strong></div><div class="deadline-field"><small>Responsável</small><strong>${escapeText(person)}</strong></div><div class="deadline-field"><small>Prazo</small><strong>${escapeText(due)}</strong></div>${tag(x.completedAt?'Concluído':'Pendente',x.completedAt?'mint':'soft')}</div>`;
    }).join(''):empty('clock','Nenhum prazo cadastrado','Sem prazos definidos para esta atividade.',true);
    const observations=notes.length?notes.slice().reverse().map(n=>`<div class="observation-item"><strong>${escapeText(n.authorName||'Integrante')}</strong><small>${formatDate(n.createdAt,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small><p>${escapeText(n.body||'')}</p></div>`).join(''):'';
    const revisions=Array.isArray(t.revisions)?t.revisions.slice().reverse().slice(0,7):[];
    const history=revisions.length?`<div class="revision-list">${revisions.map(x=>`<div><strong>${escapeText(x.action||'Atualização')} — ${escapeText(x.actorName)}</strong><small>${formatDate(x.at,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div>`).join('')}</div>`:'<p class="notice-line">Nenhuma alteração registrada.</p>';
    const posting=t.postingAt?`<p class="activity-due">Postagem prevista: <strong>${formatDate(t.postingAt)}</strong></p>`:'';
    const savedText=String(t.captionText||'').trim();
    return `${header('Atividade',t.title,'',`<a class="button ghost" href="#/registrar/${safeHref(t.id)}">${icon('settings')} Editar demanda</a><a class="button ghost" href="${t.meetingId?'#/reunioes/'+safeHref(t.meetingId):t.committeeId?'#/comissoes/'+safeHref(t.committeeId):'#/demandas'}">${icon('chevron-left')} Voltar</a>`)}${connectNotice()}
    <div class="activity-header-strip card card-pad">${statusBadge}${posting}</div>
    <div class="activity-detail-grid">
      <div class="stack">
        <section class="card card-pad"><h2>Prazos e etapas</h2>${deadlines}</section>
        ${savedText?`<section class="card card-pad"><h2>Texto registrado</h2><p class="saved-activity-text">${escapeText(savedText)}</p></section>`:''}
        <section class="card card-pad"><h2>Observações</h2>${observations||'<p class="notice-line">Nenhuma observação registrada.</p>'}</section>
      </div><div class="stack">
        <section class="card card-pad"><h2>Responsáveis</h2>${assignees.length?`<div class="assigned-pills">${assignees.map(a=>tag(a,'soft')).join('')}</div>`:'<p class="notice-line">Nenhum responsável atribuído.</p>'}</section>
        <section class="card card-pad"><h2>Situação da revisão</h2><p class="notice-line">${escapeText(reviewLabel(review))}</p><p class="assignment-preview-note">A aprovação não é automática: depende de uma decisão da Tutoria ou da Administração.</p></section>
        <section class="card card-pad"><h2>Histórico de alterações</h2>${history}</section>
      </div>
    </div>`;
  }
  function notFound(){return `${header('Navegação','Registro não encontrado','O item solicitado não está disponível ou não pode ser consultado com este acesso.')}<div class="card card-pad">${empty('search','Não foi possível abrir o registro','Retorne à lista e escolha uma atividade disponível.')}</div>`;}
  function render(){
    const {base,id}=getRoute();const screen=$('#screen');if(!screen)return;
    $('#current-page').textContent=routeTitles[base]||'PET Educação';
    document.title=`${routeTitles[base]||'PET Educação'} | PET Educação`;
    document.querySelectorAll('[data-route]').forEach(el=>{const selected=el.dataset.route===base;el.classList.toggle('active',selected);if(selected)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    const views={inicio:renderHome,demandas:renderDemandas,registrar:renderRegister,cronograma:renderCronograma,comissoes:()=>id?renderCommitteeDetail(id):renderComissoes(),reunioes:()=>id==='nova'?renderMemoryEditor(''):id.startsWith('editar/')?renderMemoryEditor(id.slice(7)):id?renderMeetingDetail(id):renderReunioes(),'minhas-pendencias':renderMyTasks,atividade:()=>renderActivityDetail(id)};
    screen.innerHTML=(views[base]||renderHome)();
  }
  function navigate(path){location.hash='#/'+path; if(getRoute().base===path)render();}
  function monthStep(step){const d=new Date(state.year,state.month+step,1);state.year=d.getFullYear();state.month=d.getMonth();state.week=1;state.selectedDay=1;savePrefs();render();}
  function resetCurrent(){state.year=TODAY.getFullYear();state.month=TODAY.getMonth();state.week=weekForDay(state.year,state.month,TODAY.getDate());state.selectedDay=TODAY.getDate();savePrefs();render();}
  function showToast(message){const t=$('#toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},4200);}
  function menuOpen(open){$('#sidebar').classList.toggle('open',open);$('#overlay').hidden=!open;document.body.style.overflow=open?'hidden':'';}
  function bind(){
    $('#open-menu').addEventListener('click',()=>menuOpen(true));
    $('#close-menu').addEventListener('click',()=>menuOpen(false));
    $('#overlay').addEventListener('click',()=>menuOpen(false));
    window.addEventListener('keydown',e=>{if(e.key==='Escape')menuOpen(false)});
    window.addEventListener('hashchange',()=>{menuOpen(false);render();window.scrollTo(0,0)});
    $('#account-button').addEventListener('click',()=>showToast('O acesso às contas será disponibilizado após a configuração de autenticação.'));
    $('#admin-link').addEventListener('click',()=>showToast('A Administração está bloqueada até a implantação das permissões e do banco de dados.'));
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-action]');if(!b)return;
      if(b.disabled)return;
      switch(b.dataset.action){
        case 'go':navigate(b.dataset.to);break;
        case 'demand-mode':state.demandMode=b.dataset.value;render();break;
        case 'select-week':state.week=Number(b.dataset.value);savePrefs();render();break;
        case 'prev-month':monthStep(-1);break;
        case 'next-month':monthStep(1);break;
        case 'today':resetCurrent();break;
        case 'commission-current':state.commissionWeek='all';resetCurrent();break;
        case 'assignment-scope':state.assignmentScope=b.dataset.value;state.assignmentPicked=[];{const group=document.querySelector('.register-assignment');if(group)group.outerHTML=renderAssignmentPreview();else render();}break;
        case 'add-deadline':{
          const container=document.querySelector('.register-deadlines');
          if(container && container.querySelectorAll('.register-deadline').length<8 && state.formDeadlineCount<32){
            container.insertAdjacentHTML('beforeend',registerDeadlineRow(state.formDeadlineCount));
            state.formDeadlineCount++;
          } else showToast('Limite de oito prazos por atividade.');
          break;
        }
        case 'remove-deadline':{
          const row=b.closest('.register-deadline');
          if(row){row.remove();showToast('Prazo retirado do formulário. Salve a demanda para confirmar a alteração.');}
          break;
        }
        case 'delete-task':deleteDemoRecord('task',b.dataset.id);break;
        case 'delete-meeting':deleteDemoRecord('meeting',b.dataset.id);break;
      }
    });
    document.addEventListener('submit',e=>{
      if(e.target.id==='register-task-form'){e.preventDefault();saveRegisteredTask(e.target);}
      if(e.target.id==='register-memory-form'){e.preventDefault();saveRegisteredMemory(e.target);}
    });
    document.addEventListener('change',e=>{
      const el=e.target;if(!el.dataset?.field)return;
      if(el.dataset.assignTarget!==undefined){
        const id=String(el.dataset.assignTarget);
        state.assignmentPicked=el.checked?[...new Set([...state.assignmentPicked,id])]:state.assignmentPicked.filter(v=>v!==id);
        return;
      }
      const field=el.dataset.field;
      if(field==='month'){state.month=Number(el.value);state.week=1;state.commissionWeek='all';state.selectedDay=1;}
      if(field==='year'){state.year=Number(el.value);state.week=1;state.commissionWeek='all';state.selectedDay=1;}
      if(field==='week'){state.week=Number(el.value);}
      if(field==='commissionWeek'){state.commissionWeek=el.value==='all'?'all':String(el.value);}
      if(field==='demoActor'){
        const oldForm=document.querySelector('#register-task-form');
        const oldText=oldForm?.querySelector('[name="captionText"]')?.value??'';
        state.demoActor=el.value;
        const reviewPanel=document.querySelector('.edit-revision-section');
        const task=tasks().find(t=>String(t.id)===String(oldForm?.dataset.id||''));
        if(reviewPanel&&task){
          reviewPanel.outerHTML=renderReviewEditor(task);
          const txt=oldForm.querySelector('[name="captionText"]');
          if(txt)txt.value=oldText;
        }else render();
        return;
      }
      if(field==='regCommitteeId'){state.regCommitteeId=el.value;const group=document.querySelector('.register-assignment');if(group)group.outerHTML=renderAssignmentPreview();return;}
      if(field==='autoMonth'||field==='autoWeek'){state[field]=el.checked;savePrefs();return;}
      savePrefs();render();
    });
  }
  function sanitizeBootstrap(raw){
    const src=raw&&typeof raw==='object'?raw:{};
    const asArr=v=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[];
    const unique=arr=>Array.from(new Map(arr.filter(x=>x.id!==undefined&&x.id!==null).map(x=>[String(x.id),x])).values());
    return {tasks:unique(asArr(src.tasks)),committees:unique(asArr(src.committees)),meetings:unique(asArr(src.meetings)),users:unique(asArr(src.users)),events:asArr(src.events),session:src.session&&typeof src.session==='object'?src.session:null};
  }
  async function loadInstitutionalData(){
    if(!API && config.demoMode===true && window.PET_GESTAO_DEMO){
      state.data=sanitizeBootstrap(window.PET_GESTAO_DEMO);
      state.connected=true;
      state.demo=true;
      mergeLocalDemoWrites();
      $('#connection-label').textContent='Modo demonstração';
      render();
      return;
    }
    if(!API)return;
    state.loading=true;
    try{
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
      let response;
      try{response=await fetch(`${API}/api/v1/bootstrap`,{method:'GET',credentials:'include',headers:{'Accept':'application/json'},cache:'no-store',signal:controller.signal});}
      finally{clearTimeout(timeout);}
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();state.data=sanitizeBootstrap(data);state.connected=true;
      $('#connection-label').textContent='Conectado';$('#connection-dot').classList.add('online');
    }catch(error){
      console.warn('PET Gestão: dados não disponíveis; exibindo estrutura sem registros.',error?.message||error);
      state.data=emptyData();state.connected=false;
    }finally{state.loading=false;render();}
  }
  function start(){
    $('#today-label').textContent=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(TODAY);
    if(!location.hash)location.replace(location.pathname+location.search+'#/inicio');
    bind();render();loadInstitutionalData();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
