function buildInternalAssessmentPublishing_(key) {
  const config=internalPublishingConfig_(key);
  return '<section class="assessment-section internal-publishing" data-publishing="'+key+'" aria-labelledby="'+key+'PublishingHeading"><header class="publishing-heading"><div><span class="publishing-eyebrow">Internal assessment · Publication</span><h3 id="'+key+'PublishingHeading">'+escapeHtml(config.title)+'</h3><p>Publish results using the assessment’s existing publication rules.</p></div><button type="button" data-refresh onclick="InternalAssessmentPublishing.refresh(\''+key+'\')">Refresh evaluations</button></header><div data-notice role="status" aria-live="polite"></div><div data-publishing-content>'+getSkeletonMarkup_('panel','Reading '+config.title+' publication status')+'</div></section>';
}

function internalAssessmentPublishingBrowser_() {
  const states=new Map();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stateLabels={AWAITING_EVALUATION:'Awaiting evaluation',READY_TO_PUBLISH:'Ready to publish',PARTIAL_OR_EXCEPTION:'Needs attention',PARTIALLY_PUBLISHED:'Partial / updates pending',PUBLISHED:'Published'};
  const publicationLabels={NOT_PUBLISHED:'Not published',PUBLISHED:'Published',UPDATE_PENDING:'Published · update pending'};
  const academicLabels={COMPLETED:'Complete',MAKEUP_PENDING:'Makeup pending',COMPLETED_AFTER_MAKEUP:'Complete after makeup',ABSENT_UNAPPROVED:'Unapproved absence',ACADEMIC_DECISION_PENDING:'Academic decision pending',NON_PARTICIPATION:'Non-participation',INCOMPLETE:'Incomplete'};
  const label=value=>academicLabels[value]||value;
  const mark=value=>value===null || value===undefined?'Pending':String(value);
  function state(key) {
    if(!states.has(key))states.set(key,{busy:false,generation:0,query:'',filter:'all',open:new Set(),requests:new Map(),outcomes:new Map(),report:null});
    return states.get(key);
  }
  function rpc(method,args) {
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);callback(value);};
      const timer=setTimeout(()=>finish(reject,{message:'No response received. The operation may have completed.',uncertain:true}),45000);
      try {DashboardUI.guideRun().withSuccessHandler(value=>finish(resolve,value)).withFailureHandler(error=>finish(reject,error))[method](...args);}
      catch(error){finish(reject,error);}
    });
  }
  function knownRejection(error) {
    return !error.uncertain && /changed|not available|Unknown student|Coordinator access|Sign in|missing|ambiguous|Invalid request|Request ID|Another evaluation|roster|headers|payload is too large/i.test(error.message||'');
  }
  async function runSequence(jobs,send,progress=()=>{}) {
    const results=[];
    for(const job of jobs){
      try {await send(job.method,[job.input]);results.push({...job,outcome:'success'});}
      catch(error){results.push({...job,outcome:knownRejection(error)?'failed':'uncertain',error:error.message||String(error)});}
      progress(results.slice());
    }
    return results;
  }
  function effectiveState(team,s) {return s.outcomes.has(team.team) && s.outcomes.get(team.team).some(r=>r.outcome!=='success')?'PARTIAL_OR_EXCEPTION':team.publicationState;}
  function summary(team) {
    const counts=new Map();team.students.forEach(student=>{const text=label(student.assessmentStatus);counts.set(text,(counts.get(text)||0)+1);});
    return Array.from(counts,([text,count])=>count+' '+text).join(', ')||'No roster students';
  }
  function studentResults(team,resultsOnly=false) {
    if(!team.students.length)return resultsOnly?'—':'No roster students';
    return '<ul class="publishing-student-results">'+team.students.map(student=>{
      const identity=(student.name||'Name unavailable')+' ('+student.register+')';
      const resolved=student.assessmentComplete && student.total!==null && student.total!==undefined;
      const result=resolved?mark(student.total)+(student.maximum!==null && student.maximum!==undefined?' / '+mark(student.maximum):''):'Pending';
      return '<li>'+(resultsOnly?'<span class="publishing-score" aria-label="'+escape(identity+': '+result)+'">'+escape(result)+'</span>':'<span class="publishing-student-identity">'+escape(identity)+'</span>')+'</li>';
    }).join('')+'</ul>';
  }
  function actionButton(icon,text,attributes,classes='') {
    return '<button type="button" class="publishing-icon-action '+classes+'" '+attributes+' data-tooltip="'+escape(text)+'" aria-label="'+escape(text)+'">'+DashboardUI.renderIcon(icon)+'</button>';
  }
  function publicationTooltip(details) {
    return details?' tabindex="0" data-tooltip="'+escape(details)+'"':'';
  }
  function teamAction(team,index,config) {
    if(!team.canPublishTeam)return '';
    const text=config.teamPublication==='sequential' && team.students.some(s=>s.publicationPermission!=='ALLOWED')?'Publish eligible students':'Publish Team';
    return actionButton('megaphone',text+' · '+team.displayTeam,'data-publish="'+index+'"','publishing-primary');
  }
  function markup(report,s) {
    const teams=report.teams,config=report.config;
    const count=values=>teams.filter(team=>values.includes(effectiveState(team,s))).length;
    const metrics=[['Total teams',teams.length],['Awaiting evaluation',count(['AWAITING_EVALUATION'])],['Ready to publish',count(['READY_TO_PUBLISH'])],['Exceptions / partial',count(['PARTIAL_OR_EXCEPTION','PARTIALLY_PUBLISHED'])],['Published',count(['PUBLISHED'])]];
    return '<div class="publishing-stats">'+metrics.map(([title,value])=>'<div><span>'+title+'</span><strong>'+value+'</strong></div>').join('')+'</div><div class="publishing-toolbar"><label>Find a team or student<input type="search" data-search placeholder="Team, register number or name" value="'+escape(s.query)+'"></label><label>Publication status<select data-filter>'+[['all','All statuses'],['AWAITING_EVALUATION','Awaiting evaluation'],['READY_TO_PUBLISH','Ready to publish'],['exceptions','Exceptions / partial'],['PUBLISHED','Published']].map(([value,text])=>'<option value="'+value+'"'+(value===s.filter?' selected':'')+'>'+text+'</option>').join('')+'</select></label><span data-count role="status"></span></div><div class="publishing-table-wrap"><table class="publishing-table"><caption class="publishing-sr-only">'+escape(config.title)+' publication teams</caption><thead><tr><th scope="col">Team</th><th scope="col">Students</th><th scope="col">Result</th><th scope="col">Assessment</th><th scope="col">Publication</th><th scope="col">Action</th></tr></thead>'+teams.map((team,index)=>{
      const open=s.open.has(team.team),status=effectiveState(team,s),outcomes=s.outcomes.get(team.team);
      return '<tbody data-team="'+index+'"><tr><th scope="row">'+escape(team.displayTeam)+'</th><td class="publishing-registers">'+studentResults(team)+'</td><td class="publishing-results">'+studentResults(team,true)+'</td><td class="publishing-academic">'+escape(summary(team))+'</td><td><span class="publishing-badge" data-state="'+status+'"'+publicationTooltip(team.canPublishTeam?'Publication permitted':'')+'>'+stateLabels[status]+'</span></td><td><div class="publishing-actions">'+teamAction(team,index,config)+''+actionButton('eye',(status==='PARTIAL_OR_EXCEPTION' || status==='PARTIALLY_PUBLISHED'?'Review':'Details')+' · '+team.displayTeam,'data-details="'+index+'" aria-expanded="'+open+'" aria-controls="'+config.key+'Team'+index+'"','publishing-details')+'</div></td></tr><tr id="'+config.key+'Team'+index+'" data-detail-row'+(open?'':' hidden')+'><td colspan="6"><div class="publishing-detail">'+team.issues.map(issue=>'<p class="publishing-error">'+escape(issue)+'</p>').join('')+(outcomes?'<div class="publishing-result" role="status">'+outcomeText(outcomes)+(outcomes.some(r=>r.outcome!=='success')?' <button type="button" data-retry-operation="'+index+'">Retry unsuccessful requests</button>':'')+'</div>':'')+'<div class="publishing-table-wrap"><table class="publishing-students"><caption class="publishing-sr-only">Students in '+escape(team.displayTeam)+'</caption><thead><tr><th scope="col">Student</th><th scope="col">Assessment</th><th scope="col">Permission</th><th scope="col">Publication</th><th scope="col">Action</th></tr></thead><tbody>'+team.students.map((student,j)=>'<tr><th scope="row">'+escape(student.name||student.register)+'<small>'+escape(student.register)+'</small></th><td>'+escape(label(student.assessmentStatus))+'<small>Total: '+escape(mark(student.total))+' · Contribution: '+escape(mark(student.weighted))+'</small></td><td>'+(student.publicationPermission==='ALLOWED'?'<span class="publishing-allowed">Allowed under current policy</span>':'<span>'+escape(student.publicationStatus==='PUBLISHED'?'No publication needed':student.blockingReason)+'</span>')+'</td><td><span'+publicationTooltip(student.hasPublishedSnapshot && student.needsPublication?'Students still see the previous publication.':'')+'>'+publicationLabels[student.publicationStatus]+'</span></td><td><div class="publishing-actions">'+(student.publicationPermission==='ALLOWED' && student.needsPublication?actionButton('megaphone','Publish · '+student.register,'data-publish="'+index+'" data-student="'+j+'"'):'')+(config.reopenScope==='student' && student.canReopen?actionButton('refresh-cw','Reopen student · '+student.register,'data-reopen="'+index+'" data-student="'+j+'"','publishing-reopen'):'')+'</div></td></tr>'+((student.decisions||[]).length?'<tr><td colspan="5"><div class="publishing-history-context">'+escape(student.name||student.register)+' ('+escape(student.register)+')</div>'+DashboardUI.renderAssessmentHistory(student.decisions)+'</td></tr>':'')).join('')+'</tbody></table></div>'+(team.canReopen?'<div class="publishing-secondary"><span>Reopening clears scores and withdraws the existing published review.</span>'+actionButton('refresh-cw','Reopen full review · '+team.displayTeam,'data-reopen="'+index+'"','publishing-reopen')+'</div>':'')+'</div></td></tr></tbody>';
    }).join('')+'</table></div><div class="publishing-empty" data-empty hidden><strong>'+(!teams.length?'No teams in the current roster':'No matching teams')+'</strong><p>'+(!teams.length?'Add roster data before publishing results.':'Try a different search or publication status.')+'</p></div>';
  }
  function outcomeText(results) {
    const count=kind=>results.filter(r=>r.outcome===kind).length;
    const description=results.every(r=>r.method==='publishGuideEvaluation')?' students published successfully':results.every(r=>/reopen/i.test(r.method||''))?' reopening requests confirmed':' publication requests confirmed';
    return count('success')+'/'+results.length+description+(count('failed')?' · '+count('failed')+' failed':'')+(count('uncertain')?' · '+count('uncertain')+' unconfirmed; refresh or retry to verify':'')+results.filter(r=>r.outcome!=='success').map(r=>'<small>'+escape(r.input.student||r.input.team)+': '+escape(r.error)+'</small>').join('');
  }
  function root(key){return document.querySelector('[data-publishing="'+key+'"]');}
  function disable(section,value){section.querySelectorAll('button,input,select').forEach(node=>node.disabled=value);}
  function notice(section,text,error=false){const node=section.querySelector('[data-notice]');node.textContent=text;node.className=error?'publishing-error':'';}
  function render(section,s) {
    const host=section.querySelector('[data-publishing-content]');host.innerHTML=markup(s.report,s);
    host.querySelectorAll('.publishing-table-wrap').forEach((wrapper,index)=>{wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label',index?'Student publication details, scroll horizontally':'Team publication table, scroll horizontally');});
    const hint=document.createElement('p');hint.className='publishing-scroll-hint';hint.textContent='Scroll horizontally to see publication status and actions.';host.querySelector('.publishing-table-wrap').before(hint);
    const apply=()=>{
      s.query=host.querySelector('[data-search]').value;s.filter=host.querySelector('[data-filter]').value;const query=s.query.trim().toLowerCase();let count=0;
      host.querySelectorAll('[data-team]').forEach(node=>{const team=s.report.teams[Number(node.dataset.team)],status=effectiveState(team,s),match=s.filter==='all' || s.filter===status || s.filter==='exceptions' && ['PARTIAL_OR_EXCEPTION','PARTIALLY_PUBLISHED'].includes(status);
        node.hidden=!match || ![team.displayTeam,...team.students.flatMap(student=>[student.name,student.register])].some(value=>String(value).toLowerCase().includes(query));if(!node.hidden)count++;
      });host.querySelector('[data-count]').textContent=count+' of '+s.report.teams.length+' teams';host.querySelector('[data-empty]').hidden=count!==0;
    };
    host.querySelector('[data-search]').addEventListener('input',apply);host.querySelector('[data-filter]').addEventListener('change',apply);apply();
    host.querySelectorAll('[data-details]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.details),team=s.report.teams[index],open=!s.open.has(team.team);if(open)s.open.add(team.team);else s.open.delete(team.team);button.setAttribute('aria-expanded',String(open));host.querySelectorAll('[data-detail-row]')[index].hidden=!open;});
    host.querySelectorAll('[data-publish],[data-reopen]').forEach(button=>button.onclick=()=>act(s.report.config.key,button));
    host.querySelectorAll('[data-retry-operation]').forEach(button=>button.onclick=()=>retry(s.report.config.key,Number(button.dataset.retryOperation)));
  }
  function reconcile(s) {
    if(s.report.config.teamPublication!=='sequential')return;
    s.report.teams.forEach(team=>{
      const results=s.outcomes.get(team.team);if(!results)return;
      results.forEach(result=>{const student=team.students.find(member=>member.register===result.input.student);if(student && student.publishedRequestId===result.input.requestId)result.outcome='success';});
    });
  }
  async function refresh(key) {
    const s=state(key),section=root(key);if(!section || s.busy)return;
    s.busy=true;const generation=++s.generation,host=section.querySelector('[data-publishing-content]'),hadContent=!!host.querySelector('[data-search]');disable(section,true);
    const finish=DashboardUI.beginContentLoading(host,'Reading publication status');
    try {
      const report=await rpc('loadInternalAssessmentPublishing',[key]);finish();
      if(!section.isConnected || generation!==s.generation)return;
      if(!report.ready)throw new Error(report.error||'Assessment configuration is unavailable.');
      s.report=report;reconcile(s);render(section,s);notice(section,'');
    } catch(error){finish();if(section.isConnected && generation===s.generation){if(!hadContent)host.innerHTML='<p class="publishing-empty">Publication data is unavailable. Retry to read the current records.</p>';notice(section,'Unable to refresh: '+error.message+' ',true);const button=document.createElement('button');button.type='button';button.textContent='Retry';button.onclick=()=>refresh(key);section.querySelector('[data-notice]').appendChild(button);}}
    finally{finish();s.busy=false;if(section.isConnected)disable(section,false);}
  }
  function job(s,method,input) {
    const signature=JSON.stringify({method,input});
    if(!s.requests.has(signature))s.requests.set(signature,{method,input:{...input,requestId:window.crypto.randomUUID()}});
    return s.requests.get(signature);
  }
  async function execute(key,section,s,team,jobs,verb) {
    notice(section,verb+'…');
    const results=await runSequence(jobs,rpc,done=>{if(section.isConnected)notice(section,verb+': '+done.length+'/'+jobs.length+' requests settled.');});
    s.outcomes.set(team.team,results);if(results.some(r=>r.outcome!=='success'))s.open.add(team.team);
    s.busy=false;if(section.isConnected){disable(section,false);await refresh(key);if(section.isConnected){const node=section.querySelector('[data-notice]');const summary=document.createElement('div');summary.innerHTML=verb==='Reopening'?(results.every(r=>r.outcome==='success')?'Evaluation reopened.':outcomeText(results)):outcomeText(s.outcomes.get(team.team));node.appendChild(summary);}}
  }
  async function act(key,button) {
    const s=state(key),section=root(key);if(!section || s.busy || !s.report)return;
    s.busy=true;disable(section,true);
    try {
      const publish=button.hasAttribute('data-publish'),index=Number(publish?button.dataset.publish:button.dataset.reopen),team=s.report.teams[index],config=s.report.config;
      const student=button.hasAttribute('data-student')?team.students[Number(button.dataset.student)]:null;
      let jobs;
      if(publish){
        const selected=student?[student]:config.teamPublication==='native'?team.students:team.students.filter(member=>member.publicationPermission==='ALLOWED' && member.needsPublication);
        if(!selected.length || student && student.publicationPermission!=='ALLOWED' || !student && !team.canPublishTeam)return;
        const remaining=team.totalStudents-selected.length;
        const question='Publish '+config.title+' results for '+(student?student.name+' ('+student.register+')':selected.length+' eligible students')+' in '+team.displayTeam+'?'+(remaining?' '+remaining+' students will not be included.':'')+(selected.some(member=>!member.assessmentComplete)?' Pending academic statuses will remain visible.':'')+(!student && config.teamPublication==='native' && selected.some(member=>member.hasPublishedSnapshot)?' This republishes the team’s current results, including previously published students.':'');
        if(!await DashboardUI.ask(question))return;
        jobs=config.teamPublication==='sequential'?selected.map(member=>job(s,config.publishMethod,{team:team.team,student:member.register,revision:member.revision})):[job(s,config.publishMethod,{team:team.team,revision:team.revision,...(student?{student:student.register}:{})})];
      } else {
        const reason=await DashboardUI.requestText('Reason for reopening '+config.title+' '+(student?student.register:team.displayTeam)+' (scores will be cleared):');if(!reason || !reason.trim())return;
        jobs=[job(s,config.reopenMethod,{team:team.team,revision:student?student.revision:team.revision,...(student?{student:student.register}:{}),reason:reason.trim()})];
      }
      if(!section.isConnected)return;
      await execute(key,section,s,team,jobs,publish?'Publishing':'Reopening');
    } catch(error){if(section.isConnected)notice(section,error.message,true);}
    finally{s.busy=false;if(section.isConnected){disable(section,false);if(!button.isConnected){const index=button.dataset.publish??button.dataset.reopen;const fallback=section.querySelector('[data-details="'+index+'"]');if(fallback)fallback.focus();}}}
  }
  async function retry(key,index) {
    const s=state(key),section=root(key);if(!section || s.busy)return;
    s.busy=true;disable(section,true);
    try {
      const team=s.report.teams[index],old=s.outcomes.get(team.team)||[],jobs=old.filter(result=>result.outcome!=='success');
      if(!jobs.length || !await DashboardUI.ask('Retry '+jobs.length+' unsuccessful requests for '+team.displayTeam+' using their original request IDs?'))return;
      if(!section.isConnected)return;
      const results=await runSequence(jobs,rpc);s.outcomes.set(team.team,[...old.filter(result=>result.outcome==='success'),...results]);
      s.busy=false;await refresh(key);
    } catch(error){if(section.isConnected)notice(section,error.message,true);}
    finally{s.busy=false;if(section.isConnected)disable(section,false);}
  }
  return {refresh,runSequence,markup};
}
function getInternalAssessmentPublishingClientScript_() {
  return 'const InternalAssessmentPublishing = ('+internalAssessmentPublishingBrowser_.toString()+')();';
}
