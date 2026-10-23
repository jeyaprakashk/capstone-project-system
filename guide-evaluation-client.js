/* Browser module is serialized into the dashboard shell; no persistent browser storage. */
function guideEvaluationBrowser_(bridge, getWeekly) {
  let activePi=null, ownPi={}, loaded=null, reading=null, current=null, busy=false, generation=0, dirty=false, pending=null, detach=null;
  const el=id=>document.getElementById(id);
  const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const requestId=()=>crypto.randomUUID().replace(/-/g,'');
  const FIELD='mt-1.5 block h-10 w-full rounded-md border border-control bg-paper px-3 py-2 font-sans text-sm font-normal text-ink';
  const TEXTAREA='mt-1.5 block min-h-20 w-full resize-y rounded-md border border-control bg-paper px-3 py-2 font-sans text-sm font-normal text-ink';
  const LABEL='block text-sm font-semibold text-ink';
  const SMALL='border-0 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-paper px-3 py-1.5 font-sans text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:cursor-not-allowed disabled:opacity-50';
  const BUTTON='border-0 inline-flex min-h-10 items-center justify-center rounded-md bg-paper px-4 py-2 font-sans text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:cursor-not-allowed disabled:opacity-50';
  const PRIMARY='border-0 inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 font-sans text-sm font-semibold text-paper hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';
  const CARD='rounded-card border border-edge bg-paper p-5 shadow-card';
  const BADGE='rounded-md bg-tint px-2 py-0.5 text-xs font-semibold text-primary';
  const LEVELS='mt-7 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6';
  const LEVEL='border-0 flex min-h-16 min-w-0 flex-col items-center justify-center rounded-md bg-paper px-2 py-2 font-sans text-sm tabular-nums text-ink ring-2 ring-inset ring-line hover:bg-tint aria-pressed:bg-primary aria-pressed:text-paper aria-pressed:ring-primary disabled:cursor-not-allowed disabled:opacity-50';
  const MENU_ITEM='border-0 w-full rounded-md bg-transparent px-3 py-2 text-left font-sans text-sm text-ink hover:bg-tint aria-pressed:bg-tint aria-pressed:text-primary disabled:cursor-not-allowed disabled:opacity-50 [&[data-complete=true]_[data-pi-icon]]:text-success';
  const SEGMENT='h-1.5 flex-1 rounded-full bg-edge data-[state=complete]:bg-success data-[state=current]:bg-primary';
  const ICON_BUTTON='border-0 inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-paper text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:cursor-not-allowed disabled:opacity-50';
  const MENU_SUMMARY='list-none cursor-pointer [&::-webkit-details-marker]:hidden';
  const MENU_PANEL='absolute z-20 mt-1 rounded-card border border-edge bg-paper p-1 shadow-overlay';
  const FEEDBACK='border-0 flex w-full items-start gap-2 rounded-lg bg-paper px-3 py-2 text-left font-sans text-sm text-ink-2 ring-1 ring-inset ring-edge hover:bg-tint aria-pressed:bg-tint aria-pressed:text-primary aria-pressed:ring-primary disabled:cursor-not-allowed disabled:opacity-50';
  // Suggestions depend only on the criterion name and level; updateRanges asks for them on every keystroke.
  const feedbackMemo=new Map();
  function feedbackOptions(c,level) {
    const memoKey=String(c.name)+'\u0000'+level;
    if(!feedbackMemo.has(memoKey))feedbackMemo.set(memoKey,buildFeedbackOptions(c,level));
    return feedbackMemo.get(memoKey);
  }
  function buildFeedbackOptions(c,level) {
    const topic=String(c.name||'this criterion').toLowerCase();
    const topics=[
      [/problem|need|stakeholder|scope/,['Clarify the problem, intended users, and project scope.','Support the stated need with stakeholder evidence.'],['The problem and scope are clearly defined.','The need is supported by relevant stakeholder evidence.']],
      [/literature|existing|gap|survey/,['Compare relevant recent sources and existing solutions.','Explain the research gap using a structured comparison.'],['Relevant sources and existing solutions are compared clearly.','The identified gap provides a clear basis for the project.']],
      [/design|architecture|method|solution/,['Explain the design choices and their trade-offs.','Connect the proposed method to the project requirements.'],['Design choices are justified against the project requirements.','The proposed method is coherent and well explained.']],
      [/implement|prototype|develop|coding/,['Demonstrate the implemented functionality with supporting evidence.','Address incomplete functionality and explain the next steps.'],['The implementation demonstrates the intended functionality.','The prototype provides clear evidence of progress.']],
      [/test|valid|result|analysis/,['Define measurable evaluation criteria and report supporting results.','Discuss limitations and compare results against a baseline.'],['Results are supported by clear evaluation evidence.','The analysis explains the findings and their limitations.']],
      [/present|communicat|viva|understand/,['Explain the work more clearly using relevant examples.','Strengthen the explanation of technical choices and individual contributions.'],['The explanation is clear and technically sound.','Responses demonstrate a good understanding of the work.']],
      [/plan|manage|timeline|progress|contribution|team/,['Clarify responsibilities, milestones, and the next deliverables.','Provide evidence of progress and individual contributions.'],['Responsibilities and milestones are clearly communicated.','Contributions and progress are supported by evidence.']]
    ];
    const matched=topics.find(([pattern])=>pattern.test(topic));
    const suggestions=matched?matched[level<3?1:2]:level<3?['Provide clearer evidence for '+c.name+'.','Address the gaps identified in the selected rubric descriptor.']:['The work meets the selected rubric descriptor for '+c.name+'.','The assessment is supported by a clear explanation and relevant evidence.'];
    const intro=level===0?'No assessable evidence was demonstrated for this criterion.':level===1?'Only limited evidence was demonstrated; substantial improvement is needed.':level===2?'The criterion is partially met; further development is needed.':level===3?'The expected standard is met, with scope for further refinement.':level===4?'Strong performance is demonstrated against this criterion.':'Excellent performance is demonstrated against this criterion.';
    return [intro,...suggestions];
  }
  // Match whole suggestion lines only: edited prose remains faculty-authored text.
  function selectedFeedback(value) {
    return new Set(value.split(/\r\n|\r|\n/).map(line=>line.trim()));
  }
  const BANDS=[0,40,60,75,85,95,100];
  const trim=n=>String(Number(n.toFixed(2)));
  const RANGE='block h-6 min-h-0 w-full cursor-pointer rounded-none border-0 bg-transparent p-0 accent-primary disabled:cursor-not-allowed';
  // Whole and half marks inside a level's band, as in the Review marking page.
  const bounds=(max,level)=>({min:Math.ceil(max*BANDS[level]/50)/2,max:(level===5?Math.floor(max*2):Math.ceil(max*BANDS[level+1]/50)-1)/2});
  function sliderScale(range) {
    const steps=Math.round((range.max-range.min)*2);
    let every=1;while(every<steps && (steps%every || steps/every>6))every++;
    return Array.from({length:steps/every+1},(_,i)=>range.min+i*every/2);
  }
  const levelRange=(max,n)=>trim(max*BANDS[n]/100)+'–'+trim(max*BANDS[n+1]/100);
  function message(text) { if(el('guideEvalMessage')) el('guideEvalMessage').textContent=text; }
  function setBusy(value) {
    busy=value;
    const host=el('guideEvaluationEditor');
    if(host) host.querySelectorAll('input,select,textarea,button').forEach(node=>node.disabled=value || node.dataset.locked==='true');
  }
  async function open(team,register,force) {
    // A save in flight cannot be cancelled, so it blocks; a read can be replaced, so a newer request (another student or team) supersedes it.
    if(busy && !reading) return;
    let host=el('guideEvaluationEditor');
    if(!host) return;
    const sameTeam=String(host.dataset.team||'')===String(team);
    if(reading && !force && reading===team+':'+(register||'')) return;
    if(dirty && !await DashboardUI.ask('Discard unsaved evaluation changes?')) {
      // The group tab already moved to another team; put it back on the team whose entries are still shown.
      if(!sameTeam && host.dataset.team) getWeekly().selectTeam(host.dataset.team,true);
      return;
    }
    host.dataset.team=String(team);
    if(!host.retryAttached){host.retryAttached=true;host.addEventListener('click',event=>{const retry=event.target.closest && event.target.closest('[data-guide-retry]');if(retry)open(retry.dataset.team,retry.dataset.register,true);});}
    if(typeof GuideWeekly!=='undefined')GuideWeekly.selectView('evaluation',true);
    const own=!force&&loaded&&register&&String(loaded.roster.team)===String(team)?(loaded.entries||[]).find(entry=>entry.register===String(register)):null,student=own&&loaded.roster.students.find(item=>item.register===own.register);
    if(student){
      // Every student of the team arrived with the last read, so moving between them needs no new one.
      ++generation;busy=false;reading=null;dirty=false;pending=null;current={...loaded,student,revision:own.revision,evaluation:own.evaluation};host.hidden=false;render();
      if(typeof GuideWeekly!=='undefined')GuideWeekly.evaluationStatus(current.roster.team,current.statuses);
      return;
    }
    const version=++generation;
    host.hidden=false;host.innerHTML=DashboardUI.renderSkeleton('panel', 'Loading guide evaluation');busy=true;reading=team+':'+(register||'');
    host.scrollIntoView({behavior:'smooth',block:'start'});
    bridge.read('guide-evaluation','API_guide_getEvaluation',[team,register || ''],{timeoutMs:60000}).then(data=>{
      if(version!==generation)return;
      busy=false;reading=null;dirty=false;pending=null;loaded=data;current=data;render();if(typeof GuideWeekly!=='undefined')GuideWeekly.evaluationStatus(data.roster.team,data.statuses);
    },err=>{if(version!==generation || (err && err.superseded))return;busy=false;reading=null;host.textContent='Unable to load: '+err.message;const retry=document.createElement('button');retry.type='button';retry.className=SMALL;retry.textContent='Retry';retry.setAttribute('data-guide-retry','');retry.dataset.team=String(team);retry.dataset.register=String(register||'');host.appendChild(retry);loaded=null;});
  }
  function render() {
    const d=current, old=d.evaluation;
    const locked=old && old.status!=='Draft';
    const config=locked ? old.config : d.config;
    const same=old && JSON.stringify(old.config)===JSON.stringify(d.config);
    const scores=old && (locked || same) ? old.scores : {};
    const host=el('guideEvaluationEditor');
    const lock=locked?' disabled data-locked="true"':'';
    const students=d.roster.students,at=students.findIndex(item=>item.register===d.student.register);
    const dueLabel=new Date(config.due*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
    const nav='<div data-student-navigation class="flex shrink-0 items-center gap-2 sm:gap-3"><button type="button" class="'+ICON_BUTTON+'" data-student-step="-1" aria-label="Previous student"'+(at<=0?' disabled data-locked="true"':'')+'>'+DashboardUI.renderIcon('chevron-left')+'</button><select id="guideEvalStudent" aria-label="Select student" class="min-w-16 max-w-56 truncate border-0 bg-transparent p-0 font-sans text-sm font-semibold text-ink">'+students.map(s=>'<option value="'+escape(s.register)+'" '+(s.register===d.student.register?'selected':'')+'>'+escape(s.name+' ('+s.register+') · '+(d.statuses.find(item=>item.register===s.register)||{}).status)+'</option>').join('')+'</select><button type="button" class="'+ICON_BUTTON+'" data-student-step="1" aria-label="Next student"'+(at<0||at>=students.length-1?' disabled data-locked="true"':'')+'>'+DashboardUI.renderIcon('chevron-right')+'</button></div>';
    const menu='<details class="relative shrink-0" data-actions-menu><summary class="'+ICON_BUTTON+' '+MENU_SUMMARY+'" aria-label="More actions">'+DashboardUI.renderIcon('ellipsis-vertical')+'</summary><div class="'+MENU_PANEL+' right-0 w-56"><button type="button" class="'+MENU_ITEM+'" id="guideEvalReload"><span class="flex items-center gap-3">'+DashboardUI.renderIcon('refresh-cw','','shrink-0 text-muted')+'Reload from sheet</span></button></div></details>';
    host.innerHTML='<header class="rounded-card border border-edge bg-paper px-4 pb-5 pt-5 shadow-card sm:px-6"><div class="flex flex-wrap items-center gap-x-3 gap-y-3 sm:gap-x-5"><div class="order-1 flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-5">'+nav+'<button type="button" class="'+SMALL+' shrink-0" data-weekly-logs>'+DashboardUI.renderIcon('file-text','','shrink-0')+'View all weekly logs</button></div><div class="order-2 flex min-w-0 basis-full items-start justify-between gap-3 sm:ml-auto sm:basis-auto sm:items-center"><div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"><span class="'+BADGE+'">'+escape(config.label||'Guide Evaluation')+'</span><span class="text-sm '+(d.overdue?'font-semibold text-danger':'text-muted')+'">'+escape(old ? old.status : 'Not started')+' · Due '+escape(dueLabel)+(d.overdue?' · Overdue':'')+'</span></div>'+menu+'</div></div>'+
      '</header>'+
      (!same && old && !locked?'<p class="mt-2 text-sm text-warning">Rubric changed. Previous revisions are retained; enter scores against the current rubric.</p>':'')+
      '<div class="mt-4 grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]"><aside data-criteria-rail class="rounded-card border border-edge bg-paper p-4 shadow-card lg:sticky lg:top-2"><div data-ai-score hidden class="mb-3 rounded-md border-l-4 border-primary bg-tint px-3 py-2" title="Average AI weekly-progress score over the weeks scored; advisory only"><p class="m-0 text-xs font-semibold uppercase tracking-wide text-primary">Weekly progress AI score</p><p class="m-0 mt-1 flex flex-wrap items-baseline gap-x-2 text-ink"><span data-ai-percent class="text-2xl font-bold text-primary"></span></p></div><div class="flex items-center justify-between gap-2 text-xs"><p data-evaluation-progress class="m-0 font-semibold text-ink" aria-live="polite"></p><p class="m-0 shrink-0 text-muted">Total <span data-rail-total></span> / '+config.maximum+'</p></div><div data-pi-segments aria-hidden="true" class="mt-3 flex gap-1">'+config.criteria.map(c=>'<span class="'+SEGMENT+'" data-segment="'+escape(c.pi)+'"></span>').join('')+'</div><div role="group" aria-label="Performance indicators" class="mt-3 flex flex-col gap-1">'+config.criteria.map(c=>'<button type="button" class="'+MENU_ITEM+'" data-select-pi="'+escape(c.pi)+'" aria-pressed="false"><span class="flex min-w-0 items-center gap-2 sm:gap-3"><span data-pi-icon class="inline-flex shrink-0">'+DashboardUI.renderIcon('clock')+'</span><span class="min-w-0 flex-1"><strong class="block">'+escape(c.pi+' · '+c.co)+'</strong><span class="block text-xs text-muted">'+escape(c.name)+'</span></span><span data-pi-mark class="shrink-0 text-xs tabular-nums text-muted">— / '+escape(c.maxMarks)+'</span></span></button>').join('')+'</div></aside><div class="min-w-0">'+
      config.criteria.map(c=>{
        const score=scores[c.pi]||{};
        return '<fieldset class="relative m-0 mt-4 min-w-0 '+CARD+'" data-pi="'+escape(c.pi)+'"><legend class="sr-only">'+escape(c.name)+'</legend>'+
          '<div class="flex items-center justify-between gap-2"><span class="'+BADGE+'">'+escape(c.pi+' · '+c.co)+'</span><span class="rounded-md bg-canvas px-2 py-1 text-xs font-semibold text-ink">Max '+c.maxMarks+' marks</span></div>'+
          '<p class="m-0 mt-3 text-base font-semibold text-ink" aria-hidden="true">'+escape(c.name)+'</p>'+
          '<select data-level hidden aria-label="Proficiency level"'+lock+'><option value="">Select</option>'+[0,1,2,3,4,5].map(i=>'<option '+(score.level===i?'selected':'')+'>'+i+'</option>').join('')+'</select>'+
          '<div class="'+LEVELS+'" role="group" aria-label="Choose proficiency level">'+[0,1,2,3,4,5].map(n=>'<button type="button" class="'+LEVEL+'" data-pick-level="'+n+'" aria-pressed="'+(score.level===n)+'" aria-label="Level '+n+', '+BANDS[n]+'–'+BANDS[n+1]+'%, '+levelRange(c.maxMarks,n)+' marks" title="Level '+n+' · '+BANDS[n]+'–'+BANDS[n+1]+'%"'+lock+'><strong>L'+n+'</strong><small>'+levelRange(c.maxMarks,n)+'</small></button>').join('')+'</div>'+
          '<div data-descriptor aria-live="polite" class="mt-3 rounded-md border-l-4 border-primary bg-tint px-4 py-3 text-sm leading-relaxed text-ink"></div>'+
          '<details class="group mt-2"><summary class="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-primary hover:underline [&::-webkit-details-marker]:hidden">'+DashboardUI.renderIcon('chevron-right','','shrink-0 transition-transform group-open:rotate-90')+'View all level descriptors</summary><div class="mt-1 flex flex-col gap-2 border-l-2 border-edge pl-3">'+c.descriptors.map((text,i)=>'<p class="m-0 text-sm text-ink-2"><strong class="text-ink">Level '+i+':</strong> '+escape(text)+'</p>').join('')+'</div></details>'+
          '<div class="mt-5 grid gap-5 border-t border-edge pt-5 md:grid-cols-2"><div class="min-w-0"><div class="flex flex-wrap items-center justify-between gap-2"><label class="text-base! font-semibold text-ink" for="guideMarks-'+escape(c.pi)+'">Awarded marks</label><span data-range class="text-sm text-muted"></span></div>'+
          '<input data-marks hidden type="number" min="0" max="'+c.maxMarks+'" step="0.01" value="'+escape(score.marks??'')+'"'+lock+'>'+
          '<div class="mt-3 flex items-center gap-3"><div class="min-w-0 flex-1"><input class="'+RANGE+'" data-marks-slider id="guideMarks-'+escape(c.pi)+'" type="range" step="0.5" min="0" max="'+c.maxMarks+'" value="'+escape(score.marks??0)+'" aria-label="Adjust awarded marks"'+lock+'><div data-slider-values aria-hidden="true" class="mt-1 h-5 text-xs tabular-nums text-muted"></div></div><span data-awarded-total class="min-w-12 shrink-0 text-right text-base font-semibold tabular-nums text-ink" aria-live="polite"></span></div></div>'+
          '<div data-feedback-panel class="min-w-0"><div class="flex flex-wrap items-center justify-between gap-2"><div class="flex flex-wrap items-center gap-2"><strong class="text-base font-semibold text-ink">Criterion feedback</strong><span data-feedback-required class="rounded-md bg-warning-tint px-2 py-0.5 text-xs font-semibold text-warning"></span></div><span data-feedback-status class="text-sm text-muted"></span></div>'+
          '<div class="mt-2 flex flex-col gap-1.5 text-sm text-muted" data-feedback-options aria-label="Feedback suggestions"></div>'+
          '<button type="button" class="'+SMALL+' mt-2" data-other-feedback aria-pressed="false"'+lock+'>Other remarks</button><label data-custom-feedback-label hidden class="mt-3 '+LABEL+'">Other remarks<textarea class="'+TEXTAREA+'" data-custom-feedback maxlength="2000" rows="3" placeholder="Add custom feedback"'+lock+'></textarea></label><textarea data-remark hidden class="resize-y" maxlength="2000"'+lock+'>'+escape(score.remark||'')+'</textarea></div></div></fieldset>';
      }).join('')+'<p id="guideEvalTotal" class="mt-4 text-sm font-semibold text-ink"></p></div></div>'+
      '<footer data-evaluation-footer class="sticky bottom-0 z-20 mt-4 flex shrink-0 flex-col gap-2 border-t border-edge bg-paper px-5 py-3 max-md:bottom-16 max-sm:px-3 max-sm:py-2"><p id="guideEvalMessage" role="status" aria-live="polite" class="m-0 max-h-20 overflow-y-auto text-sm text-ink-2 empty:hidden max-sm:sr-only"></p><div class="flex flex-wrap items-center gap-2"><button type="button" class="'+BUTTON+' gap-1" data-pi-step="-1">'+DashboardUI.renderIcon('chevron-left')+'Prev PI</button><button type="button" class="'+BUTTON+' gap-1" data-pi-step="1">Next PI'+DashboardUI.renderIcon('chevron-right')+'</button><span data-footer-progress data-state="incomplete" class="text-sm font-semibold text-danger max-sm:sr-only data-[state=complete]:text-success" role="status" aria-live="polite"></span><span class="flex items-center gap-2 sm:ml-auto"><button class="'+BUTTON+'" type="button" id="guideEvalDraft"'+lock+'>Save Draft</button><button class="'+PRIMARY+'" type="button" id="guideEvalSubmit"'+lock+'>Submit</button></span></div></footer>';
    // Each student continues from the PI they were last on. A student not opened yet starts on PI1, or, with a saved draft, on the first PI not yet completed.
    const piKey=d.roster.team+':'+d.student.register;
    const completed=c=>{const sc=scores[c.pi];return !!sc&&sc.level!==null&&sc.level!==undefined&&sc.marks!==''&&sc.marks!==null&&sc.marks!==undefined&&(Number(sc.level)>=2||!!String(sc.remark||'').trim());};
    activePi=config.criteria.some(c=>c.pi===ownPi[piKey])?ownPi[piKey]:(config.criteria.find(c=>!completed(c))||config.criteria[0]||{}).pi;
    if(!config.criteria.some(c=>c.pi===activePi))activePi=config.criteria.length?config.criteria[0].pi:null;
    const refreshRail=()=>{
      let done=0,total=0;
      ownPi[piKey]=activePi;
      host.querySelectorAll('fieldset[data-pi]').forEach(field=>{
        const pi=field.dataset.pi,c=config.criteria.find(item=>item.pi===pi),level=field.querySelector('[data-level]').value,marks=field.querySelector('[data-marks]').value;
        const graded=level!==''&&marks!==''&&(Number(level)>=2||!!field.querySelector('[data-remark]').value.trim());
        if(graded)done++;
        total+=Number(marks)||0;
        field.hidden=pi!==activePi;
        const pill=host.querySelector('[data-select-pi="'+pi+'"]'),segment=host.querySelector('[data-segment="'+pi+'"]');
        pill.dataset.complete=String(graded);pill.setAttribute('aria-pressed',String(pi===activePi));
        pill.querySelector('[data-pi-icon]').innerHTML=DashboardUI.renderIcon(graded?'check':'clock');
        pill.querySelector('[data-pi-mark]').textContent=(marks===''?'—':marks)+' / '+c.maxMarks;
        segment.dataset.state=graded?'complete':pi===activePi?'current':'';
      });
      const foot=host.querySelector('[data-footer-progress]');foot.textContent=done+' of '+config.criteria.length+' criteria completed';foot.dataset.state=done===config.criteria.length?'complete':'incomplete';
      const pos=config.criteria.findIndex(c=>c.pi===activePi);
      host.querySelectorAll('[data-pi-step]').forEach(b=>{b.disabled=pos+Number(b.dataset.piStep)<0||pos+Number(b.dataset.piStep)>=config.criteria.length;});
      host.querySelector('[data-evaluation-progress]').textContent=done+' of '+config.criteria.length+' criteria evaluated';
      host.querySelector('[data-rail-total]').textContent=String(Number(total.toFixed(2)));
    };
    // As on the Review page, an untouched PI opens at Level 2 (no marks yet); that is a change only once the user moves between PIs.
    const startPi=(pi,markDirty)=>{
      const field=host.querySelector('fieldset[data-pi="'+pi+'"]');if(!field||locked)return;
      const level=field.querySelector('[data-level]'),c=config.criteria.find(item=>item.pi===pi),range=bounds(c.maxMarks,2);
      if(level.value!==''||field.querySelector('[data-marks]').value!==''||field.querySelector('[data-remark]').value!==''||range.max<range.min)return;
      level.value='2';if(markDirty){dirty=true;pending=null;}
    };
    // The AI score averaged over the weeks scored, as a percentage; advisory only, it plays no part in the marks.
    const paintAi=token=>{
      if(token!==generation)return;
      const box=host.querySelector('[data-ai-score]'),ai=getWeekly().aiScoreFor(d.student.register);if(!box||!ai)return;
      box.hidden=false;
      box.querySelector('[data-ai-percent]').textContent=ai.average===null?'Not scored yet':Math.round(ai.average/ai.max*100)+' / 100';
    };
    const aiToken=generation;getWeekly().whenData(()=>paintAi(aiToken));
    // One delegated listener set per render; the previous set is removed first.
    if(detach)detach();
    const update=field=>{
      const level=field.querySelector('[data-level]').value, max=config.criteria.find(c=>c.pi===field.dataset.pi).maxMarks;
      const bands=BANDS,crit=config.criteria.find(c=>c.pi===field.dataset.pi);
      field.querySelectorAll('[data-pick-level]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pickLevel===level)));
      field.querySelector('[data-descriptor]').textContent=level===''?'Select a level to see its descriptor.':'Level '+level+': '+crit.descriptors[Number(level)];
      const marks=field.querySelector('[data-marks]').value,range=level===''?null:bounds(max,Number(level)),usable=range&&range.max>=range.min,slider=field.querySelector('[data-slider-values]');
      field.querySelector('[data-range]').textContent=level===''?'Select a level':usable?'Permitted: '+range.min+'–'+range.max+' pts':'No whole or half mark fits this level.';
      field.querySelector('[data-awarded-total]').textContent=(marks===''?'—':marks)+'/'+max;
      const ctl=field.querySelector('[data-marks-slider]');
      ctl.disabled=field.dataset.locked==='true'||busy||!usable;
      if(usable){ctl.min=range.min;ctl.max=range.max;ctl.value=marks===''?range.min:Math.max(range.min,Math.min(range.max,Math.round(Number(marks)*2)/2));}
      slider.hidden=!usable;
      slider.innerHTML=usable?'<span class="flex justify-between">'+sliderScale(range).map(v=>'<span'+(marks!==''&&Number(marks)===v?' class="font-semibold text-primary"':'')+'>'+v+'</span>').join('')+'</span>':'';
      const rem=field.querySelector('[data-remark]'),crit_=config.criteria.find(c=>c.pi===field.dataset.pi),lv=field.querySelector('[data-level]').value,nn=Number(lv);
      const sug=lv===''?[]:feedbackOptions(crit_,nn),custom=field.querySelector('[data-custom-feedback]'),other=field.querySelector('[data-other-feedback]'),label=field.querySelector('[data-custom-feedback-label]'),opts=field.querySelector('[data-feedback-options]');
      if(lv!==''){
        const customText=rem.value.split(/\r\n|\r|\n/).filter(line=>!sug.includes(line.trim())).join('\n');
        if(customText.trim())field.dataset.otherFeedback='true';
        const show=field.dataset.otherFeedback==='true';
        if(custom.value!==customText)custom.value=customText;
        label.hidden=!show;other.setAttribute('aria-pressed',String(show));
      }
      other.hidden=lv==='';if(lv==='')label.hidden=true;
      const req=field.querySelector('[data-feedback-required]');
      req.textContent=lv!==''&&nn<2?'Required for Level < 2':'Optional for Level '+lv;req.hidden=lv===''||nn>=2;
      field.querySelector('[data-feedback-status]').textContent=lv===''?'Select a level':nn<2?'Mandatory':'Optional';
      if(opts.dataset.level!==lv){
        opts.dataset.level=lv;
        opts.innerHTML=lv===''?'<small>Select a level for suggested feedback.</small>':sug.map((text,i)=>'<button type="button" class="'+FEEDBACK+'" data-feedback="'+i+'" aria-pressed="false" aria-label="'+escape(text)+'"'+lock+'>'+DashboardUI.renderIcon('plus')+' '+escape(text)+'</button>').join('');
      }
      const picked=selectedFeedback(rem.value);
      opts.querySelectorAll('[data-feedback]').forEach(button=>{const text=sug[Number(button.dataset.feedback)],on=picked.has(text);button.setAttribute('aria-pressed',String(on));button.innerHTML=DashboardUI.renderIcon(on?'check':'plus','','mt-0.5 shrink-0')+' '+escape(text);});
      refreshRail();
      const total=Array.from(host.querySelectorAll('[data-marks]')).reduce((n,input)=>n+(Number(input.value)||0),0);
      el('guideEvalTotal').textContent='Preview: '+total.toFixed(2)+' / '+config.maximum+' · '+(total/config.maximum*config.weight*100).toFixed(2)+' / '+(config.weight*100)+'. Validated on save.';
    };
    const onInput=event=>{const field=event.target.closest && event.target.closest('fieldset');if(!field)return;
      if(event.target.hasAttribute('data-custom-feedback')){
        const rem=field.querySelector('[data-remark]'),c=config.criteria.find(i=>i.pi===field.dataset.pi),sug=feedbackOptions(c,Number(field.querySelector('[data-level]').value)),picked=selectedFeedback(rem.value);
        rem.value=[...sug.filter(text=>picked.has(text)),event.target.value].filter(Boolean).join('\n');
      }
      if(event.target.hasAttribute('data-marks-slider')){if(event.target.disabled || field.querySelector('[data-level]').value==='')return;field.querySelector('[data-marks]').value=event.target.value;}dirty=true;pending=null;update(field);};
    const onChange=event=>{if(event.target.id!=='guideEvalStudent')return;const selected=event.target.value;event.target.value=d.student.register;open(d.roster.team,selected);};
    const onClick=async event=>{
      const button=event.target.closest && event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-weekly-logs')){getWeekly().openWeeklyLogs(d.student.register,d.student.name,button);return;}
      if(button.hasAttribute('data-pi-step')){const target=config.criteria[config.criteria.findIndex(c=>c.pi===activePi)+Number(button.dataset.piStep)];if(target){activePi=target.pi;startPi(activePi,true);host.querySelectorAll('fieldset[data-pi]').forEach(update);}return;}
      if(button.hasAttribute('data-student-step')){const next=d.roster.students[at+Number(button.dataset.studentStep)];if(next)open(d.roster.team,next.register);return;}
      if(button.hasAttribute('data-select-pi')){activePi=button.dataset.selectPi;startPi(activePi,true);host.querySelectorAll('fieldset[data-pi]').forEach(update);return;}
      if(button.hasAttribute('data-pick-level')){
        const field=button.closest('fieldset'),level=field.querySelector('[data-level]');
        if(level.value===button.dataset.pickLevel)return;
        // As on the Review page, a new level starts its marks and feedback afresh.
        level.value=button.dataset.pickLevel;field.querySelector('[data-marks]').value='';field.querySelector('[data-remark]').value='';field.dataset.otherFeedback='false';
        message('Level changed. Enter marks for the selected level.');dirty=true;pending=null;update(field);return;
      }
      if(button.hasAttribute('data-feedback')){
        const field=button.closest('fieldset'),c=config.criteria.find(i=>i.pi===field.dataset.pi),level=field.querySelector('[data-level]').value,rem=field.querySelector('[data-remark]');
        if(locked||busy||level==='')return;
        const text=feedbackOptions(c,Number(level))[Number(button.dataset.feedback)];if(!text)return;
        const on=selectedFeedback(rem.value).has(text);
        const next=on?rem.value.split(/\r\n|\r|\n/).filter(line=>line.trim()!==text).join('\n'):rem.value+(rem.value&&!rem.value.endsWith('\n')?'\n':'')+text;
        if(!on&&next.length>2000){message('Feedback is limited to 2000 characters. Shorten it before adding another suggestion.');return;}
        rem.value=next;message(on?'Suggested feedback removed.':'Suggested feedback selected.');dirty=true;pending=null;update(field);return;
      }
      if(button.hasAttribute('data-other-feedback')){
        const field=button.closest('fieldset'),rem=field.querySelector('[data-remark]'),custom=field.querySelector('[data-custom-feedback]');
        if(locked||busy)return;
        field.dataset.otherFeedback=field.dataset.otherFeedback==='true'?'false':'true';
        if(field.dataset.otherFeedback==='false'){
          const c=config.criteria.find(i=>i.pi===field.dataset.pi),sug=feedbackOptions(c,Number(field.querySelector('[data-level]').value));
          rem.value=rem.value.split(/\r\n|\r|\n/).filter(line=>sug.includes(line.trim())).join('\n');custom.value='';
        }
        dirty=true;pending=null;update(field);if(field.dataset.otherFeedback==='true')custom.focus();return;
      }
      if(button.id==='guideEvalReload'){const menu=button.closest('details');if(menu)menu.open=false;open(d.roster.team,d.student.register,true);}
      else if(button.id==='guideEvalDraft')save(false);
      else if(button.id==='guideEvalSubmit')save(true);
    };
    host.addEventListener('click',onClick);host.addEventListener('input',onInput);host.addEventListener('change',onChange);
    detach=()=>{host.removeEventListener('click',onClick);host.removeEventListener('input',onInput);host.removeEventListener('change',onChange);detach=null;};
    startPi(activePi,false);host.querySelectorAll('fieldset').forEach(update);
    if(locked) message('Submitted scores are locked. Contact the coordinator for corrections.');
  }
  async function save(submit) {
    if(busy)return;
    if(submit && !await DashboardUI.ask('Submit this student’s evaluation? Scores will lock until the coordinator reopens it.'))return;
    const method=submit?'submitGuideEvaluation_':'saveGuideEvaluationDraft_';
    const scores={};el('guideEvaluationEditor').querySelectorAll('fieldset').forEach(field=>{
      const level=field.querySelector('[data-level]').value;
      scores[field.dataset.pi]={level:level===''?null:Number(level),marks:field.querySelector('[data-marks]').value,remark:field.querySelector('[data-remark]').value};
    });
    if(!pending || pending.method!==method)pending={method,input:{team:current.roster.team,student:current.student.register,revision:current.revision,token:current.token,scores,requestId:requestId()}};
    setBusy(true);const done=DashboardUI.busy.write(el('guideEvalMessage'),'Saving…');
    bridge.write(submit?'API_guide_submitEvaluation':'API_guide_saveEvaluationDraft',[pending.input]).then(result=>{
      done();setBusy(false);dirty=false;pending=null;
      const team=current.roster.team,student=current.student.register;
      open(team,student,true);
    },err=>{done();setBusy(false);message(err.message+' Retry uses the same request ID unless you change the form.');});
  }
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  return {open};
}
function getGuideEvaluationClientScript_() { return 'const GuideEvaluation = ('+guideEvaluationBrowser_.toString()+')(DataBridge, () => GuideWeekly);'; }
