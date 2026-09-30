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
    node.querySelectorAll('button,select').forEach(control=>{control.disabled=disabled;});
  }
  function load() {
    const node=host();if(!node || node.busy)return;
    node.busy=true;controls(node,true);
    const finish=DashboardUI.beginContentLoading(node.querySelector('[data-guide-weekly-read]'),'Reading weekly progress',{compact:true});
    const settle=()=>{finish();node.busy=false;controls(node,false);};
    rpc('loadGuideWeeklyProgress',[],data=>{
      settle();if(!current(node))return;
      node.data=data;
      if(!data.weeks.includes(node.week))node.week=data.weeks[0];
      node.querySelector('[data-guide-weekly-status]').textContent='';
      render(node);
      const updated=node.querySelector('#guide-weeklyUpdated');
      if(updated)updated.textContent='Updated '+new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:data.timezone,hour12:true});
    },error=>{
      settle();if(current(node))node.querySelector('[data-guide-weekly-status]').textContent='Could not read weekly progress: '+message(error)+' Use Refresh to retry.';
    });
  }
  function render(node) {
    const target=node.querySelector('[data-guide-weekly-read]');
    if(!node.data.entries.length){target.innerHTML='<p>No weekly submissions available.</p>';return;}
    const entries=node.data.entries.filter(entry=>entry.weekId===node.week);
    target.innerHTML='<label>Week <select data-week>'+node.data.weeks.map(week=>'<option value="'+esc(week)+'"'+(week===node.week?' selected':'')+'>'+esc(week)+'</option>').join('')+'</select></label>'+
      '<p>Either confirmation freezes further student revisions for that week.</p><div class="tracker-table-scroll" role="region" aria-label="Weekly progress" tabindex="0"><table class="coord-table"><thead><tr>'+['Student','Guide Discussion/Decision','AI Quality','Discussed','Not Discussed'].map(label=>'<th scope="col">'+label+'</th>').join('')+'</tr></thead><tbody>'+
      entries.map(entry=>'<tr data-entry="'+esc(entry.entryId)+'"><th scope="row">'+esc(entry.student)+'<br><small>'+esc(entry.regNo)+'</small><br><button type="button" class="app-btn btn-sm btn-secondary" data-details aria-expanded="false">View Details</button></th><td class="weekly-log-answer">'+esc(entry.discussion.length > 240 ? entry.discussion.slice(0,240)+'…' : entry.discussion)+'<br><small>'+esc(entry.status)+'</small></td><td>'+ (entry.score===null?'—':esc(entry.score)+'/10')+'</td>'+['DISCUSSED','NOT_DISCUSSED'].map(status=>'<td><button type="button" class="app-btn btn-sm '+(entry.status===status?'btn-success':'btn-secondary')+'" data-sign="'+status+'" aria-pressed="'+(entry.status===status)+'">'+(status==='DISCUSSED'?'Discussed':'Not Discussed')+'</button></td>').join('')+'</tr><tr data-detail-row="'+esc(entry.entryId)+'" hidden><td colspan="5"></td></tr>').join('')+'</tbody></table></div>';
    target.querySelector('[data-week]').onchange=event=>{if(node.busy)return;node.week=event.target.value;render(node);};
    target.querySelectorAll('[data-sign]').forEach(button=>button.onclick=()=>sign(node,button));
    target.querySelectorAll('[data-details]').forEach(button=>button.onclick=()=>details(node,button));
  }
  function sign(node,button) {
    if(node.busy)return;
    node.busy=true;controls(node,true);
    const entryId=button.closest('[data-entry]').dataset.entry,status=button.dataset.sign;
    const output=node.querySelector('[data-guide-weekly-status]');output.textContent='Saving guide confirmation…';
    rpc('submitWeeklyGuideSignoff',[entryId,status],result=>{
      node.busy=false;controls(node,false);if(!current(node))return;
      node.data.entries.find(entry=>entry.entryId===entryId).status=result.status;
      render(node);output.textContent=result.message;
    },error=>{node.busy=false;controls(node,false);if(current(node))output.textContent='Could not save confirmation: '+message(error);});
  }
  function details(node,button) {
    if(node.busy)return;
    const row=button.closest('[data-entry]'),entryId=row.dataset.entry,detail=row.nextElementSibling,target=detail.firstElementChild;
    if(!detail.hidden){detail.hidden=true;button.setAttribute('aria-expanded','false');return;}
    detail.hidden=false;button.setAttribute('aria-expanded','true');
    if(target.dataset.loaded)return;
    node.busy=true;controls(node,true);
    const finish=DashboardUI.beginContentLoading(target,'Reading weekly details',{compact:true});
    const settle=()=>{finish();node.busy=false;controls(node,false);};
    rpc('loadGuideWeeklyProgressDetails',[entryId],data=>{
      settle();if(!current(node)||!target.isConnected)return;
      const fields=[['workCompleted','Work Completed'],['guideDiscussion','Guide Discussion/Decision'],['blockers','Problems/Blockers'],['nextAction','Next Week Plan']];
      target.innerHTML=fields.map(([key,label])=>'<h4>'+label+'</h4><p class="weekly-log-answer">'+esc(data[key])+'</p>').join('')+
        '<h4>AI Quality</h4>'+(data.analysis?'<p>'+esc(data.analysis.score)+'/10 — '+esc(data.analysis.comment)+'</p><dl>'+[['technical_substance','Technical substance'],['specificity','Specificity'],['outcome','Outcome'],['next_action','Next action'],['github_support','GitHub support']].map(([key,label])=>'<dt>'+label+'</dt><dd>'+esc(data.analysis[key])+'</dd>').join('')+'</dl>':'<p>—</p>')+
        '<h4>GitHub evidence</h4>'+(data.evidence.state==='available'?'<ul>'+data.evidence.commits.map(commit=>'<li>'+esc(new Date(commit.timestamp).toLocaleString('en-IN',{timeZone:data.timezone,hour12:true}))+' | '+esc(commit.message)+' | '+esc(commit.sha)+'</li>').join('')+'</ul>':'<p>'+esc(data.evidence.message||'GitHub evidence unavailable.')+'</p>');
      target.dataset.loaded='true';
    },error=>{
      settle();if(!current(node)||!target.isConnected)return;
      target.textContent='Could not read details: '+message(error)+' Close and reopen View Details to retry.';
    });
  }
  return {load};
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
