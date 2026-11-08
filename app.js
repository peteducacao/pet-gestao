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
    demandMode:'mensal', committeeId:null, assignmentScope:'usuarios', assignmentPicked:[], assignmentTaskId:null, demoActor:'petiano', demoEditing:false, formDeadlineCount:1, ...prefs
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
  function isAssigned(task,userId){return Boolean(userId&&Array.isArray(task.assigneeIds)&&task.assigneeIds.map(String).includes(String(userId)));}
  function taskDate(task){return dateFrom(task.registeredAt||task.meetingDate||task.createdAt);}
  function committeeName(id){return state.data.committees.find(c=>String(c.id)===String(id))?.name||'Sem comissão';}
  function tasks(){return state.data.tasks;}
  function taskDeadlines(task){return Array.isArray(task.deadlines)?task.deadlines:[];}
  function upcomingDeadlines(){
    const now=new Date();
    // Um registro por atividade. Os prazos individuais ficam na página de detalhes.
    return tasks().filter(t=>!isCompleted(t)).map(task=>{
      const deadlines=taskDeadlines(task).filter(d=>!d.completedAt&&dateFrom(d.dueAt))
        .map(deadline=>({deadline,date:dateFrom(deadline.dueAt)}))
        .filter(x=>x.date.getTime()>=now.getTime()-86400000).sort((a,b)=>a.date-b.date);
      return deadlines.length?{task,deadline:deadlines[0].deadline,date:deadlines[0].date}:null;
    }).filter(Boolean).sort((a,b)=>a.date-b.date).slice(0,5);
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
    const weekTasks=weeklyTasks(),meetings=weeklyMeetings();
    const open=weekTasks.filter(t=>!isCompleted(t)),done=weekTasks.filter(isCompleted);
    // Conserve links para memórias de semanas anteriores que originaram tarefas com prazo neste período.
    const linkedIds=new Set(weekTasks.map(t=>String(t.meetingId||'')).filter(Boolean));
    const sourceMeetings=state.data.meetings.filter(m=>linkedIds.has(String(m.id))&&!meetings.some(x=>String(x.id)===String(m.id)));
    const info=[...meetings,...sourceMeetings];
    const meta=available()?`<div class="weekly-counts"><span class="weekly-pending">${open.length} pendentes</span><span class="weekly-done">${done.length} concluídas</span></div>`:'';
    const entries=weekTasks.length?weekTasks.slice(0,7).map(t=>`<div class="weekly-item"><span class="weekly-symbol ${isCompleted(t)?'success':'open'}">${icon(isCompleted(t)?'check':'clock')}</span><span class="weekly-description"><strong>${escapeText(t.title)}</strong><a href="#/atividade/${safeHref(t.id)}" class="activity-details-link">Ver detalhes ${icon('arrow')}</a></span>${tag(isCompleted(t)?'Concluída':'Pendente',isCompleted(t)?'mint':'soft')}</div>`).join('')+(weekTasks.length>7?`<a class="activity-details-link weekly-more" href="#/demandas">Ver outras ${weekTasks.length-7} atividades ${icon('arrow')}</a>`:''):empty('checklist','Nenhuma atividade nesta semana','Escolha outra semana para consultar demandas, prazos e postagens.',true);
    const references=info.length?`<div class="weekly-meetings"><strong>${icon('book')} Memórias relacionadas</strong>${info.map(m=>`<a href="#/reunioes/${safeHref(m.id)}">${escapeText(m.title||'Reunião')} · ${formatDate(m.date)} ${icon('arrow')}</a>`).join('')}</div>`:'';
    return `<section class="card card-pad weekly-focus"><div class="section-head"><div><h2>Pendências semanais</h2><p>${escapeText(periodTitle())} · Semana ${state.week} (${currentWeek().label})</p></div><button class="link-action" data-action="go" data-to="cronograma">Ver cronograma ${icon('arrow')}</button></div><div class="weekly-controls">${weekSelector()}${meta}</div><div class="weekly-list">${entries}</div>${references}</section>`;
  }
  function renderHome(){
    return `
      ${connectNotice()}${renderStats()}
      <div class="dashboard-grid"><div class="stack">
        <section class="card card-pad"><div class="section-head"><div><h2>Próximos prazos</h2><p>Atividades que precisam de atenção</p></div><button class="link-action" data-action="go" data-to="cronograma">Ver cronograma ${icon('arrow')}</button></div>${renderUpcomingCompact()}</section>
        <section class="card card-pad"><div class="section-head"><div><h2>Memórias recentes</h2><p>Últimas reuniões registradas</p></div></div>
        ${state.data.meetings.length?state.data.meetings.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,4).map(m=>`<a href="#/reunioes/${safeHref(m.id)}" class="placeholder-row"><div><strong>${escapeText(m.title||'Reunião')}</strong><small>${formatDate(m.date)}</small></div>${icon('arrow')}</a>`).join(''):empty('book','Nenhuma reunião registrada','As memórias recentes aparecerão aqui quando forem cadastradas.',true)}
        </section>
      </div><div class="stack">
        ${renderWeeklyFocus()}
        <section class="card card-pad"><div class="section-head"><div><h2>Últimas atualizações</h2><p>Histórico das atividades</p></div>${icon('bell')}</div>${renderFeed()}</section>
      </div></div>`;
  }
  function renderTaskCard(t){
    // Informações detalhadas ficam na página da atividade, não na linha de listagem.
    const review=t.reviewStatus==='liberado'?tag('Liberado','mint'):t.reviewStatus==='ajustes'?tag('Ajustes','soft'):'';
    return `<div class="placeholder-row task-list-row"><div class="task-list-body"><strong>${escapeText(t.title)}</strong><a href="#/atividade/${safeHref(t.id)}" class="activity-details-link">Ver detalhes ${icon('arrow')}</a></div><div class="task-row-meta">${review}${tag(isCompleted(t)?'Concluída':t.stageName||'Pendente',isCompleted(t)?'mint':'soft')}</div></div>`;
  }
  function visibleDemandCount(){
    const mode=state.demandMode;
    if(mode==='mensal')return tasks().filter(isTaskInMonth).length;
    if(mode==='semanal')return tasks().filter(isTaskInWeek).length;
    if(mode==='pendentes')return tasks().filter(t=>!isCompleted(t)).length;
    return tasks().filter(isCompleted).length;
  }
  function renderDemandList(){const all=tasks();const mode=state.demandMode;let filtered=[];
    if(mode==='mensal'||mode==='semanal')filtered=all.filter(t=>mode==='mensal'?isTaskInMonth(t):isTaskInWeek(t));
    if(mode==='pendentes')filtered=all.filter(t=>!isCompleted(t));
    if(mode==='arquivo')filtered=all.filter(isCompleted);
    filtered.sort((a,b)=>taskSortDate(a)-taskSortDate(b));
    if(!filtered.length){const titles={mensal:'Nenhuma demanda neste mês',semanal:'Nenhuma demanda nesta semana',pendentes:'Nenhuma pendência registrada',arquivo:'Nenhuma atividade arquivada'};
      return empty(mode==='arquivo'?'archive':'list',titles[mode],'As atividades cadastradas aparecerão aqui, vinculadas aos responsáveis e às comissões.');}
    return filtered.map(renderTaskCard).join('');
  }
  function renderDemandas(){
    const modes=[['mensal','Mensal'],['semanal','Semanal'],['pendentes','Pendentes'],['arquivo','Arquivadas']];
    return `${header('Acompanhamento','Demandas','Uma lista única de atividades, organizada por período, responsáveis e situação.',`<a class="button primary" href="#/registrar">${icon('plus')} Registrar demanda</a>`)}${connectNotice()}
      <div class="card card-pad"><div class="list-toolbar"><div class="segmented" role="group" aria-label="Visualizar demandas">${modes.map(([val,label])=>`<button type="button" data-action="demand-mode" data-value="${val}" class="${state.demandMode===val?'active':''}" aria-pressed="${state.demandMode===val}">${label}</button>`).join('')}</div></div>
        ${(state.demandMode==='mensal'||state.demandMode==='semanal')?`<div class="list-toolbar">${periodSelector(state.demandMode==='semanal')}</div>`:'<p class="notice-line">Esta visualização reúne registros de todos os meses e anos.</p>'}
        <hr class="divider"/><div class="table-head"><div class="section-head" style="margin-bottom:0"><div><h2>${state.demandMode==='mensal'?periodTitle():state.demandMode==='semanal'?'Semana '+state.week+' · '+periodTitle():state.demandMode==='arquivo'?'Arquivadas':'Pendências acumuladas'}</h2><p>As atividades são exibidas uma única vez, mesmo quando relacionadas a várias áreas.</p></div></div>${available()?tag(String(visibleDemandCount())+' registros','soft'):''}</div>
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
    const own=tasks().filter(t=>String(t.committeeId)===String(id));
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
  function renderCommissionGroups(records){
    const groups=new Map();
    records.slice().sort((a,b)=>taskSortDate(a)-taskSortDate(b)).forEach(t=>{
      const d=dateFrom(t.postingAt)||taskDate(t);
      const label=d?`${MONTHS[d.getMonth()]} de ${d.getFullYear()} · Semana ${weekForDay(d.getFullYear(),d.getMonth(),d.getDate())} (${dateRangeForWeek(d)})`:'Sem data definida';
      if(!groups.has(label))groups.set(label,[]);
      groups.get(label).push(t);
    });
    return Array.from(groups,([label,items])=>`<div class="committee-group"><h3 class="committee-group-label">${escapeText(label)}</h3>${items.map(renderTaskCard).join('')}</div>`).join('');
  }
  function renderCommitteeDetail(id){const c=state.data.committees.find(c=>String(c.id)===String(id));if(!c)return notFound();
    const related=tasks().filter(t=>String(t.committeeId)===String(c.id));
    return `${header('Comissões',c.name,'',newButton('Nova atividade'))}${connectNotice()}
      <section class="card card-pad committee-summary"><div class="section-head"><h2>Resumo da comissão</h2></div>${commissionCounters(c.id)}</section><div class="card card-pad"><div class="section-head"><h2>Cronograma e atividades</h2>${tag(String(related.length)+' registros','soft')}</div>${related.length?renderCommissionGroups(related):empty('list','Nenhuma atividade registrada','As atividades desta comissão aparecerão aqui.')}</div>`;
  }
  function renderReunioes(){const all=state.data.meetings.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return `${header('Memórias','Reuniões','',`<button type="button" data-action="register-memory" class="button primary">${icon('plus')} Registrar memória</button>`)}${connectNotice()}
      <section class="card card-pad"><div class="section-head"><div><h2>Memórias registradas</h2><p>Histórico por data da reunião</p></div>${available()?tag(all.length+' reuniões','soft'):''}</div>
      ${all.length?all.map(m=>`<a href="#/reunioes/${safeHref(m.id)}" class="placeholder-row"><div><strong>${escapeText(m.title||'Reunião')}</strong><small>${formatDate(m.date)}</small></div>${icon('arrow')}</a>`).join(''):empty('book','Nenhuma memória registrada','Os encontros poderão reunir texto original, decisões, responsáveis, prazos e demandas vinculadas.')}</section>`;
  }
  function renderMeetingDetail(id){const m=state.data.meetings.find(m=>String(m.id)===String(id));if(!m)return notFound();
    const linked=tasks().filter(t=>String(t.meetingId)===String(id)||(Array.isArray(m.taskIds)&&m.taskIds.map(String).includes(String(t.id))));
    return `${header('Reuniões',m.title||'Memória da reunião',formatDate(m.date))}${connectNotice()}<div class="card card-pad memory-reading"><h2>Memória do encontro</h2><p>${escapeText(m.rawNotes||'Sem texto cadastrado.')}</p></div>`;
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
      const patches=state.data.tasks.filter(t=>originalIds.has(String(t.id))&&(t.revisions?.length||t.observations?.length||t.reviewStatus||t.captionText));
      const additions=state.data.tasks.filter(t=>!originalIds.has(String(t.id)));
      const newMeetings=state.data.meetings.filter(m=>!originalMeetingIds.has(String(m.id)));
      localStorage.setItem(DEMO_EDITS_KEY,JSON.stringify({patches,additions,newMeetings}));
      return true;
    }catch(e){console.warn('Falha ao salvar dados locais:',e);return false;}
  }
  function mergeLocalDemoWrites(){
    if(!state.demo)return;
    const edits=readLocalDemoWrites();
    const byId=new Map((Array.isArray(edits.patches)?edits.patches:[]).map(x=>[String(x.id),x]));
    state.data.tasks=state.data.tasks.map(t=>byId.has(String(t.id))?{...t,...byId.get(String(t.id))}:t);
    const original=new Set(state.data.tasks.map(t=>String(t.id)));
    (Array.isArray(edits.additions)?edits.additions:[]).forEach(t=>{if(t&&t.id&&!original.has(String(t.id))){state.data.tasks.push(t);original.add(String(t.id));}});
    const meetings=new Set(state.data.meetings.map(m=>String(m.id)));
    (Array.isArray(edits.newMeetings)?edits.newMeetings:[]).forEach(m=>{if(m&&m.id&&!meetings.has(String(m.id))){state.data.meetings.push(m);meetings.add(String(m.id));}});
  }
  function actorDemo(){
    if(!state.demo)return sessionUser()?{name:sessionUser().name||'Integrante',role:(sessionUser().roles||[]).includes('tutor')?'tutora':'petiano'}:null;
    return state.demoActor==='lene'?{name:'Lene',role:'tutora'}:{name:'PETiano(a) — teste',role:'petiano'};
  }
  const REVIEW_OPTIONS=[
    ['aguardando','Aguardando revisão'],
    ['ajustes','Ajustes necessários'],
    ['nao_liberado','Não liberado para postagem'],
    ['liberado','Liberado para postagem']
  ];
  function reviewLabel(value){return REVIEW_OPTIONS.find(r=>r[0]===value)?.[1]||'Aguardando revisão';}
  function demoActorSelect(){
    if(!state.demo)return '';
    return `<div class="demo-actor"><label for="demo-actor"><strong>Perfil de demonstração</strong><small>Não é login real. Escolha um perfil para testar a autoria.</small></label>
      <select class="select" id="demo-actor" data-field="demoActor"><option value="petiano" ${state.demoActor==='petiano'?'selected':''}>PETiano(a) — teste</option><option value="lene" ${state.demoActor==='lene'?'selected':''}>Lene — Tutora (simulação)</option></select></div>`;
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
    return `<div class="register-deadline"><label>Etapa<select class="select" name="deadline-step-${i}">${options.map(o=>`<option ${o===parsed.step?'selected':''}>${escapeText(o)}</option>`).join('')}</select></label>
      <label>Para quem<input name="deadline-assignee-${i}" value="${escapeText(name)}" placeholder="Integrante, tutoria ou comissão"></label>
      <label>Data<input type="date" name="deadline-date-${i}" value="${escapeText(day)}"></label>
      <label>Horário<input type="time" name="deadline-time-${i}" value="${escapeText(time||'23:59')}"></label></div>`;
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
    const type=task?'demanda':state.registerType||'demanda',isMemory=type==='memoria';
    const opt=state.data.committees.map(c=>`<option value="${escapeText(c.id)}" ${String(state.regCommitteeId)===String(c.id)?'selected':''}>${escapeText(c.name)}</option>`).join('');
    const meetings=state.data.meetings.map(m=>`<option value="${escapeText(m.id)}" ${String(task?.meetingId||'')===String(m.id)?'selected':''}>${escapeText(m.title)} · ${formatDate(m.date)}</option>`).join('');
    const typePicker=task?'':`<div class="segmented register-tabs" role="group" aria-label="Tipo de registro"><button type="button" class="${!isMemory?'active':''}" data-action="register-type" data-value="demanda">Nova demanda</button><button type="button" class="${isMemory?'active':''}" data-action="register-type" data-value="memoria">Memória da reunião</button></div>`;
    const memoryForm=`<form id="register-memory-form" class="register-form"><label>Título da memória<input name="title" required maxlength="150" placeholder="Ex.: Encontro de quinta-feira"></label><label>Data da reunião<input name="date" type="date" required></label><label>Memória original<textarea name="rawNotes" rows="9" required placeholder="Cole aqui o texto da memória..."></textarea></label><div class="form-actions"><button type="submit" class="button primary">${icon('check')} Salvar memória</button></div></form>`;
    const taskForm=`<form id="register-task-form" data-id="${escapeText(task?.id||'')}" class="register-form"><label>Título da demanda<input name="title" required maxlength="180" value="${escapeText(task?.title||'')}" placeholder="Ex.: Produzir banner da Lixeira"></label>
    <label>Descrição (opcional)<textarea name="description" rows="4" placeholder="O que precisa ser feito?">${escapeText(task?.description||'')}</textarea></label>
    <div class="register-two"><label>Comissão<select name="committeeId" class="select" data-field="regCommitteeId"><option value="">Sem comissão</option>${opt}</select></label><label>Memória vinculada (opcional)<select name="meetingId" class="select"><option value="">Nenhuma</option>${meetings}</select></label></div>
    <div class="register-two"><label>Data de postagem (opcional)<input type="date" name="postingAt" value="${escapeText(String(task?.postingAt||'').slice(0,10))}"></label>
      <label>Situação da demanda<select name="status" class="select"><option value="pendente" ${!task||!isCompleted(task)?'selected':''}>Pendente</option><option value="concluida" ${task&&isCompleted(task)?'selected':''}>Concluída / Arquivada</option></select></label></div>
    ${renderAssignmentPreview()}
    <div class="register-deadlines"><div class="section-head"><h3>Prazos por etapa</h3><button class="button ghost" type="button" data-action="add-deadline">${icon('plus')} Adicionar prazo</button></div>
    ${Array.from({length:state.formDeadlineCount},(_,i)=>registerDeadlineRow(i,task?.deadlines?.[i])).join('')}</div>
    <div class="form-actions"><button type="submit" class="button primary">${icon('check')} ${task?'Salvar demanda':'Registrar demanda'}</button></div></form>`;
    return `${header('Cadastros',task?'Editar demanda':'Registrar demandas',task?'Altere prazos, responsáveis, comissão ou situação da atividade.':'Crie uma demanda ou registre a memória original de uma reunião.')}${connectNotice()}
      <section class="card card-pad register-page">${typePicker}${isMemory?memoryForm:taskForm}
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
    const existing=String(form.dataset.id||'')?tasks().find(t=>String(t.id)===String(form.dataset.id)):null;
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
    const now=new Date().toISOString(),actor=actorDemo()||{name:'Demonstração'};
    if(existing){
      const wasCompleted=isCompleted(existing);
      Object.assign(existing,values);
      if(status==='concluida')existing.completedAt=existing.completedAt||now;
      else {delete existing.completedAt;delete existing.closedAt;}
      const action=status==='concluida'&&!wasCompleted?'Concluiu demanda':status!=='concluida'&&wasCompleted?'Reabriu demanda':'Dados da demanda atualizados';
      existing.revisions=[...(existing.revisions||[]),{action,actorName:actor.name,at:now}];
      existing.lastEditedBy=actor.name;existing.lastEditedAt=now;
    } else {
      const id='local-task-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
      state.data.tasks.push({id,registeredAt:dateKey(new Date()),reviewStatus:'aguardando',revisions:[],observations:[],...values,...(status==='concluida'?{completedAt:now}:{})});
    }
    if(saveLocalDemoWrites()){state.registerCurrentId=null;state.assignmentPicked=[];state.formDeadlineCount=1;state.demandMode=status==='concluida'?'arquivo':'pendentes';location.hash='#/demandas';render();showToast(existing?'Demanda atualizada neste navegador.':'Demanda registrada neste navegador.');}
    else showToast('Não foi possível salvar os dados locais.');
  }
  function saveRegisteredMemory(form){
    if(!state.demo){showToast('Cadastro disponível após a integração segura.');return;}
    const x=new FormData(form),title=String(x.get('title')||'').trim(),rawNotes=String(x.get('rawNotes')||'').trim();
    if(!title||!rawNotes){showToast('Preencha o título e a memória.');return;}
    state.data.meetings.push({id:'local-meeting-'+Date.now().toString(36),title,date:String(x.get('date')||dateKey(new Date())),rawNotes,taskIds:[]});
    if(saveLocalDemoWrites()){location.hash='#/reunioes';render();showToast('Memória registrada localmente nesta demonstração.');}
    else showToast('Não foi possível salvar os dados locais.');
  }
  function renderActivityDetail(id){
    const t=tasks().find(t=>String(t.id)===String(id));
    if(!t)return notFound();
    const d=taskDeadlines(t),notes=Array.isArray(t.observations)?t.observations:[];
    const assignees=getAssigneeNames(t);
    const person=actorDemo();
    const isTutor=person?.role==='tutora';
    const review=t.reviewStatus||'aguardando';
    const statusBadge=review==='liberado'?tag('Liberado para postagem','mint'):review==='ajustes'?tag('Ajustes necessários','soft'):review==='nao_liberado'?tag('Não liberado','soft'):tag('Aguardando revisão','soft');
    const deadlines=d.length?d.map(x=>{
      const {step,person}=deadlineParts(x),date=dateFrom(x.dueAt);
      const due=date?formatDate(date,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'A definir';
      return `<div class="deadline-record"><div class="deadline-step">${icon('clock')}<strong>${escapeText(step)}</strong></div><div class="deadline-field"><small>Responsável</small><strong>${escapeText(person)}</strong></div><div class="deadline-field"><small>Prazo</small><strong>${escapeText(due)}</strong></div>${tag(x.completedAt?'Concluído':'Pendente',x.completedAt?'mint':'soft')}</div>`;
    }).join(''):empty('clock','Nenhum prazo cadastrado','Sem prazos definidos para esta atividade.',true);
    const observations=notes.length?notes.slice().reverse().map(n=>`<div class="observation-item"><strong>${escapeText(n.authorName||'Integrante')}</strong><small>${formatDate(n.createdAt,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small><p>${escapeText(n.body||'')}</p></div>`).join(''):'';
    const revisions=Array.isArray(t.revisions)?t.revisions.slice().reverse().slice(0,7):[];
    const history=revisions.length?`<div class="revision-list">${revisions.map(x=>`<div><strong>${escapeText(x.action||'Atualização')} — ${escapeText(x.actorName)}</strong><small>${formatDate(x.at,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</small></div>`).join('')}</div>`:'<p class="notice-line">Nenhuma alteração registrada.</p>';
    const posting=t.postingAt?`<p class="activity-due">Postagem prevista: <strong>${formatDate(t.postingAt)}</strong></p>`:'';
    return `${header('Atividade',t.title,'',`<a class="button ghost" href="#/registrar/${safeHref(t.id)}">${icon('settings')} Editar demanda</a><a class="button ghost" href="${t.meetingId?'#/reunioes/'+safeHref(t.meetingId):t.committeeId?'#/comissoes/'+safeHref(t.committeeId):'#/demandas'}">${icon('chevron-left')} Voltar</a>`)}${connectNotice()}
    <div class="activity-header-strip card card-pad">${statusBadge}${posting}</div>
    <div class="activity-detail-grid">
      <div class="stack">
        <section class="card card-pad"><h2>Prazos e etapas</h2>${deadlines}</section>
        <section class="card card-pad"><h2>Observações</h2>${observations||'<p class="notice-line">Nenhuma observação cadastrada.</p>'}</section>
        <section class="card card-pad"><h2>Texto e revisão</h2><p class="notice-line">Edite o texto, inclua uma observação ou solicite uma correção. Uma observação não libera a postagem automaticamente.</p>
          ${demoActorSelect()}
          <form id="activity-update-form" data-id="${escapeText(t.id)}" class="register-form">
            <label>Texto da atividade / legenda (opcional)<textarea id="activity-text" name="captionText" rows="6" placeholder="Escreva ou edite o texto aqui...">${escapeText(t.captionText||'')}</textarea></label>
            <label>Nova observação (opcional)<textarea name="observation" rows="3" placeholder="Registre aqui uma orientação ou correção..."></textarea></label>
            ${isTutor?`<label class="review-control">Decisão da tutoria<select class="select" name="reviewStatus">${REVIEW_OPTIONS.map(([v,title])=>`<option value="${v}" ${review===v?'selected':''}>${title}</option>`).join('')}</select><small>Escolha “Liberado para postagem” somente quando a tutoria autorizar.</small></label>`:`<p class="review-readonly">Situação da revisão: <strong>${escapeText(reviewLabel(review))}</strong>. Apenas a tutoria pode alterar essa decisão.</p>`}
            <button class="button primary" type="submit">${icon('check')} Salvar alterações</button>
          </form></section>
      </div><div class="stack">
        <section class="card card-pad"><h2>Responsáveis</h2>${assignees.length?`<div class="assigned-pills">${assignees.map(a=>tag(a,'soft')).join('')}</div>`:'<p class="notice-line">Nenhum responsável atribuído.</p>'}
          <a class="activity-details-link" href="#/registrar/${safeHref(t.id)}">Editar responsáveis ${icon('arrow')}</a></section>
        <section class="card card-pad"><h2>Histórico de alterações</h2>${history}</section>
      </div>
    </div>`;
  }
  function saveActivityUpdate(form){
    if(!state.demo){showToast('Edição disponível após a implantação do acesso seguro.');return;}
    const t=tasks().find(x=>String(x.id)===String(form.dataset.id)),actor=actorDemo();
    if(!t||!actor)return;
    const data=new FormData(form),newText=String(data.get('captionText')||''),obs=String(data.get('observation')||'').trim(),oldText=String(t.captionText||'');
    const oldReview=t.reviewStatus||'aguardando',newReview=actor.role==='tutora'?String(data.get('reviewStatus')||oldReview):oldReview;
    const at=new Date().toISOString();
    let changed=false;
    if(newText!==oldText){t.captionText=newText;changed=true;}
    if(obs){t.observations=[...(t.observations||[]),{body:obs,authorName:actor.name,createdAt:at}];changed=true;}
    if(newReview!==oldReview){t.reviewStatus=newReview;changed=true;}
    if(!changed){showToast('Nenhuma alteração para salvar.');return;}
    t.revisions=[...(t.revisions||[]),{action:newReview!==oldReview?'Decisão da tutoria: '+reviewLabel(newReview):actor.role==='tutora'?'Correção':'Alteração',actorName:actor.name,at}];
    t.lastEditedBy=actor.name;t.lastEditedAt=at;
    if(saveLocalDemoWrites()){render();showToast('Alteração registrada localmente com autoria e horário. Nenhum e-mail foi enviado.');}
    else showToast('Não foi possível salvar a alteração.');
  }
  function notFound(){return `${header('Navegação','Registro não encontrado','O item solicitado não está disponível ou não pode ser consultado com este acesso.')}<div class="card card-pad">${empty('search','Não foi possível abrir o registro','Retorne à lista e escolha uma atividade disponível.')}</div>`;}
  function render(){
    const {base,id}=getRoute();const screen=$('#screen');if(!screen)return;
    $('#current-page').textContent=routeTitles[base]||'PET Educação';
    document.title=`${routeTitles[base]||'PET Educação'} | PET Educação`;
    document.querySelectorAll('[data-route]').forEach(el=>{const selected=el.dataset.route===base;el.classList.toggle('active',selected);if(selected)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    const views={inicio:renderHome,demandas:renderDemandas,registrar:renderRegister,cronograma:renderCronograma,comissoes:()=>id?renderCommitteeDetail(id):renderComissoes(),reunioes:()=>id?renderMeetingDetail(id):renderReunioes(),'minhas-pendencias':renderMyTasks,atividade:()=>renderActivityDetail(id)};
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
        case 'assignment-scope':state.assignmentScope=b.dataset.value;state.assignmentPicked=[];{const group=document.querySelector('.register-assignment');if(group)group.outerHTML=renderAssignmentPreview();else render();}break;
        case 'register-type':state.registerType=b.dataset.value;state.formDeadlineCount=1;state.assignmentPicked=[];render();break;
        case 'register-memory':state.registerCurrentId='';state.registerType='memoria';state.formDeadlineCount=1;navigate('registrar');render();break;
        case 'add-deadline':if(state.formDeadlineCount<8){const container=document.querySelector('.register-deadlines');if(container){container.insertAdjacentHTML('beforeend',registerDeadlineRow(state.formDeadlineCount));state.formDeadlineCount++;}}break;
      }
    });
    document.addEventListener('submit',e=>{
      if(e.target.id==='activity-update-form'){e.preventDefault();saveActivityUpdate(e.target);}
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
      if(field==='month'){state.month=Number(el.value);state.week=1;state.selectedDay=1;}
      if(field==='year'){state.year=Number(el.value);state.week=1;state.selectedDay=1;}
      if(field==='week'){state.week=Number(el.value);}
      if(field==='demoActor'){const oldForm=document.querySelector('#activity-update-form');const prevText=oldForm?.querySelector('[name="captionText"]')?.value??'';const prevObs=oldForm?.querySelector('[name="observation"]')?.value??'';state.demoActor=el.value;render();const newForm=document.querySelector('#activity-update-form');if(newForm){newForm.querySelector('[name="captionText"]').value=prevText;newForm.querySelector('[name="observation"]').value=prevObs;}return;}
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
