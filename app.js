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
    demandMode:'mensal', cronogramaView:'todas', committeeId:null, commissionWeek:'all', demoMineUserId:'andreza', assignmentScope:'usuarios', assignmentPicked:[], assignmentTaskId:null, demoActor:'petiano', demoEditing:false, formDeadlineCount:1, ...prefs
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
  function deadlineAssigneeNames(d){
    const names=Array.isArray(d?.assigneeNames)?d.assigneeNames.filter(Boolean).map(String):[];
    const ids=Array.isArray(d?.assigneeIds)?d.assigneeIds.filter(Boolean).map(String):[];
    ids.forEach(id=>{const p=state.data.users.find(u=>String(u.id)===id);if(p)names.push(String(p.name));});
    if(!names.length&&d?.assigneeId){const p=state.data.users.find(u=>String(u.id)===String(d.assigneeId));if(p)names.push(p.name);}
    if(!names.length&&d?.assigneeName)names.push(...String(d.assigneeName).split(/\s*,\s*/g).filter(Boolean));
    if(!names.length&&String(d?.label||'').includes(' — '))names.push(String(d.label).split(' — ').slice(1).join(' — ').trim());
    return [...new Set(names)];
  }
  function stageUserIds(d){
    const ids=Array.isArray(d?.assigneeIds)?d.assigneeIds.filter(Boolean).map(String):[];
    if(d?.assigneeId)ids.push(String(d.assigneeId));
    deadlineAssigneeNames(d).forEach(name=>{
      const match=state.data.users.find(u=>String(u.name||'').trim().toLocaleLowerCase('pt-BR')===String(name).trim().toLocaleLowerCase('pt-BR'));
      if(match)ids.push(String(match.id));
    });
    return [...new Set(ids)].filter(id=>state.data.users.some(u=>String(u.id)===id));
  }
  function stageUserId(d){return stageUserIds(d)[0]||null;}
  function assignedUserIds(t){return [...new Set([...(Array.isArray(t?.assigneeIds)?t.assigneeIds:[]),...taskDeadlines(t).flatMap(stageUserIds)].filter(Boolean).map(String))];}
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
    if(isApproved(t))return tag('APROVADA','approved-pill');
    return tag('Pendente',taskDeadlines(t).some(d=>deadlineOverdue(d))?'overdue-pill':'soft');
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
    // Uma atividade aparece só uma vez, pelo prazo não cumprido mais próximo.
    const now=new Date(),startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const all=tasks().filter(t=>!isCompleted(t)).map(task=>{
      const deadlines=taskDeadlines(task).filter(d=>!d.completedAt&&dateFrom(d.dueAt))
        .map(deadline=>({task,deadline,date:dateFrom(deadline.dueAt)})).sort((a,b)=>a.date-b.date);
      const next=deadlines.find(x=>x.date>=startToday);
      return next||(deadlines.length?deadlines[deadlines.length-1]:null);
    }).filter(Boolean);
    const upcoming=all.filter(x=>x.date>=startToday).sort((a,b)=>a.date-b.date);
    const overdue=all.filter(x=>x.date<startToday).sort((a,b)=>b.date-a.date);
    return upcoming.concat(overdue).slice(0,6);
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

  function weeksDisplay(){
    return `<div class="weeks-overview"><div class="weeks-overview-head"><div><h3>Semanas de ${escapeText(MONTHS[state.month])}</h3><p>Selecione para ver as atividades do período</p></div><span>${state.year}</span></div>
      <div class="weeks-overview-buttons" role="group" aria-label="Semanas de ${escapeText(MONTHS[state.month])}">
        ${getWeeks(state.year,state.month).map(w=>{
          const n=tasks().filter(t=>!isCompleted(t)&&taskActivityDates(t).some(d=>d.getFullYear()===state.year&&d.getMonth()===state.month&&d.getDate()>=w.start&&d.getDate()<=w.end)).length;
          return `<button type="button" class="week-overview-button ${state.week===w.n?'selected':''}" data-action="select-week" data-value="${w.n}" aria-pressed="${state.week===w.n}">
            <strong>Semana ${w.n}</strong><small>${String(w.start).padStart(2,'0')}–${String(w.end).padStart(2,'0')}/${String(state.month+1).padStart(2,'0')}</small>${n?`<span class="week-activity-number">${n}</span>`:''}
          </button>`;
        }).join('')}
      </div></div>`;
  }
  function renderWeeklyFocus(){
    const weekTasks=weeklyTasks().filter(t=>!isCompleted(t)).sort(comparePriorityTasks);
    const entries=weekTasks.length?weekTasks.slice(0,5).map(t=>`<div class="weekly-preview-item"><div><strong>${escapeText(t.title)}</strong><a class="activity-details-link" href="#/atividade/${safeHref(t.id)}">Ver detalhes ${icon('arrow')}</a></div>${displayTaskState(t)}</div>`).join('')
      +(weekTasks.length>5?`<button type="button" class="link-action" data-action="go-week-cronograma">Ver as ${weekTasks.length} demandas da semana ${icon('arrow')}</button>`:'')
      :'<p class="week-empty-notice">Nenhuma pendência nesta semana. As atividades concluídas estão em Arquivadas.</p>';
    return `<section class="card card-pad weekly-focus weekly-focus-simple"><div class="section-head"><div><h2>Pendências semanais</h2></div>
      <button class="link-action" data-action="go-all-cronograma">Ver cronograma ${icon('arrow')}</button></div>
      ${weeksDisplay()}
      <div class="weekly-preview-heading"><strong>Semana ${state.week}</strong><span>${weekTasks.length} ${weekTasks.length===1?'pendência':'pendências'}</span></div>
      <div class="weekly-preview-list">${entries}</div></section>`;
  }
  function renderHome(){
    return `
      ${connectNotice()}${renderStats()}
      <div class="dashboard-grid"><div class="stack">
        <section class="card card-pad upcoming-spotlight"><div class="upcoming-spotlight-head"><div class="upcoming-title"><span class="upcoming-badge">${icon('clock')}</span><div><h2>Próximos prazos</h2><p>Atividades que precisam de atenção</p></div></div><button class="link-action" data-action="go-all-cronograma">Ver cronograma ${icon('arrow')}</button></div><div class="upcoming-spotlight-body">${renderUpcomingCompact()}</div></section>
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
  function renderDemandMemories(){
    const all=state.data.meetings.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return `<section class="card card-pad demand-memories"><div class="section-head"><div><h2>Memórias dos encontros</h2><p>Consulte os registros das reuniões sem duplicar atividades.</p></div>
        <a href="#/reunioes/nova" class="button ghost">${icon('plus')} Nova memória</a></div>
        ${all.length?all.map(m=>`<div class="demand-memory-row" style="${memoryStyle(m)}"><div><strong>${escapeText(displayMeetingTitle(m))}</strong><small>${formatDate(m.date)}</small></div>
        <div class="demand-memory-actions"><a href="#/reunioes/${safeHref(m.id)}" class="activity-details-link">Ver memória ${icon('arrow')}</a>
        <a href="#/reunioes/editar/${safeHref(m.id)}" class="button ghost small-action">Editar</a>
        <button type="button" class="button subtle-danger small-action" data-action="delete-meeting" data-id="${escapeText(m.id)}">Excluir</button></div></div>`).join(''):empty('book','Nenhuma memória registrada','Cadastre a memória do primeiro encontro.',true)}
      </section>`;
  }
  function renderDemandas(){
    const modes=[['mensal','Mensal'],['semanal','Semanal'],['pendentes','Pendentes'],['arquivo','Arquivadas']];
    return `${header('Acompanhamento','Demandas','Uma lista única de atividades, organizada por período, responsáveis e situação.',`<a class="button primary" href="#/registrar">${icon('plus')} Registrar demanda</a>`)}${connectNotice()}
      <div class="card card-pad"><div class="demand-filter-groups">
        <div class="demand-filter-group"><strong>Período</strong><div class="segmented" role="group" aria-label="Demandas por período">${modes.slice(0,2).map(([val,label])=>`<button type="button" data-action="demand-mode" data-value="${val}" class="${state.demandMode===val?'active':''}" aria-pressed="${state.demandMode===val}">${label}</button>`).join('')}</div></div>
        <div class="demand-filter-group demand-filter-status"><strong>Situação</strong><div class="segmented" role="group" aria-label="Demandas por situação">${modes.slice(2).map(([val,label])=>`<button type="button" data-action="demand-mode" data-value="${val}" class="${state.demandMode===val?'active':''}" aria-pressed="${state.demandMode===val}">${label}</button>`).join('')}</div></div>
      </div>
        ${(state.demandMode==='mensal'||state.demandMode==='semanal')?`<div class="list-toolbar">${periodSelector(state.demandMode==='semanal')}</div>`:'<p class="notice-line">Esta visualização reúne registros de todos os meses e anos.</p>'}
        <hr class="divider"/><div class="table-head"><div class="section-head" style="margin-bottom:0"><div><h2>${state.demandMode==='mensal'?periodTitle():state.demandMode==='semanal'?'Semana '+state.week+' · '+periodTitle():state.demandMode==='arquivo'?'Arquivadas':'Pendências acumuladas'}</h2></div></div>${available()?tag(String(visibleDemandCount())+' registros','soft'):''}</div>
        ${renderDemandList()}
      </div>${renderDemandMemories()}`;
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
    const byWeek=weeklyTasks().filter(t=>!isCompleted(t)).sort(comparePriorityTasks);
    return byWeek.length?byWeek.map(renderTaskCard).join(''):empty('calendar','Sem atividades para esta semana','Os prazos, eventos e postagens registrados aparecerão neste período.',true);
  }
  function renderPrefs(){return `<details class="prefs-panel"><summary>${icon('sliders')} Preferências de navegação ${icon('chevron-down')}</summary><div class="prefs-content">
    <div class="switch-row"><div><strong>Atualizar mês e ano automaticamente</strong><small>Ao abrir o sistema, selecionar o mês e o ano atuais.</small></div><label class="switch"><input type="checkbox" data-field="autoMonth" ${state.autoMonth?'checked':''} aria-label="Atualizar mês e ano automaticamente"><span class="track"></span></label></div>
    <div class="switch-row"><div><strong>Atualizar semana automaticamente</strong><small>Ao abrir o sistema, selecionar a semana atual do período.</small></div><label class="switch"><input type="checkbox" data-field="autoWeek" ${state.autoWeek?'checked':''} aria-label="Atualizar semana automaticamente"><span class="track"></span></label></div>
    <p class="notice-line" style="margin:0">Os seletores manuais sempre ficam disponíveis. Alterar o período não modifica nem exclui atividades anteriores.</p>
  </div></details>`;}

  function renderCronograma(){
    const selected=state.cronogramaView||'todas';
    const all=tasks().filter(t=>!isCompleted(t)).sort(comparePriorityTasks);
    const onWeek=all.filter(isTaskInWeek);
    return `${header('Planejamento','Cronograma','Acompanhe todas as demandas abertas ou consulte uma semana específica.',`<a class="button primary" href="#/registrar">${icon('plus')} Registrar demanda</a>`)}${connectNotice()}
      <section class="card card-pad cronograma-simple">
        <div class="cronograma-view-tabs" role="group" aria-label="Visualização do cronograma">
          <button data-action="cronograma-view" data-value="todas" class="${selected==='todas'?'active':''}" aria-pressed="${selected==='todas'}">Todas as demandas <span>${all.length}</span></button>
          <button data-action="cronograma-view" data-value="semana" class="${selected==='semana'?'active':''}" aria-pressed="${selected==='semana'}">Por semana</button>
        </div>
        ${selected==='semana'? `<div class="cronograma-period-controls">${monthsSelector()}${yearsSelector()}</div>
          ${weeksDisplay()}
          <div class="section-head cronograma-list-heading"><div><h2>Semana ${state.week} · ${escapeText(periodTitle())}</h2>
          <p>${currentWeek().label} · ${onWeek.length} ${onWeek.length===1?'atividade':'atividades'}</p></div></div>
          ${onWeek.length?onWeek.map(renderTaskCard).join(''):empty('calendar','Nenhuma pendência nesta semana','Consulte outra semana para visualizar suas atividades.',true)}`
        :`<div class="section-head cronograma-list-heading"><div><h2>Todas as demandas</h2><p>Atividades abertas de todos os meses e comissões, sem duplicações.</p></div>${tag(all.length+' '+(all.length===1?'registro':'registros'),'soft')}</div>
          ${all.length?all.map(renderTaskCard).join(''):empty('checklist','Nenhuma demanda aberta','As atividades concluídas continuam disponíveis em Demandas → Arquivadas.',true)}`}
      </section>`;
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

  function renderComissoes(){
    const all=state.data.committees;
    return `${header('Trabalho em equipe','Comissões','',`<a class="button primary" href="#/comissoes/nova">${icon('plus')} Nova comissão</a>`)}${connectNotice()}
      <section class="card card-pad"><div class="section-head"><div><h2>Comissões cadastradas</h2><p>Organização das equipes e suas demandas.</p></div>${available()?tag(all.length+' '+(all.length===1?'comissão':'comissões'),'soft'):''}</div>
      ${all.length?all.map(c=>`<article class="commission-list-item"><a href="#/comissoes/${safeHref(c.id)}" class="commission-name-link"><span class="commission-icon">${icon('users')}</span><span><strong>${escapeText(c.name)}</strong><small>${Array.isArray(c.memberIds)?c.memberIds.length:0} integrantes${c.description?' · '+escapeText(c.description):''}</small></span></a>
        ${commissionCounters(c.id)}<div class="commission-list-actions"><a href="#/comissoes/${safeHref(c.id)}" class="activity-details-link">Ver atividades ${icon('arrow')}</a>
        <a href="#/comissoes/editar/${safeHref(c.id)}" class="button ghost small-action">${icon('settings')} Editar</a>
        <button type="button" data-action="delete-commission" data-id="${escapeText(c.id)}" class="button subtle-danger small-action">${icon('close')} Excluir</button></div></article>`).join(''):empty('users','Nenhuma comissão cadastrada','Crie uma comissão para organizar sua equipe e as demandas vinculadas.')}
      </section>`;
  }
  function renderCommissionEditor(id){
    const c=id?state.data.committees.find(x=>String(x.id)===String(id)):null;
    if(id&&!c)return notFound();
    const selected=new Set((c?.memberIds||[]).map(String));
    const users=state.data.users;
    const title=c?'Editar comissão':'Nova comissão';
    return `${header('Comissões',title,'',`<a class="button ghost" href="#/comissoes">${icon('chevron-left')} Voltar às comissões</a>`)}${connectNotice()}
      <div class="commission-editor-grid">
        <section class="card card-pad commission-editor-primary">
          <form id="commission-form" data-id="${escapeText(c?.id||'')}" class="register-form">
            <div class="edit-section-title"><h2>Dados da comissão</h2><p>Defina o nome, a descrição e quem faz parte da equipe.</p></div>
            <label>Nome da comissão <span class="required-star">*</span><input type="text" name="name" maxlength="90" required placeholder="Ex.: ImaginAÇÃO" value="${escapeText(c?.name||'')}"></label>
            <label>Descrição (opcional)<textarea name="description" rows="3" placeholder="Qual é a finalidade da comissão?">${escapeText(c?.description||'')}</textarea></label>
            <section class="commission-members-editor"><div class="section-head"><div><h2>Integrantes</h2><p>Selecione quem participa da comissão.</p></div><button class="button ghost small-action" data-action="commission-select-all" type="button">Selecionar todos</button></div>
              <div class="commission-member-list">${users.map(u=>`<label><input type="checkbox" name="memberIds" value="${escapeText(u.id)}" ${selected.has(String(u.id))?'checked':''}><span class="member-icon">${escapeText(String(u.name||'').charAt(0).toUpperCase())}</span><span>${escapeText(u.name)}</span></label>`).join('')||'<p class="notice-line">Nenhum PETiano(a) cadastrado.</p>'}</div></section>
            <div class="form-actions commission-editor-buttons">${c?`<button type="button" class="button subtle-danger" data-action="delete-commission" data-id="${escapeText(c.id)}">${icon('close')} Excluir comissão</button>`:''}<button type="submit" class="button primary">${icon('check')} ${c?'Salvar alterações':'Criar comissão'}</button></div>
          </form>
        </section>
        <aside class="card card-pad commission-editor-side"><span class="commission-example-icon">${icon('users')}</span><h2>Uma estrutura para todas</h2>
          <p>Ao criar sua comissão, ela terá automaticamente o mesmo cronograma, prazos, responsáveis e indicadores das demais.</p>
          <div class="commission-side-detail"><span>📅</span><div><strong>Cronograma mensal e semanal</strong><small>Consulte os períodos sem apagar o histórico.</small></div></div>
          <div class="commission-side-detail"><span>◎</span><div><strong>Demandas compartilhadas</strong><small>Vincule uma demanda a mais de uma comissão sem duplicá-la.</small></div></div>
          <div class="commission-side-detail"><span>✓</span><div><strong>Pendentes, atrasadas e concluídas</strong><small>Contadores atualizados a partir das atividades.</small></div></div>
          <p class="assignment-preview-note">Na demonstração, tudo fica salvo somente neste navegador.</p>
        </aside>
      </div>`;
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
    }).sort(comparePriorityTasks);
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
    return [...groups].sort(([weekA,listA],[weekB,listB])=>{
      const approvedA=listA.some(isApproved)?0:1,approvedB=listB.some(isApproved)?0:1;
      return approvedA-approvedB||weekA-weekB;
    }).map(([number,items])=>{
      items.sort(comparePriorityTasks);
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
    return `${header('Comissões',c.name,'',`<a class="button ghost" href="#/comissoes/editar/${safeHref(c.id)}">${icon('settings')} Editar comissão</a><a class="button primary" href="#/registrar/novo/${safeHref(c.id)}">${icon('plus')} Nova demanda</a>`)}${connectNotice()}
      <section class="card card-pad committee-summary"><div class="section-head"><h2>Resumo da comissão</h2></div>${commissionCounters(c.id)}</section>
      <section class="card card-pad committee-activities">
        <div class="section-head"><h2>Cronograma e atividades</h2>${tag(count+' '+(count===1?'registro':'registros'),'soft')}</div>
        ${commissionPeriodFilters()}
        <div class="commission-period-result">
        ${shown.length?renderCommissionGroups(shown):empty('calendar','Nenhuma atividade neste período','Escolha outro mês ou semana para consultar as atividades.',true)}
        </div>
      </section>`;
  }

  const MEMORY_THEMES={
    classic:['#ffffff','#ffffff'],
    lilac:['#f7f2ff','#eae0ff'],
    sage:['#f0faf3','#d7eee2'],
    blue:['#edf7ff','#dcecff'],
    purplegradient:['#f4e9ff','#e4e9ff'],
    sunset:['#fff0e9','#f8dcee'],
    custom:['#f7f1ff','#e4edff']
  };
  function memoryHex(value,fallback){return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):fallback;}
  function memoryStyle(m){
    const theme=String(m?.theme||'classic');
    const defaults=MEMORY_THEMES[theme]||MEMORY_THEMES.classic;
    const a=theme==='custom'?memoryHex(m?.colorA,defaults[0]):defaults[0];
    const b=theme==='custom'?memoryHex(m?.colorB,defaults[1]):defaults[1];
    return `background:linear-gradient(130deg,${a},${b});`;
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
      ${count?all.map(m=>`<article class="memory-list-item" style="${memoryStyle(m)}"><span class="memory-list-icon">${icon('book')}</span>
        <div class="memory-list-content"><h2>${escapeText(displayMeetingTitle(m))}</h2><p class="memory-summary">${escapeText(String(m.rawNotes||'').replace(/[\r\n*•→]/g,' ').replace(/\s+/g,' ').trim().slice(0,160))}${String(m.rawNotes||'').length>160?'…':''}</p><span class="memory-list-date">${formatDate(m.date,{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}</span>
          <div class="memory-actions"><a href="#/reunioes/${safeHref(m.id)}" class="activity-details-link">Ver memória ${icon('arrow')}</a><a href="#/reunioes/editar/${safeHref(m.id)}" class="button ghost small-action">${icon('settings')} Editar</a><button class="button subtle-danger small-action" data-action="delete-meeting" data-id="${escapeText(m.id)}" type="button">${icon('close')} Excluir</button></div>
        </div></article>`).join(''):empty('book','Nenhuma memória registrada','Cadastre a primeira memória para consultar os encontros aqui.')}
      </section>`;
  }
  function renderMeetingDetail(id){
    const m=state.data.meetings.find(m=>String(m.id)===String(id));
    if(!m)return notFound();
    return `${header('Demandas',displayMeetingTitle(m),formatDate(m.date),`<a class="button ghost" href="#/reunioes/editar/${safeHref(m.id)}">${icon('settings')} Editar memória</a>`)}${connectNotice()}
      <div class="card card-pad memory-reading" style="${memoryStyle(m)}"><div class="memory-reading-head">${icon('book')} <strong>Registro completo</strong></div><p>${escapeText(m.rawNotes||'Sem texto cadastrado.')}</p></div>`;
  }
  function renderMemoryEditor(id){
    const existing=id?state.data.meetings.find(m=>String(m.id)===String(id)):null;
    if(id&&!existing)return notFound();
    const title=existing?'Editar memória':'Nova memória';
    return `${header('Demandas',title,'',`<a href="#/demandas" class="button ghost">${icon('chevron-left')} Voltar</a>`)}${connectNotice()}
      <section class="card card-pad register-page memory-editor"><form id="register-memory-form" data-id="${escapeText(existing?.id||'')}" class="register-form">
        <label>Título da reunião<input name="title" maxlength="150" placeholder="Ex.: Reunião semanal do PET" value="${escapeText(existing?.title||'')}"></label>
        <label>Data da reunião<input type="date" name="date" value="${escapeText(existing?.date||dateKey(new Date()))}" required></label>
        <label>Memória da reunião<textarea name="rawNotes" rows="12" required placeholder="Cole aqui o registro da reunião...">${escapeText(existing?.rawNotes||'')}</textarea></label>
        <section class="memory-style-controls"><div class="edit-section-title"><h2>Aparência da memória</h2><p>Escolha um fundo ou combine duas cores em degradê. A aparência será aplicada na lista e na leitura.</p></div>
          <label>Estilo do fundo<select name="theme" class="select" data-field="memoryTheme">
            ${[['classic','Branco'],['lilac','Lilás suave'],['sage','Verde sálvia'],['blue','Azul claro'],['purplegradient','Degradê lilás'],['sunset','Degradê rosado'],['custom','Degradê personalizado']].map(([key,label])=>`<option value="${key}" ${(existing?.theme||'classic')===key?'selected':''}>${label}</option>`).join('')}
          </select></label>
          <div class="memory-palette"><label>Cor inicial<input type="color" name="colorA" data-field="memoryColor" value="${memoryHex(existing?.colorA,'#f7f1ff')}"></label>
            <label>Cor final<input type="color" name="colorB" data-field="memoryColor" value="${memoryHex(existing?.colorB,'#e4edff')}"></label></div>
          <div class="memory-live-sample" id="memory-live-sample" style="${memoryStyle(existing)}">Prévia do fundo da memória</div>
        </section>
        <div class="form-actions memory-form-actions">${existing?`<button type="button" class="button subtle-danger" data-action="delete-meeting" data-id="${escapeText(existing.id)}">${icon('close')} Excluir memória</button>`:''}<button type="submit" class="button primary">${icon('check')} ${existing?'Salvar alterações':'Salvar memória'}</button></div>
      </form><p class="assignment-preview-note">As alterações são demonstrativas e ficam somente neste navegador.</p></section>`;
  }

  function renderMyTasks(){
    const user=state.demo?state.data.users.find(u=>String(u.id)===String(state.demoMineUserId))||null:sessionUser();
    const mine=user?tasks().filter(t=>!isCompleted(t)&&isAssigned(t,user.id)).sort(comparePriorityTasks):[];
    const preview=state.demo?`<div class="mytasks-demo-selector"><div><strong>Consultar pendências por PETiano(a)</strong><small>Simulação da área pessoal; na versão com login, cada pessoa verá somente as próprias atividades.</small></div>
      <label for="mytasks-demo-user">Usuário</label><select class="select" id="mytasks-demo-user" data-field="demoMineUserId" aria-label="Escolher usuário para prévia">${state.data.users.map(u=>`<option value="${escapeText(u.id)}" ${String(u.id)===String(state.demoMineUserId)?'selected':''}>${escapeText(u.name)}</option>`).join('')}</select></div>`:'';
    return `${header('Área pessoal','Minhas pendências','Atividades atribuídas a você, de qualquer comissão e período.')}${connectNotice()}
      ${preview}${!user?`<div class="private-lock">${icon('lock')}<div><strong>Acesso pessoal ainda não ativado</strong><p>As pendências individuais serão habilitadas com a autenticação segura.</p></div></div>`
      :`<section class="card card-pad"><div class="section-head"><h2>Pendências de ${escapeText(user.name)}</h2>${tag(String(mine.length)+' '+(mine.length===1?'atividade':'atividades'),'soft')}</div>
       ${mine.length?mine.map(renderTaskCard).join(''):empty('checklist','Nenhuma pendência atribuída','As atividades concluídas continuam em Arquivadas.')}
      </section>`}`;
  }
  function getAssigneeNames(t){
    return taskNames(t);
  }
  function deadlineParts(d){
    const label=String(d.label||d.kind||'Prazo');
    const separated=label.split(' — ');
    const step=separated[0]||'Prazo';
    const person=deadlineAssigneeNames(d).join(', ')||separated.slice(1).join(' — ').trim();
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
      const originalCommissions=window.PET_GESTAO_DEMO?.committees||[];
      const originalCommissionIds=new Set(originalCommissions.map(c=>String(c.id)));
      const presentCommissionIds=new Set(state.data.committees.map(c=>String(c.id)));
      const commissionPatches=state.data.committees.filter(c=>originalCommissionIds.has(String(c.id))&&!originalCommissions.some(o=>String(o.id)===String(c.id)&&o.name===c.name&&(o.description||'')===(c.description||'')&&JSON.stringify(o.memberIds||[])===JSON.stringify(c.memberIds||[])));
      const newCommissions=state.data.committees.filter(c=>!originalCommissionIds.has(String(c.id)));
      const deletedCommissionIds=[...originalCommissionIds].filter(id=>!presentCommissionIds.has(id));
      const originalIds=new Set(originalTasks.map(t=>String(t.id)));
      const originalMeetingIds=new Set(originalMeetings.map(m=>String(m.id)));
      const currentTasks=new Set(state.data.tasks.map(t=>String(t.id)));
      const currentMeetings=new Set(state.data.meetings.map(m=>String(m.id)));
      const patches=state.data.tasks.filter(t=>originalIds.has(String(t.id))&&(t.revisions?.length||t.observations?.length||t.reviewStatus||t.captionText));
      const additions=state.data.tasks.filter(t=>!originalIds.has(String(t.id)));
      const memoryPatches=state.data.meetings.filter(m=>originalMeetingIds.has(String(m.id)) && !originalMeetings.some(x=>String(x.id)===String(m.id)&&x.title===m.title&&x.date===m.date&&x.rawNotes===m.rawNotes&&(x.theme||'classic')===(m.theme||'classic')&&(x.colorA||'')===(m.colorA||'')&&(x.colorB||'')===(m.colorB||'')));
      const newMeetings=state.data.meetings.filter(m=>!originalMeetingIds.has(String(m.id)));
      const deletedTaskIds=[...originalIds].filter(id=>!currentTasks.has(id));
      const deletedMeetingIds=[...originalMeetingIds].filter(id=>!currentMeetings.has(id));
      localStorage.setItem(DEMO_EDITS_KEY,JSON.stringify({patches,additions,memoryPatches,newMeetings,deletedTaskIds,deletedMeetingIds,commissionPatches,newCommissions,deletedCommissionIds}));
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
    const removedCommissions=new Set(Array.isArray(edits.deletedCommissionIds)?edits.deletedCommissionIds.map(String):[]);
    const commissionById=new Map((Array.isArray(edits.commissionPatches)?edits.commissionPatches:[]).map(c=>[String(c.id),c]));
    state.data.committees=state.data.committees.filter(c=>!removedCommissions.has(String(c.id))).map(c=>commissionById.has(String(c.id))?{...c,...commissionById.get(String(c.id))}:c);
    const seenCommissions=new Set(state.data.committees.map(c=>String(c.id)));
    (Array.isArray(edits.newCommissions)?edits.newCommissions:[]).forEach(c=>{if(c?.id&&!seenCommissions.has(String(c.id))){state.data.committees.push(c);seenCommissions.add(String(c.id));}});
    state.data.tasks.forEach(t=>{
      if(Array.isArray(t.commissionIds))t.commissionIds=t.commissionIds.filter(id=>!removedCommissions.has(String(id)));
      if(t.committeeId&&removedCommissions.has(String(t.committeeId)))t.committeeId=t.commissionIds?.[0]||null;
    });
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
    return {name:state.data.users.find(u=>String(u.id)===String(state.demoMineUserId))?.name||'Usuário de teste',role:'petiano'};
  }
  function canReview(actor){return Boolean(actor&&['tutora','administracao'].includes(actor.role));}
  const REVIEW_OPTIONS=[
    ['aguardando','Aguardando revisão'],
    ['ajustes','Ajustes necessários'],
    ['nao_liberado','Não liberado'],
    ['liberado','APROVADO']
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
    const opts=[['todos','Todos'],['comissoes','Comissões'],['usuarios','PETianos(as)']];
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
    const raw=deadline||{},parsed=deadlineParts(raw);
    const ds=String(raw.dueAt||''),day=ds.slice(0,10),time=ds.includes('T')?ds.slice(11,16):'23:59';
    const step=parsed.step==='Correção'?'Correção':'Prazo';
    const ids=new Set(stageUserIds(raw).map(String));
    const names=deadlineAssigneeNames(raw),other=new Set(names.filter(n=>!state.data.users.some(u=>u.name===n)));
    const chips=names.length?names.map(n=>`<span class="deadline-person-chip">${escapeText(n)}</span>`).join(''):'<span class="deadline-prompt">Selecionar responsáveis</span>';
    return `<div class="register-deadline" data-deadline-index="${i}">
      <label>Etapa<select class="select" name="deadline-step-${i}"><option value="Prazo" ${step==='Prazo'?'selected':''}>Prazo</option><option value="Correção" ${step==='Correção'?'selected':''}>Correção</option></select></label>
      <div class="deadline-assignee-field"><span>Para quem</span><details class="deadline-assignee-picker"><summary aria-label="Selecionar responsáveis"><span class="deadline-selection-tags">${chips}</span>${icon('chevron-down')}</summary>
        <div class="deadline-assignee-options"><p>Marque pessoas ou comissões. Abra novamente para acrescentar mais.</p>
          <div class="deadline-picker-grid">${state.data.users.map(u=>`<label><input type="checkbox" name="deadline-assignee-${i}" value="u:${escapeText(u.id)}" ${ids.has(String(u.id))?'checked':''}><span>${escapeText(u.name)}</span></label>`).join('')}
          ${state.data.committees.map(c=>`<label><input type="checkbox" name="deadline-assignee-${i}" value="c:${escapeText(c.id)}" ${other.has(String(c.name))?'checked':''}><span>${escapeText(c.name)} · comissão</span></label>`).join('')}
          ${[...other].filter(n=>!state.data.committees.some(c=>String(c.name)===n)).map(n=>`<label><input type="checkbox" name="deadline-assignee-${i}" value="legacy:${escapeText(n)}" checked><span>${escapeText(n)} · referência anterior</span></label>`).join('')}
          </div></div></details></div>
      <label>Data<input type="date" name="deadline-date-${i}" value="${escapeText(day)}"></label>
      <label>Horário<input type="time" name="deadline-time-${i}" value="${escapeText(time||'23:59')}"></label>
      <button type="button" class="remove-deadline-button" data-action="remove-deadline" data-index="${i}" aria-label="Remover este prazo">${icon('close')} Remover prazo</button></div>`;
  }
  function collectDeadlines(form,existing){
    const fd=new FormData(form),result=[];
    for(let i=0;i<state.formDeadlineCount;i++){
      const day=String(fd.get('deadline-date-'+i)||'');
      if(!day)continue;
      const time=String(fd.get('deadline-time-'+i)||'23:59'),step=String(fd.get('deadline-step-'+i)||'Prazo');
      const chosen=typeof fd.getAll==='function'?fd.getAll('deadline-assignee-'+i):[];
      const userIds=[],names=[];
      chosen.forEach(v=>{
        const raw=String(v),tag=raw.slice(0,2),ref=raw.slice(tag==='u:'||tag==='c:'?2:7);
        if(tag==='u:'){
          const user=state.data.users.find(u=>String(u.id)===ref);
          if(user){userIds.push(String(user.id));names.push(String(user.name));}
        }else if(tag==='c:'){
          const c=state.data.committees.find(c=>String(c.id)===ref);
          if(c)names.push(String(c.name));
        }else if(raw.startsWith('legacy:'))names.push(raw.slice(7));
      });
      const unique=[...new Set(names)],old=existing?.deadlines?.[i]||null;
      result.push({label:step==='Publicação'?'Publicar':step,assigneeIds:[...new Set(userIds)],assigneeNames:unique,
        assigneeId:userIds[0]||null,assigneeName:unique.join(', '),dueAt:day+'T'+(time||'23:59')+':00',completedAt:old?.completedAt||null});
    }
    return result;
  }
  function saveDeadlineSection(form){
    if(!state.demo){showToast('Salvamento disponível após a integração segura.');return;}
    const id=String(form?.dataset?.id||''),task=tasks().find(t=>String(t.id)===id);
    if(!task){
      if(typeof form.requestSubmit==='function')form.requestSubmit();
      else showToast('Cadastre a demanda antes de salvar seus prazos.');
      return;
    }
    const next=collectDeadlines(form,task),previous=JSON.stringify(taskDeadlines(task));
    if(previous===JSON.stringify(next)){showToast('Nenhuma alteração nos prazos.');return;}
    const actor=actorDemo(),now=new Date().toISOString();
    task.deadlines=next;
    task.revisions=[...(task.revisions||[]),{action:'Prazos atualizados',actorName:actor?.name||'Demonstração',at:now}];
    task.lastEditedBy=actor?.name||'Demonstração';task.lastEditedAt=now;
    if(saveLocalDemoWrites()){render();showToast('Prazos salvos neste navegador.');}
    else showToast('Não foi possível salvar os prazos.');
  }
  function renderRegister(){
    const id=getRoute().id||'';
    const fromCommission=id.startsWith('novo/')?id.slice(5):null;
    const task=id&&!fromCommission?tasks().find(t=>String(t.id)===String(id)):null;
    if((id&&!fromCommission&&!task)||(fromCommission&&!state.data.committees.some(c=>String(c.id)===String(fromCommission))))return notFound();
    if(state.registerCurrentId!==id){
      state.registerCurrentId=id;
      state.registerType='demanda';
      state.regCommitteeId=task?.committeeId||'';
      state.assignmentScope='usuarios';
      state.assignmentPicked=(task?.assigneeIds||[]).map(String);
      state.formDeadlineCount=Math.max(1,task?.deadlines?.length||1);
    }

    const linkedIds=task?commissionIds(task):fromCommission?[fromCommission]:[];
    const commissionPicker=`<section class="register-commissions"><div class="edit-section-title"><h2>Vincular às comissões (opcional)</h2><p>A mesma atividade aparece no cronograma de cada comissão selecionada, sem criar cópias.</p></div>
      <div class="commission-checkboxes">${state.data.committees.map(c=>`<label class="commission-checkbox"><input type="checkbox" name="commissionIds" value="${escapeText(c.id)}" ${linkedIds.includes(String(c.id))?'checked':''}>
        <span>${escapeText(c.name)}</span></label>`).join('')||'<span class="notice-line">Nenhuma comissão cadastrada.</span>'}</div></section>`;
    const taskForm=`<form id="register-task-form" data-id="${escapeText(task?.id||'')}" data-return-commission="${escapeText(fromCommission||task?.committeeId||'')}" class="register-form"><label>Título da demanda<input name="title" required maxlength="180" value="${escapeText(task?.title||'')}" placeholder="Ex.: Produzir banner da Lixeira"></label>
    <label>Descrição (opcional)<textarea name="description" rows="4" placeholder="O que precisa ser feito?">${escapeText(task?.description||'')}</textarea></label>
    ${commissionPicker}
    <div class="register-two"><label>Data de postagem <span class="required-star">*</span><input type="date" name="postingAt" required value="${escapeText(String(task?.postingAt||'').slice(0,10))}"></label></div>
    ${renderAssignmentPreview()}
    <div class="register-deadlines"><div class="section-head"><h3>Prazos por etapa</h3><div class="deadline-toolbar-actions"><button class="button ghost" type="button" data-action="add-deadline">${icon('plus')} Adicionar prazo</button><button class="button primary deadline-save-button" type="button" data-action="save-deadlines">${icon('check')} Salvar prazos</button></div></div>
    ${Array.from({length:state.formDeadlineCount},(_,i)=>registerDeadlineRow(i,task?.deadlines?.[i])).join('')}</div>
    ${task?`<section class="edit-copy-section observations-editor"><div class="edit-section-title"><h2>Observações</h2><p>Edite o conteúdo da demanda. O histórico registra quem salvou e quando.</p></div>
      <div class="observation-editor-head"><label for="edit-caption-text">Texto da atividade (opcional)</label><button type="button" class="button ghost copy-observations" data-action="copy-observations" title="Copiar observações">${icon('copy')} Copiar</button></div>
      <textarea name="captionText" id="edit-caption-text" rows="6" placeholder="Escreva as observações desta atividade...">${escapeText(task.captionText||'')}</textarea>
      <p class="observations-last-change">Última alteração: <strong>${escapeText(task.observationsEditedBy||task.lastEditedBy||'Nenhuma')}</strong>${(task.observationsEditedAt||task.lastEditedAt)?' · '+formatDate(task.observationsEditedAt||task.lastEditedAt,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):''}</p>
      </section>`:''}
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



  function saveCommission(form){
    if(!state.demo){showToast('Cadastro disponível após a integração segura.');return;}
    const fd=new FormData(form),name=String(fd.get('name')||'').trim(),description=String(fd.get('description')||'').trim();
    if(!name){showToast('Informe o nome da comissão.');return;}
    const id=String(form.dataset.id||'');
    const original=id?state.data.committees.find(c=>String(c.id)===id):null;
    if(id&&!original){showToast('Comissão não encontrada.');return;}
    if(state.data.committees.some(c=>String(c.id)!==id&&String(c.name||'').toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'))){showToast('Já existe uma comissão com esse nome.');return;}
    const memberIds=[...new Set((typeof fd.getAll==='function'?fd.getAll('memberIds'):[]).map(String))].filter(v=>state.data.users.some(u=>String(u.id)===v));
    const now=new Date().toISOString(),who=actorDemo()?.name||'Demonstração';
    let saved;
    if(original){original.name=name;original.description=description;original.memberIds=memberIds;original.lastEditedBy=who;original.lastEditedAt=now;saved=original;}
    else {saved={id:'local-commission-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name,description,memberIds,lastEditedBy:who,lastEditedAt:now};state.data.committees.push(saved);}
    if(saveLocalDemoWrites()){location.hash='#/comissoes/'+safeHref(saved.id);render();showToast(original?'Comissão atualizada neste navegador.':'Comissão criada neste navegador.');}
    else showToast('Não foi possível salvar a comissão.');
  }
  function deleteDemoCommission(id){
    if(!state.demo){showToast('Exclusão disponível após autenticação.');return;}
    const c=state.data.committees.find(c=>String(c.id)===String(id));
    if(!c)return;
    if(!window.confirm('Excluir a comissão "'+c.name+'"? As demandas permanecerão cadastradas e perderão somente este vínculo.'))return;
    const now=new Date().toISOString(),who=actorDemo()?.name||'Demonstração';
    state.data.tasks.filter(t=>linkedToCommission(t,id)).forEach(t=>{
      t.commissionIds=commissionIds(t).filter(v=>String(v)!==String(id));
      t.committeeId=t.commissionIds[0]||null;
      t.revisions=[...(t.revisions||[]),{action:'Desvinculada da comissão '+c.name,actorName:who,at:now}];
    });
    state.data.committees=state.data.committees.filter(item=>String(item.id)!==String(id));
    if(saveLocalDemoWrites()){location.hash='#/comissoes';render();showToast('Comissão excluída nesta demonstração; demandas preservadas.');}
    else showToast('Não foi possível salvar a exclusão.');
  }
  function saveRegisteredTask(form){
    if(!state.demo){showToast('Cadastro disponível após a integração segura.');return;}
    const x=new FormData(form),title=String(x.get('title')||'').trim();
    if(!title){showToast('Informe o título da demanda.');return;}
    const id=String(form.dataset.id||'');
    const existing=id?tasks().find(t=>String(t.id)===id):null;
    if(id&&!existing){showToast('Demanda não encontrada.');return;}
    const deadlines=collectDeadlines(form,existing);
    const chosenStatus=String(x.get('status')||(existing?(isCompleted(existing)?'concluida':isApproved(existing)?'aprovada':'pendente'):'pendente'));
    const status=chosenStatus==='concluida'?'concluida':'pendente';
    const postingAt=String(x.get('postingAt')||'').trim();
    if(!postingAt){showToast('Informe a data obrigatória de postagem.');return;}
    const selectedCommissions=[...new Set(typeof x.getAll==='function'?x.getAll('commissionIds').filter(Boolean).map(String):[])];
    const values={title,description:String(x.get('description')||'').trim(),postingAt,
      meetingId:existing?.meetingId||null,commissionIds:selectedCommissions,committeeId:selectedCommissions[0]||null,
      deadlines,assigneeIds:registeredAssigneeIds(),status,stageName:status==='concluida'?'Concluída':'Pendente'};
    const now=new Date().toISOString(),actor=actorDemo()||{name:'Demonstração',role:'petiano'};
    if(existing){
      const before=JSON.stringify(Object.fromEntries(Object.keys(values).map(key=>[key,existing[key]])));
      const wasCompleted=isCompleted(existing);
      const priorReview=existing.reviewStatus||'aguardando';
      const priorText=String(existing.captionText||'');
      const newText=String(x.get('captionText')??priorText);
      // A observação e o seletor de liberação são exclusivos da tutoria e administração.
      const obs=''; // Observações agora são o texto único da atividade, não comentários separados.
      const choice=chosenStatus==='aprovada'?'liberado':chosenStatus==='pendente'?'aguardando':null;
      const textChanged=newText!==priorText;
      const observationsChanged=Boolean(obs);
      const edits=[];
      Object.assign(existing,values);
      if(status==='concluida')existing.completedAt=existing.completedAt||now;
      else {delete existing.completedAt;delete existing.closedAt;}
      if(before!==JSON.stringify(values))edits.push('Dados da demanda atualizados');
      if(wasCompleted!==isCompleted(existing))edits.push(isCompleted(existing)?'Concluiu demanda':'Reabriu demanda');
      if(textChanged){existing.captionText=newText;existing.observationsEditedBy=actor.name;existing.observationsEditedAt=now;edits.push('Observações atualizadas');}
      if(observationsChanged){
        existing.observations=[...(existing.observations||[]),{body:obs,authorName:actor.name,createdAt:now}];
        edits.push('Observação registrada');
      }
      // Nenhuma alteração textual ou observação aprova automaticamente a publicação.
      // Mudanças em material já liberado exigem nova liberação explícita.
      let updatedReview=priorReview;
      if(textChanged&&priorReview==='liberado')updatedReview='aguardando';
      if(choice)updatedReview=choice;
      if(updatedReview!==priorReview){existing.reviewStatus=updatedReview;edits.push('Revisão: '+reviewLabel(updatedReview));}
      if(edits.length){
        existing.revisions=[...(existing.revisions||[]),...edits.map(action=>({action,actorName:actor.name,at:now}))];
        existing.lastEditedBy=actor.name;existing.lastEditedAt=now;
      }
    }else{
      const id='local-task-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
      state.data.tasks.push({id,registeredAt:dateKey(new Date()),reviewStatus:chosenStatus==='aprovada'?'liberado':'aguardando',revisions:[],observations:[],...values,...(status==='concluida'?{completedAt:now}:{})});
    }
    if(saveLocalDemoWrites()){
      state.registerCurrentId=null;state.assignmentPicked=[];state.formDeadlineCount=1;state.demandMode=status==='concluida'?'arquivo':'pendentes';
      const returnCommission=String(form.dataset.returnCommission||'');
      if(returnCommission&&state.data.committees.some(c=>String(c.id)===returnCommission)&&status!=='concluida'){
        const date=dateFrom(postingAt);
        if(date){state.year=date.getFullYear();state.month=date.getMonth();}
        state.commissionWeek='all';location.hash='#/comissoes/'+safeHref(returnCommission);
      }else location.hash='#/demandas';
      render();
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
      existing.theme=String(x.get('theme')||'classic');
      existing.colorA=memoryHex(x.get('colorA'),'#f7f1ff');
      existing.colorB=memoryHex(x.get('colorB'),'#e4edff');
      existing.lastEditedBy=who;
      existing.lastEditedAt=now;
    }else{
      state.data.meetings.push({id:'local-meeting-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),title,date,rawNotes,theme:String(x.get('theme')||'classic'),colorA:memoryHex(x.get('colorA'),'#f7f1ff'),colorB:memoryHex(x.get('colorB'),'#e4edff'),taskIds:[],lastEditedBy:who,lastEditedAt:now});
    }
    if(saveLocalDemoWrites()){location.hash='#/demandas';render();showToast(existing?'Memória atualizada neste navegador.':'Memória registrada neste navegador.');}
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
      location.hash='#/demandas';
    }else{
      state.data.tasks=state.data.tasks.filter(t=>String(t.id)!==String(id));
      state.data.meetings.forEach(m=>{if(Array.isArray(m.taskIds))m.taskIds=m.taskIds.filter(x=>String(x)!==String(id));});
      state.demandMode='pendentes';
      location.hash='#/demandas';
    }
    if(saveLocalDemoWrites()){render();showToast(isMeeting?'Memória excluída nesta demonstração.':'Demanda excluída nesta demonstração.');}
    else showToast('Não foi possível salvar a exclusão no navegador.');
  }



  function quickTaskStatus(t){
    const selected=isCompleted(t)?'concluida':isApproved(t)?'aprovada':'pendente';
    return `<div class="quick-task-status"><div class="quick-task-status-title"><span>Situação da demanda</span><strong>${selected==='pendente'?'Pendente':selected==='aprovada'?'Aprovada':'Concluída'}</strong></div>
      <div class="quick-task-status-actions" role="group" aria-label="Alterar situação da demanda">
        ${[['pendente','Pendente'],['aprovada','Aprovada'],['concluida','Concluída']].map(([value,label])=>`<button type="button" data-action="quick-task-status" data-id="${escapeText(t.id)}" data-status="${value}" class="quick-status-choice ${selected===value?'active status-'+value:''}" aria-pressed="${selected===value}">${label}</button>`).join('')}
      </div></div>`;
  }
  function saveQuickTaskStatus(id,status){
    if(!state.demo){showToast('Edição disponível após a implantação do acesso seguro.');return;}
    if(!['pendente','aprovada','concluida'].includes(status))return;
    const t=tasks().find(t=>String(t.id)===String(id));if(!t)return;
    const before=isCompleted(t)?'concluida':isApproved(t)?'aprovada':'pendente';
    if(before===status)return;
    const now=new Date().toISOString(),name=actorDemo()?.name||'Usuário de teste';
    t.status=status==='concluida'?'concluida':'pendente';
    t.reviewStatus=status==='aprovada'?'liberado':'aguardando';
    t.stageName=status==='concluida'?'Concluída':status==='aprovada'?'Aprovada':'Pendente';
    if(status==='concluida')t.completedAt=t.completedAt||now;
    else {delete t.completedAt;delete t.closedAt;}
    t.revisions=[...(t.revisions||[]),{action:'Situação: '+({pendente:'Pendente',aprovada:'Aprovada',concluida:'Concluída'}[status]),actorName:name,at:now}];
    t.lastEditedBy=name;t.lastEditedAt=now;
    if(saveLocalDemoWrites()){
      if(status==='concluida'){state.demandMode='arquivo';location.hash='#/demandas';}
      render();showToast(status==='concluida'?'Demanda concluída e arquivada neste navegador.':'Situação atualizada neste navegador.');
    }else showToast('Não foi possível salvar a situação.');
  }
  function renderActivityDetail(id){
    const t=tasks().find(t=>String(t.id)===String(id));
    if(!t)return notFound();
    const d=taskDeadlines(t),notes=Array.isArray(t.observations)?t.observations:[];
    const assignees=getAssigneeNames(t);
    const deadlines=d.length?d.map(x=>{
      const {step,person}=deadlineParts(x),date=dateFrom(x.dueAt);
      const due=date?formatDate(date,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'A definir';
      return `<div class="deadline-record"><div class="deadline-step">${icon('clock')}<strong>${escapeText(step)}</strong></div><div class="deadline-field"><small>Responsáveis</small><strong>${escapeText(person)}</strong></div><div class="deadline-field"><small>Prazo</small><strong>${escapeText(due)}</strong></div>${tag(x.completedAt?'Concluído':'Pendente',x.completedAt?'mint':'soft')}</div>`;
    }).join(''):'<div class="compact-detail-empty">Nenhum prazo cadastrado.</div>';
    const revisions=Array.isArray(t.revisions)?t.revisions.slice().reverse().slice(0,7):[];
    const history=revisions.length?`<div class="revision-list">${revisions.map(x=>`<div><strong>${escapeText(x.action||'Atualização')} — ${escapeText(x.actorName)}</strong><small>${formatDate(x.at,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div>`).join('')}</div>`:'<p class="notice-line">Nenhuma alteração registrada.</p>';
    const posting=t.postingAt?`<p class="activity-due">Previsão: <strong>${formatDate(t.postingAt)}</strong></p>`:'';
    const value=String(t.captionText||'').trim();
    const olderNotes=notes.length?`<details class="observations-archive"><summary>Histórico anterior de comentários (${notes.length})</summary>${notes.slice().reverse().map(n=>`<div class="observation-item"><strong>${escapeText(n.authorName||'Integrante')}</strong><small>${formatDate(n.createdAt,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small><p>${escapeText(n.body||'')}</p></div>`).join('')}</details>`:'';
    const updated=`<p class="observations-last-change">Última alteração: <strong>${escapeText(t.observationsEditedBy||t.lastEditedBy||'Nenhuma')}</strong>${(t.observationsEditedAt||t.lastEditedAt)?' · '+formatDate(t.observationsEditedAt||t.lastEditedAt,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):''}</p>`;
    return `${header('Atividade',t.title,'',`<a class="button ghost" href="#/registrar/${safeHref(t.id)}">${icon('settings')} Editar demanda</a><a class="button ghost" href="${t.meetingId?'#/reunioes/'+safeHref(t.meetingId):t.committeeId?'#/comissoes/'+safeHref(t.committeeId):'#/demandas'}">${icon('chevron-left')} Voltar</a>`)}${connectNotice()}
    <div class="card card-pad activity-status-panel">${quickTaskStatus(t)}<div class="activity-status-meta">${posting}</div></div>
    <div class="activity-detail-grid">
      <div class="stack">
        <section class="card card-pad"><h2>Prazos e etapas</h2>${deadlines}</section>
        <section class="card card-pad"><div class="section-head observations-title-row"><h2>Observações</h2><div class="observations-title-actions"><span class="observations-author-badge">Última alteração: <strong>${escapeText(t.observationsEditedBy||t.lastEditedBy||'Nenhuma')}</strong>${(t.observationsEditedAt||t.lastEditedAt)?'<small>'+formatDate(t.observationsEditedAt||t.lastEditedAt,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+'</small>':''}</span><button type="button" class="button ghost copy-observations" data-action="copy-observations">${icon('copy')} Copiar</button></div></div>
        ${value?`<p class="saved-activity-text" id="saved-observations-text">${escapeText(value)}</p>`:'<p class="notice-line">Nenhuma observação registrada.</p>'}${olderNotes}</section>
      </div><div class="stack">
        <section class="card card-pad"><h2>Responsáveis</h2>${assignees.length?`<div class="assigned-pills">${assignees.map(a=>tag(a,'soft')).join('')}</div>`:'<p class="notice-line">Nenhum responsável atribuído.</p>'}</section>
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
    const views={inicio:renderHome,demandas:renderDemandas,registrar:renderRegister,cronograma:renderCronograma,comissoes:()=>id==='nova'?renderCommissionEditor(''):id.startsWith('editar/')?renderCommissionEditor(id.slice(7)):id?renderCommitteeDetail(id):renderComissoes(),reunioes:()=>id==='nova'?renderMemoryEditor(''):id.startsWith('editar/')?renderMemoryEditor(id.slice(7)):id?renderMeetingDetail(id):renderReunioes(),'minhas-pendencias':renderMyTasks,atividade:()=>renderActivityDetail(id)};
    screen.innerHTML=(views[base]||renderHome)();
  }
  function navigate(path){location.hash='#/'+path; if(getRoute().base===path)render();}
  function monthStep(step){const d=new Date(state.year,state.month+step,1);state.year=d.getFullYear();state.month=d.getMonth();state.week=1;state.selectedDay=1;savePrefs();render();}
  function resetCurrent(){state.year=TODAY.getFullYear();state.month=TODAY.getMonth();state.week=weekForDay(state.year,state.month,TODAY.getDate());state.selectedDay=TODAY.getDate();savePrefs();render();}
  function showToast(message){const t=$('#toast');t.textContent=message;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},4200);}
  function menuOpen(open){$('#sidebar').classList.toggle('open',open);$('#overlay').hidden=!open;document.body.style.overflow=open?'hidden':'';}
  function updateMemoryPreview(colorChanged=false){
    const form=document.querySelector('#register-memory-form'),sample=document.querySelector('#memory-live-sample');
    if(!form||!sample)return;
    const theme=form.querySelector('[name="theme"]'),colorA=form.querySelector('[name="colorA"]'),colorB=form.querySelector('[name="colorB"]');
    if(!theme||!colorA||!colorB)return;
    if(colorChanged)theme.value='custom';
    const background=memoryStyle({theme:theme.value,colorA:colorA.value,colorB:colorB.value}).replace(/^background:/,'').replace(/;$/,'');
    sample.style.setProperty('background',background);
    sample.dataset.theme=theme.value;
  }
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
        case 'go-all-cronograma':state.cronogramaView='todas';navigate('cronograma');break;
        case 'go-week-cronograma':state.cronogramaView='semana';navigate('cronograma');break;
        case 'cronograma-view':state.cronogramaView=b.dataset.value==='semana'?'semana':'todas';render();break;
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
        case 'save-deadlines':{const form=document.querySelector('#register-task-form');if(form)saveDeadlineSection(form);break;}
        case 'remove-deadline':{
          const row=b.closest('.register-deadline');
          if(row){row.remove();showToast('Prazo retirado do formulário. Salve a demanda para confirmar a alteração.');}
          break;
        }
        case 'toggle-deadline-picker':{break;}
        case 'copy-observations':{
          const textField=document.querySelector('#edit-caption-text');
          const details=getRoute().id?tasks().find(t=>String(t.id)===String(getRoute().id)):null;
          const txt=String(textField?.value??details?.captionText??'');
          if(!txt){showToast('Não há observações para copiar.');break;}
          if(navigator.clipboard?.writeText){navigator.clipboard.writeText(txt).then(()=>showToast('Observações copiadas.')).catch(()=>showToast('Não foi possível copiar.'));}
          else {const tmp=document.createElement('textarea');tmp.value=txt;document.body.append(tmp);tmp.select();const ok=document.execCommand('copy');tmp.remove();showToast(ok?'Observações copiadas.':'Não foi possível copiar.');}
          break;
        }
        case 'commission-select-all':{
          const boxes=[...document.querySelectorAll('#commission-form input[name="memberIds"]')];
          const select=boxes.some(box=>!box.checked);boxes.forEach(box=>{box.checked=select;});
          b.textContent=select?'Desmarcar todos':'Selecionar todos';break;
        }
        case 'delete-commission':deleteDemoCommission(b.dataset.id);break;
        case 'quick-task-status':saveQuickTaskStatus(b.dataset.id,b.dataset.status);break;
        case 'delete-task':deleteDemoRecord('task',b.dataset.id);break;
        case 'delete-meeting':deleteDemoRecord('meeting',b.dataset.id);break;
      }
    });
    document.addEventListener('submit',e=>{
      if(e.target.id==='commission-form'){e.preventDefault();saveCommission(e.target);}
      if(e.target.id==='register-task-form'){e.preventDefault();saveRegisteredTask(e.target);}
      if(e.target.id==='register-memory-form'){e.preventDefault();saveRegisteredMemory(e.target);}
    });
    document.addEventListener('input',e=>{
      if(e.target?.dataset?.field==='memoryColor')updateMemoryPreview(true);
    });
    document.addEventListener('change',e=>{
      const el=e.target;
      if(el.name?.startsWith('deadline-assignee-')&&el.type==='checkbox'){
        const picker=el.closest('.deadline-assignee-picker');
        if(picker){
          const labels=[...picker.querySelectorAll('input:checked')].map(ch=>ch.closest('label')?.querySelector('span')?.textContent?.replace(/ · (comissão|referência anterior)$/,'')||'').filter(Boolean);
          const target=picker.querySelector('.deadline-selection-tags');
          if(target)target.innerHTML=labels.length?labels.map(n=>'<span class="deadline-person-chip">'+escapeText(n)+'</span>').join(''):'<span class="deadline-prompt">Selecionar responsáveis</span>';
          picker.open=false;
        }
        return;
      }
      if(!el.dataset?.field)return;
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
      if(field==='demoMineUserId'){state.demoMineUserId=String(el.value);render();return;}
      if(field==='demoActor'){
        const oldForm=document.querySelector('#register-task-form');
        const oldText=oldForm?.querySelector('[name="captionText"]')?.value??'';
        state.demoActor=el.value;
        const obsField=oldForm?.querySelector('[name="captionText"]');
        if(obsField)obsField.value=oldText;
        else render();
        return;
      }
      if(field==='regCommitteeId'){state.regCommitteeId=el.value;const group=document.querySelector('.register-assignment');if(group)group.outerHTML=renderAssignmentPreview();return;}
      if(field==='memoryTheme'||field==='memoryColor'){
        updateMemoryPreview(field==='memoryColor');return;
      }
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
