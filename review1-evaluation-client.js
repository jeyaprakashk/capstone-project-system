/** Shared drawer classes supply layout; native dialog supplies modality and focus containment. */
function review1EvaluationBrowser_(reviewKey='review1') {
  const reviewNumber=reviewKey==='review2'?'2':'1',reviewLabel='Review '+reviewNumber;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rpc=(method,args,ok,fail)=>DashboardUI.guideRun().withSuccessHandler(ok).withFailureHandler(fail)[method.replace('Review1','Review'+reviewNumber)](...args);
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
  const reviewDayReasons={MEDICAL:'Medical reason',PERSONAL_FAMILY:'Personal / family reason',OFFICIAL_ACADEMIC:'Official academic activity',OTHER_APPROVED:'Other approved reason'};
  const reviewDayEvidence={MEDICAL_DOCUMENT:'Medical document provided',APPROVAL_DOCUMENT:'Official approval/permission provided',OTHER:'Other supporting evidence'};
  const contributionOptions={GUIDE_CONFIRMATION:'Guide confirmation',PROJECT_LOG:'Project log',GITHUB_ACTIVITY:'GitHub activity',ASSIGNED_TASK:'Assigned task evidence',TECHNICAL_DESIGN:'Technical / design deliverables',OTHER:'Other contribution evidence'};
  function reviewDayFields(index,f) {
    const choices=(options,kind,attr,selected)=>Object.entries(options).map(([value,label])=>'<label class="review1-absence-choice"><input type="'+kind+'" name="'+reviewKey+'-absence-'+index+'" '+attr+' value="'+value+'"'+(selected(value)?' checked':'')+'> '+(attr==='data-supporting-evidence' && value==='OTHER'?'<span data-other-evidence-option>'+label+'</span>':label)+'</label>').join('');
    return '<div data-review-day-fields'+(f.type!=='NORMAL' && f.approved===true?'':' hidden')+'><fieldset><legend data-absence-reason-label>'+ (f.type==='PROLONGED'?'Reason for approved absence *':'Reason for absence *')+'</legend>'+choices(reviewDayReasons,'radio','data-primary-reason',v=>f.absenceReason===v)+'</fieldset><fieldset><legend data-absence-evidence-label>'+(f.type==='PROLONGED'?'Supporting absence evidence (optional)':'Supporting evidence (optional)')+'</legend>'+choices({...reviewDayEvidence,OTHER:f.type==='PROLONGED'?'Other supporting absence evidence':reviewDayEvidence.OTHER},'checkbox','data-supporting-evidence',v=>(f.supportingEvidence||[]).includes(v))+'</fieldset><label data-other-reason-label hidden>Specify other approved reason<textarea data-other-reason maxlength="2000">'+escape(f.otherReasonText||'')+'</textarea></label><label data-other-evidence-label hidden><span data-other-evidence-title>Describe other supporting evidence</span><textarea data-other-evidence maxlength="2000">'+escape(f.otherEvidenceText||'')+'</textarea></label>'+(f.reason?'<p class="review1-recorded-reason">Historical reason / evidence: '+escape(f.reason)+'</p>':'')+'</div>';
  }
  function contributionFields(f) {
    return '<div data-contribution-fields'+(f.verifiedContribution===true?'':' hidden')+'><fieldset><legend>Contribution evidence *</legend>'+Object.entries(contributionOptions).map(([value,label])=>'<label class="review1-absence-choice"><input type="checkbox" data-contribution-evidence value="'+value+'"'+((f.contributionEvidence||[]).includes(value)?' checked':'')+'> '+label+'</label>').join('')+'</fieldset><label data-other-contribution-label hidden>Describe other contribution evidence *<textarea data-other-contribution maxlength="2000">'+escape(f.otherContributionEvidenceText||'')+'</textarea></label></div>';
  }
  function structuredReasonSummary(f) {
    const contribution=f.type==='PROLONGED' && f.verifiedContribution?'<div><dt>Contribution evidence</dt><dd>'+escape((f.contributionEvidence||[]).map(e=>contributionOptions[e]).join(', ')||'See historical evidence')+(f.otherContributionEvidenceText?': '+escape(f.otherContributionEvidenceText):'')+'</dd></div>':'';
    if(!f.absenceReason)return contribution;
    return contribution+'<div><dt>Reason for absence</dt><dd>'+escape(reviewDayReasons[f.absenceReason])+(f.otherReasonText?': '+escape(f.otherReasonText):'')+'</dd></div><div><dt>Supporting evidence</dt><dd>'+escape((f.supportingEvidence||[]).map(e=>reviewDayEvidence[e]).join(', ')||'None')+(f.otherEvidenceText?': '+escape(f.otherEvidenceText):'')+'</dd></div>';
  }
  let drawer,model,trigger,busy=false,dirty=false,sequence=0,pending=null,targeted=null,reading=false,finishRead=null,correctionIndex=null,activeStudent=0,activeCriteria='team';
  function message(text) {drawer.querySelector('[data-message]').textContent=text.replaceAll('Review 1',reviewLabel);}
  function savedStudent(index) {return ((model.evaluation||{}).students||[]).find(s=>s.register===model.roster.students[index].register)||{};}
  function pendingStudents() {
    if(!model || model.availability.editable)return [];
    return model.roster.students.map((_,index)=>index).filter(index=>{
      const a=savedStudent(index).assessment||{};
      return ['MAKEUP_PENDING','ACADEMIC_DECISION_PENDING'].includes(a.status) || assessmentComponents(a).length>0;
    });
  }
  function focusedAssessment() {return !!targeted || pendingStudents().length>0;}
  function hiddenStudent(index) {return targeted?targeted.index!==index:focusedAssessment() && !pendingStudents().includes(index);}
  function criteriaTabs() {
    return '<div class="review1-criteria-tabs" role="tablist" aria-label="Assessment components">'+['team','individual'].map(component=>{
      const label=component==='team'?'Team Criteria':'Individual',max=model.config.criteria.filter(c=>c.type.toLowerCase()===component).reduce((sum,c)=>sum+c.maxMarks,0);
      return '<button type="button" role="tab" id="'+reviewKey+'-'+component+'-tab" data-criteria-tab="'+component+'" aria-controls="'+reviewKey+'-'+component+'-panel" aria-selected="'+(activeCriteria===component)+'" tabindex="'+(activeCriteria===component?'0':'-1')+'"><span class="review1-tab-label">'+DashboardUI.renderIcon(component==='team'?'users':'user')+label+'</span><span class="review1-tab-caption">'+max+' pts '+(component==='team'?'pool':'weight')+'</span></button>';
    }).join('')+'</div>';
  }
  let gradingProgress={team:{graded:0,total:0},individual:{graded:0,total:0}},activeTeamPI=null,activeStudentPIs={};
  function piPillLabel(c) {
    return '<span data-pi-icon>'+DashboardUI.renderIcon('clock')+'</span><span class="review1-pi-label"><strong>'+escape(c.pi+'–'+c.co)+'</strong><small>0–'+escape(c.maxMarks)+'</small></span>';
  }
  function individualPills(owner) {
    return '<div class="review1-pi-pills" data-individual-pills="'+owner+'" role="group" aria-label="Individual performance indicators">'+model.config.criteria.map((c,index)=>{
      if(c.type!=='Individual' && !(targeted && targeted.index===owner && targeted.components.includes('team')))return '';
      return '<button type="button" data-select-individual-pi="'+index+'" data-student="'+owner+'" aria-pressed="false" title="'+escape(c.name)+'">'+piPillLabel(c)+'</button>';
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
    return '<div class="review1-pi-pills" data-team-pills role="group" aria-label="Team performance indicators">'+criteria.map(({c,index})=>'<button type="button" data-select-pi="'+index+'" aria-pressed="'+(index===activeTeamPI)+'" title="'+escape(c.name)+'">'+piPillLabel(c)+'</button>').join('')+'</div>';
  }
  function updateTabProgress() {
    const row=drawer.querySelector('[data-tab-progress]');if(!row)return;
    const {graded,total}=gradingProgress[activeCriteria],status=total>0 && graded===total?'complete':graded>0?'partial':'empty';
    row.innerHTML='<span>'+(activeCriteria==='team'?'Performance Indicators':'Students')+'</span><span class="review1-graded-pill" data-completion="'+status+'">'+graded+' of '+total+' graded</span>';
  }
  function syncCriteriaTabs() {
    for(const component of ['team','individual']) {
      const selected=activeCriteria===component,tab=drawer.querySelector('[data-criteria-tab="'+component+'"]'),panel=drawer.querySelector('[data-criteria-group="'+component+'"]');
      if(tab){tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;tab.disabled=busy || reading || focusedAssessment() && component==='team';}
      if(panel){panel.hidden=!selected;panel.open=selected;}
    }
    const students=drawer.querySelector('.review1-header-students');if(students)students.hidden=activeCriteria!=='individual';
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
  function selectStudent(index) {
    if(busy || reading || !model || !model.roster.students[index] || hiddenStudent(index))return;
    activeStudent=index;syncStudentSelection();
    const group=drawer.querySelector('[data-criteria-group="individual"]');
    if(group)revealCriterion(group);
  }
  function studentChips(students) {
    return '<ul class="review1-header-students" aria-label="Select student">'+students.map((s,index)=>{
      const words=String(s.name||s.register).trim().split(/\s+/),short=words[0]+(words.length>1?' '+words[words.length-1].charAt(0)+'.':'');
      const initials=words.map(w=>w.charAt(0)).slice(0,2).join('');
      return '<li'+(hiddenStudent(index)?' hidden':'')+'><button type="button" data-select-student="'+index+'" aria-pressed="'+(index===activeStudent)+'" title="'+escape(s.name+' ('+s.register+')')+'" aria-label="'+escape('Assess '+s.name+', '+s.register)+'"><span class="review1-avatar" aria-hidden="true">'+escape(initials)+'</span><span class="review1-student-details">'+escape(short)+'</span><small class="review1-student-register">'+escape(s.register)+'</small><span class="review1-student-score" data-student-score="'+index+'">— / '+model.config.maximum+'</span></button></li>';
    }).join('')+'</ul>';
  }
  function assessmentSummaryCard(students) {
    return '<section class="review1-assessment-summary" data-assessment-summary aria-live="polite" aria-label="Assessment Summary"><h3>Assessment Summary <small data-summary-unsaved hidden>Unsaved preview</small></h3>'+students.map((student,index)=>assessmentSummary(index)).join('')+'</section>';
  }
  function assessmentSummary(index) {
    const student=savedStudent(index).assessment?savedStudent(index):(model.assessmentResults||[]).find(s=>s.register===model.roster.students[index].register)||{};
    const actions=!model.availability.editable && !targeted && correctionIndex===null && student.assessment?academicControls(index,student):'';
    return '<div data-summary-student="'+index+'"'+(hiddenStudent(index) || index!==activeStudent?' hidden':'')+'><dl data-summary-values="'+index+'">'+assessmentSummaryValues(student)+'</dl>'+actions+'</div>';
  }
  function assessmentSummaryValues(student) {
    const a=student.assessment||{},maximum=type=>model.config.criteria.filter(c=>c.type===type).reduce((sum,c)=>sum+c.maxMarks,0);
    const component=(value,state)=>value!=null?mark(value):state==='PENDING'?'Pending':'Unassessed';
    const unresolved=a.teamState==='PENDING' || a.individualState==='PENDING'?'Pending':'Incomplete';
    const labels={COMPLETED:'Completed',MAKEUP_PENDING:'Makeup Pending',COMPLETED_AFTER_MAKEUP:'Completed after Makeup',ABSENT_UNAPPROVED:'Absent – Unapproved',ACADEMIC_DECISION_PENDING:'Academic Decision Required',NON_PARTICIPATION:'Non-Participation',INCOMPLETE:'Assessment Incomplete'};
    const cells=[['Team Mark',component(a.teamMark,a.teamState)+' / '+maximum('Team')],['Individual Mark',component(a.individualMark,a.individualState)+' / '+maximum('Individual')],['Review Total',(student.total==null?unresolved:mark(student.total))+' / '+model.config.maximum]];
    const tone=['COMPLETED','COMPLETED_AFTER_MAKEUP'].includes(a.status)?'complete':['MAKEUP_PENDING','ACADEMIC_DECISION_PENDING'].includes(a.status)?'pending':['ABSENT_UNAPPROVED','NON_PARTICIPATION'].includes(a.status)?'exception':'incomplete';
    return cells.map(([label,value],index)=>'<div'+(index===2?' class="review1-summary-total" data-resolved="'+(student.total!=null)+'"':'')+'><dt>'+label+'</dt><dd>'+escape(value)+'</dd></div>').join('')+'<div class="review1-summary-status" data-tone="'+tone+'"><dt>Assessment Status</dt><dd>'+escape(labels[a.status]||'Assessment Incomplete')+'</dd></div>';
  }
  function canEditAbsence(index) {return !busy && !reading && !targeted && (model.availability.editable || correctionIndex===index);}
  const attendanceChoices=[['','Select attendance'],['NORMAL','Present / Normal'],['REVIEW_DAY_ABSENCE','Review-Day Absence'],['PROLONGED','Prolonged Absence']];
  function attendancePicker(index,value) {
    const current=attendanceChoices.find(([key])=>key===value)||attendanceChoices[0];
    return '<div class="review1-attendance"><span id="'+reviewKey+'AttendanceLabel-'+index+'">Absence / exception</span><select data-fact="type" hidden aria-hidden="true" tabindex="-1">'+attendanceChoices.map(([key,label])=>'<option value="'+key+'"'+(key===current[0]?' selected':'')+'>'+label+'</option>').join('')+'</select><details class="review1-attendance-picker" data-attendance-picker><summary aria-labelledby="'+reviewKey+'AttendanceLabel-'+index+' '+reviewKey+'AttendanceValue-'+index+'"><span data-attendance-label id="'+reviewKey+'AttendanceValue-'+index+'">'+current[1]+'</span>'+DashboardUI.renderIcon('chevron-down')+'</summary><div class="review1-attendance-options" role="radiogroup" aria-labelledby="'+reviewKey+'AttendanceLabel-'+index+'">'+attendanceChoices.map(([key,label])=>'<label><input type="radio" name="'+reviewKey+'Attendance-'+index+'" data-attendance-option value="'+key+'"'+(key===current[0]?' checked':'')+'><span>'+label+'</span></label>').join('')+'</div></details></div>';
  }
  function focusAttendance(host) {
    const summary=host.querySelector('[data-attendance-picker] > summary');
    (summary||host.querySelector('[data-fact="type"]')).focus();
  }
  async function editAbsence(index) {
    if(busy || reading || targeted || model.availability.editable)return;
    if(dirty && !await DashboardUI.ask('Discard unsaved changes before editing this absence correction?'))return;
    correctionIndex=index;dirty=false;pending=null;render();
    revealCriterion(drawer.querySelector('[data-absence="'+index+'"]'));
    const group=drawer.querySelector('[data-student-group="'+index+'"]');if(group)group.open=true;
    focusAttendance(drawer.querySelector('[data-absence="'+index+'"]'));
  }
  async function cancelAbsence(index) {
    if(busy || reading || correctionIndex!==index)return;
    if(dirty && !await DashboardUI.ask('Discard unsaved absence correction?'))return;
    correctionIndex=null;dirty=false;pending=null;render();
    revealCriterion(drawer.querySelector('[data-absence="'+index+'"]'));
    const group=drawer.querySelector('[data-student-group="'+index+'"]');if(group)group.open=true;
    const button=drawer.querySelector('[data-edit-absence="'+index+'"]');if(button)button.focus();
  }
  function facts(index) {
    const host=drawer.querySelector('[data-absence="'+index+'"]');
    if(!host)return (savedStudent(index).assessment||{}).facts||{type:'NORMAL',attended:true};
    const read=name=>host.querySelector('[data-fact="'+name+'"]').value;
    const type=read('type');
    if(!type)return {type:'UNSELECTED',attended:null};
    if(type==='REVIEW_DAY_ABSENCE' && read('approved')==='no')return {type,approved:false,attended:false,absenceReason:null,supportingEvidence:[],otherReasonText:null,otherEvidenceText:null};
    const structured=type!=='NORMAL' && host.querySelector('[data-review-day-fields]');
    const extra=structured?{absenceReason:(host.querySelector('[data-primary-reason]:checked')||{}).value||null,supportingEvidence:Array.from(host.querySelectorAll('[data-supporting-evidence]:checked'),e=>e.value),otherReasonText:host.querySelector('[data-other-reason]').value,otherEvidenceText:host.querySelector('[data-other-evidence]').value}:{};
    if(structured && extra.absenceReason!=='OTHER_APPROVED')extra.otherReasonText=null;
    if(structured && !extra.supportingEvidence.includes('OTHER'))extra.otherEvidenceText=null;
    if(structured && read('approved')!=='yes')Object.assign(extra,{absenceReason:null,supportingEvidence:[],otherReasonText:null,otherEvidenceText:null});
    if(type==='PROLONGED' && host.querySelector('[data-contribution-fields]'))Object.assign(extra,{contributionEvidence:read('contribution')==='yes'?Array.from(host.querySelectorAll('[data-contribution-evidence]:checked'),e=>e.value):[],otherContributionEvidenceText:read('contribution')==='yes' && host.querySelector('[data-contribution-evidence][value="OTHER"]:checked')?host.querySelector('[data-other-contribution]').value:null});
    return {...extra,type,approved:read('approved')===''?null:read('approved')==='yes',verifiedContribution:read('contribution')===''?null:read('contribution')==='yes',attended:type==='NORMAL'?true:type==='REVIEW_DAY_ABSENCE'?false:read('attended')===''?null:read('attended')==='yes',reason:structured?((savedStudent(index).assessment||{}).facts||{}).reason||'':read('reason')};
  }
  function canEdit(field) {
    if(targeted)return field.dataset.owner===String(targeted.index) && targeted.components.includes(model.config.criteria[Number(field.dataset.index)].type==='Team'?'team':'individual');
    if(!model.availability.editable)return false;
    if(field.dataset.owner==='team')return true;
    const index=Number(field.dataset.owner),f=facts(index),old=savedStudent(index);
    if(f.type!=='NORMAL' && old.scores && model.config.criteria.filter(c=>c.type==='Individual').every(c=>old.scores[c.pi] && old.scores[c.pi].marks!==null))return false;
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
    // Retain access to legitimate saved evidence even when a later absence is recorded.
    const scores=savedStudent(index).scores||{};
    return model.config.criteria.filter(c=>c.type==='Individual').every(c=>{
      const score=scores[c.pi];
      return score && Number.isFinite(score.marks) && Number.isInteger(score.level) && (score.level>=2 || String(score.remark||'').trim());
    });
  }
  function assessmentComponents(a) {
    if(a.nextActions)return a.nextActions.assessmentComponents;
    // Legacy responses may omit a pending mark; the summary displays both null and undefined as Pending.
    return a.authorized && a.authorized.length?a.authorized:(a.facts && a.facts.approved && a.status==='MAKEUP_PENDING' && a.individualMark==null?['individual']:[]);
  }
  function eligibleComponents(student) {
    const a=student.assessment||{},f=a.facts||{};
    const teamPending=a.teamState?a.teamState==='PENDING':a.teamMark===null;
    const individualComplete=model.config.criteria.filter(c=>c.type==='Individual').every(c=>{
      const score=(student.scores||{})[c.pi];
      return score && Number.isFinite(score.marks) && Number.isInteger(score.level) && (score.level>=2 || String(score.remark||'').trim());
    });
    return [...(teamPending?['team']:[]),...(!individualComplete && a.individualState!=='UNASSESSED' && (a.individualMark===null || f.type!=='NORMAL' && f.approved===false)?['individual']:[])];
  }
  function academicControls(index,student) {
    const a=student.assessment||{},f=a.facts||{},eligible=eligibleComponents(student),authorized=assessmentComponents(a);
    const teamPending=a.teamState?a.teamState==='PENDING':a.teamMark===null;
    const judgment=a.nextActions?a.nextActions.academicDecision:teamPending || !authorized.length && (a.individualMark===null || f.approved===false && eligible.length);
    let html='';
    if(judgment) {
      const decisions=[...(eligible.length?[['MAKEUP_ALTERNATIVE_ASSESSMENT','Authorize Makeup / Alternative Assessment']]:[]),
        ...(a.teamMark===null || a.individualMark===null?[['DEFERRED_ASSESSMENT','Deferred Assessment']]:[]),
        ...(teamPending?[['TEAM_MARK_APPLICABLE','Team Mark Applicable'],['TEAM_MARK_NOT_APPLICABLE','Team Mark Not Applicable']]:[]),['OTHER','Other permitted academic decision']];
      html+='<details class="review1-summary-decision"><summary>Record Academic Decision</summary><label>Academic decision<select data-decision="'+index+'">'+decisions.map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('')+'</select></label>';
      if(eligible.length>1)html+='<label data-component-choice="'+index+'">Components for assessment<select data-components="'+index+'"><option value="team">Team</option><option value="individual">Individual</option><option value="team,individual">Team and Individual</option></select></label>';
      html+='<label>Decision reason<textarea data-decision-reason="'+index+'" maxlength="2000"></textarea></label><button type="button" data-record-decision="'+index+'">Record decision</button></details>';
    }
    if(authorized.length)html+='<button type="button" data-target="'+index+'">'+(a.individualState==='UNASSESSED' && f.attended?'Complete Individual Assessment':a.status==='MAKEUP_PENDING' && authorized.length===1 && authorized[0]==='individual'?'Conduct Makeup Assessment':'Conduct Authorized Assessment')+'</button>';
    return html;
  }
  function assessmentHistory(decisions) {
    return DashboardUI.renderAssessmentHistory(decisions);
  }

  function absenceControl(index,student) {
    const a=student.assessment||{},f=a.facts||{type:'UNSELECTED'};
    const readOnly=!model.availability.editable && correctionIndex!==index;
    const labels={UNSELECTED:'Not selected',NORMAL:'Present / Normal',REVIEW_DAY_ABSENCE:'Review-Day Absence',PROLONGED:'Prolonged Absence'};
    const recorded=readOnly?'<dl class="review1-exception-summary"><div><dt>Absence type</dt><dd>'+escape(labels[f.type])+'</dd></div>'+(f.type!=='NORMAL'?'<div><dt>Approval status</dt><dd>'+(f.approved?'Approved':'Unapproved')+'</dd></div>'+(f.reason?'<div><dt>Recorded reason / evidence</dt><dd class="review1-recorded-reason">'+escape(f.reason)+'</dd></div>':'')+structuredReasonSummary(f)+(f.type==='PROLONGED'?'<div><dt>Verified contribution</dt><dd>'+(f.verifiedContribution?'Yes':'No')+'</dd></div><div><dt>Attended scheduled review</dt><dd>'+(f.attended?'Yes':'No')+'</dd></div>':''):'')+'</dl>':'';
    const choice=(name,value)=>'<select data-fact="'+name+'"><option value="">Select</option><option value="yes"'+(value===true?' selected':'')+'>Yes</option><option value="no"'+(value===false?' selected':'')+'>No</option></select>';
    return '<div class="review1-criterion" data-absence="'+index+'"'+(targeted?' hidden':'')+'>'+(!model.availability.editable && f.type==='REVIEW_DAY_ABSENCE' && f.approved?'<h4>Approved Review-Day Absence</h4>':'')+recorded+'<div data-absence-editor'+(readOnly?' hidden':'')+'>'+attendancePicker(index,f.type)+'<div data-exception-fields'+(f.type==='NORMAL'?' hidden':'')+'><label>Absence approved?'+choice('approved',f.approved)+'</label>'+reviewDayFields(index,f)+'<div data-prolonged-fields'+(f.type!=='PROLONGED'?' hidden':'')+'><label>Attended scheduled review?'+choice('attended',f.attended)+'</label><label>Verified contribution during assessment period?'+choice('contribution',f.verifiedContribution)+'</label>'+contributionFields(f)+'</div><div data-legacy-evidence hidden><textarea data-fact="reason" hidden>'+escape(f.reason||'')+'</textarea></div></div></div><div data-effective="'+index+'"></div>'+(!model.availability.editable && !targeted && (f.type!=='NORMAL' || ['MAKEUP_PENDING','ACADEMIC_DECISION_PENDING'].includes(a.status))?(correctionIndex===index?'<button type="button" data-record-absence="'+index+'">Save absence details</button><button type="button" data-cancel-absence="'+index+'">Cancel editing</button>':'<button type="button" data-edit-absence="'+index+'">Edit absence details</button>'):'')+assessmentHistory(a.decisions)+'</div>';
  }
  async function close() {
    if (busy || (dirty && !await DashboardUI.ask('Discard unsaved '+reviewLabel+' marks?'))) return;
    if(finishRead)finishRead();finishRead=null;reading=false;
    sequence++;drawer.close();dirty=false;model=null;pending=null;correctionIndex=null;
    document.body.classList.remove('team-drawer-open');
    if (trigger && trigger.isConnected) trigger.focus();
  }
  function ensure() {
    if (drawer) return;
    drawer=document.createElement('dialog');drawer.className='team-drawer open review1-drawer';
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
        if(field){activeTeamPI=Number(button.dataset.selectPi);syncCriteriaTabs();const content=drawer.querySelector('.team-drawer-content');if(content)content.scrollTop=0;const level=field.querySelector('[data-pick-level]');if(level)level.focus({preventScroll:true});}
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
      if(button.hasAttribute('data-select-student')){selectStudent(Number(button.dataset.selectStudent));return;}
      if(button.hasAttribute('data-close'))return close();
      if(button.hasAttribute('data-draft'))return save(false);
      if(button.hasAttribute('data-submit'))return save(true);
      if(button.hasAttribute('data-edit-absence'))return editAbsence(Number(button.dataset.editAbsence));
      if(button.hasAttribute('data-cancel-absence'))return cancelAbsence(Number(button.dataset.cancelAbsence));
      if(button.hasAttribute('data-record-absence'))academic('exception',Number(button.dataset.recordAbsence));
      if(button.hasAttribute('data-record-decision'))academic('decision',Number(button.dataset.recordDecision));
      if(button.hasAttribute('data-target')) {
        if(busy || reading)return;
        if(dirty && !await DashboardUI.ask('Discard unsaved changes and open the authorized assessment?'))return;
        const index=Number(button.dataset.target),a=savedStudent(index).assessment||{};
        targeted={index,components:assessmentComponents(a)};correctionIndex=null;dirty=false;render();
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
      if(event.target.hasAttribute('data-decision')){
        const choice=drawer.querySelector('[data-component-choice="'+event.target.dataset.decision+'"]');
        if(choice)choice.hidden=event.target.value!=='MAKEUP_ALTERNATIVE_ASSESSMENT';
      }
    });
    document.body.appendChild(drawer);
  }
  function shell(title,body,students=[],assessment=null,footer='') {
    title=String(title||'').trim().toUpperCase();
    const timing=assessment && assessment.availability.timing || {tone:'neutral',label:''};
    const dateLabel=assessment?new Date(assessment.config.due*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):'';
    const dateDetails=assessment?'Due '+day(assessment.config.due)+' · '+timing.label+' · '+assessment.status+' · Opens '+day(assessment.config.opens)+(assessment.availability.editable && assessment.availability.late?' · Late submissions allowed':''):'';
    const meta=assessment?'<span class="review1-header-due" data-timing="'+escape(timing.tone)+'" title="'+escape(dateDetails)+'">Due '+escape(dateLabel)+(timing.label?' · '+escape(timing.label):'')+'</span>':'';
    const projectTitle=assessment?String(assessment.details.title||'Project title not provided'):'';
    const titleRow=assessment?'<details class="review1-project-title-row"><summary title="'+escape(projectTitle)+'">'+DashboardUI.renderIcon('file-text')+'<span>'+escape(projectTitle)+'</span>'+DashboardUI.renderIcon('chevron-down','','review1-title-chevron')+'</summary><p>'+escape(projectTitle)+'</p></details>':'';
    const headerDetails=assessment?'<div class="review1-project-meta-row"><p class="review1-project-meta">Guide: '+escape(assessment.details.guideName)+'</p><p class="review1-project-meta">Committee: '+escape(assessment.details.committee)+'</p></div>':'';
    const navigation=assessment?'<div class="review1-assessment-navigation">'+criteriaTabs()+'<div class="review1-tab-progress" data-tab-progress aria-live="polite"></div>'+teamPills()+(students.length?studentChips(students):'')+'</div>':'';
    if(assessment && students.length)body=assessmentSummaryCard(students)+body;
    return '<div class="team-drawer-header"><div class="review1-heading-details"><div class="review1-header-line"><h2 class="team-drawer-title" id="'+reviewKey+'Heading">'+escape(title)+'</h2><span class="review1-header-review">'+escape(reviewLabel)+'</span>'+meta+'</div>'+(assessment?'<div class="review1-progress" data-evaluation-progress aria-live="polite"></div>':'')+headerDetails+titleRow+'</div><button type="button" class="team-drawer-close" data-close aria-label="Close '+escape(reviewLabel)+' drawer">×</button></div>'+navigation+'<div class="team-drawer-content">'+body+'<p data-message role="status" aria-live="polite"></p></div>'+footer;
  }

  function open(team,button) {
    if (busy || reading) return;
    if (DashboardUI.closeRubricDrawer) DashboardUI.closeRubricDrawer(false);
    ensure();
    const previous=drawer.open && drawer.dataset.team===team?model:null,previousDirty=dirty,previousTarget=targeted,previousCorrection=correctionIndex;
    trigger=button;reading=true;
    if(previous && DashboardUI.beginContentLoading){finishRead=DashboardUI.beginContentLoading(drawer.querySelector('.team-drawer-content'),'Refreshing '+reviewLabel+' evaluation');const reload=drawer.querySelector('[data-reload]');if(reload)reload.disabled=true;}
    else {activeCriteria='team';activeStudent=0;activeStudentPIs={};model=null;dirty=false;pending=null;targeted=null;correctionIndex=null;drawer.dataset.team=team;drawer.innerHTML=shell(team,DashboardUI.renderSkeleton('drawer','Loading '+reviewLabel+' evaluation'));}
    const token=++sequence;
    if(!drawer.open)drawer.showModal();
    document.body.classList.add('team-drawer-open');
    rpc('getReview1Evaluation',[team],data=>{
      if(token!==sequence || !drawer.open)return;
      if(finishRead)finishRead();finishRead=null;reading=false;
      model=data;dirty=false;pending=null;targeted=null;correctionIndex=null;render();
    },error=>{
      if(token!==sequence || !drawer.open)return;
      if(finishRead)finishRead();finishRead=null;reading=false;
      if(previous){model=previous;dirty=previousDirty;targeted=previousTarget;correctionIndex=previousCorrection;const reload=drawer.querySelector('[data-reload]');if(reload)reload.disabled=false;message(error.message+' Existing entries are retained. Use Reload to retry.');}
      else {drawer.innerHTML=shell(team,'<button type="button" data-reload>Retry</button>');message(error.message);}
    });
  }
  function control(c,index,owner,score) {
    score=score||{};
    return '<fieldset class="guide-eval-criterion review1-criterion '+(c.type==='Team'?'review1-team-rubric':'review1-individual-rubric')+'" data-index="'+index+'" data-owner="'+owner+'"'+(focusedAssessment() && (!targeted || String(owner)!==String(targeted.index) || !targeted.components.includes(c.type==='Team'?'team':'individual'))?' hidden':'')+'><legend class="review1-criterion-accessible-title">'+escape(c.name)+'</legend><div class="review1-criterion-meta"><span>'+escape(c.pi+' · '+c.co)+'</span><span>Max '+c.maxMarks+' marks</span></div><h3 class="review1-card-title">'+escape(c.name)+'</h3><p class="review1-control-title">Proficiency level</p><select data-level hidden aria-label="Proficiency level"><option value="">Select level</option>'+[0,1,2,3,4,5].map(n=>'<option value="'+n+'"'+(score.level===n?' selected':'')+'>'+n+'</option>').join('')+'</select><div class="review1-levels" role="group" aria-label="Choose proficiency level">'+[0,1,2,3,4,5].map(n=>'<button type="button" data-pick-level="'+n+'" aria-pressed="'+(score.level===n)+'" aria-label="Level '+n+'" title="Level '+n+' · '+bands[n]+'–'+bands[n+1]+'%"><strong>L'+n+'</strong><small>'+levelMarkRange(c.maxMarks,n)+'</small></button>').join('')+'</div><div class="review1-descriptor" data-descriptor aria-live="polite"></div><details><summary>View full rubric descriptors</summary>'+c.descriptors.map((text,i)=>'<p><strong>Level '+i+':</strong> '+escape(text)+'</p>').join('')+'</details><div class="review1-award"><div class="review1-award-heading"><label for="review1Marks-'+owner+'-'+index+'">Fine-tune mark</label><span data-range></span></div><div class="review1-stepper"><button type="button" data-step="-0.5" aria-label="Decrease marks">−</button><input data-marks id="review1Marks-'+owner+'-'+index+'" aria-describedby="review1MarksError-'+owner+'-'+index+'" type="number" min="0" max="'+c.maxMarks+'" step="0.5" value="'+escape(score.marks??'')+'"><button type="button" data-step="0.5" aria-label="Increase marks">+</button></div><input data-marks-slider type="range" step="0.5" min="0" max="'+c.maxMarks+'" value="'+escape(score.marks??0)+'" aria-label="Adjust awarded marks"><span class="review1-awarded-total" data-awarded-total></span><div class="review1-slider-values" data-slider-values aria-label="Selectable marks"></div></div><p class="review1-marks-error" data-marks-error id="review1MarksError-'+owner+'-'+index+'" aria-live="polite" hidden></p><div class="review1-feedback-heading"><div class="review1-feedback-title"><strong>Criterion Feedback</strong><span data-feedback-required></span></div><span data-feedback-status></span></div><div class="review1-feedback-options" data-feedback-options aria-label="Feedback suggestions"></div><button type="button" class="review1-other-feedback" data-other-feedback aria-pressed="false">Other remarks</button><label class="review1-feedback-label" data-custom-feedback-label hidden>Other remarks<textarea data-custom-feedback maxlength="2000" rows="2" placeholder="Add custom feedback"></textarea></label><textarea data-remark hidden maxlength="2000">'+escape(score.remark||'')+'</textarea></fieldset>';
  }
  function accordion(title,description,content) {
    return '<details class="review1-accordion" data-criteria-group="'+(title==='Team Criteria'?'team':'individual')+'" name="review1-criteria" id="'+reviewKey+'-'+(title==='Team Criteria'?'team':'individual')+'-panel" role="tabpanel" aria-labelledby="'+reviewKey+'-'+(title==='Team Criteria'?'team':'individual')+'-tab"'+(focusedAssessment()?(title==='Team Criteria'?' hidden':' open'):'')+'><summary><strong>'+title+'</strong>'+(title==='Team Criteria'?'<span class="review1-header-mark" data-team-mark aria-label="Common team score"></span>':'')+(description?'<span>'+description+'</span>':'')+'</summary><div class="review1-accordion-content">'+content+'</div></details>';
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
      const student=savedStudents.find(v=>v.register===s.register)||{},a=student.assessment||{},draft=a.targetDraft||{},scores=targeted && targeted.index===index?(draft.individual||student.scores||{}):(student.scores||{});
      return '<details class="review1-student-accordion" data-student-group="'+index+'" name="review1-students"'+(hiddenStudent(index) || index!==activeStudent?' hidden':'')+(index===activeStudent?' open':'')+'><summary><span class="review1-student-heading"><strong>'+escape(s.name)+'</strong><span class="review1-header-mark" data-individual-mark="'+index+'" aria-label="Individual score"></span></span><span class="review1-student-subheading"><span>'+escape(s.register)+'</span><span data-assessment-status="'+index+'"></span></span></summary><div class="review1-accordion-content">'+absenceControl(index,student)+individualPills(index)+criteria.map((c,i)=>c.type==='Individual'?control(c,i,index,scores[c.pi]):targeted && targeted.index===index && targeted.components.includes('team')?control(c,i,index,(draft.team||{})[c.pi]):'').join('')+'</div></details>';
    }).join('');
    drawer.innerHTML=shell(d.details.team,(old.reason?'<p>Reopened: '+escape(old.reason)+'</p>':'')+'<form novalidate>'+accordion('Team Criteria','',teamFields || '<p>No team criteria configured.</p>')+accordion(focusedAssessment()?'Pending Assessment':'Individual Criteria',focusedAssessment()?'Review the pending student and enter their authorized assessment.':'',focusedAssessment() || criteria.some(c=>c.type==='Individual')?individual:'<p>No individual criteria configured.</p>')+'</form>',d.roster.students,d,'<div class="review1-footer"><div class="review1-actions">'+(d.availability.editable?'<button type="button" data-draft>Save Draft</button><button type="button" data-submit>Submit Evaluation</button>':'')+'<button type="button" data-reload>Reload</button><button type="button" data-close>Close</button></div></div>');
    if(targeted)drawer.querySelector('.review1-actions').innerHTML='<button type="button" data-target-draft>Save assessment draft</button><button type="button" data-target-submit>Complete assessment</button><button type="button" data-reload>Cancel / Reload</button><button type="button" data-close>Close</button>';
    drawer.querySelector('form').addEventListener('submit',event=>event.preventDefault());
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
        : assessment && assessment.individualMark===null && ['MAKEUP_PENDING','ACADEMIC_DECISION_PENDING'].includes(assessment.status));
      const academicPending=model.availability.editable?absence && absence.type==='PROLONGED' && !absence.verifiedContribution:assessment && assessment.status==='ACADEMIC_DECISION_PENDING';
      const pendingMessage=pendingIndividual?(academicPending?'Individual assessment pending academic decision.':'Individual assessment pending makeup.') : '';
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
          values.innerHTML=values.hidden?'':Array.from({length:Math.round((range.max-range.min)*2)+1},(_,i)=>{const value=range.min+i/2;return '<span'+(marks!=='' && Number(marks)===value?' class="is-selected"':'')+'>'+value+'</span>';}).join('');
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
          options.innerHTML=pendingIndividual?'<small>'+escape(pendingMessage)+'</small>':level===''?'<small>Select a level for suggested feedback.</small>':feedbackOptions(c,n).map((suggestion,i)=>'<button type="button" data-feedback="'+i+'" aria-pressed="false" aria-label="'+escape(suggestion)+'" title="Add this feedback">+ '+escape(suggestion)+'</button>').join('');
        }
        const suggestions=feedbackOptions(c,n),selected=selectedFeedback(remark.value);
        options.querySelectorAll('button').forEach(button=>{
          const suggestion=suggestions[Number(button.dataset.feedback)],pressed=selected.has(suggestion);
          button.disabled=busy || !editable;
          button.setAttribute('aria-pressed',String(pressed));
          button.title=pressed?'Remove this feedback':'Add this feedback';
          const label=(pressed?'✓ ':'+ ')+suggestion;
          if(button.textContent!==label)button.textContent=label;
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
    if(progress)progress.innerHTML='<span class="review1-progress-students">'+model.roster.students.length+' '+(model.roster.students.length===1?'student':'students')+'</span><div class="review1-progress-completion"><span><strong>'+completed+' of '+count+'</strong> criteria evaluated</span><progress max="'+Math.max(1,count)+'" value="'+completed+'" aria-label="Evaluated criteria"></progress></div>';
    syncIndividualCards();
    updateAbsenceDisplay();
  }
  const mark=value=>value===null || value===undefined || !Number.isFinite(Number(value))?'Pending':String(value);
  function updateAbsenceDisplay() {
    model.roster.students.forEach((s,index)=>{
      const host=drawer.querySelector('[data-absence="'+index+'"]');if(!host)return;
      const f=facts(index),old=savedStudent(index),a=old.assessment;
      ['type','approved','contribution','attended','reason'].forEach(name=>host.querySelector('[data-fact="'+name+'"]').disabled=!canEditAbsence(index));
      const picker=host.querySelector('[data-attendance-picker]');
      if(picker){
        const value=host.querySelector('[data-fact="type"]').value;
        picker.querySelector('[data-attendance-label]').textContent=(attendanceChoices.find(([key])=>key===value)||attendanceChoices[0])[1];
        picker.querySelector('summary').setAttribute('aria-disabled',String(!canEditAbsence(index)));
        if(!canEditAbsence(index))picker.open=false;
        picker.querySelectorAll('[data-attendance-option]').forEach(option=>{option.disabled=!canEditAbsence(index);option.checked=option.value===value;});
      }
      host.querySelector('[data-exception-fields]').hidden=f.type==='NORMAL' || f.type==='UNSELECTED';
      host.querySelector('[data-prolonged-fields]').hidden=f.type!=='PROLONGED';
      const dayFields=host.querySelector('[data-review-day-fields]'),legacy=host.querySelector('[data-legacy-evidence]');
      if(dayFields) {
        const active=f.type!=='NORMAL' && f.approved===true,editable=canEditAbsence(index);
        dayFields.hidden=!active;legacy.hidden=true;
        host.querySelectorAll('[data-primary-reason],[data-supporting-evidence]').forEach(el=>{
          const unavailable=el.value==='APPROVAL_DOCUMENT' && f.approved!==true;
          el.disabled=!active || !editable || unavailable;
          if(f.type!=='NORMAL' && editable && f.approved===false)el.checked=false;
          el.required=active && el.hasAttribute('data-primary-reason');
        });
        for(const [name,show] of [['reason',f.absenceReason==='OTHER_APPROVED'],['evidence',(f.supportingEvidence||[]).includes('OTHER')]]) {
          host.querySelector('[data-other-'+name+'-label]').hidden=!active || !show;
          const field=host.querySelector('[data-other-'+name+']');field.disabled=!active || !show || !editable;field.required=active && show;
        }
      }
      const contributionHost=host.querySelector('[data-contribution-fields]');
      if(contributionHost) {
        const active=f.type==='PROLONGED' && f.verifiedContribution===true,editable=canEditAbsence(index);
        contributionHost.hidden=!active;
        const evidence=Array.from(host.querySelectorAll('[data-contribution-evidence]'));
        evidence.forEach(el=>{el.disabled=!active || !editable;if(!active && editable)el.checked=false;el.setCustomValidity(active && !evidence.some(e=>e.checked)?'Select at least one contribution evidence item.':'');});
        const other=active && (f.contributionEvidence||[]).includes('OTHER'),field=host.querySelector('[data-other-contribution]');
        host.querySelector('[data-other-contribution-label]').hidden=!other;field.disabled=!other || !editable;field.required=other;
      }
      const reasonLabel=host.querySelector('[data-absence-reason-label]'),evidenceLabel=host.querySelector('[data-absence-evidence-label]');
      if(reasonLabel)reasonLabel.textContent=f.type==='PROLONGED'?'Reason for approved absence *':'Reason for absence *';
      if(evidenceLabel)evidenceLabel.textContent=f.type==='PROLONGED'?'Supporting absence evidence (optional)':'Supporting evidence (optional)';
      const otherOption=host.querySelector('[data-other-evidence-option]'),otherTitle=host.querySelector('[data-other-evidence-title]');
      if(otherOption)otherOption.textContent=f.type==='PROLONGED'?'Other supporting absence evidence':'Other supporting evidence';
      if(otherTitle)otherTitle.textContent=f.type==='PROLONGED'?'Describe other supporting absence evidence *':'Describe other supporting evidence';
      const value=(type,owner)=>{
        const criteria=model.config.criteria.filter(c=>c.type===type);
        const values=criteria.map(c=>{
          const i=model.config.criteria.indexOf(c),field=drawer.querySelector('[data-index="'+i+'"][data-owner="'+(owner??(type==='Team'?'team':index))+'"]');
          const v=field && field.querySelector('[data-marks]').value;
          const stored=type==='Team' && !field && ((model.evaluation||{}).teamScores||{})[c.pi];
          return stored?stored.marks:v===undefined || v===''?null:Number(v);
        });return values.some(v=>v===null)?null:values.reduce((n,v)=>n+v,0);
      };
      const commonTeam=value('Team');
      let t=commonTeam,i=value('Individual'),status='COMPLETED';
      if(f.type==='PROLONGED' && f.verifiedContribution===false)t=f.approved?null:0;
      if(f.attended===false && !(f.type==='PROLONGED' && i!==null))i=f.approved?null:0;
      if(f.type==='PROLONGED' && f.approved && f.verifiedContribution===false && i===null)status='ACADEMIC_DECISION_PENDING';
      else if(i===null && f.approved && f.attended===false)status='MAKEUP_PENDING';
      else if(f.attended===false && f.approved===false)status='ABSENT_UNAPPROVED';
      if(f.type==='PROLONGED' && f.approved===false && f.verifiedContribution===false)status='NON_PARTICIPATION';
      if(f.type==='PROLONGED' && f.approved && f.verifiedContribution===false)status='ACADEMIC_DECISION_PENDING';
      if(status==='COMPLETED' && (t===null || i===null))status='INCOMPLETE';
      let teamState=t===null?(f.type==='PROLONGED' && f.approved && f.verifiedContribution===false?'PENDING':'UNASSESSED'):'RESOLVED';
      let individualState=i===null?(f.attended===false && f.approved?'PENDING':'UNASSESSED'):'RESOLVED';
      if(!model.availability.editable && a){teamState=a.teamState;individualState=a.individualState;t=a.teamMark??null;i=a.individualMark??null;status=a.status;}
      if(targeted && targeted.index===index && targeted.components.includes('individual')){i=value('Individual');individualState=i===null?'UNASSESSED':'RESOLVED';}
      const total=t===null || i===null?null:Math.round((t+i)*100)/100;
      const maximum=type=>model.config.criteria.filter(c=>c.type===type).reduce((n,c)=>n+c.maxMarks,0);
      const statusLabel=status?status.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()):'Pending';
      const teamBadge=drawer.querySelector('[data-team-mark]');
      if(teamBadge)teamBadge.textContent=(commonTeam===null?'Unassessed':mark(commonTeam))+' / '+maximum('Team');
      const individualBadge=drawer.querySelector('[data-individual-mark="'+index+'"]');
      if(individualBadge)individualBadge.textContent=(i===null && individualState==='UNASSESSED'?'Unassessed':mark(i))+' / '+maximum('Individual');
      const assessmentStatus=drawer.querySelector('[data-assessment-status="'+index+'"]');
      if(assessmentStatus)assessmentStatus.textContent='Assessment status: '+statusLabel;
      const values=drawer.querySelector('[data-summary-values="'+index+'"]');
      if(values && dirty && (model.availability.editable || correctionIndex===index || targeted && targeted.index===index)) {
        const checkedValue=(type,owner)=>{
          const criteria=model.config.criteria.filter(c=>c.type===type);
          const valid=criteria.every(c=>{
            const field=drawer.querySelector('[data-index="'+model.config.criteria.indexOf(c)+'"][data-owner="'+owner+'"]');
            if(!field)return false;
            const level=field.querySelector('[data-level]').value,marks=field.querySelector('[data-marks]').value,remark=field.querySelector('[data-remark]').value;
            const n=Number(level),m=Number(marks),range=Number.isInteger(n) && n>=0 && n<=5?bounds(c.maxMarks,n):null;
            return level!=='' && marks!=='' && range && Number.isFinite(m) && Number.isInteger(m*2) && m>=range.min && m<=range.max && (n>=2 || !!remark.trim()) && remark.length<=2000;
          });
          return valid?value(type,owner):null;
        };
        let previewTeam=model.availability.editable || correctionIndex===index?checkedValue('Team','team'):a?.teamMark??null;
        let previewIndividual=model.availability.editable || correctionIndex===index?checkedValue('Individual',index):a?.individualMark??null;
        let previewTeamState=previewTeam===null?'UNASSESSED':'RESOLVED',previewIndividualState=previewIndividual===null?'UNASSESSED':'RESOLVED',previewStatus='COMPLETED';
        if(!model.availability.editable && a){previewTeamState=a.teamState;previewIndividualState=a.individualState;previewStatus=a.status;}
        if(model.availability.editable || correctionIndex===index) {
          previewStatus=a?.makeupCompleted?'COMPLETED_AFTER_MAKEUP':'COMPLETED';
          if(f.type==='UNSELECTED'){previewIndividual=null;previewIndividualState='UNASSESSED';}
          else if(f.type!=='NORMAL' && (f.approved===null || f.type==='PROLONGED' && (f.attended===null || f.verifiedContribution===null))) {
            previewTeam=null;previewIndividual=null;previewTeamState='UNASSESSED';previewIndividualState='UNASSESSED';
          } else {
            if(f.type==='PROLONGED' && f.verifiedContribution===false){previewTeam=f.approved?null:0;previewTeamState=f.approved?'PENDING':'RESOLVED';}
            const preserved=savedStudent(index).assessment?.makeupCompleted || f.type==='PROLONGED' && previewIndividual!==null;
            if(f.attended===false && !preserved){previewIndividual=f.approved?null:0;previewIndividualState=f.approved?'PENDING':'RESOLVED';}
            if(f.attended===false && f.approved===false && !preserved)previewStatus='ABSENT_UNAPPROVED';
            if(f.type==='PROLONGED' && f.approved===false && f.verifiedContribution===false)previewStatus='NON_PARTICIPATION';
          }
          if(correctionIndex===index && (a?.teamDecision || a?.alternativeTeamScores)){previewTeam=a.teamMark;previewTeamState=a.teamState;}
        }
        if(targeted && targeted.index===index) {
          if(targeted.components.includes('team')){previewTeam=checkedValue('Team',index);previewTeamState=previewTeam===null?'PENDING':'RESOLVED';}
          if(targeted.components.includes('individual')){previewIndividual=checkedValue('Individual',index);previewIndividualState=previewIndividual===null?'PENDING':'RESOLVED';}
          if(previewTeam!==null && previewIndividual!==null)previewStatus='COMPLETED_AFTER_MAKEUP';
        }
        const previewTotal=previewTeam===null || previewIndividual===null?null:Math.round((previewTeam+previewIndividual)*100)/100;
        if(previewTeamState==='PENDING')previewStatus='ACADEMIC_DECISION_PENDING';
        else if(previewIndividualState==='PENDING')previewStatus='MAKEUP_PENDING';
        else if(previewTotal===null)previewStatus='INCOMPLETE';
        values.innerHTML=assessmentSummaryValues({total:previewTotal,assessment:{teamMark:previewTeam,individualMark:previewIndividual,teamState:previewTeamState,individualState:previewIndividualState,status:previewStatus}});
      }
      const summary=drawer.querySelector('[data-student-score="'+index+'"]');
      if(summary)summary.textContent=mark(total)+' / '+model.config.maximum;
    });
  }
  function academic(action,index) {
    if(busy || reading)return;
    if(action==='exception' && correctionIndex!==index)return;
    if(action==='decision' && correctionIndex!==null){message('Save or cancel the absence correction before recording an academic decision.');return;}
    const input={review:reviewKey,team:model.roster.team,student:model.roster.students[index].register,revision:model.revision,token:model.token};
    const reasonField=drawer.querySelector('[data-decision-reason="'+index+'"]');
    input.reason=reasonField?reasonField.value:'';
    if(action==='exception'){input.absence=facts(index);input.reason=input.reason || input.absence.reason;}
    else {input.decision=drawer.querySelector('[data-decision="'+index+'"]').value;if(input.decision==='MAKEUP_ALTERNATIVE_ASSESSMENT'){const selector=drawer.querySelector('[data-components="'+index+'"]');input.components=selector?selector.value.split(','):eligibleComponents(savedStudent(index));}}
    sendAcademic(action==='exception'?'recordReviewAbsence':'recordReviewAcademicDecision',input);
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
  async function saveTarget(submit) {
    if(busy || reading || !targeted)return;
    updateRanges();if(!validateFeedback(submit))return;
    const reason=await DashboardUI.requestText(savedStudent(targeted.index).assessment.individualState==='UNASSESSED'?'Individual assessment remark':'Makeup / alternative assessment remark');if(!reason || !reason.trim())return;
    const input={review:reviewKey,team:model.roster.team,student:model.roster.students[targeted.index].register,revision:model.revision,token:model.token,submit,reason};
    targeted.components.forEach(component=>{input[component==='team'?'teamScores':'scores']={};});
    drawer.querySelectorAll('[data-index]').forEach(field=>{
      if(!canEdit(field))return;
      const c=model.config.criteria[Number(field.dataset.index)],level=field.querySelector('[data-level]').value,marks=field.querySelector('[data-marks]').value;
      input[c.type==='Team'?'teamScores':'scores'][c.pi]={level:level===''?null:Number(level),marks:marks===''?null:marks,remark:field.querySelector('[data-remark]').value};
    });
    sendAcademic('saveReviewTargetedAssessment',input);
  }
  function sendAcademic(method,input) {
    const signature=JSON.stringify({method,input});if(!pending || pending.signature!==signature)pending={signature,id:requestId()};
    input.requestId=pending.id;setBusy(true);message('Saving assessment…');
    rpc(method,[input],result=>{
      busy=false;dirty=false;pending=null;targeted=null;correctionIndex=null;model.revision=result.revision;model.status=result.status;model.evaluation=result.evaluation;
      render();message('Assessment saved. Changed results require publication.');refreshTable();
    },error=>{setBusy(false);message(error.message+' Your entries are retained.');});
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
    const method=submit?'submitReview1Evaluation':'saveReview1EvaluationDraft', signature=JSON.stringify({method,payload});
    if(!pending || pending.signature!==signature)pending={signature,id:requestId()};
    payload.requestId=pending.id;setBusy(true);message('Saving Review 1…');
    rpc(method,[payload],result=>{
      dirty=false;pending=null;model.revision=result.revision;model.status=result.status;
      model.evaluation=result.evaluation || {...payload,status:result.status,submittedAt:result.submittedAt,submittedDay:result.submittedDay,late:result.late};model.availability.editable=result.status==='Draft';
      if(result.timing)model.availability.timing=result.timing;
      busy=false;render();message(result.status==='Draft'?'Draft saved.':'Review 1 submitted.');refreshTable();
    },error=>{setBusy(false);message(error.message+' Your entries are retained. Retry uses the same request ID until you edit.');});
  }
  function refreshTable() {
    const host=document.getElementById('reviewerContent');if(!host)return;
    if(host.getAttribute('aria-busy')==='true')return;
    const finish=DashboardUI.beginContentLoading(host,'Refreshing assigned teams');
    const search=document.getElementById('reviewerAssignedSearch'),query=search?search.value:'';
    rpc('refreshReviewerContentForCurrentUser',[],html=>{
      finish();
      host.innerHTML=html;const box=document.getElementById('reviewerAssignedSearch');if(box)box.value=query;
      DashboardUI.filterReviewerAssignedTeams(false);
    },()=>{finish();if(drawer.open)message('Evaluation saved. The assigned-team table could not refresh; reload to retry.');});
  }
  function admin() { return InternalAssessmentPublishing.refresh(reviewKey); }
  let studentBusy=false;
  function student() {
    const host=document.getElementById('studentReview'+reviewNumber+'Evaluation');if(!host || studentBusy)return;
    studentBusy=true;
    const finish=DashboardUI.beginContentLoading(host,'Loading '+reviewLabel+' results');
    rpc('loadPublishedReview1Evaluation',[],result=>{
      finish();studentBusy=false;
      if(!result){host.textContent=reviewLabel+': not published.';return;}
      const a=result.assessment || {};
      host.innerHTML='<h3>'+escape(result.config.label)+'</h3><p>Team Mark: '+mark(a.teamMark)+' &middot; Individual Mark: '+mark(a.individualMark)+' &middot; Review Total: '+mark(result.total)+' / '+result.config.maximum+' &middot; Course contribution '+mark(result.weighted)+' / '+(result.config.weight*100)+' &middot; Status: '+escape(a.status || 'Pending')+'</p>'+result.config.criteria.map(c=>{
        const score=result.scores[c.pi] || {},effective=a.effectiveScores && a.effectiveScores[c.pi];
        return '<p><strong>'+escape(c.name)+'</strong>: '+mark(effective?effective.marks:score.marks)+' / '+c.maxMarks+'</p>'+(effective && effective.source==='policy'?'<p>Policy-assigned zero</p>':'<p>'+escape(score.remark)+'</p>');
      }).join('');
    },error=>{
      finish();studentBusy=false;
      const notice=document.createElement('p');notice.textContent=reviewLabel+' results unavailable. '+error.message+' ';
      const button=document.createElement('button');button.textContent='Retry';button.onclick=()=>{notice.remove();student();};notice.appendChild(button);host.appendChild(notice);
    });
  }
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  return {open,admin,student};
}
function getReview1EvaluationClientScript_() {return 'const ReviewAssessmentBrowser = '+review1EvaluationBrowser_.toString()+'; const Review1Evaluation = ReviewAssessmentBrowser("review1"); const Review2Evaluation = ReviewAssessmentBrowser("review2");';}
function getReview1EvaluationStyles_() {
  return `.review1-drawer { inset:0 0 0 auto; margin:0; padding:0; border:0; max-width:100vw; max-height:100dvh; height:100dvh; box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden; font-size:12px; line-height:1.5; }
  .review1-drawer .team-drawer-title { margin:0; font-family:inherit; font-size:16px; font-weight:700; line-height:1.4; letter-spacing:0; text-transform:uppercase; }
  .review1-drawer .drawer-project-title { font-size:13px; }
  .review1-drawer .review1-project-meta { font-size:10px; }
  .review1-project-meta-row { display:flex; align-items:baseline; justify-content:space-between; gap:4px 16px; flex-wrap:wrap; margin:8px 0 0; color:var(--color-ink-muted,#667085); }
  .review1-project-meta-row .review1-project-meta { margin:0; min-width:0; overflow-wrap:anywhere; }
  .review1-project-meta-row .review1-project-meta:last-child { flex-shrink:0; text-align:right; }

  .review1-exception-summary { display:grid; gap:16px; margin:16px 0; }
  .review1-exception-summary dt, .review1-assessment-summary dt { font-size:12px; color:var(--muted-text, var(--color-ink-muted,#64748b)); margin-bottom:4px; }
  .review1-exception-summary dd, .review1-assessment-summary dd { margin:0; overflow-wrap:anywhere; }
  .review1-criterion .review1-absence-choice { display:flex; align-items:center; gap:6px; margin-top:6px; font-weight:400; }
  .review1-criterion .review1-absence-choice input { width:auto; margin:0; }
  .review1-criterion :is([data-review-day-fields],[data-contribution-fields]) fieldset { border:0; padding:0; margin:12px 0; }
  .review1-assessment-summary dd { font-size:12px; font-weight:600; }
  .review1-recorded-reason { white-space:pre-wrap; }
  .review1-drawer:not([open]) { display:none; }
  .review1-drawer.open { transform:none; transition:none; }
  .review1-drawer [hidden] { display:none !important; }
  .review1-drawer::backdrop { background:rgba(15,23,42,.28); }
  .review1-drawer .team-drawer-header { position:relative; display:block; flex-shrink:0; }
  .review1-heading-details { min-width:0; flex:1; }
  .review1-team-line { display:flex; align-items:center; justify-content:space-between; gap:8px 12px; flex-wrap:wrap; }
  .review1-team-line .team-drawer-title { margin:0; }
  .review1-header-line { display:flex; align-items:center; flex-wrap:wrap; gap:6px; min-height:36px; padding-right:44px; margin-bottom:0; color:var(--color-ink,#344054); font-size:12px; font-weight:500; line-height:1.5; }
  .review1-header-line > span { white-space:nowrap; }
  .review1-header-review { padding:2px 8px; border-radius:999px; background:var(--color-accent-tint,#f4ebff); color:var(--color-accent-primary,#6941c6); font-size:11px; font-weight:500; }
  .review1-header-line .review1-header-due { padding:2px 6px; border:1px solid var(--color-control-border,#d0d5dd); border-radius:4px; background:var(--color-canvas,#f9fafb); color:var(--color-ink,#182230); font-size:10px; font-weight:500; }
  .review1-header-line .review1-header-due[data-timing="info"] { background:var(--color-info-tint,#eff8ff); border-color:var(--color-info,#b2ddff); color:var(--color-info,#175cd3); }
  .review1-header-line .review1-header-due[data-timing="success"] { background:var(--color-success-tint,#ecfdf3); border-color:var(--color-success,#abefc6); color:var(--color-success,#067647); }
  .review1-header-line .review1-header-due[data-timing="warning"] { background:var(--color-warning-tint,#fffaeb); border-color:var(--color-warning,#fedf89); color:var(--color-warning,#93370d); }
  .review1-header-line .review1-header-due[data-timing="danger"] { background:var(--color-danger-tint,#fef3f2); border-color:var(--color-danger,#fecdca); color:var(--color-danger,#b42318); }
  .review1-header-line .review1-header-due { white-space:normal; }
  .review1-heading-details > .review1-progress { margin-top:8px; width:100%; box-sizing:border-box; }
  .review1-project-title-row { margin-top:8px; border-top:1px solid var(--color-border,#e4e7ec); border-bottom:1px solid var(--color-border,#e4e7ec); }
  .review1-project-title-row > summary { display:flex; align-items:center; gap:6px; padding:7px 0; list-style:none; cursor:pointer; color:var(--color-ink,#344054); font-size:11px; font-weight:600; }
  .review1-project-title-row > summary::-webkit-details-marker { display:none; }
  .review1-project-title-row > summary > span { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .review1-project-title-row .lucide-icon { width:13px; height:13px; flex-shrink:0; color:var(--color-accent-primary,#9333ea); }
  .review1-project-title-row .review1-title-chevron { color:var(--color-ink-muted,#98a2b3); }
  .review1-project-title-row[open] .review1-title-chevron { transform:rotate(180deg); }
  .review1-project-title-row > summary:focus-visible { outline:2px solid var(--color-accent-primary,#6941c6); outline-offset:2px; border-radius:4px; }
  .review1-project-title-row > p { margin:0 0 8px; max-height:15dvh; overflow:auto; overflow-wrap:anywhere; font-size:12px; color:var(--color-ink,#344054); }
  .review1-assessment-navigation { flex:0 0 auto; padding:6px 20px 4px; background:var(--color-canvas,#f8fafc); border-bottom:1px solid var(--color-border,#e4e7ec); }
  .review1-criteria-tabs { display:flex; gap:4px; padding:3px; margin:0; border:1px solid var(--color-border,#e4e7ec); border-radius:var(--editorial-radius,11px); background:var(--color-paper,#fff); }
  .review1-drawer .review1-criteria-tabs [role="tab"] { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0; min-width:0; min-height:44px; box-sizing:border-box; padding:4px 5px; border:1px solid transparent; border-radius:var(--editorial-radius,8px); background:transparent; color:var(--color-ink,#344054); font-size:12px; font-weight:600; line-height:1.4; }
  .review1-tab-label { display:flex; align-items:center; justify-content:center; gap:5px; }
  .review1-tab-label .lucide-icon { width:14px; height:14px; color:var(--color-ink-muted,#98a2b3); }
  .review1-tab-caption { color:var(--color-ink-muted,#8492a6); font-size:11px; font-weight:400; }
  .review1-pi-pills { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-start; gap:6px; padding:0; margin-top:6px; }
  .review1-pi-pills[data-individual-pills] { margin:0 0 6px; }
  .review1-drawer .review1-pi-pills button { display:flex; flex:0 0 auto; align-items:center; justify-content:flex-start; gap:5px; width:auto; min-width:0; max-width:100%; min-height:34px; box-sizing:border-box; padding:4px 8px; margin:0; border:1px solid var(--color-control-border,#d0d5dd); border-radius:var(--editorial-radius,6px); background:var(--color-paper,#fff); color:var(--color-ink-muted,#475467); font-size:11px; text-align:left; }
  .review1-pi-label { display:flex; flex-direction:column; align-items:flex-start; line-height:1.3; overflow-wrap:anywhere; }
  .review1-pi-label strong { font-size:11px; font-weight:600; }
  .review1-pi-label small { font-size:9px; font-weight:400; }
  .review1-pi-pills [data-pi-icon] { display:flex; }
  .review1-pi-pills .lucide-icon { width:12px; height:12px; }
  .review1-drawer .review1-pi-pills button[aria-pressed="false"]:not(:disabled):hover { border-color:var(--color-accent-primary,#9e77ed); background:var(--color-accent-tint,#f4f3ff); color:var(--color-ink-muted,#475467); }
  .review1-drawer .review1-pi-pills [data-complete="true"] { color:var(--color-success,#067647); background:var(--color-success-tint,#ecfdf3); border-color:var(--color-success,#abefc6); }
  .review1-drawer .review1-pi-pills button[aria-pressed="true"],.review1-drawer .review1-pi-pills button[aria-pressed="true"]:hover { border-color:var(--color-accent-primary,#6941c6); background:var(--color-accent-primary,#6941c6); color:var(--color-paper,#fff); box-shadow:0 1px 3px rgba(16,24,40,.12); }
  .review1-drawer .review1-pi-pills[data-individual-pills] button[aria-pressed="false"]:not(:disabled):hover { border-color:var(--color-accent-secondary,#99f6e4); background:var(--color-accent-tint,#f0fdfa); color:var(--color-accent-primary,#115e59); }
  .review1-drawer .review1-pi-pills[data-individual-pills] button[aria-pressed="true"], .review1-drawer .review1-pi-pills[data-individual-pills] button[aria-pressed="true"]:hover { border-color:var(--color-accent-secondary,#99f6e4); background:var(--color-accent-tint,#f0fdfa); color:var(--color-accent-primary,#115e59); box-shadow:inset 0 0 0 1px var(--color-accent-primary,#14b8a6); }
  .review1-card-title { display:none; }
  .review1-criterion[data-index] { position:relative; margin:0 0 16px; padding:16px; border:1px solid var(--color-border,#e4e7ec); border-top:5px solid var(--color-accent-primary,#7f56d9); border-radius:var(--editorial-radius,16px); background:linear-gradient(110deg,var(--color-paper,#fff) 65%,var(--color-accent-tint,#faf5ff)); }
  .review1-individual-rubric[data-index] { border-top-color:var(--color-accent-primary,#0f766e); background:linear-gradient(110deg,var(--color-paper,#fff) 65%,var(--color-accent-tint,#f0fdfa)); }
  .review1-individual-rubric[data-index] .review1-criterion-meta span:first-child { background:var(--color-accent-tint,#f0fdfa); color:var(--color-accent-primary,#115e59); }
  .review1-criterion[data-index] > legend { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  .review1-criterion[data-index] .review1-card-title { display:block; margin:8px 0 14px; color:var(--color-ink,#182230); font-size:14px; line-height:1.4; font-weight:700; }
  .review1-criterion[data-index] .review1-criterion-meta { margin-bottom:0; gap:6px; }
  .review1-criterion[data-index] .review1-criterion-meta span { padding:3px 6px; font-size:10px; }
  .review1-criterion[data-index] .review1-control-title { margin-top:10px; color:var(--color-ink-muted,#8492a6); font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
  .review1-criterion[data-index] .review1-levels button[aria-pressed="true"] { background:var(--color-accent-primary,#6941c6); color:var(--color-paper,#fff); border-color:var(--color-accent-secondary,#b692f6); }
  .review1-criterion[data-index] .review1-feedback-heading { margin-top:14px; padding-top:12px; border-top:1px solid var(--color-border,#eaecf0); }
  .review1-criterion[data-index] .review1-feedback-options button { border-radius:var(--editorial-radius,6px); padding:5px 8px; min-height:28px; }
  .review1-tab-progress { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; color:var(--color-ink-muted,#667085); font-size:11px; }
  .review1-graded-pill { padding:2px 7px; border:1px solid var(--color-border,#e4e7ec); border-radius:5px; background:var(--color-soft,#f2f4f7); color:var(--color-ink-muted,#667085); white-space:nowrap; }
  .review1-graded-pill[data-completion="partial"] { color:var(--color-accent-primary,#6941c6); border-color:var(--color-accent-secondary,#e9d5ff); background:var(--color-accent-tint,#faf5ff); }
  .review1-graded-pill[data-completion="complete"] { color:var(--color-success,#067647); border-color:var(--color-success,#abefc6); background:var(--color-success-tint,#ecfdf3); }
  .review1-drawer .review1-criteria-tabs [aria-selected="false"]:not(:disabled):hover { background:var(--color-canvas,#f8fafc); }
  .review1-drawer .review1-criteria-tabs [aria-selected="true"] { background:var(--color-accent-tint,#faf5ff); color:var(--color-accent-primary,#6927da); border-color:var(--color-accent-secondary,#e9d5ff); }
  .review1-drawer .review1-criteria-tabs [data-criteria-tab="individual"][aria-selected="true"] { background:var(--color-accent-tint,#f0fdfa); color:var(--color-accent-primary,#115e59); border-color:var(--color-accent-secondary,#99f6e4); }
  .review1-criteria-tabs [aria-selected="true"] .review1-tab-label::after { content:""; width:5px; height:5px; border-radius:50%; background:currentColor; }
  .review1-criteria-tabs [aria-selected="true"] .lucide-icon,.review1-criteria-tabs [aria-selected="true"] .review1-tab-caption { color:inherit; }
  .review1-criteria-tabs [role="tab"]:focus-visible { outline:2px solid currentColor; outline-offset:1px; }
  .review1-criteria-tabs [role="tab"]:disabled { opacity:.55; cursor:default; }
  .review1-header-students { display:grid; grid-template-columns:repeat(auto-fit,minmax(100px,1fr)); gap:6px; max-width:100%; list-style:none; padding:2px 0; margin:6px 0 0; color:var(--color-ink-muted,#667085); font-size:11px; font-weight:400; line-height:1.4; }
  .review1-header-students li { min-width:0; }
  .review1-drawer .review1-header-students button { display:grid; grid-template-columns:20px minmax(0,1fr); align-content:start; align-items:center; gap:4px; width:100%; height:100%; min-height:44px; box-sizing:border-box; border:1px solid var(--color-control-border,#d0d5dd); border-radius:var(--editorial-radius,9px); padding:8px 6px; background:var(--color-paper,#fff); color:var(--color-ink,#344054); font-size:11px; text-align:left; cursor:pointer; }
  .review1-drawer .review1-header-students button { border-color:var(--color-accent-secondary,#99f6e4); background:var(--color-accent-tint,#f0fdfa); color:var(--color-accent-primary,#115e59); }
  .review1-drawer .review1-header-students button[aria-pressed="false"]:not(:disabled):hover { border-color:var(--color-accent-secondary,#5eead4); background:var(--color-accent-tint,#ccfbf1); }
  .review1-drawer .review1-header-students button[aria-pressed="true"] { background:var(--color-accent-tint,#f0fdfa); border-color:var(--color-accent-primary,#14b8a6); color:var(--color-accent-primary,#115e59); box-shadow:inset 0 0 0 1px var(--color-accent-primary,#14b8a6); }
  .review1-drawer .review1-header-students button:focus-visible, .review1-drawer .review1-pi-pills[data-individual-pills] button:focus-visible { outline:2px solid var(--color-accent-primary,#0f766e); outline-offset:2px; }
  .review1-avatar { display:grid; place-items:center; width:20px; height:20px; border-radius:50%; background:var(--color-soft,#f2f4f7); color:var(--color-ink-muted,#475467); font-size:9px; font-weight:600; }
  .review1-header-students .review1-avatar { background:var(--color-accent-tint,#ccfbf1); color:var(--color-accent-primary,#115e59); }
  .review1-header-students [aria-pressed="true"] .review1-avatar { background:var(--color-accent-primary,#0f766e); color:var(--color-paper,#fff); }
  .review1-header-students .review1-student-details { font-weight:600; }
  .review1-student-register { grid-column:1 / -1; color:var(--color-ink-muted,#667085); font-size:10px; overflow-wrap:anywhere; }
  .review1-header-students .review1-student-score { grid-column:1 / -1; padding-top:3px; border-top:1px solid var(--color-border,#eaecf0); font-size:11px; text-align:left; white-space:normal; overflow-wrap:anywhere; }

  .review1-student-details { min-width:0; overflow-wrap:anywhere; }
  .review1-student-score { flex-shrink:0; color:var(--color-accent-primary,#6941c6); font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; text-align:right; }
  .review1-header-students .review1-student-score { color:var(--color-accent-primary,#115e59); border-top-color:var(--color-accent-secondary,#99f6e4); }
  .review1-drawer .team-drawer-close { position:absolute; top:18px; right:20px; }
  .review1-drawer form .drawer-section > h3 { margin:20px 0 12px; padding:10px 12px; border-left:4px solid var(--color-accent-primary,#6941c6); border-radius:var(--editorial-radius,6px); background:var(--color-accent-tint,#f4f3ff); color:var(--color-accent-hover,#42307d); font-size:13px; line-height:1.5; overflow-wrap:anywhere; }
  .review1-drawer .team-drawer-content { background:var(--color-canvas,#f8fafc); flex:1 1 auto; min-height:0; overflow-y:auto; padding-top:6px; }
  .review1-criterion { min-width:0; margin:14px 0; border:1px solid var(--color-border,#e4e7ec); border-radius:var(--editorial-radius,8px); padding:14px; background:var(--color-paper,#fff); }
  .review1-drawer .review1-criterion[data-absence] { margin:0 0 14px; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; }
  .review1-criterion [data-absence-editor] > label:first-child { margin-top:0; }
  .review1-attendance > span { display:block; margin-bottom:4px; color:var(--color-ink,#344054); font-weight:600; }
  .review1-criterion .review1-attendance-picker { font-size:12px; color:var(--color-ink,#344054); }
  .review1-attendance-picker > summary { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:34px; box-sizing:border-box; padding:6px 8px; border:1px solid var(--color-control-border,#d0d5dd); border-radius:var(--editorial-radius,6px); background:var(--color-paper,#fff); list-style:none; cursor:pointer; }
  .review1-attendance-picker > summary::-webkit-details-marker { display:none; }
  .review1-attendance-picker > summary[aria-disabled="true"] { opacity:.6; cursor:default; }
  .review1-attendance-picker[open] > summary { border-color:var(--color-accent-primary,#14b8a6); }
  .review1-attendance-picker[open] > summary .lucide-icon { transform:rotate(180deg); }
  .review1-attendance-options { margin-top:4px; padding:4px; border:1px solid var(--color-accent-secondary,#99f6e4); border-radius:var(--editorial-radius,6px); background:var(--color-paper,#fff); }
  .review1-criterion .review1-attendance-options label { display:flex; align-items:center; gap:8px; margin:0; padding:7px 8px; border-radius:4px; color:var(--color-ink,#344054); font-weight:400; cursor:pointer; }
  .review1-criterion .review1-attendance-options input { width:14px; height:14px; flex:0 0 14px; margin:0; padding:0; accent-color:var(--color-accent-primary,#0f766e); }
  .review1-attendance-options label:hover, .review1-attendance-options label:focus-within { background:var(--color-accent-tint,#f0fdfa); }
  .review1-attendance-options input:checked + span { color:var(--color-accent-primary,#115e59); font-weight:600; }
  .review1-drawer .review1-attendance-picker > summary:focus-visible { outline:2px solid var(--color-accent-primary,#0f766e); outline-offset:2px; }
  .review1-criterion > legend { max-width:100%; box-sizing:border-box; padding:4px 8px; color:var(--color-ink,#182230); font-size:13px; font-weight:700; line-height:1.5; overflow-wrap:anywhere; }
  .review1-criterion label { display:block; margin-top:12px; color:var(--color-ink,#344054); font-weight:600; }
  .review1-criterion :is(input,select,textarea) { display:block; width:100%; box-sizing:border-box; font:inherit; margin-top:4px; padding:5px 6px; border:1px solid var(--color-control-border,#d0d5dd); border-radius:var(--editorial-radius,6px); }
  .review1-criterion :is(input,select,textarea) { font-weight:400; color:var(--color-ink,#182230); background:var(--color-paper,#fff); }
  .review1-drawer button { font:inherit; cursor:pointer; }
  .review1-criterion [data-level][hidden] { display:none; }
  .review1-criterion-meta { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
  .review1-criterion-meta span { padding:5px 9px; border-radius:var(--editorial-radius,6px); background:var(--color-accent-tint,#f4f3ff); color:var(--color-accent-primary,#6941c6); font-size:11px; font-weight:700; }
  .review1-criterion-meta span:last-child { background:var(--color-soft,#f2f4f7); color:var(--color-ink-muted,#475467); }
  .review1-control-title { color:var(--color-ink-muted,#667085); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
  .review1-marks-error { margin:8px 0 12px; padding:9px 11px; border:1px solid var(--color-danger,#fda29b); border-left:3px solid var(--color-danger,#d92d20); border-radius:var(--editorial-radius,6px); background:var(--color-danger-tint,#fef3f2); color:var(--color-danger,#b42318); font-size:12px; font-weight:600; line-height:1.5; }
  .review1-criterion input[aria-invalid="true"] { border-color:var(--color-danger,#d92d20); background:var(--color-danger-tint,#fff6f5); }
  .review1-levels { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:4px; padding:4px; border-radius:var(--editorial-radius,12px); background:var(--color-soft,#f2f4f7); }
  .review1-drawer .review1-levels button { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-width:0; min-height:44px; padding:6px 1px; border:1px solid transparent; border-radius:var(--editorial-radius,8px); background:transparent; color:var(--color-ink-muted,#475467); }
  .review1-levels button strong { display:block; font-size:12px; font-weight:500; }
  .review1-levels button small { display:block; margin:0; font-size:9px; font-weight:400; line-height:1.4; white-space:nowrap; }
  .review1-slider-values { grid-column:1 / -1; display:flex; justify-content:space-between; flex-wrap:wrap; gap:4px 8px; padding:0 6px; color:var(--color-ink-muted,#8492a6); font-size:10px; font-variant-numeric:tabular-nums; }
  .review1-slider-values .is-selected { color:var(--color-accent-primary,#6941c6); font-weight:700; }
  .review1-levels button[aria-pressed="true"] strong { font-weight:800; }
  .review1-drawer .review1-levels button[aria-pressed="true"] { background:var(--color-accent-primary,#6941c6); border-color:var(--color-accent-primary,#9e77ed); color:var(--color-paper,#fff); box-shadow:0 1px 3px rgba(16,24,40,.12); }
  .review1-descriptor { margin:14px 0 10px; padding:12px; border:1px solid var(--color-accent-secondary,#e9d7fe); border-radius:var(--editorial-radius,10px); background:var(--color-accent-tint,#faf5ff); color:var(--color-accent-hover,#53389e); font-size:12px; line-height:1.5; white-space:pre-wrap; }
  .review1-criterion details { font-size:11px; color:var(--color-accent-primary,#6941c6); }
  .review1-criterion summary { cursor:pointer; }
  .review1-accordion { margin:0; border:0; padding:0; background:transparent; }
  .review1-accordion > summary { cursor:pointer; padding:12px; border-left:4px solid var(--color-accent-primary,#6941c6); border-radius:var(--editorial-radius,7px); background:var(--color-accent-tint,#f4f3ff); color:var(--color-accent-hover,#42307d); font-size:13px; }
  .review1-accordion > summary strong { font-weight:700; }
  .review1-accordion > summary span { display:block; margin:4px 0 0 16px; color:var(--color-ink-muted,#475467); font-size:12px; line-height:1.5; }
  .review1-accordion > summary:focus-visible { outline:3px solid var(--color-accent-primary,#9e77ed); outline-offset:2px; }
  .review1-accordion[data-criteria-group] > summary { display:none; }
  .review1-accordion[data-criteria-group="individual"] > summary { border-left-color:var(--color-accent-primary,#0f766e); background:var(--color-accent-tint,#f0fdfa); color:var(--color-accent-primary,#115e59); }
  .review1-accordion[data-criteria-group="individual"] > summary:focus-visible { outline-color:var(--color-accent-primary,#14b8a6); }
  .review1-accordion[data-criteria-group="individual"] .drawer-section > h3 { border-left-color:var(--color-accent-primary,#0f766e); background:var(--color-accent-tint,#f0fdfa); color:var(--color-accent-primary,#115e59); }
  .review1-accordion-content { padding:0; }
  .review1-student-accordion { margin:0; border:0; padding:0; background:transparent; }
  .review1-student-accordion > summary { display:none; }
  .review1-assessment-summary { display:block; margin:0 0 12px; padding:8px 10px; border:1px solid var(--color-border,#dbe3e9); border-radius:var(--editorial-radius,8px); background:var(--color-paper,#fff); color:var(--color-ink-muted,#475569); font-size:12px; }
  .review1-assessment-summary h3 { margin:0 0 6px; font-size:12px; color:var(--color-ink,#0f172a); }
  .review1-assessment-summary dl { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px 12px; margin:0; }
  .review1-assessment-summary dl > div { display:flex; align-items:baseline; flex-wrap:wrap; gap:3px 6px; }
  .review1-assessment-summary dt { margin:0; font-size:11px; color:var(--color-ink-muted,#64748b); }
  .review1-assessment-summary .review1-summary-status { grid-column:1 / -1; }
  .review1-assessment-summary dd { color:var(--color-ink,#1e293b); font-variant-numeric:tabular-nums; }
  .review1-assessment-summary .review1-summary-total { border-left:2px solid var(--color-accent-secondary,#99f6e4); padding-left:8px; }
  .review1-assessment-summary .review1-summary-total[data-resolved="true"] dd { color:var(--color-accent-primary,#0f766e); font-weight:700; }
  .review1-assessment-summary .review1-summary-status dd { padding:2px 7px; border-radius:5px; background:var(--color-soft,#f1f5f9); color:var(--color-ink-muted,#475569); font-size:11px; }
  .review1-assessment-summary .review1-summary-status[data-tone="complete"] dd { background:var(--color-success-tint,#ecfdf5); color:var(--color-success,#047857); }
  .review1-assessment-summary .review1-summary-status[data-tone="pending"] dd { background:var(--color-warning-tint,#fffbeb); color:var(--color-warning,#92400e); }
  .review1-assessment-summary .review1-summary-status[data-tone="exception"] dd { background:var(--color-danger-tint,#fff1f2); color:var(--color-danger,#9f1239); }
  .review1-assessment-summary button, .review1-summary-decision { margin-top:8px; }
  .review1-summary-decision > summary { cursor:pointer; color:var(--color-accent-primary,#6941c6); font-weight:600; }
  .review1-summary-decision label { display:block; margin-top:8px; }
  .review1-assessment-summary [data-summary-unsaved] { display:inline-block; margin-left:6px; padding:1px 5px; border-radius:4px; background:var(--color-warning-tint,#fffbeb); color:var(--color-warning,#92400e); font-size:10px; font-weight:400; }
  .review1-student-accordion > summary span { display:block; margin:3px 0 0 16px; color:var(--color-ink-muted,#475467); font-size:11px; }
  .review1-accordion > summary .review1-header-mark, .review1-student-accordion > summary .review1-header-mark { display:inline-flex; flex-shrink:0; margin:0 0 0 8px; padding:3px 9px; border:1px solid var(--color-accent-secondary,#d6bbfb); border-radius:999px; background:var(--color-accent-tint,#f4f3ff); color:var(--color-accent-primary,#5925dc); font-size:12px; font-weight:600; line-height:1.5; }
  .review1-accordion > summary > .review1-header-mark { float:right; }
  .review1-student-accordion > summary .review1-student-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0; color:inherit; font-size:12px; }
  .review1-student-heading strong { min-width:0; overflow-wrap:anywhere; }
  .review1-student-accordion > summary .review1-student-subheading { display:flex; justify-content:space-between; align-items:baseline; gap:8px; flex-wrap:wrap; margin:4px 0 0; }
  .review1-student-accordion > summary .review1-student-subheading > span { display:inline; margin:0; }
  .review1-student-accordion > summary [data-assessment-status] { margin-left:auto !important; text-align:right; }
  .review1-team-rubric { border-color:var(--color-accent-secondary,#d6bbfb); border-left:4px solid var(--color-accent-primary,#6941c6); }

  .review1-student-accordion > summary .review1-header-mark { border-color:var(--color-accent-secondary,#99f6e4); background:var(--color-accent-tint,#f0fdfa); color:var(--color-accent-primary,#115e59); }
  .review1-student-accordion > summary:focus-visible { outline:3px solid var(--color-accent-primary,#14b8a6); outline-offset:2px; }
  .review1-award { display:grid; grid-template-columns:minmax(0,1fr) 100px; align-items:center; gap:6px 8px; margin:10px 0; padding:8px; border:1px solid var(--color-border,#eaecf0); border-radius:var(--editorial-radius,8px); background:var(--color-canvas,#f9fafb); }
  .review1-award-heading { display:flex; flex-direction:column; align-items:flex-start; gap:2px; }
  .review1-award-heading label { margin:0; min-width:0; font-size:11px; font-weight:500; flex-shrink:0; }
  .review1-stepper { display:grid; grid-template-columns:26px minmax(0,1fr) 26px; align-items:stretch; gap:0; margin:0; padding:0; min-width:0; height:30px; box-sizing:border-box; border:1px solid var(--color-control-border,#d0d5dd); border-radius:var(--editorial-radius,7px); background:var(--color-paper,#fff); }
  .review1-stepper button { display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:100%; min-width:0; height:28px; margin:0; padding:0; border:0; background:var(--color-paper,#fff); color:var(--color-accent-primary,#6941c6); font-size:14px; line-height:1; }
  .review1-stepper button:first-child { border-radius:var(--editorial-radius,6px) 0 0 6px; }
  .review1-stepper button:last-child { border-radius:0 6px 6px 0; }
  .review1-criterion .review1-stepper input { appearance:textfield; margin:0; padding:0 2px; border:0; border-left:1px solid var(--color-control-border,#d0d5dd); border-right:1px solid var(--color-control-border,#d0d5dd); border-radius:0; text-align:center; font-size:11px; font-weight:600; color:var(--color-accent-primary,#6941c6); min-width:0; width:100%; height:28px; line-height:normal; }
  .review1-stepper input::-webkit-inner-spin-button,.review1-stepper input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
  .review1-criterion [data-marks-slider] { grid-column:1 / -1; width:100%; min-width:0; padding:0; margin:0; accent-color:var(--color-accent-primary,#7f56d9); }
  .review1-award [data-range] { margin:0; padding:0; color:var(--color-ink-muted,#667085); font-size:10px; font-weight:400; line-height:1.4; font-variant-numeric:tabular-nums; }
  .review1-awarded-total { display:none; }
  .review1-drawer .review1-other-feedback { margin:4px 0 0; padding:5px 9px; border:1px solid var(--color-control-border,#d0d5dd); border-radius:var(--editorial-radius,6px); background:var(--color-paper,#fff); color:var(--color-ink-muted,#475467); font-size:11px; }
  .review1-drawer .review1-other-feedback[aria-pressed="true"] { border-color:var(--color-accent-secondary,#b692f6); background:var(--color-accent-tint,#faf5ff); color:var(--color-accent-primary,#6941c6); }
  .review1-criterion:is([data-level="0"],[data-level="1"]) .review1-award [data-range] { border-color:var(--color-warning,#fec84b); background:var(--color-warning-tint,#fef0c7); color:var(--color-warning,#7a2e0e); }
  .review1-awarded-total { white-space:nowrap; font-size:11px; font-weight:600; color:var(--color-ink,#344054); }
  .review1-feedback-heading { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:11px; }
  .review1-feedback-title { display:flex; align-items:center; flex-wrap:wrap; gap:6px; min-width:0; }
  .review1-feedback-title strong { color:var(--color-ink,#182230); }
  .review1-feedback-heading [data-feedback-required] { padding:2px 5px; border-radius:4px; background:var(--color-warning-tint,#fef0c7); color:var(--color-warning,#b54708); font-size:10px; font-weight:500; line-height:1.4; white-space:nowrap; }
  .review1-feedback-heading [data-feedback-status] { flex-shrink:0; font-size:10px; color:var(--color-ink-muted,#667085); }
  .review1-criterion:is([data-level="3"],[data-level="4"],[data-level="5"]) [data-feedback-status] { color:var(--color-success,#067647); background:var(--color-success-tint,#ecfdf3); border-radius:4px; padding:2px 6px; font-weight:500; line-height:1.4; }
  .review1-feedback-options { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
  .review1-feedback-options { --pill-border:var(--color-accent-secondary,#d6bbfb); --pill-bg:var(--color-accent-tint,#faf5ff); --pill-text:var(--color-accent-primary,#6941c6); --pill-active:var(--color-accent-primary,#6941c6); --pill-hover:var(--color-accent-hover,#53389e); }
  .review1-feedback-options button { max-width:100%; min-height:32px; padding:6px 12px; border:1px solid var(--pill-border); border-radius:999px; background:var(--pill-bg); color:var(--pill-text); text-align:left; font-size:11px; line-height:1.5; overflow-wrap:anywhere; transition:background-color .15s ease,color .15s ease,border-color .15s ease; }
  .review1-feedback-options button[aria-pressed="true"] { border-color:var(--pill-active); background:var(--pill-active); color:var(--color-paper,#fff); }
  .review1-feedback-options button:is(:hover,:focus-visible):enabled { border-color:var(--pill-hover); background:var(--pill-hover); color:var(--color-paper,#fff); }
  .review1-feedback-options button:focus-visible { outline:3px solid var(--color-accent-primary,#9e77ed); outline-offset:3px; }
  .review1-feedback-options button:disabled { cursor:default; }
  .review1-criterion:is([data-level="0"],[data-level="1"]) .review1-feedback-options { --pill-border:var(--color-warning,#fedf89); --pill-bg:var(--color-warning-tint,#fffaeb); --pill-text:var(--color-warning,#93370d); --pill-active:var(--color-warning,#b54708); --pill-hover:var(--color-warning,#93370d); }
  @media(prefers-reduced-motion:reduce) { .review1-feedback-options button { transition:none; } }
  .review1-criterion .review1-feedback-label { font-size:11px; font-weight:400; }
  .review1-criterion :is(textarea) { font-size:12px; line-height:1.5; min-height:48px; resize:vertical; }
  .review1-criterion:is([data-level="0"],[data-level="1"]) .review1-descriptor { background:var(--color-warning-tint,#fffaeb); border-color:var(--color-warning,#fedf89); color:var(--color-warning,#93370d); }
  .review1-criterion:is([data-level="0"],[data-level="1"]) [data-feedback-status] { color:var(--color-warning,#b54708); }
  .review1-criterion:is([data-level="0"],[data-level="1"]) textarea { border-color:var(--color-warning,#fec84b); }
  .review1-progress { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0; font-size:11px; font-weight:500; line-height:1.5; color:var(--color-ink,#344054); }
  .review1-progress-students { color:var(--color-accent-primary,#6941c6); font-weight:600; white-space:nowrap; }
  .review1-progress-completion { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:4px 8px; min-width:0; margin-left:auto; }
  .review1-progress-students,.review1-progress-completion > span { display:inline-flex; align-items:center; gap:4px; white-space:nowrap; }
  .review1-progress-students::before,.review1-progress-completion > span::before { content:""; width:6px; height:6px; flex-shrink:0; margin-right:2px; border-radius:50%; background:var(--color-accent-primary,#6941c6); }
  .review1-progress-completion > span::before { background:var(--color-warning,#f59e0b); }
  .review1-progress progress::-webkit-progress-bar { background:var(--color-border,#e2e8f0); border-radius:999px; }
  .review1-progress progress::-webkit-progress-value { background:var(--color-accent-primary,#6941c6); border-radius:999px; }
  .review1-progress progress::-moz-progress-bar { background:var(--color-accent-primary,#6941c6); border-radius:999px; }
  .review1-progress progress { width:80px; max-width:100%; height:5px; accent-color:var(--color-accent-primary,#6941c6); border:0; border-radius:999px; overflow:hidden; background:var(--color-border,#e2e8f0); }
  @media(max-width:400px) { .review1-criterion { padding:12px; } .review1-drawer .team-drawer-content { padding:6px 14px 14px; } }
  .review1-drawer :is(button,input,select,textarea):focus-visible { outline:3px solid var(--color-accent-primary,#9e77ed); outline-offset:2px; }
  .review1-drawer .review1-stepper :is(button,input):focus-visible { outline:2px solid var(--color-accent-primary,#6941c6); outline-offset:-2px; }
  .review1-drawer [hidden] { display:none !important; }
  .review1-footer { flex:0 0 auto; min-width:0; max-height:45dvh; display:flex; flex-direction:column; background:var(--color-paper,#fff); border-top:1px solid var(--color-border,#eaecf0); }
  .review1-actions { display:flex; justify-content:center; align-items:center; flex-wrap:wrap; gap:8px; flex:0 0 auto; width:100%; box-sizing:border-box; z-index:2; isolation:isolate; background:var(--color-paper,#fff); padding:12px 14px; padding-bottom:max(12px,env(safe-area-inset-bottom)); border-top:1px solid var(--color-border,#eaecf0); }
  .review1-actions button { padding:10px 12px; border:1px solid var(--color-control-border,#d0d5dd); border-radius:var(--editorial-radius,8px); background:var(--color-paper,#fff); }
  .review1-actions [data-submit] { background:var(--color-accent-primary,#6941c6); color:var(--color-paper,#fff); }
  .review1-drawer [data-target] { background:var(--color-accent-primary,#6941c6); color:var(--color-paper,#fff); margin-right:8px; }
  .review1-drawer :disabled { cursor:default; opacity:.7; }`;
}
