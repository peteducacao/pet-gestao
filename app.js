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
    const entries=weekTasks.length?weekTasks.slice(0,7).map(t=>`<a class="weekly-item" href="#/atividade/${safeHref(t.id)}"><span class="weekly-symbol ${isCompleted(t)?'success':'open'}">${icon(isCompleted(t)?'check':'clock')}</span><span class="weekly-description"><strong>${escapeText(t.title)}</strong><small>${escapeText(taskOrigin(t))}${t.postingAt?' · Postagem '+formatDate(t.postingAt,{day:'2-digit',month:'2-digit'}):''}</small></span>${tag(isCompleted(t)?'Concluída':'Pendente',isCompleted(t)?'mint':'soft')}</a>`).join('')+(weekTasks.length>7?`<p class="weekly-more">+ ${weekTasks.length-7} outras atividades no cronograma</p>`:''):empty('checklist','Nenhuma atividade nesta semana','Escolha outra semana para consultar demandas, prazos e postagens.',true);
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
        <hr class="divider"/><div class="table-head"><div class="section-head" style="margin-bottom:0"><div><h2>${state.demandMode==='mensal'?periodTitle():state.demandMode==='semanal'?'Semana '+state.week+' · '+periodTitle():state.demandMode==='arquivo'?'Arquivadas':'Pendências acumuladas'}</h2><p>As atividades são exibidas uma única vez, mesmo quando relacionadas a várias áreas.</p></div></div>${available()?tag(String(tasks().length)+' registros','soft'):''}</div>
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
    return `${header('Memórias','Reuniões','',`<a href="#/registrar?tipo=memoria" class="button primary">${icon('plus')} Registrar memória</a>`)}${connectNotice()}
      <section class="card card-pad"><div class="section-head"><div><h2>Memórias registradas</h2><p>Histórico por data da reunião</p></div>${available()?tag(all.length+' reuniões','soft'):''}</div>
      ${all.length?all.map(m=>`<a href="#/reunioes/${safeHref(m.id)}" class="placeholder-row"><div><strong>${escapeText(m.title||'Reunião')}</strong><small>${formatDate(m.date)} · ${Array.isArray(m.taskIds)?m.taskIds.length:0} demandas vinculadas</small></div>${icon('arrow')}</a>`).join(''):empty('book','Nenhuma memória registrada','Os encontros poderão reunir texto original, decisões, responsáveis, prazos e demandas vinculadas.')}</section>`;
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
  function renderAssignmentPreview(){
    const scope=state.assignmentScope;
    const opts=[['todos','Todos'],['comissoes','Comissões'],['usuarios','Usuários']];
    const choices=scope==='comissoes'?state.data.committees.map(c=>({id:c.id,name:c.name})):state.data.users.map(u=>({id:u.id,name:u.name}));
    const list=scope==='todos'
      ?`<div class="assignment-all">${icon('users')} Todos os ${state.data.users.length} usuários cadastrados estão incluídos nesta seleção.</div>`
      :choices.length?`<div class="assignment-options">${choices.map(c=>`<label class="assignment-option"><input type="checkbox" data-assign-target="${escapeText(c.id)}" ${state.assignmentPicked.includes(String(c.id))?'checked':''}><span>${escapeText(c.name)}</span></label>`).join('')}</div>`
      :`<p class="notice-line">Nenhum cadastro disponível nesta categoria.</p>`;
    return `<section class="card card-pad assignment-preview"><div class="section-head"><div><h2>Marcar responsáveis</h2><p>Escolha quem participaria desta atividade.</p></div></div>
      <div class="segmented assignment-modes" role="group" aria-label="Quem marcar como responsável">${opts.map(([v,title])=>`<button type="button" data-action="assignment-scope" data-value="${v}" class="${scope===v?'active':''}" aria-pressed="${scope===v}">${title}</button>`).join('')}</div>
      ${list}<p class="assignment-preview-note">${state.demo?'Prévia interativa: a seleção não é salva nem envia notificações.':'Seleções serão salvas quando o gerenciamento seguro estiver habilitado.'}</p>
    </section>`;
  }
  function renderActivityDetail(id){
    const t=tasks().find(t=>String(t.id)===String(id));
    if(!t)return notFound();
    if(state.assignmentTaskId!==String(id)){
      state.assignmentTaskId=String(id);
      state.assignmentScope='usuarios';
      state.assignmentPicked=[];
    }
    const d=taskDeadlines(t),notes=Array.isArray(t.observations)?t.observations:[];
    const assignees=getAssigneeNames(t);
    const linkedCommittee=t.committeeId?state.data.committees.find(c=>String(c.id)===String(t.committeeId)):null;
    const label=t.meetingId?'Reunião':linkedCommittee?'Comissão':'Demanda geral';
    const sourceHref=t.meetingId?`#/reunioes/${safeHref(t.meetingId)}`:linkedCommittee?`#/comissoes/${safeHref(linkedCommittee.id)}`:'#/demandas';
    const description=String(t.description||'').trim();
    const deadlines=d.length?d.map(x=>{
      const {step,person}=deadlineParts(x);
      const date=dateFrom(x.dueAt);
      const dueDate=date?formatDate(date,{day:'2-digit',month:'2-digit',year:'numeric'}):'Não definido';
      const dueTime=date?new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(date):'23:59';
      return `<div class="deadline-record"><div class="deadline-step">${icon('clock')}<strong>${escapeText(step)}</strong></div>
        <div class="deadline-field"><small>Para quem</small><strong>${escapeText(person)}</strong></div>
        <div class="deadline-field"><small>Data e horário</small><strong>${escapeText(dueDate)} · ${escapeText(dueTime)}</strong></div>
        <div>${tag(x.completedAt?'Concluído':'Pendente',x.completedAt?'mint':'soft')}</div>
      </div>`;
    }).join(''):empty('clock','Nenhum prazo cadastrado','Quando houver prazos, eles aparecerão aqui com seus responsáveis.',true);
    const observationHtml=notes.length?notes.map(n=>`<div class="placeholder-row"><div><strong>${escapeText(n.authorName||'Integrante')}</strong><small>${formatDate(n.createdAt)}</small><p style="white-space:pre-wrap;font-size:12px;line-height:1.8">${escapeText(n.body||'')}</p></div></div>`).join(''):empty('book','Nenhuma observação cadastrada','As observações são independentes da descrição da atividade.',true);
    const posting=t.postingAt?`<div class="activity-info"><span>Data prevista para postagem</span><strong>${formatDate(t.postingAt)}</strong></div>`:'';
    const people=assignees.length?`<div class="assigned-pills">${assignees.map(name=>tag(name,'soft')).join('')}</div>`:'<p class="notice-line">Responsável geral ainda não definido.</p>';
    return `${header('Detalhes da atividade',t.title,'',`<a class="button ghost" href="${sourceHref}">${icon('chevron-left')} Voltar à origem</a>`)}${connectNotice()}
      <div class="activity-overview card card-pad"><span class="detail-kicker">${escapeText(label)}: ${escapeText(taskOrigin(t))}</span>${tag(isCompleted(t)?'Concluída':t.stageName||'Pendente',isCompleted(t)?'mint':'soft')}
      ${posting}${description?`<div class="activity-description"><h2>Descrição</h2><p>${escapeText(description)}</p></div>`:''}</div>
      <div class="dashboard-grid activity-grid"><div class="stack">
        <section class="card card-pad"><div class="section-head"><div><h2>Prazos e etapas</h2><p>Datas e destinatários definidos para cada etapa.</p></div></div>${deadlines}</section>
        <section class="card card-pad"><div class="section-head"><h2>Observações</h2></div>${observationHtml}</section>
      </div><div class="stack">
        <section class="card card-pad"><div class="section-head"><h2>Responsáveis pela atividade</h2></div>${people}</section>
        ${renderAssignmentPreview()}
      </div></div>`;
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
        case 'assignment-scope':state.assignmentScope=b.dataset.value;state.assignmentPicked=[];render();break;
      }
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
