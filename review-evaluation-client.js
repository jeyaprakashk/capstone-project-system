/** Shared drawer classes supply layout; native dialog supplies modality and focus containment. */
function reviewEvaluationBrowser_(reviewKey, bridge) {
  let reviewLabel=reviewKey;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SAVE_KINDS={saveReviewEvaluationDraft_:'draft',submitReviewEvaluation_:'submit',recordReviewAbsence_:'absence',saveReviewMakeupDraft_:'makeupDraft',submitReviewMakeup_:'makeupSubmit'};
  // The dialog is a flex column (header, navigation, scrolling body, footer). Without preflight the browser's dialog
  // margin, padding and border must be reset here, and `open:flex` keeps a closed dialog hidden.
  const DRAWER='review-drawer fixed inset-y-0 right-0 left-auto z-40 m-0 hidden h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden border-0 bg-paper p-0 font-sans text-ink shadow-overlay animate-[slide-in-right_.25s_cubic-bezier(.2,0,0,1)] backdrop:bg-scrim open:flex sm:w-[min(560px,92vw)]';
  const SMALL='border-0 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-paper px-3 py-1.5 font-sans text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:cursor-not-allowed disabled:opacity-50';
  const ICON_BUTTON='border-0 inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-paper text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:cursor-not-allowed disabled:opacity-50';
  const BUTTON='border-0 inline-flex min-h-10 items-center justify-center rounded-md bg-paper px-4 py-2 font-sans text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:cursor-not-allowed disabled:opacity-50';
  const PRIMARY='border-0 inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 font-sans text-sm font-semibold text-paper hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';
  // Menus are native <details>; their items carry no display utility because scripts toggle them with `hidden`.
  const MENU_SUMMARY='list-none cursor-pointer [&::-webkit-details-marker]:hidden';
  const MENU_PANEL='absolute z-20 mt-1 rounded-card border border-edge bg-paper p-1 shadow-overlay';
  const MENU_ITEM='border-0 w-full rounded-md bg-transparent px-3 py-2 text-left font-sans text-sm text-ink hover:bg-tint aria-pressed:bg-tint aria-pressed:text-primary disabled:cursor-not-allowed disabled:opacity-50 [&[data-complete=true]_[data-pi-icon]]:text-success';
  const SEGMENT='h-1.5 flex-1 rounded-full bg-edge data-[state=complete]:bg-success data-[state=current]:bg-primary';
  const LEVELS='mt-4 grid grid-cols-6 gap-1 rounded-xl bg-tint p-1';
  const LEVEL='border-0 flex min-h-12 min-w-0 flex-col items-center justify-center rounded-lg bg-transparent px-1 py-1.5 font-sans text-sm tabular-nums text-ink-2 hover:bg-paper aria-pressed:bg-primary aria-pressed:text-paper aria-pressed:shadow-selected disabled:cursor-not-allowed disabled:opacity-50';
  const FEEDBACK='border-0 flex w-full items-start gap-2 rounded-lg bg-paper px-3 py-2 text-left font-sans text-sm text-ink-2 ring-1 ring-inset ring-edge hover:bg-tint aria-pressed:bg-tint aria-pressed:text-primary aria-pressed:ring-primary disabled:cursor-not-allowed disabled:opacity-50';
  const TAB='border-x-0 border-t-0 flex flex-1 flex-wrap items-baseline gap-x-1.5 border-b-[3px] border-transparent bg-transparent px-1 py-3 text-left font-sans text-sm text-ink-2 hover:text-ink aria-selected:border-primary aria-selected:text-primary disabled:cursor-not-allowed disabled:opacity-50';
  const CHIP='flex min-w-24 flex-col items-center gap-0.5 rounded-tile border border-edge bg-paper px-3 py-2 font-sans text-sm text-ink hover:border-line aria-pressed:border-primary aria-pressed:bg-tint aria-pressed:ring-1 aria-pressed:ring-primary disabled:cursor-not-allowed disabled:opacity-60';
  const AVATARS=['bg-teal-700','bg-purple-700','bg-primary'];
  const FIELD='h-10 rounded-md border border-control bg-paper px-3 py-2 font-sans text-sm text-ink';
  const TEXTAREA='block min-h-20 w-full resize-y rounded-md border border-control bg-paper px-3 py-2 font-sans text-sm font-normal text-ink';
  const LABEL='block text-sm font-semibold text-ink';
  // Radios, checkboxes and the slider opt out of the base text-field box (fixed height, padding, border).
  const CHOICE='flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-normal text-ink hover:bg-tint has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60';
  const CHECK='m-0 size-5 min-h-0 shrink-0 cursor-pointer rounded-none border-0 bg-transparent p-0 accent-primary';
  const RANGE='block h-6 min-h-0 w-full cursor-pointer rounded-none border-0 bg-transparent p-0 accent-primary disabled:cursor-not-allowed';
  const STEP='border-0 inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-paper hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-soft disabled:text-muted';
  const CARD='rounded-card border border-edge bg-paper p-4 shadow-card';
  const BADGE='rounded-md bg-tint px-2 py-0.5 text-xs font-semibold text-primary';
  const SUMMARY_TONE={complete:'text-success',pending:'text-warning',incomplete:'text-ink'};
  const day=value=>new Date(value*86400000).toISOString().slice(0,10);
  const requestId=()=>window.crypto.randomUUID();
  const bands=[0,40,60,75,85,95,100];
  function bounds(max,level) {
    return {min:Math.ceil(max*bands[level]/50)/2,max:(level===5?Math.floor(max*2):Math.ceil(max*bands[level+1]/50)-1)/2};
  }
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
  // Values that cannot change during one synchronous refresh pass; null outside a pass.
  let passMemo=null;
  function withPass(run) {
    if(passMemo)return run();
    passMemo={facts:new Map(),pending:null};
    try {return run();} finally {passMemo=null;}
  }
  function message(text) {drawer.querySelector('[data-message]').textContent=text;}
  function savedStudent(index) {return ((model.evaluation||{}).students||[]).find(s=>s.register===model.roster.students[index].register)||{};}
  function pendingStudents() {
    if(!passMemo)return readPendingStudents();
    if(!passMemo.pending)passMemo.pending=readPendingStudents();
    return passMemo.pending;
  }
  function readPendingStudents() {
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
    return '<div class="review-criteria-tabs mt-3 flex gap-4 border-b border-edge" role="tablist" aria-label="Assessment components">'+['team','individual'].map(component=>{
      const label=component==='team'?'Team Criteria':'Individual',max=model.config.criteria.filter(c=>c.type.toLowerCase()===component).reduce((sum,c)=>sum+c.maxMarks,0);
      return '<button type="button" class="'+TAB+'" role="tab" id="'+reviewKey+'-'+component+'-tab" data-criteria-tab="'+component+'" aria-controls="'+reviewKey+'-'+component+'-panel" aria-selected="'+(activeCriteria===component)+'" tabindex="'+(activeCriteria===component?'0':'-1')+'"><span class="font-semibold">'+label+'</span><span class="text-xs text-muted">· '+max+' pts '+(component==='team'?'pool':'weight')+'</span></button>';
    }).join('')+'</div>';
  }
  let activeTeamPI=null,activeStudentPIs={};
  function piPillLabel(c) {
    return '<span class="flex items-center gap-3"><span data-pi-icon class="inline-flex shrink-0">'+DashboardUI.renderIcon('clock')+'</span><span class="flex min-w-0 flex-col leading-snug"><strong>'+escape(c.pi+' · '+c.co)+'</strong><small class="truncate text-xs font-normal text-muted">'+escape(c.name)+' · 0–'+escape(c.maxMarks)+' marks</small></span></span>';
  }
  function individualPills(owner) {
    return '<div data-individual-pills="'+owner+'" role="group" aria-label="Individual performance indicators">'+model.config.criteria.map((c,index)=>{
      if(c.type!=='Individual' && !(targeted && targeted.index===owner && targeted.components.includes('team')))return '';
      return '<button type="button" class="'+MENU_ITEM+'" data-select-individual-pi="'+index+'" data-student="'+owner+'" aria-pressed="false">'+piPillLabel(c)+'</button>';
    }).join('')+'</div>';
  }
  function syncIndividualCards() {
    const fields=Array.from(drawer.querySelectorAll('[data-index]')).filter(field=>field.dataset.owner!=='team');
    model.roster.students.forEach((student,index)=>{
      const available=fields.filter(field=>Number(field.dataset.owner)===index && showRubric(field));
      if(!available.some(field=>Number(field.dataset.index)===activeStudentPIs[index]))activeStudentPIs[index]=available.length?Number(available[0].dataset.index):null;
      const pills=drawer.querySelector('[data-individual-pills="'+index+'"]');if(pills)pills.hidden=!available.length || activeCriteria!=='individual' || index!==activeStudent;
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
    return '<div data-team-pills role="group" aria-label="Team performance indicators">'+criteria.map(({c,index})=>'<button type="button" class="'+MENU_ITEM+'" data-select-pi="'+index+'" aria-pressed="'+(index===activeTeamPI)+'">'+piPillLabel(c)+'</button>').join('')+'</div>';
  }
  // PI cards in the selected tab: the team's, or the selected student's.
  function contextFields() {
    return Array.from(drawer.querySelectorAll('[data-index]')).filter(field=>(activeCriteria==='team'?field.dataset.owner==='team':field.dataset.owner===String(activeStudent)) && showRubric(field));
  }
  function updateTabProgress() {
    const row=drawer.querySelector('[data-tab-progress]');if(!row)return;
    const fields=contextFields(),graded=fields.filter(field=>field.dataset.graded==='true').length,total=fields.length,status=total>0 && graded===total?'complete':graded>0?'partial':'empty';
    setHtml(row,'<span class="sr-only">'+(activeCriteria==='team'?'Performance Indicators':'Student performance indicators')+': </span><span data-completion="'+status+'" class="text-xs text-muted data-[completion=complete]:font-semibold data-[completion=complete]:text-success">'+graded+' of '+total+' graded</span>');
  }
  // Prev/Next walk every applicable PI of this evaluation: team PIs, then each student's, in roster order.
  const fieldKey=field=>[field.dataset.owner==='team'?-1:Number(field.dataset.owner),Number(field.dataset.index)];
  const compareKeys=(a,b)=>a[0]-b[0] || a[1]-b[1];
  function navigationFields() {
    const all=Array.from(drawer.querySelectorAll('[data-index]'));
    if(correctionIndex!==null)return all.filter(field=>field.dataset.owner===String(correctionIndex) && showRubric(field));
    return all.filter(field=>showRubric(field) && (field.dataset.owner==='team' || !hiddenStudent(Number(field.dataset.owner))));
  }
  function currentKey() {
    if(activeCriteria==='team')return [-1,activeTeamPI??-1];
    return [activeStudent,activeStudentPIs[activeStudent]??-1];
  }
  function currentField() {
    const key=currentKey();
    return Array.from(drawer.querySelectorAll('[data-index]')).find(field=>!compareKeys(fieldKey(field),key) && showRubric(field));
  }
  function stepTarget(direction) {
    const key=currentKey(),after=navigationFields().filter(field=>compareKeys(fieldKey(field),key)*direction>0);
    return direction>0?after[0]:after[after.length-1];
  }
  function closePiMenu() {const menu=drawer.querySelector('[data-pi-menu]');if(menu)menu.open=false;}
  /** Shows one PI card after validating the visible one; focusLevel moves focus to the new card's levels. */
  function goToField(field,focusLevel) {
    if(busy || reading || !field || !showRubric(field))return false;
    const current=currentField();
    if(current && !validateClosingGroup({querySelectorAll:()=>[current]}))return false;
    if(field.dataset.owner==='team'){activeCriteria='team';activeTeamPI=Number(field.dataset.index);}
    else {activeCriteria='individual';activeStudent=Number(field.dataset.owner);activeStudentPIs[activeStudent]=Number(field.dataset.index);syncStudentSelection();}
    syncCriteriaTabs();closePiMenu();
    const content=drawer.querySelector('[data-drawer-content]');if(content)content.scrollTop=0;
    if(focusLevel){const level=field.querySelector('[data-pick-level]');if(level)level.focus({preventScroll:true});}
    return true;
  }
  function updateNavigator() {
    const current=currentField(),label=drawer.querySelector('[data-pi-current]');
    if(label){const c=current && model.config.criteria[Number(current.dataset.index)];label.textContent=c?c.pi+' · '+c.co:activeCriteria==='individual'?'Select attendance to assess':'No criteria';}
    [-1,1].forEach(step=>{const blocked=busy || reading || !stepTarget(step);['top','bottom'].forEach(place=>{const button=drawer.querySelector('[data-pi-step="'+step+'"][data-pi-place="'+place+'"]');if(button)button.disabled=blocked;});});
    const segments=drawer.querySelector('[data-pi-segments]');
    if(segments)setHtml(segments,contextFields().map(field=>'<span class="'+SEGMENT+'" data-state="'+(field===current?'current':field.dataset.graded==='true'?'complete':'pending')+'"></span>').join(''));
    updateTabProgress();
  }
  function syncCriteriaTabs() {
    for(const component of ['team','individual']) {
      const selected=activeCriteria===component,tab=drawer.querySelector('[data-criteria-tab="'+component+'"]'),panel=drawer.querySelector('[data-criteria-group="'+component+'"]');
      if(tab){tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;tab.disabled=busy || reading || focusedAssessment() && component==='team';}
      if(panel){panel.hidden=!selected;panel.open=selected;}
    }
    const students=drawer.querySelector('[data-review-students]');if(students)students.hidden=activeCriteria!=='individual';
    const pills=drawer.querySelector('[data-team-pills]');if(pills)pills.hidden=activeCriteria!=='team';
    model.config.criteria.forEach((c,index)=>{const button=drawer.querySelector('[data-select-pi="'+index+'"]');if(button){button.disabled=busy || reading;button.setAttribute('aria-pressed',String(index===activeTeamPI));}});
    syncTeamCards();
    syncIndividualCards();
    updateNavigator();
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
    return '<div data-review-students><ul aria-label="Select student" class="mb-0 mt-3 flex list-none flex-wrap gap-2 p-0">'+students.map((s,index)=>{
      const words=String(s.name||s.register).trim().split(/\s+/);
      const initials=words.map(w=>w.charAt(0)).slice(0,2).join('');
      return '<li'+(hiddenStudent(index)?' hidden':'')+'><button type="button" class="'+CHIP+'" data-select-student="'+index+'" aria-pressed="'+(index===activeStudent)+'" aria-label="'+escape('Assess '+s.name+', '+s.register)+'" aria-describedby="'+reviewKey+'Score-'+index+' '+reviewKey+'ScoreNote-'+index+'"><span class="inline-flex size-8 items-center justify-center rounded-full text-xs font-bold text-paper '+AVATARS[index%3]+'" aria-hidden="true">'+escape(initials)+'</span><span class="font-semibold tabular-nums">'+escape(s.register)+'</span><span data-student-score="'+index+'" id="'+reviewKey+'Score-'+index+'" class="text-xs font-semibold tabular-nums text-primary">— / '+model.config.maximum+'</span><span class="sr-only" data-student-score-note="'+index+'" id="'+reviewKey+'ScoreNote-'+index+'"></span></button></li>';
    }).join('')+'</ul></div>';
  }
  const STATUS_LABELS={COMPLETED:'Completed',MAKEUP_PENDING:'Makeup Pending',INCOMPLETE:'Assessment Incomplete'};
  /** The Review total preview, as the chip shows it: a mark, or why there is none yet. */
  function reviewTotal(student) {
    const a=student.assessment||{};
    return (student.total==null?(a.teamState==='PENDING' || a.individualState==='PENDING'?'Pending':'Incomplete'):mark(student.total))+' / '+model.config.maximum;
  }
  function canEditAbsence(index) {return !busy && !reading && !targeted && (model.availability.editable || correctionIndex===index);}
  const attendanceChoices=[['','Select attendance'],['NORMAL','Present'],['REVIEW_DAY_ABSENCE','Absent for Review'],['PROLONGED','Long Absent']];
  function attendancePicker(index,value) {
    const current=attendanceChoices.find(([key])=>key===value)||attendanceChoices[0];
    return '<div><span class="text-sm font-semibold text-ink" id="'+reviewKey+'AttendanceLabel-'+index+'">Absence / exception</span><select data-fact="type" hidden aria-hidden="true" tabindex="-1">'+attendanceChoices.map(([key,label])=>'<option value="'+key+'"'+(key===current[0]?' selected':'')+'>'+label+'</option>').join('')+'</select><details class="review-attendance-picker group mt-1.5" data-attendance-picker><summary data-attendance-summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-control bg-paper px-3 text-sm text-ink hover:border-primary aria-disabled:cursor-not-allowed aria-disabled:bg-soft aria-disabled:text-muted [&::-webkit-details-marker]:hidden" aria-labelledby="'+reviewKey+'AttendanceLabel-'+index+' '+reviewKey+'AttendanceValue-'+index+'"><span data-attendance-label id="'+reviewKey+'AttendanceValue-'+index+'">'+current[1]+'</span>'+DashboardUI.renderIcon('chevron-down','','shrink-0 transition-transform group-open:rotate-180')+'</summary><div role="radiogroup" class="mt-1 flex flex-col gap-0.5 rounded-md border border-edge bg-paper p-1 shadow-overlay" aria-labelledby="'+reviewKey+'AttendanceLabel-'+index+'">'+attendanceChoices.map(([key,label])=>'<label class="'+CHOICE+'"><input type="radio" name="'+reviewKey+'Attendance-'+index+'" data-attendance-option value="'+key+'"'+(key===current[0]?' checked':'')+' class="'+CHECK+'"><span>'+label+'</span></label>').join('')+'</div></details></div>';
  }
  function focusAttendance(host) {
    const summary=host.querySelector('[data-attendance-summary]');
    (summary||host.querySelector('[data-fact="type"]')).focus();
  }
  function facts(index) {
    if(!passMemo)return readFacts(index);
    if(!passMemo.facts.has(index))passMemo.facts.set(index,readFacts(index));
    return passMemo.facts.get(index);
  }
  function readFacts(index) {
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
    return '<div data-absence-evidence hidden><fieldset class="m-0 flex min-w-0 flex-col gap-0.5 rounded-md border border-edge p-2 text-sm"><legend class="px-1 text-sm font-semibold text-ink">Supporting absence evidence (optional)</legend>'+Object.entries(options).map(([value,label])=>'<label class="'+CHOICE+'"><input type="checkbox" data-supporting-evidence value="'+value+'"'+((f.supportingEvidence||[]).includes(value)?' checked':'')+' class="'+CHECK+'"><span>'+label+'</span></label>').join('')+'</fieldset><label data-other-evidence-label hidden class="mt-3 '+LABEL+'">Describe other supporting evidence<textarea data-other-evidence class="mt-1.5 '+TEXTAREA+'" maxlength="2000">'+escape(f.otherEvidenceText||'')+'</textarea></label></div>';
  }

  function absenceControl(index,student) {
    const f=student.assessment?.facts||{type:'UNSELECTED'};
    const choice=(name,value)=>'<select data-fact="'+name+'" class="'+FIELD+' mt-1.5 block w-full font-normal sm:w-48"><option value="">Select</option><option value="yes"'+(value===true?' selected':'')+'>Yes</option><option value="no"'+(value===false?' selected':'')+'>No</option></select>';
    const actions=!model.availability.editable && !targeted && absenceCorrectable(index)?(correctionIndex===index?'<button class="'+PRIMARY+'" type="button" data-record-absence="'+index+'">Save absence details</button><button class="'+BUTTON+'" type="button" data-cancel-absence="'+index+'">Cancel editing</button>':correctionIndex===null?'<button class="'+BUTTON+'" type="button" data-edit-absence="'+index+'">Edit absence details</button>':''):'';
    return '<div class="review-criterion mb-4 '+CARD+'" data-absence="'+index+'"'+(targeted?' hidden':'')+'>'+attendancePicker(index,f.type)+'<div data-exception-fields><div class="mt-4 flex flex-col gap-4 border-t border-edge pt-4"><label class="'+LABEL+'" data-approval-field>Absence Approved?'+choice('approved',f.approved)+'</label>'+absenceEvidenceFields(index,f)+'<div data-prolonged-fields><div class="flex flex-col gap-4"><label class="'+LABEL+'">Contribution Established?'+choice('contribution',f.verifiedContribution)+'</label><p class="m-0 text-sm text-muted">The committee considers contribution evidence submitted by the team and endorsed by the Guide.</p><label class="'+LABEL+'">Attended the Review?'+choice('attended',f.attended)+'</label></div></div></div></div><div data-effective="'+index+'"></div>'+(actions?'<div class="mt-4 flex flex-wrap gap-2">'+actions+'</div>':'')+'</div>';
  }
  async function close() {
    if (busy || (dirty && !await DashboardUI.ask('Discard unsaved '+reviewLabel+' marks?'))) return;
    if(finishRead)finishRead();finishRead=null;reading=false;
    sequence++;drawer.close();dirty=false;model=null;pending=null;correctionIndex=null;
    delete document.body.dataset.scrollLocked;
    if (trigger && trigger.isConnected) trigger.focus();
  }
  function ensure() {
    if (drawer) return;
    drawer=document.createElement('dialog');drawer.className=DRAWER;drawer.setAttribute('data-tooltip-boundary','');
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
      if(attendance && attendance.open && event.key==='Escape'){event.preventDefault();event.stopPropagation();attendance.open=false;attendance.querySelector('[data-attendance-summary]').focus();return;}
      const menu=event.target.closest && event.target.closest('[data-drawer-menu]');
      if(menu && menu.open && event.key==='Escape'){event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector('[data-menu-summary]').focus();return;}
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
      const openMenu=event.target.closest && event.target.closest('[data-drawer-menu]');
      drawer.querySelectorAll('[data-drawer-menu]').forEach(other=>{if(other!==openMenu)other.open=false;});
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
      if(button.hasAttribute('data-select-pi')){goToField(drawer.querySelector('[data-index="'+Number(button.dataset.selectPi)+'"][data-owner="team"]'),true);return;}
      if(button.hasAttribute('data-select-individual-pi')){goToField(drawer.querySelector('[data-index="'+Number(button.dataset.selectIndividualPi)+'"][data-owner="'+Number(button.dataset.student)+'"]'),true);return;}
      if(button.hasAttribute('data-pi-step')) {
        // Focus stays on the button for repeated steps, and moves to the card once the end is reached.
        if(goToField(stepTarget(Number(button.dataset.piStep)),false) && button.disabled){const level=currentField()?.querySelector('[data-pick-level]');if(level)level.focus({preventScroll:true});}
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
      if(button.hasAttribute('data-reload')){const menu=button.closest('[data-actions-menu]');if(menu)menu.open=false;}
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
    const dateDetails=assessment?'Status '+assessment.status+'. Opens '+day(assessment.config.opens)+'.'+(assessment.availability.editable && assessment.availability.late?' Late submissions allowed.':''):'';
    const meta=assessment?'<span data-timing="'+escape(timing.tone)+'" class="text-sm text-muted data-[timing=danger]:font-semibold data-[timing=danger]:text-danger data-[timing=info]:text-primary data-[timing=success]:text-success data-[timing=warning]:font-semibold data-[timing=warning]:text-warning">Due '+escape(dateLabel)+(timing.label?' · '+escape(timing.label):'')+'<span class="sr-only">. '+escape(dateDetails)+'</span></span>':'';
    const studentCount=assessment?'<span class="text-sm text-muted">'+assessment.roster.students.length+' '+(assessment.roster.students.length===1?'student':'students')+'</span>':'';
    const actionsMenu=assessment?'<details class="relative" data-drawer-menu data-actions-menu><summary data-menu-summary class="'+ICON_BUTTON+' '+MENU_SUMMARY+'" aria-label="More actions">'+DashboardUI.renderIcon('ellipsis-vertical')+'</summary><div class="'+MENU_PANEL+' right-0 w-56"><button type="button" class="'+MENU_ITEM+'" data-reload><span class="flex items-center gap-3">'+DashboardUI.renderIcon('refresh-cw','','shrink-0 text-muted')+'Reload from sheet</span></button></div></details>':'';
    const projectTitle=assessment?String(assessment.details.title||'Project title not provided'):'';
    const titleRow=assessment?'<details class="review-project-title-row group mt-2 text-sm text-ink"><summary class="flex min-w-0 cursor-pointer list-none items-start gap-2 rounded-md hover:text-primary [&::-webkit-details-marker]:hidden" aria-label="Project title: '+escape(projectTitle)+'">'+DashboardUI.renderIcon('file-text','','mt-0.5 shrink-0 text-muted')+'<span class="min-w-0 flex-1 truncate group-open:whitespace-normal">'+escape(projectTitle)+'</span>'+DashboardUI.renderIcon('chevron-down','','review-title-chevron mt-0.5 shrink-0 text-muted transition-transform group-open:rotate-180')+'</summary></details>':'';
    const headerDetails=assessment?'<p class="m-0 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted"><span>Guide <span class="font-medium text-ink">'+escape(assessment.details.guideName)+'</span></span><span class="h-4 w-px bg-line" aria-hidden="true"></span><span>Committee <span class="font-medium text-ink">'+escape(assessment.details.committee)+'</span></span></p>':'';
    const piNavigator=assessment?'<div class="mt-3 flex items-center gap-2"><button type="button" class="'+STEP+'" data-pi-step="-1" data-pi-place="top" aria-label="Previous performance indicator">'+DashboardUI.renderIcon('chevron-left')+'</button>'+
      '<details class="group relative min-w-0 flex-1" data-drawer-menu data-pi-menu><summary data-menu-summary class="flex min-h-10 items-center gap-2 rounded-md border border-edge bg-paper px-3 text-sm hover:border-line '+MENU_SUMMARY+'"><span class="sr-only">Performance indicator: </span><span data-pi-current class="min-w-0 flex-1 truncate font-semibold text-ink"></span><span data-tab-progress aria-live="polite" class="shrink-0"></span>'+DashboardUI.renderIcon('chevron-down','','shrink-0 text-muted transition-transform group-open:rotate-180')+'</summary>'+
      '<div class="'+MENU_PANEL+' inset-x-0 max-h-72 overflow-y-auto">'+teamPills()+students.map((_,index)=>individualPills(index)).join('')+'</div></details>'+
      '<button type="button" class="'+STEP+'" data-pi-step="1" data-pi-place="top" aria-label="Next performance indicator">'+DashboardUI.renderIcon('chevron-right')+'</button></div><div data-pi-segments aria-hidden="true" class="mt-3 flex gap-1"></div>':'';
    const navigation=assessment?criteriaTabs()+(students.length?studentChips(students):'')+piNavigator:'';
    const statusMessage='<p class="review-message m-0 max-h-20 overflow-y-auto text-sm text-ink-2 empty:hidden" data-message role="status" aria-live="polite"></p>';
    const closeButton='<button type="button" class="'+ICON_BUTTON+'" data-close data-drawer-close aria-label="Close '+escape(reviewLabel)+' drawer">'+DashboardUI.renderIcon('x')+'</button>';
    return '<header class="review-top shrink-0 border-b border-edge bg-paper px-5 pb-3 pt-4"><div class="flex items-start gap-2"><div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"><h2 id="'+reviewKey+'Heading" class="m-0 text-lg font-semibold text-ink">'+escape(title)+'</h2>'+studentCount+'</div><div class="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1"><span class="'+BADGE+'">'+escape(reviewLabel)+'</span>'+meta+'</div>'+actionsMenu+closeButton+'</div>'+headerDetails+titleRow+navigation+'</header>'+
      '<div class="team-drawer-content min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas px-5 py-4" data-drawer-content>'+body+(footer?'':statusMessage)+'</div>'+
      (footer?'<footer class="review-footer flex shrink-0 flex-col gap-2 border-t border-edge bg-paper px-5 py-3">'+statusMessage+'<p class="m-0 text-xs text-muted" data-evaluation-progress aria-live="polite"></p><div class="flex flex-wrap items-center gap-2"><button type="button" class="'+BUTTON+' gap-1" data-pi-step="-1" data-pi-place="bottom">'+DashboardUI.renderIcon('chevron-left')+'Prev</button><button type="button" class="'+BUTTON+' gap-1" data-pi-step="1" data-pi-place="bottom">Next'+DashboardUI.renderIcon('chevron-right')+'</button>'+footer+'</div></footer>':'');
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
    document.body.dataset.scrollLocked='true';
    bridge.read('review-evaluation:'+reviewKey,'API_review_getEvaluation',[team,reviewKey],{timeoutMs:60000}).then(data=>{
      if(token!==sequence || !drawer.open)return;
      if(finishRead)finishRead();finishRead=null;reading=false;
      model=data;reviewLabel=data.config.label;dirty=false;pending=null;targeted=null;correctionIndex=null;render();
    },error=>{
      if(error && error.superseded)return;
      if(token!==sequence || !drawer.open)return;
      if(finishRead)finishRead();finishRead=null;reading=false;
      if(previous){model=previous;dirty=previousDirty;targeted=previousTarget;const reload=drawer.querySelector('[data-reload]');if(reload)reload.disabled=false;message(error.message+' Existing entries are retained. Use Reload to retry.');}
      else {drawer.innerHTML=shell(team,'<div class="'+CARD+' mb-4 flex flex-col items-start gap-3"><p class="m-0 text-sm text-ink-2">The evaluation could not be loaded.</p><button class="'+BUTTON+'" type="button" data-reload>Retry</button></div>');message(error.message);}
    });
  }
  function control(c,index,owner,score) {
    score=score||{};
    const id=owner+'-'+index;
    return '<fieldset class="review-criterion relative m-0 mb-4 min-w-0 '+CARD+'" data-index="'+index+'" data-owner="'+owner+'"'+(focusedAssessment() && (!targeted || String(owner)!==String(targeted.index) || !targeted.components.includes(c.type==='Team'?'team':'individual'))?' hidden':'')+'><legend class="review-criterion-accessible-title sr-only">'+escape(c.name)+'</legend>'+
      '<div class="flex items-center justify-between gap-2"><span class="'+BADGE+'">'+escape(c.pi+' · '+c.co)+'</span><span class="text-sm text-muted">Max '+c.maxMarks+' marks</span></div>'+
      '<h3 class="review-card-title m-0 mt-2 text-base font-semibold text-ink" aria-hidden="true">'+escape(c.name)+'</h3>'+
      '<select data-level hidden aria-label="Proficiency level"><option value="">Select level</option>'+[0,1,2,3,4,5].map(n=>'<option value="'+n+'"'+(score.level===n?' selected':'')+'>'+n+'</option>').join('')+'</select>'+
      '<div class="'+LEVELS+'" role="group" aria-label="Choose proficiency level">'+[0,1,2,3,4,5].map(n=>'<button type="button" class="'+LEVEL+'" data-pick-level="'+n+'" aria-pressed="'+(score.level===n)+'" aria-label="Level '+n+', '+bands[n]+'–'+bands[n+1]+'%, '+levelMarkRange(c.maxMarks,n)+' marks" title="Level '+n+' · '+bands[n]+'–'+bands[n+1]+'%"><strong>L'+n+'</strong><small>'+levelMarkRange(c.maxMarks,n)+'</small></button>').join('')+'</div>'+
      '<div data-descriptor aria-live="polite" class="mt-3 rounded-md bg-tint px-3 py-2 text-sm leading-relaxed text-ink-2"></div>'+
      '<details class="group mt-2"><summary class="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-primary hover:underline [&::-webkit-details-marker]:hidden">'+DashboardUI.renderIcon('chevron-right','','shrink-0 transition-transform group-open:rotate-90')+'View all level descriptors</summary><div class="mt-1 flex flex-col gap-2 border-l-2 border-edge pl-3">'+c.descriptors.map((text,i)=>'<p class="m-0 text-sm text-ink-2"><strong class="text-ink">Level '+i+':</strong> '+escape(text)+'</p>').join('')+'</div></details>'+
      '<div class="mt-4 border-t border-edge pt-4"><div class="flex flex-wrap items-center justify-between gap-2"><label class="text-sm font-semibold text-ink" for="reviewMarks-'+id+'">Awarded marks</label><span data-range class="text-sm text-muted"></span></div>'+
      '<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3"><div class="flex items-center gap-1"><button class="'+STEP+'" type="button" data-step="-0.5" aria-label="Decrease marks by 0.5">'+DashboardUI.renderIcon('minus')+'</button><input class="'+FIELD+' w-20 text-center text-base font-semibold tabular-nums" data-marks id="reviewMarks-'+id+'" aria-describedby="reviewMarksError-'+id+'" type="number" inputmode="decimal" min="0" max="'+c.maxMarks+'" step="0.5" value="'+escape(score.marks??'')+'"><button class="'+STEP+'" type="button" data-step="0.5" aria-label="Increase marks by 0.5">'+DashboardUI.renderIcon('plus')+'</button></div>'+
      '<div class="min-w-40 flex-1 pt-5"><input class="'+RANGE+'" data-marks-slider type="range" step="0.5" min="0" max="'+c.maxMarks+'" value="'+escape(score.marks??0)+'" aria-label="Adjust awarded marks"><span class="review-awarded-total hidden" data-awarded-total></span><div data-slider-values aria-hidden="true" class="mt-1 h-5 text-xs tabular-nums text-muted"></div></div></div></div>'+
      '<p class="m-0 mt-2 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger" data-marks-error id="reviewMarksError-'+id+'" aria-live="polite" hidden></p>'+
      '<div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-edge pt-4 text-sm"><div class="flex flex-wrap items-center gap-2"><strong class="text-ink">Criterion feedback</strong><span data-feedback-required class="rounded-md bg-warning-tint px-2 py-0.5 text-xs font-semibold text-warning"></span></div><span data-feedback-status class="text-sm text-muted"></span></div>'+
      '<div class="mt-2 flex flex-col gap-1.5 text-sm text-muted" data-feedback-options aria-label="Feedback suggestions"></div>'+
      '<button type="button" class="'+SMALL+' mt-2" data-other-feedback aria-pressed="false">Other remarks</button><label data-custom-feedback-label hidden class="mt-3 '+LABEL+'">Other remarks<textarea class="mt-1.5 '+TEXTAREA+'" data-custom-feedback maxlength="2000" rows="3" placeholder="Add custom feedback"></textarea></label><textarea data-remark hidden class="resize-y" maxlength="2000">'+escape(score.remark||'')+'</textarea></fieldset>';
  }
  function accordion(title,description,content) {
    return '<details class="review-accordion" data-criteria-group="'+(title==='Team Criteria'?'team':'individual')+'" name="review-criteria" id="'+reviewKey+'-'+(title==='Team Criteria'?'team':'individual')+'-panel" role="tabpanel" aria-labelledby="'+reviewKey+'-'+(title==='Team Criteria'?'team':'individual')+'-tab"'+(focusedAssessment()?(title==='Team Criteria'?' hidden':' open'):'')+'><summary class="hidden"><strong>'+title+'</strong>'+(title==='Team Criteria'?'<span data-team-mark aria-label="Common team score"></span>':'')+(description?'<span>'+description+'</span>':'')+'</summary><div>'+content+'</div></details>';
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
  function render() {withPass(renderDrawer);}
  function renderDrawer() {
    if(focusedAssessment())activeCriteria='individual';
    if(targeted)activeStudent=targeted.index;
    else if(hiddenStudent(activeStudent))activeStudent=pendingStudents()[0]??0;
    const d=model,old=d.evaluation||{},team=old.teamScores||{},savedStudents=old.students||[];
    const criteria=d.config.criteria;
    const teamFields=criteria.map((c,i)=>c.type==='Team'?control(c,i,'team',team[c.pi]):'').join('');
    const individual=d.roster.students.map((s,index)=>{
      const student=savedStudents.find(v=>v.register===s.register)||{},a=student.assessment||{},draft=a.makeupDraft||{},scores=targeted && targeted.index===index?(draft.scores||{}):!d.availability.editable && a.individualSource==='makeup'?(a.makeup?.scores||{}):(student.scores||{});
      return '<details class="review-student-accordion" data-student-group="'+index+'" name="review-students"'+(hiddenStudent(index) || index!==activeStudent?' hidden':'')+(index===activeStudent?' open':'')+'><summary class="hidden"><span><strong>'+escape(s.name)+'</strong><span data-individual-mark="'+index+'" aria-label="Individual score"></span></span><span><span>'+escape(s.register)+'</span><span data-assessment-status="'+index+'"></span></span></summary><div>'+(!d.availability.editable && !targeted && correctionIndex===null && student.assessment?.nextActions?.makeup?'<div class="mb-4">'+makeupControls(index,student)+'</div>':'')+absenceControl(index,student)+criteria.map((c,i)=>c.type==='Individual'?control(c,i,index,scores[c.pi]):targeted && targeted.index===index && targeted.components.includes('team')?control(c,i,index,(draft.team||{})[c.pi]):'').join('')+'</div></details>';
    }).join('');
    drawer.innerHTML=shell(d.details.team,(old.reason?'<p class="m-0 mb-4 rounded-md bg-warning-tint px-3 py-2 text-sm text-warning"><strong>Reopened:</strong> '+escape(old.reason)+'</p>':'')+'<form novalidate>'+accordion('Team Criteria','',teamFields || '<p>No team criteria configured.</p>')+accordion(focusedAssessment()?'Pending Assessment':'Individual Criteria',focusedAssessment()?'Review the pending student and enter their Individual Makeup.':'',focusedAssessment() || criteria.some(c=>c.type==='Individual')?individual:'<p>No individual criteria configured.</p>')+'</form>',d.roster.students,d,'<div data-review-actions class="ml-auto flex flex-wrap items-center gap-2">'+(d.availability.editable?'<button class="'+BUTTON+'" type="button" data-draft>Save Draft</button><button class="'+PRIMARY+'" type="button" data-submit>Submit</button>':'')+'</div>');
    if(targeted)drawer.querySelector('[data-review-actions]').innerHTML='<button class="'+BUTTON+'" type="button" data-reload>Cancel Makeup</button><button class="'+BUTTON+'" type="button" data-target-draft>Save Makeup Draft</button><button class="'+PRIMARY+'" type="button" data-target-submit>Submit Makeup</button>';
    drawer.querySelectorAll('[data-absence] input,[data-absence] select,[data-absence] textarea').forEach(el=>el.disabled=!!targeted);
    syncStudentSelection();syncCriteriaTabs();updateRanges();drawer.querySelector('[data-close]').focus();
  }
  // Markup last written to each element, so unchanged fragments are not re-parsed on every keystroke.
  const writtenHtml=new WeakMap();
  function setHtml(element,html) {
    if(writtenHtml.get(element)===html)return;
    element.innerHTML=html;writtenHtml.set(element,html);
  }
  // At most seven evenly spaced half-mark values, always including both ends of the level's range.
  function sliderScale(range) {
    const steps=Math.round((range.max-range.min)*2);
    let every=1;while(every<steps && (steps%every || steps/every>6))every++;
    return Array.from({length:steps/every+1},(_,i)=>range.min+i*every/2);
  }
  function markPill(pill,c,graded) {
    if(!pill)return;
    pill.dataset.complete=String(graded);pill.setAttribute('aria-label',c.pi+' · '+c.co+' · '+c.name+': '+(graded?'Completed':'Incomplete'));
    const icon=pill.querySelector('[data-pi-icon]');if(icon)setHtml(icon,DashboardUI.renderIcon(graded?'check':'clock'));
  }
  function updateRanges() {withPass(refreshRanges);}
  function refreshRanges() {
    if(!model)return;
    let completed=0,count=0;
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
        markPill(drawer.querySelector('[data-select-pi="'+field.dataset.index+'"]'),c,graded);
      }
      else {
        markPill(drawer.querySelector('[data-select-individual-pi="'+field.dataset.index+'"][data-student="'+field.dataset.owner+'"]'),c,graded);
      }
      field.dataset.graded=String(graded);
      if(graded)completed++;
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
          setHtml(values,values.hidden?'':'<span class="flex justify-between">'+sliderScale(range).map(value=>'<span'+(marks!=='' && Number(marks)===value?' class="font-semibold text-primary"':'')+'>'+value+'</span>').join('')+'</span>');
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
          options.innerHTML=pendingIndividual?'<small>'+escape(pendingMessage)+'</small>':level===''?'<small>Select a level for suggested feedback.</small>':feedbackOptions(c,n).map((suggestion,i)=>'<button type="button" class="'+FEEDBACK+'" data-feedback="'+i+'" aria-pressed="false" aria-label="'+escape(suggestion)+'">'+DashboardUI.renderIcon('plus')+' '+escape(suggestion)+'</button>').join('');
        }
        const suggestions=feedbackOptions(c,n),selected=selectedFeedback(remark.value);
        options.querySelectorAll('[data-feedback]').forEach(button=>{
          const suggestion=suggestions[Number(button.dataset.feedback)],pressed=selected.has(suggestion);
          button.disabled=busy || !editable;
          button.setAttribute('aria-pressed',String(pressed));
          setHtml(button,DashboardUI.renderIcon(pressed?'check':'plus','','mt-0.5 shrink-0')+' '+escape(suggestion));
        });
      }
    });
    const progress=drawer.querySelector('[data-evaluation-progress]');
    if(progress) {
      const remaining=count-completed;
      progress.hidden=focusedAssessment() && !targeted;
      progress.textContent=!(model.availability.editable || targeted)?completed+' of '+count+' criteria evaluated':!count?'No criteria to evaluate':!remaining?'All criteria evaluated':remaining+(remaining===1?' criterion':' criteria')+' remaining';
    }
    syncIndividualCards();
    updateNavigator();
    updateAbsenceDisplay();
  }
  const mark=value=>value===null || value===undefined || !Number.isFinite(Number(value))?'Pending':String(value);
  function updateAbsenceDisplay() {
    model.roster.students.forEach((s,index)=>{
      const host=drawer.querySelector('[data-absence="'+index+'"]');
      const f=facts(index),old=savedStudent(index);
      if(host)updateAttendanceCard(host,index,f);
      updatePreview(s,index,f,old);
    });
  }
  function updateAttendanceCard(host,index,f) {
    ['type','approved','contribution','attended'].forEach(name=>{const node=host.querySelector('[data-fact="'+name+'"]');if(node)node.disabled=!canEditAbsence(index);});
    const picker=host.querySelector('[data-attendance-picker]');
    if(picker){picker.querySelector('[data-attendance-summary]').setAttribute('aria-disabled',String(!canEditAbsence(index)));if(!canEditAbsence(index))picker.open=false;picker.querySelector('[data-attendance-label]').textContent=(attendanceChoices.find(([k])=>k===f.type)||attendanceChoices[0])[1];picker.querySelectorAll('[data-attendance-option]').forEach(n=>{n.disabled=!canEditAbsence(index);n.checked=n.value===f.type;});}
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
      evidenceHost.querySelectorAll('[data-supporting-evidence],[data-other-evidence]').forEach(node=>{node.disabled=!relevant || !canEditAbsence(index);});
    }
  }
  function updatePreview(s,index,f,old) {
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
    const individual=drawer.querySelector('[data-individual-mark="'+index+'"]');if(individual)individual.textContent=mark(a.individualMark)+' / '+model.config.criteria.filter(c=>c.type==='Individual').reduce((n,c)=>n+c.maxMarks,0);
    const status=drawer.querySelector('[data-assessment-status="'+index+'"]');if(status)status.textContent='Assessment status: '+(a.status||'INCOMPLETE');
    const score=drawer.querySelector('[data-student-score="'+index+'"]');if(score)score.textContent=reviewTotal(preview);
    const note=drawer.querySelector('[data-student-score-note="'+index+'"]');if(note)note.textContent='Review total. '+(STATUS_LABELS[a.status]||'Assessment Incomplete')+'.';
    const team=drawer.querySelector('[data-team-mark]');if(team)team.textContent=mark(Object.values(teamScores).every(s=>s&&s.marks!==null)?Object.values(teamScores).reduce((n,s)=>n+s.marks,0):null);
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
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  return {open};
}
function getReviewEvaluationClientScript_() {
  return [reviewPolicyFacts_,reviewPolicyScoresComplete_,reviewPolicyCalculate_].map(f=>f.toString()).join('\n')+'\nconst ReviewAssessmentBrowser = '+reviewEvaluationBrowser_.toString()+'; const ReviewEvaluations = (()=>{const instances=new Map();const get=key=>{if(!instances.has(key))instances.set(key,ReviewAssessmentBrowser(key,DataBridge));return instances.get(key);};return {open:(team,key,button)=>get(key).open(team,button)};})();';
}
