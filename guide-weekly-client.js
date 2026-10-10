/* Serialized browser module; all reads use the common loading lifecycle. */
function guideWeeklyBrowser_(bridge, getTabs) {
  const host = ()=>document.getElementById('guideWeeklyProgress');
  const esc = value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ATTENTION_BADGE='inline-flex items-center rounded-md bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-inset ring-warning/20';
  const BADGE='inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ';
  const badgeClass = tone=>BADGE+({green:'bg-success-tint text-success ring-success/20',orange:'bg-warning-tint text-warning ring-warning/20',blue:'bg-info-tint text-info ring-info/20',red:'bg-danger-tint text-danger ring-danger/20',gray:'bg-soft text-ink-2 ring-control/20'}[tone] || 'bg-soft text-ink-2 ring-control/20');
  const SMALL='border-0 rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50',SMALL_PRIMARY='border-0 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const NAV_ICON='inline-flex size-10 items-center justify-center rounded-lg border border-edge bg-paper p-0 text-ink hover:bg-tint disabled:opacity-50';
  const MORE='mt-2 border-0 bg-transparent p-0 text-xs font-semibold text-primary underline';
  const message = error=>typeof error === 'string' ? error : error?.message || 'Request failed.';
  function current(node) { return node.isConnected && host() === node; }
  function controls(node,disabled) {
    node.querySelectorAll('button:not([data-answer-toggle]),select').forEach(control=>{control.disabled=disabled || control.dataset.weekBoundary==='true';});
  }
  let selectedTeam = '', selectedView = 'title';
  // A locked Guide Evaluation tab stays clickable; it shows the availability card instead of opening the editor.
  function evaluationOpen(root) { const tab=root.querySelector('[data-guide-tab="evaluation"]'); return !!tab && !tab.disabled && !tab.hasAttribute('data-evaluation-locked'); }
  function workspace() { return document.querySelector('[data-guide-workspace]'); }
  function teamActions(team) {
    const root=workspace(),node=host();if(!root || !node)return [];
    const button=Array.from(root.querySelectorAll('[data-guide-select]')).find(button=>button.dataset.guideSelect===team);
    const panel=Array.from(root.querySelectorAll('[data-guide-team]')).find(panel=>panel.dataset.guideTeam===team);
    const students=panel?JSON.parse(panel.dataset.guideStudents).map(value=>String(value).trim().toLowerCase()):[];
    const actions=[];
    if(button?.dataset.titleAttention==='true')actions.push({key:'title',label:'Title review',count:1});
    const pending=node.data?.entries.filter(entry=>entry.status==='PENDING' && node.data.weeks.includes(entry.weekId) && students.includes(String(entry.regNo).trim().toLowerCase())).length || 0;
    if(pending)actions.push({key:'weekly',label:'Weekly progress',count:pending});
    if(evaluationOpen(root) && root.evaluationAttention?.[team])actions.push({key:'evaluation',label:'Guide Evaluation',count:root.evaluationCounts?.[team] || 1});
    if(button?.dataset.titleAttention==='true' && Number(button.dataset.documentsAttention)>0)actions.push({key:'documents',label:'Documents',count:Number(button.dataset.documentsAttention)});
    return actions;
  }
  function updateAttention() {
    const root=workspace(),node=host();if(!root || !node)return;
    root.querySelectorAll('[data-guide-select]').forEach(button=>{
      const pill=button.querySelector('[data-team-attention]');
      const label=button.querySelector('[data-team-label]'),spinner=button.querySelector('[data-team-spinner]');
      const actions=teamActions(button.dataset.guideSelect),first=actions[0];
      const unknown=!node.data || (evaluationOpen(root) && typeof root.evaluationAttention?.[button.dataset.guideSelect]!=='boolean');
      const loading=node.attentionLoading || (!node.data && !node.attentionReadFailed) || root.evaluationLoading?.[button.dataset.guideSelect];
      if(label)label.hidden=!!loading;
      if(spinner){spinner.hidden=!loading;if(loading)spinner.innerHTML=DashboardUI.renderSkeleton('inline','Checking team actions');}
      if(loading){
        if(!pill)return;
        pill.hidden=false;pill.className='';DashboardUI.busy.mark(pill,true);
        pill.innerHTML=DashboardUI.renderSkeleton('inline','Checking team actions');return;
      }
      if(pill){
        DashboardUI.busy.mark(pill,false);
        pill.hidden=!first;pill.className=ATTENTION_BADGE;
        pill.textContent=first?first.label+' · '+first.count:'';
      }
      button.setAttribute('aria-description',actions.map(action=>action.label+' · '+action.count).join(', ')+(unknown?' · Some action statuses could not be checked.':''));
    });
    const actions=teamActions(selectedTeam);
    root.querySelectorAll('[data-guide-tab]').forEach(button=>{
      const action=actions.find(action=>action.key===button.dataset.guideTab);
      getTabs().setBadge(button,action?action.count:0,action?(action.key==='documents'?'Documents supporting pending title review':action.label+' requiring action')+': '+action.count:'');
    });
  }
  function evaluationStatus(team,statuses) {
    const root=workspace();if(!root)return;
    root.evaluationAttention = root.evaluationAttention || {};
    root.evaluationVersions = root.evaluationVersions || {};
    root.evaluationVersions[team]=(root.evaluationVersions[team] || 0)+1;
    root.evaluationCounts=root.evaluationCounts || {};
    root.evaluationCounts[team]=statuses.filter(item=>item.status==='Not started' || item.status==='Draft').length;
    root.evaluationAttention[team]=root.evaluationCounts[team]>0;
    if(root.evaluationLoading)delete root.evaluationLoading[team];
    updateAttention();
    if(root.attentionLandingTeam===team && selectedTeam===team && teamActions(team)[0]?.key==='evaluation')selectView('evaluation',false,true);
  }
  function readEvaluationAttention() {
    const root=workspace();if(!root || !evaluationOpen(root))return;
    root.evaluationAttention = root.evaluationAttention || {};root.evaluationVersions = root.evaluationVersions || {};root.evaluationLoading=root.evaluationLoading || {};
    root.querySelectorAll('[data-guide-select]').forEach(button=>{
      const team=button.dataset.guideSelect;
      const version=(root.evaluationVersions[team] || 0)+1;root.evaluationVersions[team]=version;
      root.evaluationLoading[team]=true;updateAttention();
      bridge.read('guide-evaluation-attention:'+team,'API_guide_getEvaluation',[team,''],{timeoutMs:60000}).then(data=>{
        if(workspace()!==root || root.evaluationVersions[team]!==version)return;
        evaluationStatus(team,data.statuses);
      },()=>{
        if(workspace()!==root || root.evaluationVersions[team]!==version)return;
        delete root.evaluationLoading[team];
        if(typeof root.evaluationAttention[team]!=='boolean')root.evaluationAttention[team]=null;
        updateAttention();
      });
    });
  }
  function teamStudents() {
    const team=Array.from(workspace()?.querySelectorAll('[data-guide-team]') || []).find(panel=>panel.dataset.guideTeam===selectedTeam);
    return team?JSON.parse(team.dataset.guideStudents).map(value=>String(value).trim().toLowerCase()):null;
  }
  function teamMembers() {
    const team=Array.from(workspace()?.querySelectorAll('[data-guide-team]') || []).find(panel=>panel.dataset.guideTeam===selectedTeam);
    try { return team?.dataset.guideMembers ? JSON.parse(team.dataset.guideMembers) : []; } catch(error) { return []; }
  }
  function missingRows(required,entries) {
    if(!required)return '';
    const submitted=new Set(entries.map(entry=>String(entry.regNo).trim().toLowerCase()));
    const members=teamMembers(),names=new Map(members.map(member=>[String(member.regno).trim().toLowerCase(),member.name]));
    const regs=new Set([...required,...members.map(member=>String(member.regno).trim().toLowerCase()).filter(Boolean)]);
    return Array.from(regs).filter(reg=>!submitted.has(reg)).map(reg=>{
      const eligible=required.has(reg);
      return '<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-x-4 gap-y-1 px-2 py-3 max-[640px]:grid-cols-1" '+(eligible?'data-weekly-missing="':'data-weekly-ineligible="')+esc(reg)+'"><div class="flex min-w-0 flex-col"><strong>'+esc(names.get(reg) || reg)+'</strong><small class="font-mono text-xs text-muted">'+esc(reg)+'</small></div><span aria-hidden="true"></span><span class="justify-self-end text-sm text-muted max-[640px]:justify-self-start" data-guide-decision'+(eligible?'':' title="Not eligible for weekly progress in this week"')+'>'+(eligible?'Not submitted':'Not eligible this week')+'</span></div>';
    }).join('');
  }
  function selectDefaultWeek(node) {
    const students=teamStudents();
    const pendingWeeks=new Set(node.data.entries.filter(entry=>entry.status==='PENDING' &&
      (!students || students.includes(String(entry.regNo).trim().toLowerCase()))).map(entry=>entry.weekId));
    node.week=node.data.weeks.slice().reverse().find(week=>pendingWeeks.has(week)) || node.data.weeks[0];
  }
  function selectTeam(index, preserveView) {
    const root=workspace();if(!root || host()?.busy)return;
    const teams=Array.from(root.querySelectorAll('[data-guide-team]'));
    const previousTeam=selectedTeam;
    selectedTeam=teams.some(team=>team.dataset.guideTeam===String(index))?String(index):(teams[0]?.dataset.guideTeam || '');
    if(!preserveView)root.attentionLandingTeam=selectedTeam;
    root.querySelectorAll('[data-guide-select]').forEach(button=>{const active=button.dataset.guideSelect===selectedTeam;button.setAttribute('aria-pressed',String(active));});
    root.querySelectorAll('[data-guide-heading]').forEach(heading=>{heading.hidden=heading.dataset.guideHeading!==selectedTeam;});
    teams.forEach(team=>{team.hidden=team.dataset.guideTeam!==selectedTeam || (selectedView==='weekly' || selectedView==='evaluation');});
    // Tab changes only toggle visibility; keep loaded details and disclosure state.
    if(host()?.data && previousTeam!==selectedTeam){selectDefaultWeek(host());render(host());}
    updateAttention();
    if(!preserveView)selectView(teamActions(selectedTeam)[0]?.key || 'title',false,true);
  }
  function selectView(view, evaluationReady, automatic) {
    const root=workspace();if(!root || host()?.busy)return;
    if(!automatic)root.attentionLandingTeam=null;
    const editor=document.getElementById('guideEvaluationEditor');
    if(view==='evaluation') {
      const tab=root.querySelector('[data-guide-tab="evaluation"]');
      if(!tab || !editor)return;
      if(!evaluationOpen(root)) { /* locked: the editor section already holds the availability card */ }
      else if(!evaluationReady && editor.dataset.team!==selectedTeam){GuideEvaluation.open(selectedTeam);return;}
    }
    if(editor)editor.hidden=view!=='evaluation';
    selectedView=view;
    getTabs().select(root.querySelectorAll('[data-guide-tab]'),button=>button.dataset.guideTab===view);
    root.querySelectorAll('[data-guide-view]').forEach(panel=>{panel.hidden=panel.dataset.guideView!==view;});
    host().hidden=view!=='weekly';
    selectTeam(selectedTeam,true);
  }
  function load() {
    const node=host();if(!node || node.busy)return;
    node.attentionLoading=true;
    if(workspace())selectTeam(selectedTeam,true);
    node.busy=true;controls(node,true);
    const finish=DashboardUI.beginContentLoading(node.querySelector('[data-guide-weekly-read]'),'Reading weekly progress',{compact:true});
    const settle=()=>{finish();node.busy=false;node.attentionLoading=false;controls(node,false);};
    bridge.read('guide-weekly','API_guide_getWeekly',[],{timeoutMs:60000,prefetched:true}).then(data=>{
      settle();if(!current(node))return;
      if(node.dataset.guideWeeks) {
        data.weeks=JSON.parse(node.dataset.guideWeeks).filter(w=>w.opensAt<=new Date(data.checkedAt).getTime())
          .sort((a,b)=>b.opensAt-a.opensAt).map(w=>w.weekId);
      }
      node.data=data;
      node.attentionReadFailed=false;
      selectDefaultWeek(node);
      node.querySelector('[data-guide-weekly-status]').textContent='';
      render(node);
      selectTeam(selectedTeam);updateAttention();readEvaluationAttention();
    }).catch(error=>{
      if(error && error.superseded){settle();return;}
      settle();node.attentionReadFailed=true;if(current(node)){node.querySelector('[data-guide-weekly-status]').textContent='Could not read weekly progress: '+message(error)+' Use dashboard Refresh to retry.';updateAttention();readEvaluationAttention();}
    });
  }
  function submissionBadge(timeliness,firstSubmittedAt,deadlineAt,timeZone) {
    const state={ON_TIME:['green','On-time submission'],LATE:['red','Late submission']}[timeliness] || ['gray','Timing unavailable'];
    if(timeliness==='LATE' && firstSubmittedAt && Number.isFinite(deadlineAt)) {
      const submitted=new Date(firstSubmittedAt);
      if(Number.isFinite(submitted.getTime()) && submitted.getTime()>deadlineAt) {
        const day=date=>{
          const parts=date.toLocaleDateString('en-GB',{timeZone,day:'2-digit',month:'2-digit',year:'numeric'}).split('/').map(Number);
          return Date.UTC(parts[2],parts[1]-1,parts[0])/86400000;
        };
        const days=day(submitted)-day(new Date(deadlineAt));
        state[1]=days>0?days+' day'+(days===1?'':'s')+' late':'Less than 1 day late';
      }
    }
    return '<span class="'+badgeClass(state[0])+'" data-submission-timing>'+state[1]+'</span>';
  }
  function submissionTiming(node,entry) {
    const week=JSON.parse(node.dataset.guideWeeks || '[]').find(week=>week.weekId===entry.weekId);
    return '<div data-weekly-timing class="flex justify-center max-[640px]:justify-start">'+submissionBadge(entry.timeliness,entry.firstSubmittedAt,week?.deadlineAt,node.data.timezone)+'</div>';
  }
  /** The due and late cutoffs are the same for every student, so they are shown once per week. */
  function weekDeadlines(node) {
    const week=JSON.parse(node.dataset.guideWeeks || '[]').find(week=>week.weekId===node.week);
    if(!week || !Number.isFinite(week.deadlineAt))return '';
    const timeZone=node.data.timezone,now=new Date(node.data.checkedAt).getTime();
    const when=at=>new Date(at).toLocaleString('en-GB',{timeZone,weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true}).replace(/\bSept\b/g,'Sep');
    const full=at=>new Date(at).toLocaleString('en-IN',{timeZone,timeZoneName:'short',hour12:true});
    const late=Number.isFinite(week.lateUntil) && week.lateUntil>week.deadlineAt;
    const phase=!Number.isFinite(now) ? null : now<=week.deadlineAt ? ['blue','Open'] : late && now<=week.lateUntil ? ['orange','Late window open'] : ['gray','Closed'];
    const item=(label,at,key)=>'<span class="inline-flex items-baseline gap-1" data-week-'+key+'><span class="text-muted">'+label+'</span><time class="font-semibold text-ink" datetime="'+esc(new Date(at).toISOString())+'" title="'+esc(full(at))+'">'+esc(when(at))+'</time></span>';
    return '<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-week-deadlines>'+item('Due',week.deadlineAt,'due')+
      (late?'<span class="text-edge" aria-hidden="true">|</span>'+item('Late submissions until',week.lateUntil,'late-until'):'')+
      (phase?'<span class="'+badgeClass(phase[0])+'" data-week-phase>'+phase[1]+'</span>':'')+'</div>';
  }
  function lastTeamSubmission(node,students) {
    const entries=node.data.entries.filter(entry=>!students || students.includes(String(entry.regNo).trim().toLowerCase()));
    const dates=entries.map(entry=>entry.submittedAt ? new Date(entry.submittedAt).getTime() : NaN).filter(Number.isFinite);
    return 'Last submission: '+(dates.length ? new Date(Math.max(...dates)).toLocaleDateString('en-GB',{timeZone:node.data.timezone,day:'numeric',month:'short',year:'numeric'}) : entries.length ? 'Date unavailable' : 'None recorded');
  }
  function weekDateRange(node) {
    const week=JSON.parse(node.dataset.guideWeeks || '[]').find(week=>week.weekId===node.week);
    if(!week || !Number.isFinite(week.opensAt) || !Number.isFinite(week.deadlineAt))return 'Dates unavailable';
    const start=new Date(week.opensAt),end=new Date(week.deadlineAt),timeZone=node.data.timezone;
    const year=date=>date.toLocaleDateString('en-GB',{timeZone,year:'numeric'});
    const options={timeZone,day:'numeric',month:'short'};
    if(year(start)!==year(end))options.year='numeric';
    return (start.toLocaleDateString('en-GB',options)+' – '+end.toLocaleDateString('en-GB',options)).replace(/\bSept\b/g,'Sep');
  }
  function weeklyAnswers(entry) {
    return '<div class="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">'+[['workCompleted','Work completed'],['guideDiscussion','Guide discussion / decision'],['blockers','Problems / blockers'],['nextAction','Next week plan']].map(([key,label])=>{
      const answer=String(entry[key] || '').replace(/\r\n?/g,'\n').trim().replace(/(?:^|\s)Next\s*(?:…|\.{3})\s*$/i,'').trim()
        .split(/\n\s*\n/).map(paragraph=>paragraph.split('\n').reduce((text,line)=>text+(text ? (/^\s*(?:[-*•]|\d+[.)])\s/.test(line)?'\n':' ') : '')+line.trim(),'')).join('\n\n');
      return '<div data-answer="'+key+'" class="min-w-0 rounded-md bg-canvas p-3"><strong class="block text-sm text-ink">'+label+'</strong><p data-answer-text class="m-0 mt-1 line-clamp-3 whitespace-pre-line break-words text-sm text-ink-2">'+esc(answer || 'No response recorded.')+'</p><button type="button" class="'+MORE+'" data-answer-toggle aria-expanded="false" hidden>Show more</button></div>';
    }).join('')+'</div>';
  }
  /** The toggle only appears when the clamped text actually overflows; open cards are measured because closed ones have no layout. */
  function measureAnswers(node) {
    node.querySelectorAll('[data-weekly-card][open] [data-answer]').forEach(block=>{
      const text=block.querySelector('[data-answer-text]'),button=block.querySelector('[data-answer-toggle]');
      if(!text || !button || button.getAttribute('aria-expanded')==='true' || !Number.isFinite(text.scrollHeight) || !Number.isFinite(text.clientHeight))return;
      button.hidden=text.scrollHeight<=text.clientHeight+1;
    });
  }
  function toggleAnswer(button) {
    const text=button.parentElement.querySelector('[data-answer-text]'),open=button.getAttribute('aria-expanded')==='true';
    text.classList.toggle('line-clamp-3',open);button.setAttribute('aria-expanded',String(!open));button.textContent=open?'Show more':'Show less';
  }
  function weeklyEvidence(entry,timeZone) {
    const evidence=entry.evidence,commits=Array.isArray(evidence?.commits)?evidence.commits:[];
    const available=evidence?.state==='available';
    const github=available ? (commits.length ? '<ul data-commit-list class="mt-1 list-none p-0 text-sm">'+commits.map(commit=>'<li class="flex flex-wrap items-baseline gap-2 py-0.5"><a class="text-primary underline" href="'+esc(commit.url)+'" target="_blank" rel="noopener noreferrer"><code>'+esc(commit.shortSha)+'</code></a><span>'+esc(commit.message)+'</span><time datetime="'+esc(commit.timestamp)+'">'+esc(new Date(commit.timestamp).toLocaleString('en-IN',{timeZone,day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}))+'</time></li>').join('')+'</ul>' : '<p>No qualifying GitHub commits recorded for this student in this week.</p>') : '<p>'+esc(evidence?.message || 'GitHub evidence unavailable. Use dashboard Refresh to retry.')+'</p>';
    const analysis=entry.analysis;
    const ai=analysis ? '<p>'+esc(analysis.comment)+'</p><dl class="m-0 mt-2 grid grid-cols-2 gap-y-1 text-sm">'+[['technical_substance','Technical substance'],['specificity','Specificity'],['outcome','Outcome'],['next_action','Next action'],['github_support','GitHub support']].map(([key,label])=>'<dt class="text-muted">'+label+'</dt><dd class="m-0 font-semibold">'+esc(analysis[key] || '—')+'</dd>').join('')+'</dl>' : '<p>Not scored yet.</p>';
    return '<div data-weekly-evidence class="mt-3 grid gap-3 md:grid-cols-2"><section class="rounded-md bg-canvas p-3"><h4 class="m-0 text-sm font-semibold text-ink">GitHub evidence (auto-collected)'+(available?' · '+commits.length+(commits.length===1?' commit':' commits'):'')+'</h4>'+github+'</section><section class="rounded-md bg-canvas p-3"><h4 class="m-0 text-sm font-semibold text-ink">AI analysis</h4>'+ai+'</section></div>';
  }
  let actionBarObserver=null, resizeActionBars=null;
  function reserveActionBarSpace(node) {
    if(actionBarObserver)actionBarObserver.disconnect();
    if(resizeActionBars && typeof window!=='undefined'){window.removeEventListener('resize',resizeActionBars);document.removeEventListener('scroll',resizeActionBars,true);}
    if(typeof ResizeObserver==='undefined' || typeof window==='undefined')return;
    const cards=Array.from(node.querySelectorAll('[data-weekly-card]'));
    const update=()=>{
      if(!current(node)){actionBarObserver.disconnect();window.removeEventListener('resize',update);document.removeEventListener('scroll',update,true);return;}
      cards.forEach(card=>{
        const content=card.querySelector('[data-weekly-summary]'),bar=card.querySelector('[data-weekly-actions]');
        const height=bar.getBoundingClientRect().height;
        if(!height)return; // Hidden tabs are measured when revealed.
        const header=card.querySelector('[data-weekly-student-header]');
        const previous=Number(card.dataset.actionReserve || 0);
        const bounds=content.getBoundingClientRect(),bodyTop=header.getBoundingClientRect().bottom,bodyBottom=bounds.bottom-previous;
        const bodyHeight=Math.max(0,bodyBottom-bodyTop);
        const visibleBody=Math.max(0,Math.min(bodyBottom,window.innerHeight)-Math.max(bodyTop,0));
        card.dataset.stickyDecision=String(bodyHeight>0 && visibleBody>=Math.min(bodyHeight,window.innerHeight)*0.6 && card.getBoundingClientRect().bottom>height);
        const naturalHeight=bounds.height-previous+height;
        const reserve=naturalHeight>window.innerHeight?Math.ceil(height):0;
        if(reserve!==previous){card.dataset.actionReserve=String(reserve);}
      });
    };
    actionBarObserver=new ResizeObserver(update);
    cards.forEach(card=>{actionBarObserver.observe(card.querySelector('[data-weekly-actions]'));actionBarObserver.observe(card.querySelector('[data-weekly-summary]'));});
    resizeActionBars=update;window.addEventListener('resize',update);document.addEventListener('scroll',update,true);update();
  }
  function studentRow(node,entry,open) {
    const decision=entry.status==='DISCUSSED' ? '<span class="inline-flex items-center gap-1 text-sm font-semibold text-success" data-guide-decision>'+DashboardUI.renderIcon('check')+'Discussed</span>'
      : entry.status==='NOT_DISCUSSED' ? '<span class="inline-flex items-center gap-1 text-sm text-muted" data-guide-decision>'+DashboardUI.renderIcon('x')+'Not discussed</span>'
      : '<span class="inline-flex items-center gap-1 text-sm font-medium text-warning" data-guide-decision>Decision pending</span>';
    return '<details class="group relative" data-weekly-card data-card-entry="'+esc(entry.entryId)+'"'+(open?' open':'')+'>'+
      '<summary data-weekly-student-header class="grid cursor-pointer list-none grid-cols-[1fr_auto_1fr] items-center gap-x-4 gap-y-1 px-2 py-3 hover:bg-tint max-[640px]:grid-cols-1 [&::-webkit-details-marker]:hidden"><div class="flex min-w-0 flex-col"><strong>'+esc(entry.student)+'</strong><small class="font-mono text-xs text-muted">'+esc(entry.regNo)+'</small></div>'+
      submissionTiming(node,entry)+'<span class="flex items-center gap-2 justify-self-end max-[640px]:justify-self-start">'+decision+'<span class="text-muted transition-transform group-open:rotate-180" aria-hidden="true">'+DashboardUI.renderIcon('chevron-down')+'</span></span></summary>'+
      '<div class="mt-0 border-t border-edge px-2 pb-3 pt-3" data-entry="'+esc(entry.entryId)+'" data-weekly-summary>'+weeklyAnswers(entry)+weeklyEvidence(entry,node.data.timezone)+'</div>'+
      '<div class="relative bottom-0 max-md:bottom-16 z-10 flex flex-wrap items-center gap-2 border-t border-edge bg-paper px-2 py-3 group-data-[sticky-decision=true]:sticky" data-weekly-actions data-sign-entry="'+esc(entry.entryId)+'"><span class="text-sm">Did you discuss this update with the student?</span>'+['NOT_DISCUSSED','DISCUSSED'].map(status=>'<button type="button" class="'+(status==='DISCUSSED'?SMALL_PRIMARY:SMALL)+'" data-sign="'+status+'" aria-pressed="'+(entry.status===status)+'">'+(status==='DISCUSSED'?'Discussed':'Not Discussed')+'</button>').join('')+'</div></details>';
  }
  function render(node) {
    const target=node.querySelector('[data-guide-weekly-read]');
    if(!node.data.weeks.length){target.innerHTML='<p>No weekly submissions available. Weekly navigation starts when the first configured week opens.</p><p>'+esc(lastTeamSubmission(node,teamStudents()))+'</p>';return;}
    const students=teamStudents();
    const entries=node.data.entries.filter(entry=>entry.weekId===node.week && (!students || students.includes(String(entry.regNo).trim().toLowerCase())));
    const submitted=new Set(entries.map(entry=>String(entry.regNo).trim().toLowerCase())).size;
    const requiredWeek=(node.data.requiredByWeek || []).find(week=>week.weekId===node.week);
    const required=requiredWeek ? new Set(requiredWeek.regNos.map(reg=>String(reg).trim().toLowerCase()).filter(reg=>!students || students.includes(reg))) : null;
    const total=required ? required.size : null;
    const completed=required ? new Set(entries.map(entry=>String(entry.regNo).trim().toLowerCase()).filter(reg=>required.has(reg))).size : submitted;
    const pending=entries.filter(entry=>entry.status==='PENDING').length;
    const absent=missingRows(required,entries);
    const weekSummary=(total === null ? submitted+' submitted' : completed+'/'+total+' required submitted')+' · '+pending+' awaiting decision';
    const weekIndex=node.data.weeks.indexOf(node.week);
    const openCards=new Set(Array.from(node.querySelectorAll('[data-weekly-card][open]')).map(card=>card.dataset.cardEntry));
    target.innerHTML='<nav aria-label="Select weekly progress week" class="mt-3 flex items-center gap-3">'+
      '<button type="button" class="'+NAV_ICON+'" data-week-step="1" data-week-boundary="'+(weekIndex===node.data.weeks.length-1)+'" '+(weekIndex===node.data.weeks.length-1?'disabled':'')+' title="'+(weekIndex===node.data.weeks.length-1?'First project week. No more previous weeks':'Previous week')+'" aria-label="Previous week">'+DashboardUI.renderIcon('chevron-left')+'</button>'+
      '<span aria-live="polite" class="text-sm font-semibold text-ink">'+esc(weekDateRange(node))+'</span>'+
      '<button type="button" class="'+NAV_ICON+'" data-week-step="-1" data-week-boundary="'+(weekIndex===0)+'" '+(weekIndex===0?'disabled':'')+' title="'+(weekIndex===0?'Latest available project week. No more next weeks':'Next week')+'" aria-label="Next week">'+DashboardUI.renderIcon('chevron-right')+'</button>'+
      '<span class="'+badgeClass('orange')+' ml-auto empty:hidden" data-week-status role="status" title="'+esc(weekSummary)+'">'+(pending?pending+' pending':'')+'</span></nav>'+weekDeadlines(node)+
      (entries.length || absent ? '<div class="mt-3 divide-y divide-edge border-y border-edge">'+entries.map(entry=>studentRow(node,entry,openCards.has(entry.entryId))).join('')+absent+'</div>':'<p>No weekly submissions for this team in the selected week.</p><p>'+esc(lastTeamSubmission(node,students))+'</p>');
    attachActions(node);
    measureAnswers(node);
    reserveActionBarSpace(node);
  }
  /** One delegated click listener per host: week navigation, sign-off and its Undo. */
  function attachActions(node) {
    if(node.actionsAttached)return;
    node.actionsAttached=true;
    node.addEventListener('toggle',()=>measureAnswers(node),true);
    node.addEventListener('click',event=>{
      const button=event.target.closest && event.target.closest('button');
      if(!button || !node.contains(button))return;
      if(button.hasAttribute('data-week-step')){
        if(node.busy || button.disabled)return;
        const next=node.data.weeks[node.data.weeks.indexOf(node.week)+Number(button.dataset.weekStep)];
        if(next){node.week=next;render(node);}
      } else if(button.hasAttribute('data-sign'))sign(node,button);
      else if(button.hasAttribute('data-sign-undo') && node.undoSign)node.undoSign();
      else if(button.hasAttribute('data-answer-toggle'))toggleAnswer(button);
    });
  }
  function sign(node,button) {
    if(node.busy)return;
    const entryId=button.closest('[data-sign-entry]').dataset.signEntry,status=button.dataset.sign;
    if(node.data.entries.find(entry=>entry.entryId===entryId)?.status===status)return;
    node.busy=true;controls(node,true);
    const output=node.querySelector('[data-guide-weekly-status]');
    output.textContent=(status==='DISCUSSED'?'Discussed':'Not Discussed')+' will save in 5 seconds and freeze student revisions. ';
    const undo=document.createElement('button');
    undo.type='button';undo.className=SMALL;undo.textContent='Undo';undo.dataset.signUndo='';
    output.appendChild(undo);
    const timer=setTimeout(()=>{
      node.undoSign=null;
      if(!current(node)){node.busy=false;return;}
      saveSignoff(node,entryId,status,output,DashboardUI.busy.write(output,'Saving guide confirmation…'));
    },5000);
    node.undoSign=()=>{
      node.undoSign=null;clearTimeout(timer);node.busy=false;controls(node,false);
      output.textContent='Decision cancelled. No changes saved.';
      button.focus();
    };
    undo.focus();
  }
  function saveSignoff(node,entryId,status,output,done) {
    bridge.write('API_guide_signWeekly',[entryId,status]).then(result=>{
      done();node.busy=false;controls(node,false);if(!current(node))return;
      node.data.entries.find(entry=>entry.entryId===entryId).status=result.status;
      render(node);updateAttention();output.textContent=result.message;
    },error=>{done();node.busy=false;controls(node,false);if(current(node))output.textContent='Could not save confirmation: '+message(error);});
  }
  function positionTitleInfo(event,popup) {
    if(popup.dismissListeners){popup.dismissListeners();popup.dismissListeners=null;}
    if(event.newState!=='open')return;
    const button=document.querySelector('[popovertarget="'+popup.id+'"]');
    if(!button)return;
    const anchor=button.getBoundingClientRect(),box=popup.getBoundingClientRect();
    const width=window.innerWidth,height=window.innerHeight,gap=8;
    const left=Math.max(gap,Math.min(anchor.right-box.width,width-box.width-gap));
    const below=anchor.bottom+gap;
    const top=below+box.height<=height-gap?below:Math.max(gap,anchor.top-box.height-gap);
    popup.style.left=left+'px';popup.style.top=top+'px';
    const dismiss=()=>popup.hidePopover();
    window.addEventListener('resize',dismiss);
    document.addEventListener('scroll',dismiss,true);
    popup.dismissListeners=()=>{window.removeEventListener('resize',dismiss);document.removeEventListener('scroll',dismiss,true);};
  }
  return {load,selectTeam,selectView,evaluationStatus,positionTitleInfo};
}
function weeklyPhase2SetupBrowser_(bridge) {
  const host=()=>document.getElementById('weeklyPhase2Setup');
  const PRIMARY='border-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const LINE='m-0 mt-1 text-sm text-ink-2';
  function controls(node,disabled) { node.querySelectorAll('button').forEach(button=>{button.disabled=disabled || button.dataset.allowed!=='true';}); }
  function current(node) { return node.isConnected && host()===node; }
  function attach(node) {
    if(node.actionsAttached)return;
    node.actionsAttached=true;
    node.addEventListener('click',event=>{
      const button=event.target.closest && event.target.closest('button[data-setup-kind]');
      if(button && node.contains(button))setup(node,button.dataset.setupKind);
    });
  }
  function load() {
    const node=host();if(!node)return;attach(node);if(node.busy)return;
    node.busy=true;controls(node,true);
    const finish=DashboardUI.beginContentLoading(node.querySelector('[data-weekly-setup-read]'),'Checking weekly progress setup',{compact:true,variant:'status'});
    function settle(){finish();node.busy=false;controls(node,false);}
    bridge.read('weekly-setup','API_coordinator_getWeeklySetup',[],{timeoutMs:120000}).then(report=>{
      settle();if(!current(node))return;
      const target=node.querySelector('[data-weekly-setup-read]');target.textContent='';
      const summary=document.createElement('p');summary.className=LINE;summary.textContent='Storage: '+(report.storageReady?'Ready':'Needs setup')+' · AI schedule: '+(report.triggerReady===true?'Ready':report.triggerReady===null?'Check with trigger owner':'Needs setup');target.appendChild(summary);
      const actions=document.createElement('div');actions.className='mt-2 flex flex-wrap gap-2';target.appendChild(actions);
      [['storage',report.storageReady,report.canSetupStorage,'Create weekly progress storage'],['triggers',report.triggerReady!==false,report.canSetupTriggers,'Create weekly AI schedule']].forEach(([kind,ready,allowed,label])=>{
        if(ready)return;
        const button=document.createElement('button');button.type='button';button.className=PRIMARY;button.textContent=label;button.dataset.allowed=String(allowed);button.disabled=!allowed;button.dataset.setupKind=kind;actions.appendChild(button);
      });
      report.issues.forEach(issue=>{const line=document.createElement('p');line.className=LINE;line.textContent=issue;target.appendChild(line);});
      if(node.readError){node.querySelector('[data-weekly-setup-status]').textContent='';node.readError=false;}
    },error=>{
      settle();if(!current(node) || (error && error.superseded))return;
      node.readError=true;node.querySelector('[data-weekly-setup-status]').textContent='Could not check weekly setup: '+(error?.message || String(error))+'. Use Recheck to retry.';
    });
  }
  function setup(node,kind) {
    if(node.busy || !current(node))return;
    node.busy=true;controls(node,true);
    const done=DashboardUI.busy.write(node.querySelector('[data-weekly-setup-status]'),'Preparing weekly '+(kind==='storage'?'progress storage':'AI schedule')+'…');
    function settle(message){node.busy=false;controls(node,false);if(!current(node)){done();return;}done(message);load();}
    bridge.write('API_coordinator_setupWeekly',[kind]).then(()=>settle('Weekly '+(kind==='storage'?'progress storage':'AI schedule')+' is ready.'),error=>settle('Setup stopped: '+(error?.message || String(error))));
  }
  return {load};
}
function getGuideWeeklyClientScript_() { return 'const GuideWeekly = ('+guideWeeklyBrowser_.toString()+')(DataBridge, () => SharedTabs);'; }
/** Coordinator weekly setup, used by System Status; serialized separately from the Guide workspace. */
function getWeeklySetupClientScript_() { return 'const WeeklyPhase2Setup = ('+weeklyPhase2SetupBrowser_.toString()+')(DataBridge);'; }
