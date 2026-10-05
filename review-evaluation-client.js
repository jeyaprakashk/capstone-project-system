/** Shared drawer classes supply layout; native dialog supplies modality and focus containment. */
function reviewEvaluationBrowser_(reviewKey, bridge) {
  let reviewLabel=reviewKey;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SAVE_KINDS={saveReviewEvaluationDraft_:'draft',submitReviewEvaluation_:'submit',recordReviewAbsence_:'absence',saveReviewMakeupDraft_:'makeupDraft',submitReviewMakeup_:'makeupSubmit'};
  const SMALL='border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const BUTTON='border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const PRIMARY='border-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const SEGMENTED='inline-flex flex-wrap gap-1 rounded-xl bg-tint p-1';
  const PILL='border-0 inline-flex items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-left text-sm text-ink-2 aria-pressed:bg-paper aria-pressed:font-semibold aria-pressed:text-primary aria-pressed:shadow-selected disabled:opacity-50';
  const LEVEL='border-0 flex min-w-14 flex-col items-center rounded-lg bg-transparent px-2 py-1.5 text-sm text-ink-2 aria-pressed:bg-paper aria-pressed:font-semibold aria-pressed:text-primary aria-pressed:shadow-selected disabled:opacity-50';
  const TAB='border-x-0 border-t-0 inline-flex items-center gap-2 border-b-[3px] border-transparent bg-transparent px-4 py-3 text-sm text-muted aria-selected:border-primary aria-selected:font-semibold aria-selected:text-primary disabled:opacity-50';
  const CHIP='flex min-w-24 flex-col items-center gap-1 rounded-tile border border-edge bg-paper px-3 py-2 text-sm aria-pressed:border-primary aria-pressed:bg-tint disabled:opacity-60';
  const AVATARS=['bg-teal-700','bg-purple-700','bg-primary'];
  const FIELD='rounded-md border border-control px-3 py-1.5 text-sm';
  const LABEL='mt-2 flex flex-col gap-1 text-sm font-semibold';
  const day=value=>new Date(value*86400000).toISOString().slice(0,10);
  const requestId=()=>window.crypto.randomUUID();
  const bands=[0,40,60,75,85,95,100];
  function bounds(max,level) {
    return {min:Math.ceil(max*bands[level]/50)/2,max:(level===5?Math.floor(max*2):Math.ceil(max*bands[level+1]/50)-1)/2};
  }
  function feedbackOptions(c,level) {
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
    const matched=topics.find(item=>item[0].test(topic));
    const suggestions=matched?matched[level<3?1:2]:level<3?['Provide clearer evidence for '+c.name+'.','Address the gaps identified in the selected rubric descriptor.']:['The work meets the selected rubric descriptor for '+c.name+'.','The assessment is supported by a clear explanation and relevant evidence.'];
    const intro=level===0?'No assessable evidence was demonstrated for this criterion.':level===1?'Only limited evidence was demonstrated; substantial improvement is needed.':level===2?'The criterion is partially met; further development is needed.':level===3?'The expected standard is met, with scope for further refinement.':level===4?'Strong performance is demonstrated against this criterion.':'Excellent performance is demonstrated against this criterion.';
    return [intro,...suggestions];
  }
  // Match whole suggestion lines only: edited prose remains faculty-authored text.
  function selectedFeedback(value) {
    return new Set(value.split(/\r\n|\r|\n/).map(line=>line.trim()));
  }
  function levelMarkRange(max,level) {
    const range=bounds(max,level);
    return range.max<range.min?'—':range.min===range.max?String(range.min):range.min+'–'+range.max;
  }



  let drawer,model,trigger,busy=false,dirty=false,sequence=0,pending=null,targeted=null,reading=false,finishRead=null,correctionIndex=null,activeStudent=0,activeCriteria='team';
  function message(text) {drawer.querySelector('[data-message]').textContent=text;}
  function savedStudent(index) {return ((model.evaluation||{}).students||[]).find(s=>s.register===model.roster.students[index].register)||{};}
  function pendingStudents() {
    if(!model || model.availability.editable)return [];
    return model.roster.students.map((_,index)=>index).filter(index=>{
      const a=savedStudent(index).assessment||{};
      return a.status==='MAKEUP_PENDING' || (a.nextActions?.makeup?['individual']:[]).length>0;
    });
  }
  function focusedAssessment() {return !!targeted || pendingStudents().length>0;}
  function hiddenStudent(index) {return targeted?targeted.index!==index:focusedAssessment() && !pendingStudents().includes(index) && !absenceCorrectable(index);}
  function absenceCorrectable(index) {const a=savedStudent(index).assessment;return !!a && (['REVIEW_DAY_ABSENCE','PROLONGED'].includes(a.facts.type) || a.nextActions?.makeup);}
  function criteriaTabs() {
    return '<div class="review-criteria-tabs flex gap-1 border-b border-edge" role="tablist" aria-label="Assessment components">'+['team','individual'].map(component=>{
      const label=component==='team'?'Team Criteria':'Individual',max=model.config.criteria.filter(c=>c.type.toLowerCase()===component).reduce((sum,c)=>sum+c.maxMarks,0);
      return '<button type="button" class="'+TAB+'" role="tab" id="'+reviewKey+'-'+component+'-tab" data-criteria-tab="'+component+'" aria-controls="'+reviewKey+'-'+component+'-panel" aria-selected="'+(activeCriteria===component)+'" tabindex="'+(activeCriteria===component?'0':'-1')+'"><span>'+DashboardUI.renderIcon(component==='team'?'users':'user')+label+'</span><span>'+max+' pts '+(component==='team'?'pool':'weight')+'</span></button>';
    }).join('')+'</div>';
  }
  let gradingProgress={team:{graded:0,total:0},individual:{graded:0,total:0}},activeTeamPI=null,activeStudentPIs={};
  function piPillLabel(c) {
    return '<span data-pi-icon>'+DashboardUI.renderIcon('clock')+'</span><span><strong>'+escape(c.pi+'–'+c.co)+'</strong><small>0–'+escape(c.maxMarks)+'</small></span>';
  }
  function individualPills(owner) {
    return '<div class="'+SEGMENTED+'" data-individual-pills="'+owner+'" role="group" aria-label="Individual performance indicators">'+model.config.criteria.map((c,index)=>{
      if(c.type!=='Individual' && !(targeted && targeted.index===owner && targeted.components.includes('team')))return '';
      return '<button type="button" class="'+PILL+'" data-select-individual-pi="'+index+'" data-student="'+owner+'" aria-pressed="false" title="'+escape(c.name)+'">'+piPillLabel(c)+'</button>';
    }).join('')+'</div>';
  }
  function syncIndividualCards() {
    const fields=Array.from(drawer.querySelectorAll('[data-index]')).filter(field=>field.dataset.owner!=='team');
    model.roster.students.forEach((student,index)=>{
      const available=fields.filter(field=>Number(field.dataset.owner)===index && showRubric(field));
      if(!available.some(field=>Number(field.dataset.index)===activeStudentPIs[index]))activeStudentPIs[index]=available.length?Number(available[0].dataset.index):null;
      const pills=drawer.querySelector('[data-individual-pills="'+index+'"]');if(pills)pills.hidden=!available.length;
      fields.filter(field=>Number(field.dataset.owner)===index).forEach(field=>{
        const applicable=available.includes(field),selected=Number(field.dataset.index)===activeStudentPIs[index];
        field.hidden=!applicable || !selected;
        const button=drawer.querySelector('[data-select-individual-pi="'+field.dataset.index+'"][data-student="'+index+'"]');
        if(button){button.hidden=!applicable;button.disabled=busy || reading;button.setAttribute('aria-pressed',String(selected));}
      });
    });
  }
  function teamPills() {
    const criteria=model.config.criteria.map((c,index)=>({c,index})).filter(({c})=>c.type==='Team');
    if(!criteria.some(({index})=>index===activeTeamPI))activeTeamPI=criteria.length?criteria[0].index:null;
    return '<div class="'+SEGMENTED+'" data-team-pills role="group" aria-label="Team performance indicators">'+criteria.map(({c,index})=>'<button type="button" class="'+PILL+'" data-select-pi="'+index+'" aria-pressed="'+(index===activeTeamPI)+'" title="'+escape(c.name)+'">'+piPillLabel(c)+'</button>').join('')+'</div>';
  }
  function updateTabProgress() {
    const row=drawer.querySelector('[data-tab-progress]');if(!row)return;
    const {graded,total}=gradingProgress[activeCriteria],status=total>0 && graded===total?'complete':graded>0?'partial':'empty';
    row.innerHTML='<span class="font-semibold text-ink-2">'+(activeCriteria==='team'?'Performance Indicators':'Students')+'</span><span data-completion="'+status+'" class="ml-3 text-xs font-semibold text-muted">'+graded+' of '+total+' graded</span>';
  }
  function syncCriteriaTabs() {
    for(const component of ['team','individual']) {
      const selected=activeCriteria===component,tab=drawer.querySelector('[data-criteria-tab="'+component+'"]'),panel=drawer.querySelector('[data-criteria-group="'+component+'"]');
      if(tab){tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;tab.disabled=busy || reading || focusedAssessment() && component==='team';}
      if(panel){panel.hidden=!selected;panel.open=selected;}
    }
    const students=drawer.querySelector('[data-review-students]');if(students)students.hidden=activeCriteria!=='individual';
    const assessmentSummary=drawer.querySelector('[data-assessment-summary]');if(assessmentSummary)assessmentSummary.hidden=activeCriteria!=='individual';
    updateTabProgress();
    const pills=drawer.querySelector('[data-team-pills]');if(pills)pills.hidden=activeCriteria!=='team';
    model.config.criteria.forEach((c,index)=>{const button=drawer.querySelector('[data-select-pi="'+index+'"]');if(button){button.disabled=busy || reading;button.setAttribute('aria-pressed',String(index===activeTeamPI));}});
    syncTeamCards();
    syncIndividualCards();
  }
  function syncTeamCards() {
    drawer.querySelectorAll('[data-index]').forEach(field=>{if(field.dataset.owner==='team')field.hidden=!showRubric(field) || Number(field.dataset.index)!==activeTeamPI;});
  }
  function selectCriteria(component,focus=false) {
    if(busy || reading || !['team','individual'].includes(component) || focusedAssessment() && component==='team')return;
    const current=drawer.querySelector('[data-criteria-group="'+activeCriteria+'"]');
    if(component!==activeCriteria && current && !validateClosingGroup(current))return;
    activeCriteria=component;syncCriteriaTabs();
    if(focus){const tab=drawer.querySelector('[data-criteria-tab="'+component+'"]');if(tab)tab.focus();}
  }
  function syncStudentSelection() {
    model.roster.students.forEach((student,index)=>{
      const selected=index===activeStudent,group=drawer.querySelector('[data-student-group="'+index+'"]'),chip=drawer.querySelector('[data-select-student="'+index+'"]');
      if(group){group.hidden=hiddenStudent(index) || !selected;group.open=selected;}
      if(chip){chip.setAttribute('aria-pressed',String(selected));chip.disabled=busy || reading;}
      const summary=drawer.querySelector('[data-summary-student="'+index+'"]');
      if(summary)summary.hidden=hiddenStudent(index) || !selected;
    });
  }
  async function selectStudent(index) {
    if(busy || reading || !model || !model.roster.students[index] || hiddenStudent(index))return;
    if(index!==activeStudent && correctionIndex!==null){
      if(dirty && !await DashboardUI.ask('Discard unsaved absence correction?'))return;
      correctionIndex=null;dirty=false;pending=null;activeStudent=index;render();
    }
    activeStudent=index;syncStudentSelection();
    const group=drawer.querySelector('[data-criteria-group="individual"]');
    if(group)revealCriterion(group);
  }
  function studentChips(students) {
    return '<ul data-review-students aria-label="Select student" class="mt-2 flex list-none flex-wrap gap-2 p-0">'+students.map((s,index)=>{
      const words=String(s.name||s.register).trim().split(/\s+/),short=words[0]+(words.length>1?' '+words[words.length-1].charAt(0)+'.':'');
      const initials=words.map(w=>w.charAt(0)).slice(0,2).join('');
      return '<li'+(hiddenStudent(index)?' hidden':'')+'><button type="button" class="'+CHIP+'" data-select-student="'+index+'" aria-pressed="'+(index===activeStudent)+'" title="'+escape(s.name+' ('+s.register+')')+'" aria-label="'+escape('Assess '+s.name+', '+s.register)+'"><span class="inline-flex size-8 items-center justify-center rounded-full text-xs font-bold text-paper '+AVATARS[index%3]+'" aria-hidden="true">'+escape(initials)+'</span><span>'+escape(short)+'</span><small>'+escape(s.register)+'</small><span data-student-score="'+index+'">— / '+model.config.maximum+'</span></button></li>';
    }).join('')+'</ul>';
  }
  function assessmentSummaryCard(students) {
    return '<section class="mb-3 rounded-card border border-edge bg-paper p-4" data-assessment-summary aria-live="polite" aria-label="Assessment Summary"><h3 class="m-0 text-sm font-semibold text-ink">Assessment Summary <small data-summary-unsaved hidden class="ml-2 text-xs font-normal text-warning">Unsaved preview</small></h3>'+students.map((student,index)=>assessmentSummary(index)).join('')+'</section>';
  }
  function assessmentSummary(index) {
    const student=savedStudent(index).assessment?savedStudent(index):(model.assessmentResults||[]).find(s=>s.register===model.roster.students[index].register)||{};
    const actions=!model.availability.editable && !targeted && correctionIndex===null && student.assessment?makeupControls(index,student):'';
    return '<div data-summary-student="'+index+'"'+(hiddenStudent(index) || index!==activeStudent?' hidden':'')+'"><dl data-summary-values="'+index+'" class="m-0 mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">'+assessmentSummaryValues(student)+'</dl>'+actions+'</div>';
  }
  function assessmentSummaryValues(student) {
    const a=student.assessment||{},maximum=type=>model.config.criteria.filter(c=>c.type===type).reduce((sum,c)=>sum+c.maxMarks,0);
    const component=(value,state)=>value!=null?mark(value):state==='PENDING'?'Pending':'Unassessed';
    const unresolved=a.teamState==='PENDING' || a.individualState==='PENDING'?'Pending':'Incomplete';
    const labels={COMPLETED:'Completed',MAKEUP_PENDING:'Makeup Pending',INCOMPLETE:'Assessment Incomplete'};
    const cells=[['Team Mark',component(a.teamMark,a.teamState)+' / '+maximum('Team')],['Individual Mark',component(a.individualMark,a.individualState)+' / '+maximum('Individual')],['Review Total',(student.total==null?unresolved:mark(student.total))+' / '+model.config.maximum]];
    const tone=a.status==='COMPLETED'?'complete':a.status==='MAKEUP_PENDING'?'pending':'incomplete';
    return cells.map(([label,value],index)=>'<div'+(index===2?' data-resolved="'+(student.total!=null)+'"':'')+'><dt class="text-xs text-muted">'+label+'</dt><dd class="m-0 font-semibold text-ink">'+escape(value)+'</dd></div>').join('')+'<div data-tone="'+tone+'"><dt class="text-xs text-muted">Assessment Status</dt><dd class="m-0 font-semibold text-ink">'+escape(labels[a.status]||'Assessment Incomplete')+'</dd></div>';
  }
  function canEditAbsence(index) {return !busy && !reading && !targeted && (model.availability.editable || correctionIndex===index);}
  const attendanceChoices=[['','Select attendance'],['NORMAL','Present'],['REVIEW_DAY_ABSENCE','Absent for Review'],['PROLONGED','Long Absent']];
  function attendancePicker(index,value) {
    const current=attendanceChoices.find(([key])=>key===value)||attendanceChoices[0];
    return '<div><span class="text-sm font-semibold" id="'+reviewKey+'AttendanceLabel-'+index+'">Absence / exception</span><select data-fact="type" hidden aria-hidden="true" tabindex="-1">'+attendanceChoices.map(([key,label])=>'<option value="'+key+'"'+(key===current[0]?' selected':'')+'>'+label+'</option>').join('')+'</select><details class="review-attendance-picker group mt-1" data-attendance-picker><summary class="flex cursor-pointer items-center justify-between rounded-md border border-control bg-paper px-3 py-1.5 text-sm [&::-webkit-details-marker]:hidden" aria-labelledby="'+reviewKey+'AttendanceLabel-'+index+' '+reviewKey+'AttendanceValue-'+index+'"><span data-attendance-label id="'+reviewKey+'AttendanceValue-'+index+'">'+current[1]+'</span>'+DashboardUI.renderIcon('chevron-down','','group-open:rotate-180')+'</summary><div role="radiogroup" class="mt-1 flex flex-col gap-1 rounded-md border border-edge bg-paper p-2 text-sm" aria-labelledby="'+reviewKey+'AttendanceLabel-'+index+'">'+attendanceChoices.map(([key,label])=>'<label><input type="radio" name="'+reviewKey+'Attendance-'+index+'" data-attendance-option value="'+key+'"'+(key===current[0]?' checked':'')+'><span>'+label+'</span></label>').join('')+'</div></details></div>';
  }
  function focusAttendance(host) {
    const summary=host.querySelector('[data-attendance-picker] > summary');
    (summary||host.querySelector('[data-fact="type"]')).focus();
  }
  function facts(index) {
    const host=drawer.querySelector('[data-absence="'+index+'"]');
    if(!host)return (savedStudent(index).assessment||{}).facts||{type:'NORMAL'};
    const read=name=>host.querySelector('[data-fact="'+name+'"]').value;
    const type=read('type')||'UNSELECTED',bool=name=>read(name)===''?null:read(name)==='yes';
    if(type==='NORMAL')return {type,attended:true};
    if(type==='UNSELECTED')return {type,attended:null};
    const evidenceHost=host.querySelector('[data-absence-evidence]');
    const evidence=evidenceHost?{supportingEvidence:Array.from(evidenceHost.querySelectorAll('[data-supporting-evidence]:checked')).map(node=>node.value),otherEvidenceText:evidenceHost.querySelector('[data-other-evidence]').value}:{};
    return {type,approved:bool('approved'),attended:type==='REVIEW_DAY_ABSENCE'?false:bool('attended'),...(type==='PROLONGED'?{verifiedContribution:bool('contribution')}:{ }),...evidence};
  }
  function canEdit(field) {
    if(targeted)return field.dataset.owner===String(targeted.index) && targeted.components.includes(model.config.criteria[Number(field.dataset.index)].type==='Team'?'team':'individual');
    if(!model.availability.editable)return false;
    if(field.dataset.owner==='team')return true;
    const index=Number(field.dataset.owner),f=facts(index),old=savedStudent(index);

    return f.type==='NORMAL' || f.type==='PROLONGED' && f.attended===true;
  }
  function showRubric(field) {
    const component=model.config.criteria[Number(field.dataset.index)].type==='Team'?'team':'individual';
    if(targeted)return field.dataset.owner===String(targeted.index) && targeted.components.includes(component);
    if(component==='team')return !focusedAssessment();
    const index=Number(field.dataset.owner),f=facts(index);
    if(f.type==='UNSELECTED')return false;
    if(hiddenStudent(index))return false;
    if(f.type==='NORMAL' || f.type==='PROLONGED' && f.attended===true)return true;
    if(!model.availability.editable && f.approved===true && !f.attended && savedStudent(index).assessment?.individualSource==='makeup')return true;
    return false;
  }
  function makeupControls(index,student) {
    return student.assessment?.nextActions?.makeup?'<button class="'+PRIMARY+'" type="button" data-target="'+index+'">Conduct Makeup Assessment</button>':'';
  }

  function absenceEvidenceFields(index,f) {
    const options={MEDICAL_DOCUMENT:'Medical document provided',APPROVAL_DOCUMENT:'Official approval/permission provided',OTHER:'Other supporting evidence'};
    return '<div data-absence-evidence hidden class="mt-2"><fieldset class="rounded-md border border-edge p-2 text-sm"><legend class="px-1 font-semibold">Supporting absence evidence (optional)</legend>'+Object.entries(options).map(([value,label])=>'<label><input type="checkbox" data-supporting-evidence value="'+value+'"'+((f.supportingEvidence||[]).includes(value)?' checked':'')+'> '+label+'</label>').join('')+'</fieldset><label data-other-evidence-label hidden>Describe other supporting evidence<textarea data-other-evidence class="'+FIELD+' mt-1 block w-full" maxlength="2000">'+escape(f.otherEvidenceText||'')+'</textarea></label></div>';
  }

  function absenceControl(index,student) {
    const f=student.assessment?.facts||{type:'UNSELECTED'};
    const choice=(name,value)=>'<select data-fact="'+name+'" class="'+FIELD+' font-normal"><option value="">Select</option><option value="yes"'+(value===true?' selected':'')+'>Yes</option><option value="no"'+(value===false?' selected':'')+'>No</option></select>';
    return '<div class="review-criterion mb-3 rounded-lg border border-edge bg-paper p-3" data-absence="'+index+'"'+(targeted?' hidden':'')+'>'+attendancePicker(index,f.type)+'<div data-exception-fields><label class="'+LABEL+'" data-approval-field>Absence Approved?'+choice('approved',f.approved)+'</label>'+absenceEvidenceFields(index,f)+'<div data-prolonged-fields><label class="'+LABEL+'">Contribution Established?'+choice('contribution',f.verifiedContribution)+'</label><p>The committee considers contribution evidence submitted by the team and endorsed by the Guide.</p><label class="'+LABEL+'">Attended the Review?'+choice('attended',f.attended)+'</label></div></div><div data-effective="'+index+'"></div>'+(!model.availability.editable && !targeted && absenceCorrectable(index)?(correctionIndex===index?'<button class="'+BUTTON+'" type="button" data-record-absence="'+index+'">Save absence details</button><button class="'+BUTTON+'" type="button" data-cancel-absence="'+index+'">Cancel editing</button>':correctionIndex===null?'<button class="'+BUTTON+'" type="button" data-edit-absence="'+index+'">Edit absence details</button>':''):'')+'</div>';
  }
  async function close() {
    if (busy || (dirty && !await DashboardUI.ask('Discard unsaved '+reviewLabel+' marks?'))) return;
    if(finishRead)finishRead();finishRead=null;reading=false;
    sequence++;drawer.close();dirty=false;model=null;pending=null;correctionIndex=null;
    document.body.classList.remove('overflow-hidden');
    if (trigger && trigger.isConnected) trigger.focus();
  }
  function ensure() {
    if (drawer) return;
    drawer=document.createElement('dialog');drawer.className='open review-drawer fixed inset-y-0 right-0 left-auto z-40 h-screen max-h-dvh w-[min(520px,92vw)] max-w-screen overflow-hidden';drawer.setAttribute('data-tooltip-boundary','');
    drawer.setAttribute('aria-labelledby',reviewKey+'Heading');
    drawer.addEventListener('toggle',event=>{
      const group=event.target;
      const selector=group.hasAttribute('data-student-group')?'[data-student-group]':group.hasAttribute('data-criteria-group')?'[data-criteria-group]':null;
      if(selector && group.open) {
        drawer.querySelectorAll(selector).forEach(other=>{if(other!==group)other.open=false;});
      }
    },true);
    drawer.addEventListener('keydown',event=>{
      const attendance=event.target.closest && event.target.closest('[data-attendance-picker]');
      if(attendance && attendance.open && event.key==='Escape'){event.preventDefault();event.stopPropagation();attendance.open=false;attendance.querySelector('summary').focus();return;}
      if(!event.target.hasAttribute('data-criteria-tab') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?'team':event.key==='End'?'individual':activeCriteria==='team'?'individual':'team';
      selectCriteria(next,true);
    });
    drawer.addEventListener('invalid',event=>revealCriterion(event.target),true);
    drawer.addEventListener('cancel',event=>{event.preventDefault();return close();});
    drawer.addEventListener('submit',event=>event.preventDefault());
    drawer.addEventListener('click',async event=>{
      const candidate=event.target.closest && event.target.closest('[data-attendance-picker]');
      const picker=candidate && candidate.hasAttribute && candidate.hasAttribute('data-attendance-picker')?candidate:null;
      drawer.querySelectorAll('[data-attendance-picker]').forEach(other=>{if(other!==picker)other.open=false;});
      if(picker){const host=picker.closest('[data-absence]');if(!canEditAbsence(Number(host.dataset.absence))){event.preventDefault();return;}}
      if (event.target===drawer && event.clientX<drawer.getBoundingClientRect().left) {close();return;}
      const summary=event.target.closest('summary');
      if(summary && summary.parentElement && (summary.parentElement.hasAttribute('data-criteria-group') || summary.parentElement.hasAttribute('data-student-group'))) {
        event.preventDefault();
        if(busy || reading)return;
        const group=summary.parentElement;
        if(group.dataset && group.dataset.criteriaGroup){selectCriteria(group.dataset.criteriaGroup);return;}
        const selector=group.hasAttribute('data-student-group')?'[data-student-group]':'[data-criteria-group]';
        const current=Array.from(drawer.querySelectorAll(selector)).find(item=>item.open);
        if(current && !validateClosingGroup(current))return;
        if(current)current.open=false;
        if(current!==group)group.open=true;
        return;
      }
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-select-pi')) {
        if(busy || reading)return;
        const current=drawer.querySelector('[data-index="'+activeTeamPI+'"][data-owner="team"]');
        if(current && !validateClosingGroup({querySelectorAll:()=>[current]}))return;
        const field=drawer.querySelector('[data-index="'+Number(button.dataset.selectPi)+'"][data-owner="team"]');
        if(field){activeTeamPI=Number(button.dataset.selectPi);syncCriteriaTabs();const content=drawer.querySelector('[data-drawer-content]');if(content)content.scrollTop=0;const level=field.querySelector('[data-pick-level]');if(level)level.focus({preventScroll:true});}
        return;
      }
      if(button.hasAttribute('data-select-individual-pi')) {
        if(busy || reading)return;
        const owner=Number(button.dataset.student),index=Number(button.dataset.selectIndividualPi),group=drawer.querySelector('[data-student-group="'+owner+'"]');
        if(group && !validateClosingGroup(group))return;
        const field=drawer.querySelector('[data-index="'+index+'"][data-owner="'+owner+'"]');
        if(!field || !showRubric(field))return;
        activeStudentPIs[owner]=index;syncIndividualCards();
        const level=field.querySelector('[data-pick-level]');if(level)level.focus({preventScroll:true});
        return;
      }
      if(button.hasAttribute('data-criteria-tab')){selectCriteria(button.dataset.criteriaTab);return;}
      if(button.hasAttribute('data-select-student'))return selectStudent(Number(button.dataset.selectStudent));
      if(button.hasAttribute('data-close'))return close();
      if(button.hasAttribute('data-draft'))return save(false);
      if(button.hasAttribute('data-submit'))return save(true);




      if(button.hasAttribute('data-edit-absence'))return editAbsence(Number(button.dataset.editAbsence));
      if(button.hasAttribute('data-cancel-absence'))return cancelAbsence();
      if(button.hasAttribute('data-record-absence'))return saveAbsence();
      if(button.hasAttribute('data-target')) {
        if(busy || reading || correctionIndex!==null)return;
        if(dirty && !await DashboardUI.ask('Discard unsaved changes and open the Individual Makeup?'))return;
        const index=Number(button.dataset.target),a=savedStudent(index).assessment||{};
        targeted={index,components:(a.nextActions?.makeup?['individual']:[])};dirty=false;render();
      }
      if(button.hasAttribute('data-target-draft'))return saveTarget(false);
      if(button.hasAttribute('data-target-submit'))return saveTarget(true);
      if(button.hasAttribute('data-reload') && (!dirty || await DashboardUI.ask('Discard unsaved marks and reload?')))open(model?model.roster.team:drawer.dataset.team,trigger);
      if(button.hasAttribute('data-other-feedback')) {
        const field=button.closest('[data-index]');if(busy || reading || !canEdit(field))return;
        const remark=field.querySelector('[data-remark]'),custom=field.querySelector('[data-custom-feedback]');
        field.dataset.otherFeedback=field.dataset.otherFeedback==='true'?'false':'true';
        if(field.dataset.otherFeedback==='false') {
          const c=model.config.criteria[Number(field.dataset.index)],suggestions=feedbackOptions(c,Number(field.querySelector('[data-level]').value));
          remark.value=remark.value.split(/\r\n|\r|\n/).filter(line=>suggestions.includes(line.trim())).join('\n');
          if(custom)custom.value='';
        }
        dirty=true;pending=null;updateRanges();if(custom && field.dataset.otherFeedback==='true')custom.focus();return;
      }
      if(button.hasAttribute('data-pick-level') || button.hasAttribute('data-feedback') || button.hasAttribute('data-step')) {
        if(busy || !model)return;
        const field=button.closest('[data-index]'),c=model.config.criteria[Number(field.dataset.index)];
        if(!canEdit(field))return;
        const level=field.querySelector('[data-level]'),marks=field.querySelector('[data-marks]');
        if(button.hasAttribute('data-pick-level')) {
          if(level.value===button.dataset.pickLevel)return;
          level.value=button.dataset.pickLevel;
          marks.value='';
          field.querySelector('[data-remark]').value='';
          field.dataset.otherFeedback='false';
          message('Level changed. Enter marks for the selected level.');
        }
        if(button.hasAttribute('data-feedback')) {
          if(level.value==='')return;
          const suggestion=feedbackOptions(c,Number(level.value))[Number(button.dataset.feedback)],remark=field.querySelector('[data-remark]');
          if(!suggestion)return;
          const selected=selectedFeedback(remark.value).has(suggestion);
          const next=selected?remark.value.split(/\r\n|\r|\n/).filter(line=>line.trim()!==suggestion).join('\n'):
            remark.value+(remark.value && !remark.value.endsWith('\n')?'\n':'')+suggestion;
          if(!selected && next.length>2000){message('Feedback is limited to 2000 characters. Shorten it before adding another suggestion.');return;}
          remark.value=next;
          message(selected?'Suggested feedback removed.':'Suggested feedback selected.');
        }
        if(button.hasAttribute('data-step')) {
          if(level.value==='')return;
          const range=bounds(c.maxMarks,Number(level.value));
          if(range.max<range.min)return;
          const direction=Number(button.dataset.step);
          const next=marks.value===''?range.min:(direction>0?Math.floor(Number(marks.value)*2)+1:Math.ceil(Number(marks.value)*2)-1)/2;
          marks.value=String(Math.max(range.min,Math.min(range.max,next)));
        }
        dirty=true;pending=null;updateRanges();
      }
    });
    drawer.addEventListener('input',event=>{
      if(event && event.target && event.target.hasAttribute('data-attendance-option'))return;
      if(event && event.target && event.target.hasAttribute('data-custom-feedback')) {
        const field=event.target.closest('[data-index]'),c=model.config.criteria[Number(field.dataset.index)],remark=field.querySelector('[data-remark]');
        const suggestions=feedbackOptions(c,Number(field.querySelector('[data-level]').value)),selected=selectedFeedback(remark.value);
        remark.value=[...suggestions.filter(s=>selected.has(s)),event.target.value].filter(Boolean).join('\n');
      }
      if(event && event.target && event.target.hasAttribute('data-marks-slider')) {
        event.target.closest('[data-index]').querySelector('[data-marks]').value=event.target.value;
      }
      dirty=true;pending=null;updateRanges();
    });
    drawer.addEventListener('change',event=>{
      if(event.target.hasAttribute('data-attendance-option')) {
        const host=event.target.closest('[data-absence]'),index=Number(host.dataset.absence);
        if(!canEditAbsence(index))return;
        host.querySelector('[data-fact="type"]').value=event.target.value;
        host.querySelector('[data-attendance-picker]').open=false;
        dirty=true;pending=null;updateRanges();focusAttendance(host);return;
      }

    });
    document.body.appendChild(drawer);
  }
  function shell(title,body,students=[],assessment=null,footer='') {
    title=String(title||'').trim().toUpperCase();
    const timing=assessment && assessment.availability.timing || {tone:'neutral',label:''};
    const dateLabel=assessment?new Date(assessment.config.due*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):'';
    const dateDetails=assessment?'Due '+day(assessment.config.due)+' · '+timing.label+' · '+assessment.status+' · Opens '+day(assessment.config.opens)+(assessment.availability.editable && assessment.availability.late?' · Late submissions allowed':''):'';
    const meta=assessment?'<span data-timing="'+escape(timing.tone)+'" class="text-xs text-muted" title="'+escape(dateDetails)+'">Due '+escape(dateLabel)+(timing.label?' · '+escape(timing.label):'')+'</span>':'';
    const projectTitle=assessment?String(assessment.details.title||'Project title not provided'):'';
    const titleRow=assessment?'<details class="review-project-title-row group mt-1 text-sm"><summary class="flex cursor-pointer items-center gap-1 [&::-webkit-details-marker]:hidden" title="'+escape(projectTitle)+'">'+DashboardUI.renderIcon('file-text')+'<span class="overflow-hidden">'+escape(projectTitle)+'</span>'+DashboardUI.renderIcon('chevron-down','','review-title-chevron group-open:rotate-180')+'</summary><p class="mt-1 max-h-[15dvh] overflow-auto text-ink-2">'+escape(projectTitle)+'</p></details>':'';
    const headerDetails=assessment?'<div class="mt-1 text-sm text-ink-2"><p class="m-0">Guide: '+escape(assessment.details.guideName)+'</p><p class="m-0">Committee: '+escape(assessment.details.committee)+'</p></div>':'';
    const navigation=assessment?'<div class="px-4 pt-2">'+criteriaTabs()+'<div data-tab-progress aria-live="polite" class="mt-2 flex items-center text-sm"></div>'+teamPills()+(students.length?studentChips(students):'')+'</div>':'';
    if(assessment && students.length)body=assessmentSummaryCard(students)+body;
    const statusMessage='<p class="review-message m-0 overflow-y-auto text-sm text-ink-2" data-message role="status" aria-live="polite"></p>';
    return '<div class="flex items-start justify-between gap-3 border-b border-edge px-4 py-3"><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h2 id="'+reviewKey+'Heading" class="m-0 text-base font-semibold text-ink">'+escape(title)+'</h2><span class="rounded-md bg-tint px-2 py-0.5 text-xs font-semibold text-primary">'+escape(reviewLabel)+'</span>'+meta+'</div>'+(assessment?'<div class="review-progress mt-1 max-w-full overflow-hidden text-sm text-ink-2" data-evaluation-progress aria-live="polite"></div>':'')+headerDetails+titleRow+'</div><button type="button" class="'+SMALL+'" data-close data-drawer-close aria-label="Close '+escape(reviewLabel)+' drawer">'+DashboardUI.renderIcon('x')+'</button></div>'+navigation+'<div class="team-drawer-content overflow-y-auto px-4 py-3" data-drawer-content>'+body+(footer?'':statusMessage)+'</div>'+(footer?'<div class="review-footer border-t border-edge px-4 py-3">'+statusMessage+footer+'</div>':'');
  }

  function open(team,button) {
    if (busy || reading) return;
    if (DashboardUI.closeRubricDrawer) DashboardUI.closeRubricDrawer(false);
    ensure();
    const previous=drawer.open && String(drawer.dataset.team).trim().toLowerCase()===String(team).trim().toLowerCase()?model:null,previousDirty=dirty,previousTarget=targeted;
    trigger=button;reading=true;
    if(previous && DashboardUI.beginContentLoading){finishRead=DashboardUI.beginContentLoading(drawer.querySelector('[data-drawer-content]'),'Refreshing '+reviewLabel+' evaluation');const reload=drawer.querySelector('[data-reload]');if(reload)reload.disabled=true;}
    else {activeCriteria='team';activeStudent=0;activeStudentPIs={};model=null;dirty=false;pending=null;targeted=null;correctionIndex=null;drawer.dataset.team=team;drawer.innerHTML=shell(team,DashboardUI.renderSkeleton('drawer','Loading '+reviewLabel+' evaluation'));}
    const token=++sequence;
    if(!drawer.open)drawer.showModal();
    document.body.classList.add('overflow-hidden');
    bridge.read('review-evaluation:'+reviewKey,'API_review_getEvaluation',[team,reviewKey],{timeoutMs:60000}).then(data=>{
      if(token!==sequence || !drawer.open)return;
      if(finishRead)finishRead();finishRead=null;reading=false;
      model=data;reviewLabel=data.config.label;dirty=false;pending=null;targeted=null;correctionIndex=null;render();
    },error=>{
      if(error && error.superseded)return;
      if(token!==sequence || !drawer.open)return;
      if(finishRead)finishRead();finishRead=null;reading=false;
      if(previous){model=previous;dirty=previousDirty;targeted=previousTarget;const reload=drawer.querySelector('[data-reload]');if(reload)reload.disabled=false;message(error.message+' Existing entries are retained. Use Reload to retry.');}
      else {drawer.innerHTML=shell(team,'<button class="'+SMALL+'" type="button" data-reload>Retry</button>');message(error.message);}
    });
  }
  function control(c,index,owner,score) {
    score=score||{};
    return '<fieldset class="review-criterion relative mb-3 rounded-lg border border-edge bg-paper p-3" data-index="'+index+'" data-owner="'+owner+'"'+(focusedAssessment() && (!targeted || String(owner)!==String(targeted.index) || !targeted.components.includes(c.type==='Team'?'team':'individual'))?' hidden':'')+'><legend class="review-criterion-accessible-title sr-only">'+escape(c.name)+'</legend><div class="flex items-center justify-between gap-2 text-xs text-muted"><span class="font-semibold text-ink-2">'+escape(c.pi+' · '+c.co)+'</span><span>Max '+c.maxMarks+' marks</span></div><h3 class="review-card-title hidden">'+escape(c.name)+'</h3><p class="m-0 mt-2 text-sm font-semibold text-ink">Proficiency level</p><select data-level hidden aria-label="Proficiency level"><option value="">Select level</option>'+[0,1,2,3,4,5].map(n=>'<option value="'+n+'"'+(score.level===n?' selected':'')+'>'+n+'</option>').join('')+'</select><div class="'+SEGMENTED+'" role="group" aria-label="Choose proficiency level">'+[0,1,2,3,4,5].map(n=>'<button type="button" class="'+LEVEL+'" data-pick-level="'+n+'" aria-pressed="'+(score.level===n)+'" aria-label="Level '+n+'" title="Level '+n+' · '+bands[n]+'–'+bands[n+1]+'%"><strong>L'+n+'</strong><small>'+levelMarkRange(c.maxMarks,n)+'</small></button>').join('')+'</div><div data-descriptor aria-live="polite" class="mt-2 text-sm text-ink-2"></div><details class="mt-2"><summary class="cursor-pointer text-sm font-semibold text-primary">View full rubric descriptors</summary>'+c.descriptors.map((text,i)=>'<p class="mt-1 text-sm text-ink-2"><strong>Level '+i+':</strong> '+escape(text)+'</p>').join('')+'</details><div class="mt-3"><div class="flex items-center justify-between"><label class="text-sm font-semibold" for="reviewMarks-'+owner+'-'+index+'">Fine-tune mark</label><span data-range class="text-xs text-muted"></span></div><div class="mt-1 flex items-center gap-2"><button class="'+SMALL+'" type="button" data-step="-0.5" aria-label="Decrease marks">'+DashboardUI.renderIcon('minus')+'</button><input class="'+FIELD+' w-24" data-marks id="reviewMarks-'+owner+'-'+index+'" aria-describedby="reviewMarksError-'+owner+'-'+index+'" type="number" min="0" max="'+c.maxMarks+'" step="0.5" value="'+escape(score.marks??'')+'"><button class="'+SMALL+'" type="button" data-step="0.5" aria-label="Increase marks">'+DashboardUI.renderIcon('plus')+'</button></div><input class="mt-2 w-full" data-marks-slider type="range" step="0.5" min="0" max="'+c.maxMarks+'" value="'+escape(score.marks??0)+'" aria-label="Adjust awarded marks"><span class="review-awarded-total hidden" data-awarded-total></span><div data-slider-values aria-label="Selectable marks" class="mt-1 flex flex-wrap gap-2 text-xs text-muted"></div></div><p class="mt-1 text-sm text-danger" data-marks-error id="reviewMarksError-'+owner+'-'+index+'" aria-live="polite" hidden></p><div class="mt-3 flex items-center justify-between gap-2 text-sm"><div><strong>Criterion Feedback</strong> <span data-feedback-required class="text-xs text-muted"></span></div><span data-feedback-status class="text-xs text-muted"></span></div><div class="'+SEGMENTED+'" data-feedback-options aria-label="Feedback suggestions"></div><button type="button" class="'+SMALL+'" data-other-feedback aria-pressed="false">Other remarks</button><label data-custom-feedback-label hidden>Other remarks<textarea class="'+FIELD+' mt-1 block w-full resize-y" data-custom-feedback maxlength="2000" rows="2" placeholder="Add custom feedback"></textarea></label><textarea data-remark hidden class="resize-y" maxlength="2000">'+escape(score.remark||'')+'</textarea></fieldset>';
  }
  function accordion(title,description,content) {
    return '<details class="review-accordion mt-3" data-criteria-group="'+(title==='Team Criteria'?'team':'individual')+'" name="review-criteria" id="'+reviewKey+'-'+(title==='Team Criteria'?'team':'individual')+'-panel" role="tabpanel" aria-labelledby="'+reviewKey+'-'+(title==='Team Criteria'?'team':'individual')+'-tab"'+(focusedAssessment()?(title==='Team Criteria'?' hidden':' open'):'')+'><summary class="hidden"><strong>'+title+'</strong>'+(title==='Team Criteria'?'<span data-team-mark aria-label="Common team score"></span>':'')+(description?'<span>'+description+'</span>':'')+'</summary><div>'+content+'</div></details>';
  }
  function validateClosingGroup(group) {
    if(!model.availability.editable)return true;
    updateRanges();
    for(const field of group.querySelectorAll('[data-index]')) {
      const marks=field.querySelector('[data-marks]'),remark=field.querySelector('[data-remark]');
      let text='',target;
      if((marks.value!=='' || marks.validity.badInput) && !marks.checkValidity()){text=marks.validationMessage;target=marks;}
      else if(remark.value.length>2000){text='Feedback must be 2000 characters or fewer.';target=field.querySelector('[data-custom-feedback]')||remark;}
      if(target) {
        revealCriterion(field);
        message(text);
        const warning=field.querySelector('[data-marks-error]');
        warning.textContent=text;warning.hidden=false;
        target.focus();
        return false;
      }
    }
    message('');
    return true;
  }
  function revealCriterion(element) {
    const criterion=element.closest && element.closest('[data-index]');
    if(criterion && criterion.dataset){if(criterion.dataset.owner==='team')activeTeamPI=Number(criterion.dataset.index);else activeStudentPIs[criterion.dataset.owner]=Number(criterion.dataset.index);syncIndividualCards();}
    const group=element.closest && element.closest('[data-criteria-group]');
    if(group) {
      if(group.dataset && group.dataset.criteriaGroup){activeCriteria=group.dataset.criteriaGroup;syncCriteriaTabs();}
      drawer.querySelectorAll('[data-criteria-group]').forEach(other=>{other.open=other===group;});
    }
    const student=element.closest && element.closest('[data-student-group]');
    if(student){
      if(student.dataset && student.dataset.studentGroup!==undefined){activeStudent=Number(student.dataset.studentGroup);syncStudentSelection();}
      drawer.querySelectorAll('[data-student-group]').forEach(other=>{other.open=other===student;});
    }
  }
  function render() {
    if(focusedAssessment())activeCriteria='individual';
    if(targeted)activeStudent=targeted.index;
    else if(hiddenStudent(activeStudent))activeStudent=pendingStudents()[0]??0;
    const d=model,old=d.evaluation||{},team=old.teamScores||{},savedStudents=old.students||[];
    const criteria=d.config.criteria;
    const teamFields=criteria.map((c,i)=>c.type==='Team'?control(c,i,'team',team[c.pi]):'').join('');
    const individual=d.roster.students.map((s,index)=>{
      const student=savedStudents.find(v=>v.register===s.register)||{},a=student.assessment||{},draft=a.makeupDraft||{},scores=targeted && targeted.index===index?(draft.scores||{}):!d.availability.editable && a.individualSource==='makeup'?(a.makeup?.scores||{}):(student.scores||{});
      return '<details class="review-student-accordion mt-3" data-student-group="'+index+'" name="review-students"'+(hiddenStudent(index) || index!==activeStudent?' hidden':'')+(index===activeStudent?' open':'')+'><summary class="hidden"><span><strong>'+escape(s.name)+'</strong><span data-individual-mark="'+index+'" aria-label="Individual score"></span></span><span><span>'+escape(s.register)+'</span><span data-assessment-status="'+index+'"></span></span></summary><div>'+absenceControl(index,student)+individualPills(index)+criteria.map((c,i)=>c.type==='Individual'?control(c,i,index,scores[c.pi]):targeted && targeted.index===index && targeted.components.includes('team')?control(c,i,index,(draft.team||{})[c.pi]):'').join('')+'</div></details>';
    }).join('');
    drawer.innerHTML=shell(d.details.team,(old.reason?'<p>Reopened: '+escape(old.reason)+'</p>':'')+'<form novalidate>'+accordion('Team Criteria','',teamFields || '<p>No team criteria configured.</p>')+accordion(focusedAssessment()?'Pending Assessment':'Individual Criteria',focusedAssessment()?'Review the pending student and enter their Individual Makeup.':'',focusedAssessment() || criteria.some(c=>c.type==='Individual')?individual:'<p>No individual criteria configured.</p>')+'</form>',d.roster.students,d,'<div data-review-actions class="mt-2 flex flex-wrap items-center gap-2">'+(d.availability.editable?'<button class="'+BUTTON+'" type="button" data-draft>Save Draft</button><button class="'+PRIMARY+'" type="button" data-submit>Submit Evaluation</button>':'')+'<button class="'+SMALL+'" type="button" data-reload>Reload</button><button class="'+SMALL+'" type="button" data-close>Close</button></div>');
    if(targeted)drawer.querySelector('[data-review-actions]').innerHTML='<button class="'+BUTTON+'" type="button" data-target-draft>Save Makeup Draft</button><button class="'+PRIMARY+'" type="button" data-target-submit>Submit Makeup</button><button class="'+SMALL+'" type="button" data-reload>Cancel / Reload</button><button class="'+SMALL+'" type="button" data-close>Close</button>';
    drawer.querySelectorAll('[data-absence] input,[data-absence] select,[data-absence] textarea').forEach(el=>el.disabled=!!targeted);
    syncStudentSelection();syncCriteriaTabs();updateRanges();drawer.querySelector('[data-close]').focus();
  }
  function updateRanges() {
    if(!model)return;
    const unsaved=drawer.querySelector('[data-summary-unsaved]');if(unsaved)unsaved.hidden=!dirty;
    const totals=model.roster.students.map(()=>0),entered=model.roster.students.map(()=>0);let completed=0,count=0;
    let teamGraded=0;const individualGraded=model.roster.students.map(()=>0);
    drawer.querySelectorAll('[data-index]').forEach(field=>{
      const c=model.config.criteria[Number(field.dataset.index)], level=field.querySelector('[data-level]').value;
      const editable=canEdit(field);
      const applicable=showRubric(field);
      field.hidden=!applicable || field.dataset.owner==='team' && Number(field.dataset.index)!==activeTeamPI;
      const studentIndex=Number(field.dataset.owner), absence=field.dataset.owner==='team'?null:facts(studentIndex);
      const assessment=absence && savedStudent(studentIndex).assessment;
      const pendingIndividual=c.type==='Individual' && !editable && (model.availability.editable
        ? absence && absence.type!=='NORMAL' && absence.approved===true && !absence.attended && level===''
        : assessment && assessment.individualMark===null && assessment.status==='MAKEUP_PENDING');

      const pendingMessage=pendingIndividual?'Individual assessment pending makeup.' : '';
      ['[data-level]','[data-marks]','[data-remark]'].forEach(selector=>field.querySelector(selector).disabled=busy || !editable);
      const input=field.querySelector('[data-marks]'), text=field.querySelector('[data-range]');
      const marks=input.value, n=Number(level), lower=c.maxMarks*bands[n]/100,upper=c.maxMarks*bands[n+1]/100;
      const permitted=bounds(c.maxMarks,n);
      text.textContent=level===''?'Select a level':'Permitted: '+permitted.min+'–'+permitted.max+' pts';
      const awarded=field.querySelector('[data-awarded-total]');
      if(awarded)awarded.textContent=(marks===''?'—':marks)+'/'+c.maxMarks;
      if(pendingIndividual){text.textContent='Pending';if(awarded)awarded.textContent='Pending';}
      const valid=marks==='' || (level!=='' && /^\d+(\.\d{1,2})?$/.test(marks) && Number.isInteger(Number(marks)*2) && Number(marks)>=lower && (n===5?Number(marks)<=upper:Number(marks)<upper));
      let error='';
      if(input.validity.badInput)error='Enter a valid numeric mark.';
      else if(marks!=='') {
        if(level==='')error='Select a proficiency level before entering marks.';
        else if(permitted.max<permitted.min)error='No whole or half mark fits this level. Choose another level or ask the coordinator to check the rubric.';
        else if(!Number.isFinite(Number(marks)))error='Enter a valid numeric mark.';
        else if(Number(marks)<lower || (n===5?Number(marks)>upper:Number(marks)>=upper))error='Marks are outside the selected level range. Enter marks within '+permitted.min+'–'+permitted.max+' pts for Level '+n+'.';
        else if(!valid)error='Enter whole or half marks (increments of 0.5) within '+permitted.min+'–'+permitted.max+' pts.';
      }
      input.setCustomValidity(error);
      input.setAttribute('aria-invalid',String(Boolean(error)));
      const warning=field.querySelector('[data-marks-error]');
      if(warning){warning.textContent=error?'Check awarded marks: '+error:'';warning.hidden=!error;}
      if(applicable)count++;
      const remark=field.querySelector('[data-remark]');
      const custom=field.querySelector('[data-custom-feedback]'),customLabel=field.querySelector('[data-custom-feedback-label]'),other=field.querySelector('[data-other-feedback]');
      if(custom && customLabel && other) {
        const suggestions=feedbackOptions(c,n),customText=remark.value.split(/\r\n|\r|\n/).filter(line=>!suggestions.includes(line.trim())).join('\n');
        if(customText.trim())field.dataset.otherFeedback='true';
        const show=field.dataset.otherFeedback==='true';
        if(custom.value!==customText)custom.value=customText;
        customLabel.hidden=!show;custom.disabled=busy || !editable;
        custom.setCustomValidity(remark.value.length>2000?'Total feedback must be 2000 characters or fewer.':'');
        other.hidden=pendingIndividual || level==='';other.disabled=busy || !editable;other.setAttribute('aria-pressed',String(show));
      }
      const graded=applicable && level!=='' && marks!=='' && valid && (n>=2 || !!remark.value.trim()) && remark.value.length<=2000;
      if(field.dataset.owner==='team') {
        const pill=drawer.querySelector('[data-select-pi="'+field.dataset.index+'"]');
        if(pill){pill.dataset.complete=String(graded);pill.setAttribute('aria-label',c.pi+' · '+c.co+' · '+c.name+': '+(graded?'Completed':'Incomplete'));const icon=pill.querySelector('[data-pi-icon]');if(icon)icon.innerHTML=DashboardUI.renderIcon(graded?'check':'clock');}
      }
      else {
        const pill=drawer.querySelector('[data-select-individual-pi="'+field.dataset.index+'"][data-student="'+field.dataset.owner+'"]');
        if(pill){pill.dataset.complete=String(graded);pill.setAttribute('aria-label',c.pi+' · '+c.co+' · '+c.name+': '+(graded?'Completed':'Incomplete'));const icon=pill.querySelector('[data-pi-icon]');if(icon)icon.innerHTML=DashboardUI.renderIcon(graded?'check':'clock');}
      }
      if(graded) {
        completed++;
        if(field.dataset.owner==='team')teamGraded++;
        else if(c.type==='Individual')individualGraded[Number(field.dataset.owner)]++;
      }
      const descriptor=field.querySelector('[data-descriptor]');
      if(descriptor) {
        field.dataset.level=level;
        descriptor.textContent=pendingMessage || (level===''?'Choose a level to see its rubric descriptor.':'Level '+level+': '+(c.descriptors[n]||'No descriptor configured.'));
        field.querySelectorAll('[data-pick-level]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.pickLevel===level));button.disabled=busy || !editable;});
        const range=permitted,slider=field.querySelector('[data-marks-slider]');
        input.min=range.min;input.max=range.max;input.step='0.5';
        slider.disabled=busy || !editable || level==='' || range.max<range.min;
        slider.min=range.min;slider.max=Math.max(range.min,range.max);slider.value=marks===''?range.min:Math.max(range.min,Math.min(range.max,Math.round(Number(marks)*2)/2));
        const values=field.querySelector('[data-slider-values]');
        if(values) {
          values.hidden=level==='' || range.max<range.min;
          values.innerHTML=values.hidden?'':Array.from({length:Math.round((range.max-range.min)*2)+1},(_,i)=>{const value=range.min+i/2;return '<span'+(marks!=='' && Number(marks)===value?' class="font-semibold text-primary"':'')+'>'+value+'</span>';}).join('');
        }
        if(level!=='' && range.max<range.min)text.textContent='No whole or half mark fits this level. Choose another level or ask the coordinator to check the rubric.';
        field.querySelectorAll('[data-step]').forEach(button=>{button.disabled=slider.disabled;});
        const requiredBadge=field.querySelector('[data-feedback-required]');
        requiredBadge.textContent=level!=='' && n<2?'Required for Level < 2':'Optional for Level '+n;
        requiredBadge.hidden=level==='' || n>=2;
        const feedbackStatus=field.querySelector('[data-feedback-status]');
        if(feedbackStatus)feedbackStatus.textContent=pendingIndividual?'Pending':level===''?'Select a level':n<2?'Mandatory':'Optional';
        const options=field.querySelector('[data-feedback-options]');
        if(options.dataset.level!==level || options.dataset.pendingMessage!==pendingMessage) {
          options.dataset.level=level;
          options.dataset.pendingMessage=pendingMessage;
          options.innerHTML=pendingIndividual?'<small>'+escape(pendingMessage)+'</small>':level===''?'<small>Select a level for suggested feedback.</small>':feedbackOptions(c,n).map((suggestion,i)=>'<button type="button" class="'+PILL+'" data-feedback="'+i+'" aria-pressed="false" aria-label="'+escape(suggestion)+'" title="Add this feedback">'+DashboardUI.renderIcon('plus')+' '+escape(suggestion)+'</button>').join('');
        }
        const suggestions=feedbackOptions(c,n),selected=selectedFeedback(remark.value);
        options.querySelectorAll('button').forEach(button=>{
          const suggestion=suggestions[Number(button.dataset.feedback)],pressed=selected.has(suggestion);
          button.disabled=busy || !editable;
          button.setAttribute('aria-pressed',String(pressed));
          button.title=pressed?'Remove this feedback':'Add this feedback';
          const label=DashboardUI.renderIcon(pressed?'check':'plus')+' '+escape(suggestion);
          if(button.innerHTML!==label)button.innerHTML=label;
        });
      }
      if(marks!=='' && valid){
        const add=i=>{totals[i]+=Math.round(Number(marks)*100);entered[i]++;};
        if(field.dataset.owner==='team')totals.forEach((_,i)=>add(i));else add(Number(field.dataset.owner));
      }
    });
    totals.forEach((cents,i)=>{
      const el=drawer.querySelector('[data-student-score="'+i+'"]');
      if(el){el.textContent=(entered[i]?String(Number((cents/model.config.maximum).toFixed(2))):'—')+' / 100';el.title=entered[i]===model.config.criteria.length?'Score out of 100':'Score so far out of 100';}
    });
    const individualCount=model.config.criteria.filter(c=>c.type==='Individual').length;
    gradingProgress={team:{graded:teamGraded,total:model.config.criteria.filter(c=>c.type==='Team').length},individual:{graded:individualGraded.filter(n=>individualCount>0 && n===individualCount).length,total:model.roster.students.length}};
    updateTabProgress();
    const progress=drawer.querySelector('[data-evaluation-progress]');
    if(progress)progress.hidden=focusedAssessment() && !targeted;
    if(progress)progress.innerHTML='<span>'+model.roster.students.length+' '+(model.roster.students.length===1?'student':'students')+'</span><div><span><strong>'+completed+' of '+count+'</strong> criteria evaluated</span><progress max="'+Math.max(1,count)+'" value="'+completed+'" aria-label="Evaluated criteria"></progress></div>';
    syncIndividualCards();
    updateAbsenceDisplay();
  }
  const mark=value=>value===null || value===undefined || !Number.isFinite(Number(value))?'Pending':String(value);
  function updateAbsenceDisplay() {
    model.roster.students.forEach((s,index)=>{
      const host=drawer.querySelector('[data-absence="'+index+'"]');if(!host)return;
      const f=facts(index),old=savedStudent(index);
      ['type','approved','contribution','attended'].forEach(name=>{const node=host.querySelector('[data-fact="'+name+'"]');if(node)node.disabled=!canEditAbsence(index);});
      const picker=host.querySelector('[data-attendance-picker]');
      if(picker){picker.querySelector('summary').setAttribute('aria-disabled',String(!canEditAbsence(index)));if(!canEditAbsence(index))picker.open=false;picker.querySelector('[data-attendance-label]').textContent=(attendanceChoices.find(([k])=>k===f.type)||attendanceChoices[0])[1];picker.querySelectorAll('[data-attendance-option]').forEach(n=>{n.disabled=!canEditAbsence(index);n.checked=n.value===f.type;});}
      host.querySelector('[data-exception-fields]').hidden=['NORMAL','UNSELECTED'].includes(f.type);
      host.querySelector('[data-prolonged-fields]').hidden=f.type!=='PROLONGED';
      const approvalNotApplicable=f.type==='PROLONGED' && f.verifiedContribution===false && f.attended===true;
      host.querySelector('[data-approval-field]').hidden=approvalNotApplicable;
      host.querySelector('[data-fact="approved"]').disabled=approvalNotApplicable || !canEditAbsence(index);
      const evidenceHost=host.querySelector('[data-absence-evidence]');
      if(evidenceHost){
        const relevant=!['NORMAL','UNSELECTED'].includes(f.type) && f.approved===true && !approvalNotApplicable;
        evidenceHost.hidden=!relevant;
        evidenceHost.querySelector('[data-other-evidence-label]').hidden=!(f.supportingEvidence||[]).includes('OTHER');
        evidenceHost.querySelectorAll('input,textarea').forEach(node=>{node.disabled=!relevant || !canEditAbsence(index);});
      }
      const teamScores={},scores={};
      model.config.criteria.forEach((c,i)=>{
        const field=drawer.querySelector('[data-index="'+i+'"][data-owner="'+(c.type==='Team'?'team':index)+'"]');
        const value=field?{level:field.querySelector('[data-level]').value===''?null:Number(field.querySelector('[data-level]').value),marks:field.querySelector('[data-marks]').value===''?null:Number(field.querySelector('[data-marks]').value),remark:field.querySelector('[data-remark]').value}:(c.type==='Team'?(model.evaluation?.teamScores||{}):old.scores||{})[c.pi];
        (c.type==='Team'?teamScores:scores)[c.pi]=value;
      });
      let preview=old;
      if(model.availability.editable || targeted?.index===index || correctionIndex===index){
        try{
          const assessment={...old.assessment,facts:f};
          if(targeted?.index===index)assessment.makeup={scores,eventId:'preview'};
          preview=reviewPolicyCalculate_(model.config,correctionIndex===index?model.evaluation.teamScores:teamScores,{register:s.register,scores:targeted || correctionIndex===index?old.scores:scores,assessment});
        }catch(error){preview={total:null,assessment:{teamMark:null,individualMark:null,status:'INCOMPLETE',teamState:'UNASSESSED',individualState:'UNASSESSED'}};}
      }
      const a=preview.assessment||{};
      const values=drawer.querySelector('[data-summary-values="'+index+'"]');if(values)values.innerHTML=assessmentSummaryValues(preview);
      const individual=drawer.querySelector('[data-individual-mark="'+index+'"]');if(individual)individual.textContent=mark(a.individualMark)+' / '+model.config.criteria.filter(c=>c.type==='Individual').reduce((n,c)=>n+c.maxMarks,0);
      const status=drawer.querySelector('[data-assessment-status="'+index+'"]');if(status)status.textContent='Assessment status: '+(a.status||'INCOMPLETE');
      const summary=drawer.querySelector('[data-student-score="'+index+'"]');if(summary)summary.textContent=mark(preview.total)+' / '+model.config.maximum;
      const team=drawer.querySelector('[data-team-mark]');if(team)team.textContent=mark(Object.values(teamScores).every(s=>s&&s.marks!==null)?Object.values(teamScores).reduce((n,s)=>n+s.marks,0):null);
    });
  }
  function validateFeedback(submit) {
    for(const field of drawer.querySelectorAll('[data-index]')) {
      if(!canEdit(field))continue;
      const level=field.querySelector('[data-level]').value,remark=field.querySelector('[data-remark]');
      const error=remark.value.length>2000?'Total feedback must be 2000 characters or fewer.':submit && level!=='' && Number(level)<2 && !remark.value.trim()?'Select feedback or add Other remarks for Level 0 or 1.':'';
      if(!error)continue;
      revealCriterion(field);message(error);
      const other=field.querySelector('[data-other-feedback]'),custom=field.querySelector('[data-custom-feedback]');
      if(custom && field.dataset.otherFeedback==='true'){custom.setCustomValidity(error);custom.reportValidity();custom.focus();}
      else if(other)other.focus();
      return false;
    }
    return true;
  }
  async function editAbsence(index) {
    if(busy || reading || targeted || model.availability.editable || !absenceCorrectable(index))return;
    if(dirty && !await DashboardUI.ask('Discard unsaved absence correction?'))return;
    correctionIndex=index;activeStudent=index;activeCriteria='individual';dirty=false;pending=null;render();
    const host=drawer.querySelector('[data-absence="'+index+'"]');revealCriterion(host);focusAttendance(host);
  }
  async function cancelAbsence() {
    if(busy || reading || correctionIndex===null)return;
    if(dirty && !await DashboardUI.ask('Discard unsaved absence correction?'))return;
    const index=correctionIndex;correctionIndex=null;dirty=false;pending=null;render();
    const button=drawer.querySelector('[data-edit-absence="'+index+'"]');if(button)button.focus();
  }
  function saveAbsence() {
    if(correctionIndex===null || !canEditAbsence(correctionIndex))return;
    let absence;
    try {
      absence=reviewPolicyFacts_(facts(correctionIndex));
      if(absence.type==='UNSELECTED')throw new Error('Select attendance before saving absence details.');
      if(absence.supportingEvidence?.includes('OTHER') && !absence.otherEvidenceText)throw new Error('Describe the other supporting absence evidence.');
      const old=savedStudent(correctionIndex),preview=reviewPolicyCalculate_(model.config,model.evaluation.teamScores,{...old,assessment:{...old.assessment,facts:absence}});
      if(absence.attended && preview.assessment.individualState!=='RESOLVED')throw new Error('Normal individual marks are missing. Ask the coordinator to reopen the evaluation to enter those marks.');
    } catch(error) {message(error.message);return;}
    sendAcademic('recordReviewAbsence_',{assessmentId:reviewKey,team:model.roster.team,student:model.roster.students[correctionIndex].register,revision:model.revision,token:model.token,absence});
  }
  async function saveTarget(submit) {
    if(busy || reading || !targeted)return;
    updateRanges();if(!validateFeedback(submit))return;

    const input={assessmentId:reviewKey,team:model.roster.team,student:model.roster.students[targeted.index].register,revision:model.revision,token:model.token};
    targeted.components.forEach(component=>{input[component==='team'?'teamScores':'scores']={};});
    drawer.querySelectorAll('[data-index]').forEach(field=>{
      if(!canEdit(field))return;
      const c=model.config.criteria[Number(field.dataset.index)],level=field.querySelector('[data-level]').value,marks=field.querySelector('[data-marks]').value;
      input[c.type==='Team'?'teamScores':'scores'][c.pi]={level:level===''?null:Number(level),marks:marks===''?null:marks,remark:field.querySelector('[data-remark]').value};
    });
    sendAcademic(submit?'submitReviewMakeup_':'saveReviewMakeupDraft_',input);
  }
  function sendAcademic(method,input) {
    const signature=JSON.stringify({method,input});if(!pending || pending.signature!==signature)pending={signature,id:requestId()};
    input.requestId=pending.id;setBusy(true);const done=DashboardUI.busy.write(drawer.querySelector('[data-message]'),'Saving assessment…');
    bridge.write('API_review_save',[SAVE_KINDS[method],input]).then(result=>{
      done();busy=false;dirty=false;pending=null;targeted=null;correctionIndex=null;model.revision=result.revision;model.status=result.status;model.evaluation=result.evaluation;
      render();message('Assessment saved. Changed results require publication.');refreshTable();
    },error=>{done();setBusy(false);message(error.message+' Your entries are retained.');});
  }
  function setBusy(value) {
    busy=value;drawer.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=value);
    syncCriteriaTabs();
    updateRanges();
  }
  async function save(submit) {
    if(busy || reading || !model || !model.availability.editable)return;
    updateRanges();
    if(!validateFeedback(submit))return;
    if(submit) {
      const unselected=model.roster.students.findIndex((s,index)=>facts(index).type==='UNSELECTED');
      if(unselected!==-1){const host=drawer.querySelector('[data-absence="'+unselected+'"]');revealCriterion(host);message('Select attendance for every student before submitting.');focusAttendance(host);return;}
      for(let index=0;index<model.roster.students.length;index++){
        const f=facts(index),irrelevant=f.type==='PROLONGED'&&f.verifiedContribution===false&&f.attended===true;
        if(!['NORMAL','UNSELECTED'].includes(f.type)&&f.approved===true&&!irrelevant&&(f.supportingEvidence||[]).includes('OTHER')&&!String(f.otherEvidenceText||'').trim()){
          const host=drawer.querySelector('[data-absence="'+index+'"]');revealCriterion(host);message('Describe the other supporting absence evidence.');host.querySelector('[data-other-evidence]').focus();return;
        }
      }
      const missing=Array.from(drawer.querySelectorAll('[data-index]')).find(field=>canEdit(field) && field.querySelector('[data-level]').value==='');
      if(missing){revealCriterion(missing);message('Select a proficiency level for every criterion before submitting.');const button=missing.querySelector('[data-pick-level]');if(button)button.focus();return;}
    }
    const payload={team:model.roster.team,revision:model.revision,token:model.token,teamScores:{},students:model.roster.students.map((s,index)=>({register:s.register,scores:{},absence:facts(index)}))};
    drawer.querySelectorAll('[data-index]').forEach(field=>{
      const c=model.config.criteria[Number(field.dataset.index)],level=field.querySelector('[data-level]'),marks=field.querySelector('[data-marks]'),remark=field.querySelector('[data-remark]');
      const editable=canEdit(field);
      level.required=submit && editable;marks.required=submit && editable;remark.required=false;
      if(!editable){if(field.dataset.owner!=='team')payload.students[Number(field.dataset.owner)].scores=savedStudent(Number(field.dataset.owner)).scores||{};return;}
      const score={level:level.value===''?null:Number(level.value),marks:marks.value===''?null:marks.value,remark:remark.value};
      (field.dataset.owner==='team'?payload.teamScores:payload.students[Number(field.dataset.owner)].scores)[c.pi]=score;
    });
    const form=drawer.querySelector('form');
    const invalid=form.querySelector && form.querySelector('input:invalid,select:invalid,textarea:invalid');
    if(invalid){revealCriterion(invalid);invalid.reportValidity();return;}
    if(!form.reportValidity())return;
    if(submit && !await DashboardUI.ask('Submit '+reviewLabel+' for the entire team? Normal scores will lock; documented pending cases can be assessed separately.'))return;
    const method=submit?'submitReviewEvaluation_':'saveReviewEvaluationDraft_', signature=JSON.stringify({method,payload});
    if(!pending || pending.signature!==signature)pending={signature,id:requestId()};
    payload.requestId=pending.id;setBusy(true);const done=DashboardUI.busy.write(drawer.querySelector('[data-message]'),'Saving '+reviewLabel+'…');
    bridge.write('API_review_save',[SAVE_KINDS[method],{...payload,assessmentId:reviewKey}]).then(result=>{
      dirty=false;pending=null;model.revision=result.revision;model.status=result.status;
      model.evaluation=result.evaluation || {...payload,status:result.status,submittedAt:result.submittedAt,submittedDay:result.submittedDay,late:result.late};model.availability.editable=result.status==='Draft';
      if(result.timing)model.availability.timing=result.timing;
      done();busy=false;render();message(result.status==='Draft'?'Draft saved.':reviewLabel+' submitted.');refreshTable();
    },error=>{done();setBusy(false);message(error.message+' Your entries are retained. Retry uses the same request ID until you edit.');});
  }
  function refreshTable() {
    ReviewerView.refresh().then(refreshed=>{if(!refreshed&&drawer.open)message('Evaluation saved. The assigned-team table could not refresh; reload to retry.');});
  }
  function admin() { return InternalAssessmentPublishing.refresh(reviewKey); }
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  return {open,admin};
}
function getReviewEvaluationClientScript_() {
  return [reviewPolicyFacts_,reviewPolicyScoresComplete_,reviewPolicyCalculate_].map(f=>f.toString()).join('\n')+'\nconst ReviewAssessmentBrowser = '+reviewEvaluationBrowser_.toString()+'; const ReviewEvaluations = (()=>{const instances=new Map();const get=key=>{if(!instances.has(key))instances.set(key,ReviewAssessmentBrowser(key,DataBridge));return instances.get(key);};return {open:(team,key,button)=>get(key).open(team,button),admin:key=>get(key).admin()};})();';
}
