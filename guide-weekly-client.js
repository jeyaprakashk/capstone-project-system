/* Serialized browser module; all reads use the common loading lifecycle. */
function guideWeeklyBrowser_() {
  const host = ()=>document.getElementById('guideWeeklyProgress');
  const esc = value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const message = error=>typeof error === 'string' ? error : error?.message || 'Request failed.';
  function rpc(method,args,success,failure) {
    try { DashboardUI.guideRun().withSuccessHandler(success).withFailureHandler(failure)[method](...args); }
    catch(error) { failure(error); }
  }
  function current(node) { return node.isConnected && host() === node; }
  function controls(node,disabled) {
    node.querySelectorAll('button,select').forEach(control=>{control.disabled=disabled || control.dataset.weekBoundary==='true';});
  }
  let selectedTeam = '', selectedView = 'title';
  function workspace() { return document.querySelector('[data-guide-workspace]'); }
  function updateAttention() {
    const root=workspace(), node=host();if(!root || !node)return;
    const evaluationEnabled=root.querySelector('[data-guide-tab="evaluation"]')?.disabled===false;
    root.querySelectorAll('[data-guide-select]').forEach(button=>{
      const pill=button.querySelector('[data-team-attention]');if(!pill)return;
      const team=button.dataset.guideSelect;
      const panel=Array.from(root.querySelectorAll('[data-guide-team]')).find(panel=>panel.dataset.guideTeam===team);
      const students=panel?JSON.parse(panel.dataset.guideStudents).map(value=>String(value).trim().toLowerCase()):[];
      const actions=[];
      if(button.dataset.titleAttention==='true')actions.push('Title review');
      if(node.data?.entries.some(entry=>entry.status==='PENDING' && node.data.weeks.includes(entry.weekId) && students.includes(String(entry.regNo).trim().toLowerCase())))actions.push('Weekly progress');
      const evaluation=root.evaluationAttention?.[team];
      if(evaluationEnabled && evaluation===true)actions.push('Guide Evaluation');
      const unknown=!node.data || (evaluationEnabled && typeof evaluation!=='boolean');
      if(!actions.length && node.data && evaluationEnabled && evaluation===undefined) {
        pill.hidden=false;pill.className='';pill.title='';
        pill.innerHTML=DashboardUI.renderSkeleton('inline','Checking team actions');return;
      }
      pill.hidden=!actions.length && !unknown;
      pill.className='tag '+(actions.length?'orange':'gray');
      pill.textContent=actions.length>1?actions.length+' actions':actions[0] || 'Status unavailable';
      pill.title=actions.join(', ')+(unknown?(actions.length?' · ':'')+'Some action statuses could not be checked.':'');
    });
  }
  function evaluationStatus(team,statuses) {
    const root=workspace();if(!root)return;
    root.evaluationAttention = root.evaluationAttention || {};
    root.evaluationVersions = root.evaluationVersions || {};
    root.evaluationVersions[team]=(root.evaluationVersions[team] || 0)+1;
    root.evaluationAttention[team]=statuses.some(item=>item.status==='Not started' || item.status==='Draft');
    updateAttention();
  }
  function readEvaluationAttention() {
    const root=workspace();if(!root || root.querySelector('[data-guide-tab="evaluation"]')?.disabled!==false)return;
    root.evaluationAttention = root.evaluationAttention || {};root.evaluationVersions = root.evaluationVersions || {};
    root.querySelectorAll('[data-guide-select]').forEach(button=>{
      const team=button.dataset.guideSelect;
      const version=(root.evaluationVersions[team] || 0)+1;root.evaluationVersions[team]=version;
      rpc('loadGuideEvaluation',[team,''],data=>{
        if(workspace()!==root || root.evaluationVersions[team]!==version)return;
        evaluationStatus(team,data.statuses);
      },()=>{
        if(workspace()!==root || root.evaluationVersions[team]!==version)return;
        root.evaluationAttention[team]=null;updateAttention();
      });
    });
  }
  function teamStudents() {
    const team=Array.from(workspace()?.querySelectorAll('[data-guide-team]') || []).find(panel=>panel.dataset.guideTeam===selectedTeam);
    return team?JSON.parse(team.dataset.guideStudents).map(value=>String(value).trim().toLowerCase()):null;
  }
  function selectDefaultWeek(node) {
    const students=teamStudents();
    const pendingWeeks=new Set(node.data.entries.filter(entry=>entry.status==='PENDING' &&
      (!students || students.includes(String(entry.regNo).trim().toLowerCase()))).map(entry=>entry.weekId));
    node.week=node.data.weeks.slice().reverse().find(week=>pendingWeeks.has(week)) || node.data.weeks[0];
  }
  function selectTeam(index) {
    const root=workspace();if(!root || host()?.busy)return;
    const teams=Array.from(root.querySelectorAll('[data-guide-team]'));
    const previousTeam=selectedTeam;
    selectedTeam=teams.some(team=>team.dataset.guideTeam===String(index))?String(index):(teams[0]?.dataset.guideTeam || '');
    if(previousTeam!==selectedTeam && selectedView==='evaluation')selectView('title');
    root.querySelectorAll('[data-guide-select]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.guideSelect===selectedTeam)));
    root.querySelectorAll('[data-guide-heading]').forEach(heading=>{heading.hidden=heading.dataset.guideHeading!==selectedTeam;});
    teams.forEach(team=>{team.hidden=team.dataset.guideTeam!==selectedTeam || (selectedView==='weekly' || selectedView==='evaluation');});
    // Tab changes only toggle visibility; keep loaded details and disclosure state.
    if(host()?.data && previousTeam!==selectedTeam){selectDefaultWeek(host());render(host());}
  }
  function selectView(view, evaluationReady) {
    const root=workspace();if(!root || host()?.busy)return;
    const editor=document.getElementById('guideEvaluationEditor');
    if(view==='evaluation') {
      const tab=root.querySelector('[data-guide-tab="evaluation"]');
      if(!tab || tab.disabled || !editor)return;
      if(!evaluationReady && editor.dataset.team!==selectedTeam){GuideEvaluation.open(selectedTeam);return;}
    }
    if(editor)editor.hidden=view!=='evaluation';
    selectedView=view;
    root.querySelectorAll('[data-guide-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.guideTab===view)));
    root.querySelectorAll('[data-guide-view]').forEach(panel=>{panel.hidden=panel.dataset.guideView!==view;});
    host().hidden=view!=='weekly';
    selectTeam(selectedTeam);
  }
  function load() {
    const node=host();if(!node || node.busy)return;
    if(workspace()){selectTeam(selectedTeam);selectView(selectedView);}
    node.busy=true;controls(node,true);
    const finish=DashboardUI.beginContentLoading(node.querySelector('[data-guide-weekly-read]'),'Reading weekly progress',{compact:true});
    const settle=()=>{finish();node.busy=false;controls(node,false);};
    rpc('loadGuideWeeklyProgress',[],data=>{
      settle();if(!current(node))return;
      if(node.dataset.guideWeeks) {
        data.weeks=JSON.parse(node.dataset.guideWeeks).filter(w=>w.opensAt<=new Date(data.checkedAt).getTime())
          .sort((a,b)=>b.opensAt-a.opensAt).map(w=>w.weekId);
      }
      node.data=data;
      selectDefaultWeek(node);
      node.querySelector('[data-guide-weekly-status]').textContent='';
      render(node);
      updateAttention();readEvaluationAttention();
      const updated=node.querySelector('#guide-weeklyUpdated');
      if(updated)updated.textContent='Updated '+new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:data.timezone,hour12:true});
    },error=>{
      settle();if(current(node)){node.querySelector('[data-guide-weekly-status]').textContent='Could not read weekly progress: '+message(error)+' Use Refresh to retry.';updateAttention();readEvaluationAttention();}
    });
  }
  function decisionBadge(status) {
    const state={PENDING:['Awaiting Decision','orange'],DISCUSSED:['Discussed','green'],NOT_DISCUSSED:['Not Discussed','gray']}[status] || [status,'gray'];
    return '<span class="tag '+state[1]+'" data-decision-status>'+esc(state[0])+'</span>';
  }
  function render(node) {
    const target=node.querySelector('[data-guide-weekly-read]');
    if(!node.data.weeks.length){target.innerHTML='<p>No weekly submissions available. Weekly navigation starts when the first configured week opens.</p>';return;}
    const students=teamStudents();
    const entries=node.data.entries.filter(entry=>entry.weekId===node.week && (!students || students.includes(String(entry.regNo).trim().toLowerCase())));
    const submitted=new Set(entries.map(entry=>String(entry.regNo).trim().toLowerCase())).size;
    const total=students ? new Set(students).size : null;
    const pending=entries.filter(entry=>entry.status==='PENDING').length;
    const weekStatus=!submitted ? {tone:'gray',label:'No submissions'}
      : pending ? {tone:'orange',label:'Awaiting Decision'}
      : total !== null && submitted===total ? {tone:'green',label:'All submitted'}
      : {tone:'blue',label:total === null ? 'Submitted' : submitted+'/'+total+' submitted'};
    const weekSummary=(total === null ? submitted+' submitted' : submitted+'/'+total+' submitted')+' · '+pending+' awaiting decision';
    const weekIndex=node.data.weeks.indexOf(node.week);
    target.innerHTML='<nav class="guide-week-navigation" aria-label="Select weekly progress week">'+
      '<button type="button" class="app-btn btn-md btn-secondary btn-icon" data-week-step="1" data-week-boundary="'+(weekIndex===node.data.weeks.length-1)+'" '+(weekIndex===node.data.weeks.length-1?'disabled':'')+' aria-label="Previous week">&#8249;</button>'+
      '<span class="guide-week-label" aria-live="polite">'+esc(node.week)+'</span>'+
      '<button type="button" class="app-btn btn-md btn-secondary btn-icon" data-week-step="-1" data-week-boundary="'+(weekIndex===0)+'" '+(weekIndex===0?'disabled':'')+' aria-label="Next week">&#8250;</button>'+
      '<span class="tag '+weekStatus.tone+' guide-week-status" data-week-status role="status" title="'+esc(weekSummary)+'">'+weekStatus.label+'</span></nav>'+
      (entries.length ? entries.map(entry=>'<article class="guide-weekly-card"><div data-entry="'+esc(entry.entryId)+'" class="guide-weekly-summary"><header class="guide-weekly-student-header"><div><strong>'+esc(entry.student)+'</strong><small>'+esc(entry.regNo)+'</small></div>'+decisionBadge(entry.status)+'<span>AI Quality <strong>'+ (entry.score===null?'—':esc(entry.score)+'/10')+'</strong></span><button type="button" class="app-btn btn-sm btn-secondary" data-details aria-expanded="false">View Details</button></header><p class="weekly-log-answer">'+esc(entry.discussion.length > 240 ? entry.discussion.slice(0,240)+'…' : entry.discussion)+'</p></div><div class="guide-weekly-detail" data-detail-row="'+esc(entry.entryId)+'" hidden><div></div></div><div class="guide-weekly-actions" data-sign-entry="'+esc(entry.entryId)+'"><span>Did you discuss this update with the student?</span>'+['NOT_DISCUSSED','DISCUSSED'].map(status=>'<button type="button" class="app-btn btn-sm '+(entry.status===status?'btn-success':'btn-secondary')+'" data-sign="'+status+'" aria-pressed="'+(entry.status===status)+'">'+(status==='DISCUSSED'?'Discussed':'Not Discussed')+'</button>').join('')+'</div></article>').join(''):'<p>No weekly submissions for this team in the selected week.</p>');
    target.querySelectorAll('[data-week-step]').forEach(button=>button.onclick=()=>{if(node.busy || button.disabled)return;const next=node.data.weeks[weekIndex+Number(button.dataset.weekStep)];if(next){node.week=next;render(node);}});
    target.querySelectorAll('[data-sign]').forEach(button=>button.onclick=()=>sign(node,button));
    target.querySelectorAll('[data-details]').forEach(button=>button.onclick=()=>details(node,button));
  }
  function sign(node,button) {
    if(node.busy)return;
    node.busy=true;controls(node,true);
    const entryId=button.closest('[data-sign-entry]').dataset.signEntry,status=button.dataset.sign;
    const output=node.querySelector('[data-guide-weekly-status]');output.textContent='Saving guide confirmation…';
    rpc('submitWeeklyGuideSignoff',[entryId,status],result=>{
      node.busy=false;controls(node,false);if(!current(node))return;
      node.data.entries.find(entry=>entry.entryId===entryId).status=result.status;
      render(node);updateAttention();output.textContent=result.message;
    },error=>{node.busy=false;controls(node,false);if(current(node))output.textContent='Could not save confirmation: '+message(error);});
  }
  function details(node,button) {
    if(node.busy)return;
    const row=button.closest('[data-entry]'),entryId=row.dataset.entry,detail=row.nextElementSibling,target=detail.firstElementChild;
    if(!detail.hidden){detail.hidden=true;button.setAttribute('aria-expanded','false');button.textContent='View Details';return;}
    detail.hidden=false;button.setAttribute('aria-expanded','true');button.textContent='Collapse';
    if(target.dataset.loaded)return;
    node.busy=true;controls(node,true);
    const finish=DashboardUI.beginContentLoading(target,'Reading weekly details',{compact:true});
    const settle=()=>{finish();node.busy=false;controls(node,false);};
    rpc('loadGuideWeeklyProgressDetails',[entryId],data=>{
      settle();if(!current(node)||!target.isConnected)return;
      const fields=[['workCompleted','Work Completed'],['guideDiscussion','Guide Discussion/Decision'],['blockers','Problems/Blockers'],['nextAction','Next Week Plan']];
      target.innerHTML='<div class="guide-weekly-fields">'+fields.map(([key,label])=>'<section><h4>'+label+'</h4><p class="weekly-log-answer">'+esc(data[key])+'</p></section>').join('')+'</div>'+
        '<h4>AI Quality</h4>'+(data.analysis?'<p>'+esc(data.analysis.score)+'/10 — '+esc(data.analysis.comment)+'</p><dl>'+[['technical_substance','Technical substance'],['specificity','Specificity'],['outcome','Outcome'],['next_action','Next action'],['github_support','GitHub support']].map(([key,label])=>'<dt>'+label+'</dt><dd>'+esc(data.analysis[key])+'</dd>').join('')+'</dl>':'<p>—</p>')+
        '<h4>GitHub evidence</h4>'+(data.evidence.state==='available'?'<ul>'+data.evidence.commits.map(commit=>'<li>'+esc(new Date(commit.timestamp).toLocaleString('en-IN',{timeZone:data.timezone,hour12:true}))+' | '+esc(commit.message)+' | <a href="'+esc(commit.url)+'" target="_blank" rel="noopener noreferrer">'+esc(commit.shortSha)+'</a></li>').join('')+'</ul>':'<p>'+esc(data.evidence.message||'GitHub evidence unavailable.')+'</p>');
      target.dataset.loaded='true';
    },error=>{
      settle();if(!current(node)||!target.isConnected)return;
      target.textContent='Could not read details: '+message(error)+' Close and reopen View Details to retry.';
    });
  }
  return {load,selectTeam,selectView,evaluationStatus};
}
function weeklyPhase2SetupBrowser_() {
  const host=()=>document.getElementById('weeklyPhase2Setup');
  function rpc(method,success,failure) {
    try { DashboardUI.guideRun().withSuccessHandler(success).withFailureHandler(failure)[method](); }
    catch(error) { failure(error); }
  }
  function controls(node,disabled) { node.querySelectorAll('button').forEach(button=>{button.disabled=disabled || button.dataset.allowed!=='true';}); }
  function current(node) { return node.isConnected && host()===node; }
  function load() {
    const node=host();if(!node || node.busy)return;
    node.busy=true;controls(node,true);
    const finish=DashboardUI.beginContentLoading(node.querySelector('[data-weekly-setup-read]'),'Checking weekly progress setup',{compact:true,variant:'status'});
    function settle(){finish();node.busy=false;controls(node,false);}
    rpc('getWeeklyProgressPhase2Readiness',report=>{
      settle();if(!current(node))return;
      const target=node.querySelector('[data-weekly-setup-read]');target.textContent='';
      const summary=document.createElement('p');summary.textContent='Storage: '+(report.storageReady?'Ready':'Needs setup')+' · AI schedule: '+(report.triggerReady===true?'Ready':report.triggerReady===null?'Check with trigger owner':'Needs setup');target.appendChild(summary);
      const actions=document.createElement('div');actions.className='assessment-storage-controls';target.appendChild(actions);
      [['storage',report.storageReady,report.canSetupStorage,'Create weekly progress storage'],['triggers',report.triggerReady!==false,report.canSetupTriggers,'Create weekly AI schedule']].forEach(([kind,ready,allowed,label])=>{
        if(ready)return;
        const button=document.createElement('button');button.type='button';button.className='app-btn btn-md btn-primary';button.textContent=label;button.dataset.allowed=String(allowed);button.disabled=!allowed;button.onclick=()=>setup(node,kind);actions.appendChild(button);
      });
      report.issues.forEach(issue=>{const line=document.createElement('p');line.textContent=issue;target.appendChild(line);});
      if(node.readError){node.querySelector('[data-weekly-setup-status]').textContent='';node.readError=false;}
    },error=>{
      settle();if(!current(node))return;
      node.readError=true;node.querySelector('[data-weekly-setup-status]').textContent='Could not check weekly setup: '+(error?.message || String(error))+'. Use Recheck to retry.';
    });
  }
  function setup(node,kind) {
    if(node.busy || !current(node))return;
    node.busy=true;controls(node,true);
    const status=node.querySelector('[data-weekly-setup-status]');status.textContent='Preparing weekly '+(kind==='storage'?'progress storage':'AI schedule')+'…';
    const method=kind==='storage'?'setupWeeklyProgressPhase2Storage':'setupWeeklyProgressPhase2Triggers';
    function settle(message){node.busy=false;controls(node,false);if(!current(node))return;status.textContent=message;load();}
    rpc(method,()=>settle('Weekly '+(kind==='storage'?'progress storage':'AI schedule')+' is ready.'),error=>settle('Setup stopped: '+(error?.message || String(error))));
  }
  return {load};
}
function getGuideWeeklyClientScript_() { return 'const GuideWeekly = ('+guideWeeklyBrowser_.toString()+')();\nconst WeeklyPhase2Setup = ('+weeklyPhase2SetupBrowser_.toString()+')();'; }
