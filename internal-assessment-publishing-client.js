function internalAssessmentPublishingBrowser_(bridge, table, xlsx) {
  const states=new Map();
  const FIELD='rounded-md border border-control px-3 py-1.5 text-sm font-normal';
  const SMALL='border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const ICON='border-0 inline-flex items-center justify-center rounded-md bg-paper p-1.5 text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const ICON_PRIMARY='border-0 inline-flex items-center justify-center rounded-md bg-primary p-1.5 text-paper hover:bg-primary-hover disabled:opacity-50';
  const BADGE='inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ';
  const STATE={AWAITING_EVALUATION:BADGE+'bg-soft text-ink-2 ring-control/20',READY_TO_PUBLISH:BADGE+'bg-info-tint text-info ring-info/20',PARTIAL_OR_EXCEPTION:BADGE+'bg-warning-tint text-warning ring-warning/20',PARTIALLY_PUBLISHED:BADGE+'bg-warning-tint text-warning ring-warning/20',PUBLISHED:BADGE+'bg-success-tint text-success ring-success/20'};
  const PAGE_BUTTON='inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border border-line bg-paper px-3 text-sm text-ink no-underline hover:bg-tint aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:font-semibold aria-[current=page]:text-paper disabled:pointer-events-none disabled:opacity-50';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stateLabels={AWAITING_EVALUATION:'Awaiting evaluation',READY_TO_PUBLISH:'Ready to publish',PARTIAL_OR_EXCEPTION:'Needs attention',PARTIALLY_PUBLISHED:'Partial / updates pending',PUBLISHED:'Published'};
  const publicationLabels={NOT_PUBLISHED:'Not published',PUBLISHED:'Published',UPDATE_PENDING:'Published · update pending'};
  const academicLabels={COMPLETED:'Complete',MAKEUP_PENDING:'Makeup pending',INCOMPLETE:'Incomplete'};
  const label=value=>academicLabels[value]||value;
  const mark=value=>value===null || value===undefined?'Pending':String(value);
  function state(key) {
    if(!states.has(key))states.set(key,{busy:false,generation:0,query:'',filter:'all',page:1,size:10,open:new Set(),requests:new Map(),outcomes:new Map(),report:null});
    return states.get(key);
  }
  function rpc(method,args) {
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);callback(value);};
      const timer=setTimeout(()=>finish(reject,{message:'No response received. The operation may have completed.',uncertain:true}),45000);
      try {
        const call=method==='loadInternalAssessmentPublishing_'?bridge.read('publishing:'+args[0],'API_publishing_get',[args[0]],{timeoutMs:120000}):bridge.write('API_publishing_run',[method,args[0]]);
        call.then(value=>finish(resolve,value),error=>finish(reject,error));
      }
      catch(error){finish(reject,error);}
    });
  }
  function knownRejection(error) {
    return !error.uncertain && /changed|not available|Unknown student|Coordinator access|Sign in|missing|ambiguous|Invalid request|Request ID|Another evaluation|roster|headers|REOPEN_INCOMPATIBLE|integrity|finalized|payload is too large/i.test(error.message||'');
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
  function componentSummary(student) {
    if(!student.components)return '';
    return Object.entries(student.components).map(([name,c])=>table.note(escape((name==='team'?'Team':'Individual')+': '+mark(c.score)+' · '+c.state+(c.source==='policy'?' · Policy-assigned zero':c.source==='makeup'?' · Individual Makeup':'')))).join('');
  }
  function studentResults(team) {
    if(!team.students.length)return '—';
    return '<ul data-student-results class="m-0 list-none p-0">'+team.students.map(student=>{
      const identity=(student.name||'Name unavailable')+' ('+student.register+')';
      const resolved=student.assessmentComplete && student.total!==null && student.total!==undefined;
      const result=resolved?mark(student.total)+(student.maximum!==null && student.maximum!==undefined?' / '+mark(student.maximum):''):'Pending';
      return '<li><span data-student-score aria-label="'+escape(identity+': '+result)+'">'+escape(result)+'</span></li>';
    }).join('')+'</ul>';
  }
  function actionButton(icon,text,attributes,classes='') {
    return '<button type="button" class="'+classes+' '+(attributes.includes('data-publish')?ICON_PRIMARY:ICON)+'" '+attributes+' data-tooltip="'+escape(text)+'" aria-label="'+escape(text)+'">'+DashboardUI.renderIcon(icon)+'</button>';
  }
  function publicationTooltip(details) {
    return details?' tabindex="0" data-tooltip="'+escape(details)+'"':'';
  }
  function teamAction(team,index,config) {
    if(!team.canPublishTeam)return '';
    const text=config.teamPublication==='sequential' && team.students.some(s=>s.publicationPermission!=='ALLOWED')?'Publish eligible students':'Publish Team';
    return actionButton('megaphone',text+' · '+team.displayTeam,'data-publish="'+index+'"');
  }

  function studentRows(team,student,j,index,config) {
    const permission=student.publicationPermission==='ALLOWED'?'<span>Allowed under current policy</span>':'<span>'+escape(student.publicationStatus==='PUBLISHED'?'No publication needed':student.blockingReason)+'</span>';
    const actions=(student.publicationPermission==='ALLOWED' && student.needsPublication?actionButton('megaphone','Publish · '+student.register,'data-publish="'+index+'" data-student="'+j+'"'):'')+(config.reopenScope==='student' && student.canReopen?actionButton('refresh-cw','Reopen student · '+student.register,'data-reopen="'+index+'" data-student="'+j+'"','publishing-reopen'):'');
    const main=table.row([
      table.rowHeader(escape(student.name||student.register)+table.note(escape(student.register))),
      table.td(escape(label(student.assessmentStatus))+table.note('Total: '+escape(mark(student.total))+' · Contribution: '+escape(mark(student.weighted)))+componentSummary(student)),
      table.td(permission),
      table.td('<span'+publicationTooltip(student.hasPublishedSnapshot && student.needsPublication?'Students still see the previous publication.':'')+'>'+publicationLabels[student.publicationStatus]+(student.underCorrection?' · Under correction':'')+'</span>'),
      table.td('<div class="flex gap-1">'+actions+'</div>')
    ]);
    const history=(student.decisions||[]).length?table.row([table.spanCell('<div class="publishing-history-context">'+escape(student.name||student.register)+' ('+escape(student.register)+')</div>'+renderAssessmentHistory_(student.decisions),5)]):'';
    return main+history;
  }
  function teamBody(team,index,config,s) {
    const open=s.open.has(team.team),status=effectiveState(team,s),outcomes=s.outcomes.get(team.team);
    const main=table.row([
      ...table.teamCells({teamId:team.displayTeam,students:team.students.map(student=>({name:student.name,regNo:student.register})),guide:team.guideName},{studentAttrs:{'data-student-identity':true},studentsCellAttrs:{'data-registers':true}}),
      table.td(studentResults(team),{'data-results':true}),
      table.td(escape(summary(team))),
      table.td('<span data-state="'+status+'" class="'+STATE[status]+'"'+publicationTooltip(team.canPublishTeam?'Publication permitted':'')+'>'+stateLabels[status]+'</span>'),
      table.td('<div class="flex gap-1">'+teamAction(team,index,config)+actionButton('eye',(status==='PARTIAL_OR_EXCEPTION' || status==='PARTIALLY_PUBLISHED'?'Review':'Details')+' · '+team.displayTeam,'data-details="'+index+'" aria-expanded="'+open+'" aria-controls="'+config.key+'Team'+index+'"')+'</div>')
    ]);
    const students=table.table({label:'Students in '+team.displayTeam,wrapAttrs:{'data-publishing-table-wrap':true},head:table.head(['Student','Assessment','Permission','Publication','Action']),body:table.tbody(team.students.map((student,j)=>studentRows(team,student,j,index,config)).join(''))});
    const detail=table.row([table.spanCell('<div>'+team.issues.map(issue=>'<p class="m-0 text-sm text-danger">'+escape(issue)+'</p>').join('')+(outcomes?'<div role="status" class="mt-2 text-sm text-ink-2">'+outcomeText(outcomes)+(outcomes.some(r=>r.outcome!=='success')?' <button class="'+SMALL+'" type="button" data-retry-operation="'+index+'">Retry unsuccessful requests</button>':'')+'</div>':'')+students+(team.reopenReason&&!team.canReopen?'<p class="m-0 mt-2 text-sm text-muted">'+escape('Reopening unavailable: '+team.reopenReason)+'</p>':'')+(team.canReopen?'<div class="flex items-center gap-2 py-2 text-xs text-muted"><span>'+escape(config.reopenDescription)+'</span>'+actionButton('refresh-cw','Reopen assessment · '+team.displayTeam,'data-reopen="'+index+'"','publishing-reopen')+'</div>':'')+'</div>',7)],{id:config.key+'Team'+index,'data-detail-row':true,hidden:!open});
    return table.tbody(main+detail,{'data-team':index});
  }
  function markup(report,s) {
    const teams=report.teams,config=report.config;
    const count=values=>teams.filter(team=>values.includes(effectiveState(team,s))).length;
    const metrics=[['Total teams',teams.length],['Awaiting evaluation',count(['AWAITING_EVALUATION'])],['Ready to publish',count(['READY_TO_PUBLISH'])],['Exceptions / partial',count(['PARTIAL_OR_EXCEPTION','PARTIALLY_PUBLISHED'])],['Published',count(['PUBLISHED'])]];
    return '<div class="publishing-stats mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-tile border border-edge bg-edge sm:grid-cols-5">'+metrics.map(([title,value])=>'<div class="flex flex-col bg-paper px-3 py-2"><span class="text-xs text-muted">'+title+'</span><strong class="text-lg text-ink">'+value+'</strong></div>').join('')+'</div><div class="mb-3 flex flex-wrap items-end gap-3"><label class="flex flex-col gap-1 text-sm font-semibold">Find a team or student<input class="'+FIELD+'" type="search" data-search placeholder="Team, register number or name" value="'+escape(s.query)+'"></label><label class="flex flex-col gap-1 text-sm font-semibold">Publication status<select class="'+FIELD+'" data-filter>'+[['all','All statuses'],['AWAITING_EVALUATION','Awaiting evaluation'],['READY_TO_PUBLISH','Ready to publish'],['exceptions','Exceptions / partial'],['PUBLISHED','Published']].map(([value,text])=>'<option value="'+value+'"'+(value===s.filter?' selected':'')+'>'+text+'</option>').join('')+'</select></label><span data-count role="status" class="text-sm text-muted"></span></div>'+table.table({label:config.title+' publication teams',wrapAttrs:{'data-publishing-table-wrap':true},head:table.head([...table.TEAM_COLUMNS,'Result','Assessment','Publication','Action']),body:teams.map((team,index)=>teamBody(team,index,config,s)).join('')})+'<nav aria-label="Pagination" class="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"><span data-page-info>Showing 0 - 0 of 0 teams</span><label class="flex items-center gap-2">Rows per page <select data-page-size class="rounded-md border border-control px-2 py-1">'+[['10','10'],['25','25'],['50','50'],['all','All']].map(([value,text])=>'<option value="'+value+'"'+(String(s.size)===value?' selected':'')+'>'+text+'</option>').join('')+'</select></label><div data-page-buttons class="flex items-center gap-1" aria-label="Team table pages"></div></nav><div data-empty hidden><strong>'+(!teams.length?'No teams in the current roster':'No matching teams')+'</strong><p>'+(!teams.length?'Add roster data before publishing results.':'Try a different search or publication status.')+'</p></div>';
  }
  function outcomeText(results) {
    const count=kind=>results.filter(r=>r.outcome===kind).length;
    const description=results.every(r=>/reopen/i.test(r.method||''))?' reopening requests confirmed':' publication requests confirmed';
    return count('success')+'/'+results.length+description+(count('failed')?' · '+count('failed')+' failed':'')+(count('uncertain')?' · '+count('uncertain')+' unconfirmed; refresh or retry to verify':'')+results.filter(r=>r.outcome!=='success').map(r=>table.note(escape(r.input.student||r.input.team)+': '+escape(r.error))).join('');
  }
  /** One delegated listener per publication card (content and notices). */
  function attachActions(section) {
    if(section.actionsAttached)return;
    section.actionsAttached=true;
    section.addEventListener('click',event=>{
      const button=event.target.closest && event.target.closest('button');
      if(!button || !section.contains(button))return;
      const key=section.dataset.publishing,s=state(key),host=section.querySelector('[data-publishing-content]');
      if(button.hasAttribute('data-page')){s.page=Number(button.dataset.page);applyFilter(section,s);}
      else if(button.hasAttribute('data-details')){const index=Number(button.dataset.details),team=s.report.teams[index],open=!s.open.has(team.team);if(open)s.open.add(team.team);else s.open.delete(team.team);button.setAttribute('aria-expanded',String(open));host.querySelectorAll('[data-detail-row]')[index].hidden=!open;}
      else if(button.hasAttribute('data-publish') || button.hasAttribute('data-reopen'))act(key,button);
      else if(button.hasAttribute('data-retry-operation'))retry(key,Number(button.dataset.retryOperation));
      else if(button.hasAttribute('data-retry-refresh'))refresh(key);
    });
    const filter=event=>{
      if(!event.target.matches || !event.target.matches('[data-search],[data-filter],[data-page-size]'))return;
      const s=state(section.dataset.publishing);if(!s.report)return;
      if(event.target.matches('[data-page-size]'))s.size=event.target.value==='all'?'all':Number(event.target.value);
      s.page=1;applyFilter(section,s);
    };
    section.addEventListener('input',filter);section.addEventListener('change',filter);
  }
  function root(key){return document.querySelector('[data-publishing="'+key+'"]');}
  function disable(section,value){section.querySelectorAll('button,input,select').forEach(node=>node.disabled=value);}
  function notice(section,text,error=false){const node=section.querySelector('[data-notice]');node.textContent=text;node.className=error?'mt-2 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger':'mt-2 text-sm text-ink-2';}
  function render(section,s) {
    const host=section.querySelector('[data-publishing-content]');host.innerHTML=markup(s.report,s);
    const hint=document.createElement('p');hint.className='publishing-scroll-hint m-0 hidden text-xs text-muted max-[640px]:block';hint.textContent='Scroll horizontally to see publication status and actions.';host.querySelector('[data-publishing-table-wrap]').before(hint);
    applyFilter(section,s);
  }
  /** Search and status filter over the rendered rows; driven by the section's delegated input/change listener. */
  function applyFilter(section,s) {
    const host=section.querySelector('[data-publishing-content]');
    s.query=host.querySelector('[data-search]').value;s.filter=host.querySelector('[data-filter]').value;const query=s.query.trim().toLowerCase();
    const matched=Array.from(host.querySelectorAll('[data-team]')).filter(node=>{const team=s.report.teams[Number(node.dataset.team)],status=effectiveState(team,s),match=s.filter==='all' || s.filter===status || s.filter==='exceptions' && ['PARTIAL_OR_EXCEPTION','PARTIALLY_PUBLISHED'].includes(status);
      return match && [team.displayTeam,...team.students.flatMap(student=>[student.name,student.register])].some(value=>String(value).toLowerCase().includes(query));
    });
    const size=s.size==='all'?Math.max(1,matched.length):s.size,pages=Math.max(1,Math.ceil(matched.length/size));
    s.page=Math.min(Math.max(1,s.page),pages);
    const start=(s.page-1)*size,end=Math.min(start+size,matched.length),shown=new Set(matched.slice(start,end));
    host.querySelectorAll('[data-team]').forEach(node=>{node.hidden=!shown.has(node);});
    host.querySelector('[data-count]').textContent=matched.length+' of '+s.report.teams.length+' teams';host.querySelector('[data-empty]').hidden=matched.length!==0;
    host.querySelector('[data-page-info]').textContent='Showing '+(matched.length?start+1:0)+' - '+end+' of '+matched.length+' teams';
    const page=(label,number,disabled,active)=>'<button type="button" class="'+PAGE_BUTTON+'" data-page="'+number+'"'+(disabled?' disabled':'')+(active?' aria-current="page"':'')+'>'+label+'</button>';
    const dots='<span class="px-1 text-muted">…</span>';
    let first=Math.max(1,s.page-2);const last=Math.min(pages,first+4);first=Math.max(1,last-4);
    let html=page(DashboardUI.renderIcon('chevron-left')+'Previous',s.page-1,s.page===1,false);
    if(first>1)html+=page('1',1,false,s.page===1)+(first>2?dots:'');
    for(let number=first;number<=last;number++)html+=page(String(number),number,false,number===s.page);
    if(last<pages)html+=(last<pages-1?dots:'')+page(String(pages),pages,false,s.page===pages);
    html+=page('Next'+DashboardUI.renderIcon('chevron-right'),s.page+1,s.page===pages,false);
    host.querySelector('[data-page-buttons]').innerHTML=html;
  }
  function reconcile(s) {
    s.report.teams.forEach(team=>{
      const results=s.outcomes.get(team.team);if(!results)return;
      results.forEach(result=>{if((team.operations||[]).some(op=>op.requestId===result.input.requestId))result.outcome='success';});
    });
  }
  async function refresh(key) {
    const s=state(key),section=root(key);if(!section || s.busy)return;
    attachActions(section);
    s.busy=true;const generation=++s.generation,host=section.querySelector('[data-publishing-content]'),hadContent=!!host.querySelector('[data-search]');disable(section,true);
    const finish=DashboardUI.beginContentLoading(host,'Reading publication status');
    try {
      const report=await rpc('loadInternalAssessmentPublishing_',[key]);finish();
      if(!section.isConnected || generation!==s.generation)return;
      if(!report.ready)throw new Error(report.error||'Assessment configuration is unavailable.');
      s.report=report;reconcile(s);render(section,s);notice(section,'');
    } catch(error){finish();if(section.isConnected && generation===s.generation){if(!hadContent)host.innerHTML='<p class="m-0 text-sm text-ink-2">Publication data is unavailable. Retry to read the current records.</p>';notice(section,'Unable to refresh: '+error.message+' ',true);const button=document.createElement('button');button.className=SMALL;button.type='button';button.textContent='Retry';button.setAttribute('data-retry-refresh','');section.querySelector('[data-notice]').appendChild(button);}}
    finally{finish();s.busy=false;if(section.isConnected)disable(section,false);}
  }
  function job(s,method,input) {
    const signature=JSON.stringify({method,input});
    if(!s.requests.has(signature))s.requests.set(signature,{method,input:{...input,requestId:window.crypto.randomUUID()}});
    return s.requests.get(signature);
  }
  function publishJobs(s,key,config,team,selected,student) {
    return config.teamPublication==='sequential'?selected.map(member=>job(s,config.publishMethod,{assessmentId:key,team:team.team,student:member.register,revision:member.revision})):[job(s,config.publishMethod,{assessmentId:key,team:team.team,revision:team.revision,...(student?{student:student.register}:{})})];
  }
  /** Publishes every team of one assessment that the per-team button would publish, one request at a time. `card` holds the status line. */
  /** The status line and the lock of a bulk card (Publish all, Download results); the card's assessment cards are locked with it. */
  function cardTools(key,card) {
    const section=root(key),status=card.querySelector('[data-publish-all-status]');
    return {
      section,
      say:(html,error=false)=>{status.className=error?'mt-2 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger':'mt-2 text-sm text-ink-2';status.innerHTML=html;},
      lock:value=>{card.querySelectorAll('button,select').forEach(node=>node.disabled=value);if(section)disable(section,value);}
    };
  }
  /** Reads the published results of one assessment and saves them as an Excel sheet: register number, name, a column per PI and the total. */
  async function downloadResults(key,card) {
    const s=state(key),{say,lock}=cardTools(key,card);
    if(s.busy)return;
    s.busy=true;lock(true);
    try {
      say('Preparing the results…');
      const data=await new Promise((resolve,reject)=>bridge.read('publishing-export:'+key,'API_publishing_export',[key],{timeoutMs:120000}).then(resolve,reject));
      const header=['Register Number','Name','Team ID',...data.criteria.map(c=>c.pi),'Total','Comments'];
      const rows=data.rows.map(row=>[row.register,row.name,row.team,...data.criteria.map(c=>row.scores[c.pi]),row.total,row.comments||'']);
      const safe=String(data.label||key).replace(/[\\/:*?"<>|]/g,' ').trim();
      const keySheet=[['Code','Meaning'],...(data.legend||[]).map(item=>[item.code,item.meaning])];
      xlsx.download(safe+' results.xlsx',xlsx.buildBook([{name:data.label||key,rows:[header,...rows],widths:[18,34,10,...data.criteria.map(()=>8),10,80],wrap:[header.length-1]},{name:'Key',rows:keySheet,widths:[10,90]}]));
      say(escape(rows.length+' students saved to '+safe+' results.xlsx. See the Key sheet for A, NE, NA, NS, NP and ERR.'));
    } catch(error){say(escape(error.message||String(error)),true);}
    finally{s.busy=false;lock(false);}
  }
  async function publishAll(key,card) {
    const s=state(key),{section,say,lock}=cardTools(key,card);
    if(s.busy)return;
    s.busy=true;lock(true);
    let done=false;
    try {
      say('Reading publication status…');
      const report=await rpc('loadInternalAssessmentPublishing_',[key]);
      if(!report.ready)throw new Error(report.error||'Assessment configuration is unavailable.');
      const config=report.config,teams=report.teams.filter(team=>team.canPublishTeam);
      if(!teams.length){say('Nothing to publish for '+escape(config.title)+'.');return;}
      const jobs=teams.flatMap(team=>{
        const selected=config.teamPublication==='native'?team.students:team.students.filter(member=>member.publicationPermission==='ALLOWED' && member.needsPublication);
        return publishJobs(s,key,config,team,selected,null);
      });
      if(!await DashboardUI.ask('Publish '+config.title+' results for '+teams.length+' '+(teams.length===1?'team':'teams')+'? Students not yet eligible are not included.')){say('');return;}
      const results=await runSequence(jobs,rpc,settled=>say('Publishing: '+settled.length+'/'+jobs.length+' requests settled.'));
      say(outcomeText(results),results.some(r=>r.outcome!=='success'));
      done=true;
    } catch(error){say(escape(error.message||String(error)),true);}
    finally{
      s.busy=false;lock(false);
      if(done && section && section.isConnected && s.report)refresh(key);
    }
  }
  async function execute(key,section,s,team,jobs,verb) {
    const noticeNode=()=>section.querySelector('[data-notice]');
    let stop=DashboardUI.busy.write(noticeNode(),verb+'…');
    let results;
    try {
      results=await runSequence(jobs,rpc,done=>{if(section.isConnected){stop();stop=DashboardUI.busy.write(noticeNode(),verb+': '+done.length+'/'+jobs.length+' requests settled.');}});
    } finally { stop(); }
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
        jobs=publishJobs(s,key,config,team,selected,student);
      } else {
        const reason=await DashboardUI.requestText('Reason for reopening '+config.title+' '+(student?student.register:team.displayTeam)+'. '+config.reopenDescription+' Reason:');if(!reason || !reason.trim())return;
        jobs=[job(s,config.reopenMethod,{assessmentId:key,team:team.team,revision:student?student.revision:team.revision,...(student?{student:student.register}:{}),reason:reason.trim()})];
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
  function toggle(key) {
    const section=root(key);if(!section)return;
    const button=section.querySelector('[data-publishing-toggle]'),body=section.querySelector('[data-publishing-body]');
    const expanded=button.getAttribute('aria-expanded')!=='true';
    body.hidden=!expanded;
    if(expanded && !section.querySelector('[data-search]'))refresh(key);
    button.setAttribute('aria-expanded',String(expanded));
    button.setAttribute('aria-label',(expanded?'Collapse ':'Expand ')+section.querySelector('h3').textContent+' publishing');
  }
  return {refresh,toggle,publishAll,downloadResults,runSequence,markup};
}
function getInternalAssessmentPublishingClientScript_() {
  return renderAssessmentHistory_.toString()+'\nconst InternalAssessmentPublishing = ('+internalAssessmentPublishingBrowser_.toString()+')(DataBridge, SharedTable, XlsxWriter);';
}
