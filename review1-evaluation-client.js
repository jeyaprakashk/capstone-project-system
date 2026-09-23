/** Shared drawer classes supply layout; native dialog supplies modality and focus containment. */
function review1EvaluationBrowser_() {
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rpc=(method,args,ok,fail)=>DashboardUI.guideRun().withSuccessHandler(ok).withFailureHandler(fail)[method](...args);
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
  let drawer,model,trigger,busy=false,dirty=false,sequence=0,pending=null;
  function message(text) {drawer.querySelector('[data-message]').textContent=text;}
  function close() {
    if (busy || (dirty && !confirm('Discard unsaved Review 1 marks?'))) return;
    sequence++;drawer.close();dirty=false;model=null;pending=null;
    document.body.classList.remove('team-drawer-open');
    if (trigger && trigger.isConnected) trigger.focus();
  }
  function ensure() {
    if (drawer) return;
    drawer=document.createElement('dialog');drawer.className='team-drawer open review1-drawer';
    drawer.setAttribute('aria-labelledby','review1Heading');
    drawer.addEventListener('toggle',event=>{
      const group=event.target;
      const selector=group.hasAttribute('data-student-group')?'[data-student-group]':group.hasAttribute('data-criteria-group')?'[data-criteria-group]':null;
      if(selector && group.open) {
        drawer.querySelectorAll(selector).forEach(other=>{if(other!==group)other.open=false;});
      }
    },true);
    drawer.addEventListener('invalid',event=>revealCriterion(event.target),true);
    drawer.addEventListener('cancel',event=>{event.preventDefault();close();});
    drawer.addEventListener('click',event=>{
      if (event.target===drawer && event.clientX<drawer.getBoundingClientRect().left) {close();return;}
      const summary=event.target.closest('summary');
      if(summary && summary.parentElement && (summary.parentElement.hasAttribute('data-criteria-group') || summary.parentElement.hasAttribute('data-student-group'))) {
        event.preventDefault();
        if(busy)return;
        const group=summary.parentElement;
        const selector=group.hasAttribute('data-student-group')?'[data-student-group]':'[data-criteria-group]';
        const current=Array.from(drawer.querySelectorAll(selector)).find(item=>item.open);
        if(current && !validateClosingGroup(current))return;
        if(current)current.open=false;
        if(current!==group)group.open=true;
        return;
      }
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-close'))close();
      if(button.hasAttribute('data-draft'))save(false);
      if(button.hasAttribute('data-submit'))save(true);
      if(button.hasAttribute('data-reload') && (!dirty || confirm('Discard unsaved marks and reload?')))open(model?model.roster.team:drawer.dataset.team,trigger);
      if(button.hasAttribute('data-pick-level') || button.hasAttribute('data-feedback') || button.hasAttribute('data-step')) {
        if(busy || !model || !model.availability.editable)return;
        const field=button.closest('[data-index]'),c=model.config.criteria[Number(field.dataset.index)];
        const level=field.querySelector('[data-level]'),marks=field.querySelector('[data-marks]');
        if(button.hasAttribute('data-pick-level')) {
          if(level.value===button.dataset.pickLevel)return;
          level.value=button.dataset.pickLevel;
          marks.value='';
          field.querySelector('[data-remark]').value='';
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
          // Keep keyboard focus on the toggle; the textarea stays independently editable.
          message(selected?'Suggested feedback removed.':'Suggested feedback added. You can edit it below.');
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
      if(event && event.target && event.target.hasAttribute('data-marks-slider')) {
        event.target.closest('[data-index]').querySelector('[data-marks]').value=event.target.value;
      }
      dirty=true;pending=null;updateRanges();
    });
    document.body.appendChild(drawer);
  }
  function shell(title,body,students=[],assessment=null,footer='') {
    const timing=assessment && assessment.availability.timing || {tone:'neutral',label:''};
    const meta=assessment?'<span class="review1-header-status">'+escape(assessment.status)+'</span><span class="review1-header-due" data-timing="'+escape(timing.tone)+'">Due '+day(assessment.config.due)+(timing.label?' · '+escape(timing.label):'')+'</span><span>Opens '+day(assessment.config.opens)+'</span>'+(assessment.availability.editable && assessment.availability.late?'<span class="review1-header-late">Late submissions allowed</span>':''):'';
    return '<div class="team-drawer-header"><div class="review1-heading-details"><div class="review1-header-line"><span class="team-drawer-eyebrow">REVIEW 1</span>'+meta+'</div><div class="review1-team-line"><h2 class="team-drawer-title" id="review1Heading">'+escape(title)+'</h2>'+(assessment?'<div class="review1-progress" data-evaluation-progress aria-live="polite"></div>':'')+'</div>'+(students.length?'<ul class="review1-header-students">'+students.map((s,i)=>'<li><span class="review1-student-details">'+escape(s.name+' ('+s.register+')')+'</span><span class="review1-student-score" data-student-score="'+i+'" aria-label="'+escape(s.name)+' score out of 100">— / 100</span></li>').join('')+'</ul>':'')+'</div><button type="button" class="team-drawer-close" data-close aria-label="Close Review 1 drawer">×</button></div><div class="team-drawer-content">'+body+'<p data-message role="status" aria-live="polite"></p></div>'+footer;
  }
  function open(team,button) {
    if (busy) return;
    if (DashboardUI.closeRubricDrawer) DashboardUI.closeRubricDrawer(false);
    ensure();trigger=button;model=null;dirty=false;pending=null;busy=false;drawer.dataset.team=team;
    const token=++sequence;
    drawer.innerHTML=shell(team,DashboardUI.renderSkeleton('drawer','Loading Review 1 evaluation'));
    if(!drawer.open)drawer.showModal();
    document.body.classList.add('team-drawer-open');
    rpc('getReview1Evaluation',[team],data=>{
      if(token!==sequence || !drawer.open)return;
      model=data;render();
    },error=>{
      if(token!==sequence || !drawer.open)return;
      drawer.innerHTML=shell(team,'<button type="button" data-reload>Retry</button>');message(error.message);
    });
  }
  function control(c,index,owner,score) {
    score=score||{};
    return '<fieldset class="guide-eval-criterion review1-criterion" data-index="'+index+'" data-owner="'+owner+'"><legend>'+escape(c.name)+'</legend><div class="review1-criterion-meta"><span>'+escape(c.pi+' · '+c.co)+'</span><span>Max '+c.maxMarks+' marks</span></div><p class="review1-control-title">Proficiency level</p><select data-level hidden aria-label="Proficiency level"><option value="">Select level</option>'+[0,1,2,3,4,5].map(n=>'<option value="'+n+'"'+(score.level===n?' selected':'')+'>'+n+'</option>').join('')+'</select><div class="review1-levels" role="group" aria-label="Choose proficiency level">'+[0,1,2,3,4,5].map(n=>'<button type="button" data-pick-level="'+n+'" aria-pressed="'+(score.level===n)+'" aria-label="Level '+n+'" title="Level '+n+' · '+bands[n]+'–'+bands[n+1]+'%"><strong>L'+n+'</strong></button>').join('')+'</div><div class="review1-descriptor" data-descriptor aria-live="polite"></div><details><summary>View full rubric descriptors</summary>'+c.descriptors.map((text,i)=>'<p><strong>Level '+i+':</strong> '+escape(text)+'</p>').join('')+'</details><div class="review1-award"><div class="review1-award-heading"><label for="review1Marks-'+owner+'-'+index+'">Awarded Marks</label><span data-range></span></div><div class="review1-stepper"><button type="button" data-step="-0.5" aria-label="Decrease marks">−</button><input data-marks id="review1Marks-'+owner+'-'+index+'" aria-describedby="review1MarksError-'+owner+'-'+index+'" type="number" min="0" max="'+c.maxMarks+'" step="0.5" value="'+escape(score.marks??'')+'"><button type="button" data-step="0.5" aria-label="Increase marks">+</button></div><input data-marks-slider type="range" step="0.5" min="0" max="'+c.maxMarks+'" value="'+escape(score.marks??0)+'" aria-label="Adjust awarded marks"><span class="review1-awarded-total" data-awarded-total></span></div><p class="review1-marks-error" data-marks-error id="review1MarksError-'+owner+'-'+index+'" aria-live="polite" hidden></p><div class="review1-feedback-heading"><div class="review1-feedback-title"><strong>Criterion Feedback</strong><span data-feedback-required></span></div><span data-feedback-status></span></div><div class="review1-feedback-options" data-feedback-options aria-label="Feedback suggestions"></div><label class="review1-feedback-label">Edit or add your own feedback<textarea data-remark maxlength="2000" rows="2" placeholder="Select a suggestion or write your feedback…">'+escape(score.remark||'')+'</textarea></label></fieldset>';
  }
  function accordion(title,description,content) {
    return '<details class="review1-accordion" data-criteria-group="'+(title==='Team Criteria'?'team':'individual')+'" name="review1-criteria"><summary><strong>'+title+'</strong><span>'+description+'</span></summary><div class="review1-accordion-content">'+content+'</div></details>';
  }
  function validateClosingGroup(group) {
    if(!model.availability.editable)return true;
    updateRanges();
    for(const field of group.querySelectorAll('[data-index]')) {
      const marks=field.querySelector('[data-marks]'),remark=field.querySelector('[data-remark]');
      let text='',target;
      if((marks.value!=='' || marks.validity.badInput) && !marks.checkValidity()){text=marks.validationMessage;target=marks;}
      else if(remark.value.length>2000){text='Feedback must be 2000 characters or fewer.';target=remark;}
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
    const group=element.closest && element.closest('[data-criteria-group]');
    if(group) {
      drawer.querySelectorAll('[data-criteria-group]').forEach(other=>{other.open=other===group;});
    }
    const student=element.closest && element.closest('[data-student-group]');
    if(student)drawer.querySelectorAll('[data-student-group]').forEach(other=>{other.open=other===student;});
  }
  function render() {
    const d=model,old=d.evaluation||{},team=old.teamScores||{},savedStudents=old.students||[];
    const details='<section class="drawer-section"><h3 class="drawer-project-title">'+escape(d.details.title)+'</h3><p class="drawer-problem">'+escape(d.details.problem||'Problem statement not provided.')+'</p><div class="review1-project-meta-row"><p class="review1-project-meta">Guide: '+escape(d.details.guideName)+'</p><p class="review1-project-meta">Committee: '+escape(d.details.committee)+'</p></div></section>';
    const criteria=d.config.criteria;
    const teamFields=criteria.map((c,i)=>c.type==='Team'?control(c,i,'team',team[c.pi]):'').join('');
    const individual=d.roster.students.map((s,index)=>{
      const scores=(savedStudents.find(v=>v.register===s.register)||{}).scores||{};
      return '<details class="review1-student-accordion" data-student-group="'+index+'" name="review1-students"><summary><strong>'+escape(s.name)+'</strong><span>'+escape(s.register)+'</span></summary><div class="review1-accordion-content">'+criteria.map((c,i)=>c.type==='Individual'?control(c,i,index,scores[c.pi]):'').join('')+'</div></details>';
    }).join('');
    drawer.innerHTML=shell(d.details.team,details+(old.reason?'<p>Reopened: '+escape(old.reason)+'</p>':'')+'<form novalidate>'+accordion('Team Criteria','Enter common marks that apply to every team member.',teamFields || '<p>No team criteria configured.</p>')+accordion('Individual Criteria','Enter separate marks for each student based on their contribution.',criteria.some(c=>c.type==='Individual')?individual:'<p>No individual criteria configured.</p>')+'</form>',d.roster.students,d,'<div class="review1-actions">'+(d.availability.editable?'<button type="button" data-draft>Save Draft</button><button type="button" data-submit>Submit Evaluation</button>':'')+'<button type="button" data-reload>Reload</button><button type="button" data-close>Close</button></div>');
    drawer.querySelector('form').addEventListener('submit',event=>event.preventDefault());
    if(!d.availability.editable)drawer.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);
    updateRanges();drawer.querySelector('[data-close]').focus();
  }
  function updateRanges() {
    if(!model)return;
    const totals=model.roster.students.map(()=>0),entered=model.roster.students.map(()=>0);let completed=0,count=0;
    drawer.querySelectorAll('[data-index]').forEach(field=>{
      const c=model.config.criteria[Number(field.dataset.index)], level=field.querySelector('[data-level]').value;
      const input=field.querySelector('[data-marks]'), text=field.querySelector('[data-range]');
      const marks=input.value, n=Number(level), lower=c.maxMarks*bands[n]/100,upper=c.maxMarks*bands[n+1]/100;
      const permitted=bounds(c.maxMarks,n);
      text.textContent=level===''?'Select a level':'Permitted: '+permitted.min+'–'+permitted.max+' pts';
      const awarded=field.querySelector('[data-awarded-total]');
      if(awarded)awarded.textContent=(marks===''?'—':marks)+'/'+c.maxMarks;
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
      count++;
      const remark=field.querySelector('[data-remark]');
      if(level!=='' && marks!=='' && valid && (n>=2 || remark.value.trim()))completed++;
      const descriptor=field.querySelector('[data-descriptor]');
      if(descriptor) {
        field.dataset.level=level;
        descriptor.textContent=level===''?'Choose a level to see its rubric descriptor.':'Level '+level+': '+(c.descriptors[n]||'No descriptor configured.');
        field.querySelectorAll('[data-pick-level]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.pickLevel===level));button.disabled=busy || !model.availability.editable;});
        const range=permitted,slider=field.querySelector('[data-marks-slider]');
        input.min=range.min;input.max=range.max;input.step='0.5';
        slider.disabled=busy || !model.availability.editable || level==='' || range.max<range.min;
        slider.min=range.min;slider.max=Math.max(range.min,range.max);slider.value=marks===''?range.min:Math.max(range.min,Math.min(range.max,Math.round(Number(marks)*2)/2));
        if(level!=='' && range.max<range.min)text.textContent='No whole or half mark fits this level. Choose another level or ask the coordinator to check the rubric.';
        field.querySelectorAll('[data-step]').forEach(button=>{button.disabled=slider.disabled;});
        const requiredBadge=field.querySelector('[data-feedback-required]');
        requiredBadge.textContent=level!=='' && n<2?'Required for Level < 2':'Optional for Level '+n;
        requiredBadge.hidden=level==='' || n>=2;
        const feedbackStatus=field.querySelector('[data-feedback-status]');
        if(feedbackStatus)feedbackStatus.textContent=level===''?'Select a level':n<2?'Mandatory':'Optional';
        const options=field.querySelector('[data-feedback-options]');
        if(options.dataset.level!==level) {
          options.dataset.level=level;
          options.innerHTML=level===''?'<small>Select a level for suggested feedback.</small>':feedbackOptions(c,n).map((suggestion,i)=>'<button type="button" data-feedback="'+i+'" aria-pressed="false" aria-label="'+escape(suggestion)+'" title="Add this feedback">+ '+escape(suggestion)+'</button>').join('');
        }
        const suggestions=feedbackOptions(c,n),selected=selectedFeedback(remark.value);
        options.querySelectorAll('button').forEach(button=>{
          const suggestion=suggestions[Number(button.dataset.feedback)],pressed=selected.has(suggestion);
          button.disabled=busy || !model.availability.editable;
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
    const progress=drawer.querySelector('[data-evaluation-progress]');
    if(progress)progress.innerHTML='<span><strong>'+completed+' / '+count+'</strong> Evaluated</span><progress max="'+Math.max(1,count)+'" value="'+completed+'" aria-label="Evaluated criteria"></progress>';
  }
  function setBusy(value) {
    busy=value;drawer.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=value || (el.matches('input,select,textarea') && !model.availability.editable));
    updateRanges();
  }
  function save(submit) {
    if(busy || !model || !model.availability.editable)return;
    updateRanges();
    if(submit) {
      const missing=Array.from(drawer.querySelectorAll('[data-index]')).find(field=>field.querySelector('[data-level]').value==='');
      if(missing){revealCriterion(missing);message('Select a proficiency level for every criterion before submitting.');const button=missing.querySelector('[data-pick-level]');if(button)button.focus();return;}
    }
    const payload={team:model.roster.team,revision:model.revision,token:model.token,teamScores:{},students:model.roster.students.map(s=>({register:s.register,scores:{}}))};
    drawer.querySelectorAll('[data-index]').forEach(field=>{
      const c=model.config.criteria[Number(field.dataset.index)],level=field.querySelector('[data-level]'),marks=field.querySelector('[data-marks]'),remark=field.querySelector('[data-remark]');
      level.required=submit;marks.required=submit;remark.required=submit && level.value!=='' && Number(level.value)<2;
      const score={level:level.value===''?null:Number(level.value),marks:marks.value===''?null:marks.value,remark:remark.value};
      (field.dataset.owner==='team'?payload.teamScores:payload.students[Number(field.dataset.owner)].scores)[c.pi]=score;
    });
    const form=drawer.querySelector('form');
    const invalid=form.querySelector && form.querySelector('input:invalid,select:invalid,textarea:invalid');
    if(invalid){revealCriterion(invalid);invalid.reportValidity();return;}
    if(!form.reportValidity())return;
    if(submit && !confirm('Submit Review 1 for the entire team? Scores will lock until the coordinator reopens it.'))return;
    const method=submit?'submitReview1Evaluation':'saveReview1EvaluationDraft', signature=JSON.stringify({method,payload});
    if(!pending || pending.signature!==signature)pending={signature,id:requestId()};
    payload.requestId=pending.id;setBusy(true);message('Saving Review 1…');
    rpc(method,[payload],result=>{
      dirty=false;pending=null;model.revision=result.revision;model.status=result.status;
      model.evaluation={...payload,status:result.status,submittedAt:result.submittedAt,submittedDay:result.submittedDay,late:result.late};model.availability.editable=result.status==='Draft';
      if(result.timing)model.availability.timing=result.timing;
      busy=false;render();message(result.status==='Draft'?'Draft saved.':'Review 1 submitted.');refreshTable();
    },error=>{setBusy(false);message(error.message+' Your entries are retained. Retry uses the same request ID until you edit.');});
  }
  function refreshTable() {
    const host=document.getElementById('reviewerContent');if(!host)return;
    const search=document.getElementById('reviewerAssignedSearch'),query=search?search.value:'';
    rpc('refreshReviewerContentForCurrentUser',[],html=>{
      host.innerHTML=html;const box=document.getElementById('reviewerAssignedSearch');if(box)box.value=query;
      DashboardUI.filterReviewerAssignedTeams(false);
    },()=>{if(drawer.open)message('Evaluation saved. The assigned-team table could not refresh; reload the page to update it.');});
  }
  let adminBusy=false,adminPending=null;
  function admin() {
    const host=document.getElementById('review1Admin');if(!host || adminBusy)return;
    adminBusy=true;const finishLoading=DashboardUI.beginContentLoading(host, 'Loading Review 1 evaluations');
    rpc('loadCoordinatorReview1Evaluations',[],report=>{
      finishLoading();adminBusy=false;
      if(!report.ready){host.textContent='Review1Evaluations is missing from the main spreadsheet. Create the tab manually with the required headers.';return;}
      host.innerHTML=report.teams.map((team,index)=>'<section class="drawer-section"><strong>'+escape(team.team)+'</strong> · '+escape(team.status)+(team.late?' · Late':'')+(team.students||[]).map(s=>'<p>'+escape(s.register)+': '+s.total+' marks · Course contribution '+s.weighted+'</p>').join('')+(team.status==='Submitted'?'<button type="button" data-publish="'+index+'">Publish</button> ':'')+(['Submitted','Published'].includes(team.status)?'<button type="button" data-reopen="'+index+'">Reopen</button>':'')+'</section>').join('')||'No teams.';
      host.querySelectorAll('[data-publish],[data-reopen]').forEach(button=>button.addEventListener('click',()=>{
        if(adminBusy)return;
        const publish=button.hasAttribute('data-publish'),team=report.teams[Number(publish?button.dataset.publish:button.dataset.reopen)];
        const input={team:team.team,revision:team.revision};
        if(publish){if(!confirm('Publish Review 1 results for '+team.team+' to its students?'))return;}
        else {const reason=prompt('Reason for reopening (scores will be cleared):');if(!reason || !reason.trim())return;input.reason=reason.trim();}
        const method=publish?'publishReview1Evaluation':'reopenReview1Evaluation',signature=JSON.stringify({method,input});
        if(!adminPending || adminPending.signature!==signature)adminPending={signature,id:requestId()};
        input.requestId=adminPending.id;adminBusy=true;host.querySelectorAll('button').forEach(b=>b.disabled=true);
        rpc(method,[input],()=>{adminBusy=false;adminPending=null;admin();},error=>{adminBusy=false;host.querySelectorAll('button').forEach(b=>b.disabled=false);alert(error.message);});
      }));
    },error=>{finishLoading();adminBusy=false;const notice=document.createElement('p');notice.setAttribute('role','status');notice.textContent='Unable to refresh: '+error.message;host.appendChild(notice);});
  }
  function student() {
    const host=document.getElementById('studentReview1Evaluation');if(!host)return;
    host.innerHTML=DashboardUI.renderSkeleton('panel', 'Loading Review 1 results');
    rpc('loadPublishedReview1Evaluation',[],result=>{
      if(!result){host.textContent='Review 1: not published.';return;}
      host.innerHTML='<h3>'+escape(result.config.label)+'</h3><p>'+result.total.toFixed(2)+' / '+result.config.maximum+' · Course contribution '+result.weighted.toFixed(2)+' / '+(result.config.weight*100)+'</p>'+result.config.criteria.map(c=>{
        const score=result.scores[c.pi];return '<p><strong>'+escape(c.name)+'</strong>: '+score.marks+' / '+c.maxMarks+' · Level '+score.level+'</p><p>'+escape(score.remark)+'</p>';
      }).join('');
    },()=>{host.textContent='Review 1 results unavailable. ';const button=document.createElement('button');button.textContent='Retry';button.onclick=student;host.appendChild(button);});
  }
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  return {open,admin,student};
}
function getReview1EvaluationClientScript_() {return 'const Review1Evaluation = ('+review1EvaluationBrowser_.toString()+')();';}
function getReview1EvaluationStyles_() {
  return `.review1-drawer { inset:0 0 0 auto; margin:0; padding:0; border:0; max-width:100vw; max-height:100dvh; height:100dvh; box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden; font-size:12px; line-height:1.5; }
  .review1-drawer .team-drawer-title { font-size:18px; }
  .review1-drawer .drawer-project-title { font-size:13px; }
  .review1-drawer .drawer-problem,.review1-drawer .review1-project-meta { font-size:12px; }
  .review1-project-meta-row { display:flex; align-items:baseline; justify-content:space-between; gap:16px; margin:10px 0; }
  .review1-project-meta-row .review1-project-meta { margin:0; min-width:0; overflow-wrap:anywhere; }
  .review1-project-meta-row .review1-project-meta:last-child { flex-shrink:0; text-align:right; }
  .review1-drawer:not([open]) { display:none; }
  .review1-drawer::backdrop { background:rgba(15,23,42,.28); }
  .review1-drawer .drawer-problem { white-space:pre-wrap; }
  .review1-drawer .team-drawer-header { align-items:flex-start; flex-shrink:0; }
  .review1-heading-details { min-width:0; flex:1; }
  .review1-team-line { display:flex; align-items:center; justify-content:space-between; gap:8px 12px; flex-wrap:wrap; }
  .review1-team-line .team-drawer-title { margin:0; }
  .review1-header-line { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; margin-bottom:8px; color:#344054; font-size:12px; font-weight:500; line-height:1.5; }
  .review1-header-line > span { white-space:nowrap; }
  .review1-header-line .team-drawer-eyebrow { color:#344054; font-size:12px; font-weight:700; letter-spacing:.04em; }
  .review1-header-status { padding:3px 8px; border:1px solid #d6bbfb; border-radius:6px; background:#f4f3ff; color:#5925dc; font-size:12px; font-weight:700; }
  .review1-header-line .review1-header-due { padding:3px 8px; border:1px solid #d0d5dd; border-radius:6px; background:#f9fafb; color:#182230; font-weight:600; }
  .review1-header-line .review1-header-due[data-timing="info"] { background:#eff8ff; border-color:#b2ddff; color:#175cd3; }
  .review1-header-line .review1-header-due[data-timing="success"] { background:#ecfdf3; border-color:#abefc6; color:#067647; }
  .review1-header-line .review1-header-due[data-timing="warning"] { background:#fffaeb; border-color:#fedf89; color:#93370d; }
  .review1-header-line .review1-header-due[data-timing="danger"] { background:#fef3f2; border-color:#fecdca; color:#b42318; }
  .review1-header-line .review1-header-due { white-space:normal; }
  .review1-header-late { color:#b54708; }
  .review1-header-students { list-style:none; padding:0; margin:8px 0 0; color:#667085; font-size:11px; font-weight:400; line-height:1.6; }
  .review1-header-students li { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:3px 0; }
  .review1-student-details { min-width:0; overflow-wrap:anywhere; }
  .review1-student-score { flex-shrink:0; color:#6941c6; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; text-align:right; }
  .review1-drawer .team-drawer-close { flex-shrink:0; }
  .review1-drawer form .drawer-section > h3 { margin:20px 0 12px; padding:10px 12px; border-left:4px solid #6941c6; border-radius:6px; background:#f4f3ff; color:#42307d; font-size:13px; line-height:1.5; overflow-wrap:anywhere; }
  .review1-drawer .team-drawer-content { background:#f8fafc; flex:1 1 auto; min-height:0; overflow-y:auto; }
  .review1-criterion { min-width:0; margin:26px 0; border:1px solid #e4e7ec; border-radius:16px; padding:18px; background:#fff; box-shadow:0 2px 4px rgba(16,24,40,.04); }
  .review1-criterion > legend { max-width:100%; box-sizing:border-box; padding:4px 8px; color:#182230; font-size:13px; font-weight:700; line-height:1.5; overflow-wrap:anywhere; }
  .review1-criterion label { display:block; margin-top:12px; color:#344054; font-weight:600; }
  .review1-criterion :is(input,select,textarea) { display:block; width:100%; box-sizing:border-box; font:inherit; margin-top:4px; padding:5px 6px; border:1px solid #d0d5dd; border-radius:6px; }
  .review1-criterion :is(input,select,textarea) { font-weight:400; color:#182230; background:#fff; }
  .review1-drawer button { font:inherit; cursor:pointer; }
  .review1-criterion [data-level][hidden] { display:none; }
  .review1-criterion-meta { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
  .review1-criterion-meta span { padding:5px 9px; border-radius:6px; background:#f4f3ff; color:#6941c6; font-size:11px; font-weight:700; }
  .review1-criterion-meta span:last-child { background:#f2f4f7; color:#475467; }
  .review1-control-title { color:#667085; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
  .review1-marks-error { margin:8px 0 12px; padding:9px 11px; border:1px solid #fda29b; border-left:3px solid #d92d20; border-radius:6px; background:#fef3f2; color:#b42318; font-size:12px; font-weight:600; line-height:1.5; }
  .review1-criterion input[aria-invalid="true"] { border-color:#d92d20; background:#fff6f5; }
  .review1-levels { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:4px; padding:4px; border-radius:12px; background:#f2f4f7; }
  .review1-levels button { min-width:0; min-height:40px; padding:8px 2px; border:1px solid transparent; border-radius:8px; background:transparent; color:#475467; }
  .review1-levels button strong { display:block; font-size:12px; font-weight:500; }
  .review1-levels button[aria-pressed="true"] strong { font-weight:800; }
  .review1-levels button[aria-pressed="true"] { background:#fff; border-color:#9e77ed; color:#6941c6; box-shadow:0 1px 3px rgba(16,24,40,.12); }
  .review1-descriptor { margin:14px 0 10px; padding:12px; border:1px solid #e9d7fe; border-radius:10px; background:#faf5ff; color:#53389e; font-size:12px; line-height:1.5; white-space:pre-wrap; }
  .review1-criterion details { font-size:11px; color:#6941c6; }
  .review1-criterion summary { cursor:pointer; }
  .review1-accordion { margin:14px 0; border:1px solid #e4e7ec; border-radius:8px; background:#fff; }
  .review1-accordion > summary { cursor:pointer; padding:12px; border-left:4px solid #6941c6; border-radius:7px; background:#f4f3ff; color:#42307d; font-size:13px; }
  .review1-accordion > summary strong { font-weight:700; }
  .review1-accordion > summary span { display:block; margin:4px 0 0 16px; color:#475467; font-size:12px; line-height:1.5; }
  .review1-accordion > summary:focus-visible { outline:3px solid #9e77ed; outline-offset:2px; }
  .review1-accordion[data-criteria-group="individual"] > summary { border-left-color:#0f766e; background:#f0fdfa; color:#115e59; }
  .review1-accordion[data-criteria-group="individual"] > summary:focus-visible { outline-color:#14b8a6; }
  .review1-accordion[data-criteria-group="individual"] .drawer-section > h3 { border-left-color:#0f766e; background:#f0fdfa; color:#115e59; }
  .review1-accordion-content { padding:0 12px 12px; }
  .review1-student-accordion { margin-top:12px; border:1px solid #99f6e4; border-radius:8px; background:#fff; }
  .review1-student-accordion > summary { padding:12px; cursor:pointer; background:#f0fdfa; color:#115e59; border-radius:7px; font-size:12px; overflow-wrap:anywhere; }
  .review1-student-accordion > summary span { display:block; margin:3px 0 0 16px; color:#475467; font-size:11px; }
  .review1-student-accordion > summary:focus-visible { outline:3px solid #14b8a6; outline-offset:2px; }
  .review1-award { display:grid; grid-template-columns:minmax(90px,110px) minmax(0,1fr) auto; align-items:center; gap:8px 10px; margin:14px 0; padding:10px; border:1px solid #eaecf0; border-radius:10px; background:#f9fafb; }
  .review1-award-heading { grid-column:1 / -1; display:flex; justify-content:space-between; align-items:center; gap:6px; }
  .review1-award-heading label { margin:0; min-width:0; font-size:11px; font-weight:500; flex-shrink:0; }
  .review1-stepper { display:grid; grid-template-columns:26px minmax(0,1fr) 26px; align-items:stretch; gap:0; margin:0; padding:0; min-width:0; height:30px; box-sizing:border-box; border:1px solid #d0d5dd; border-radius:7px; background:#fff; }
  .review1-stepper button { display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:100%; min-width:0; height:28px; margin:0; padding:0; border:0; background:#fff; color:#6941c6; font-size:14px; line-height:1; }
  .review1-stepper button:first-child { border-radius:6px 0 0 6px; }
  .review1-stepper button:last-child { border-radius:0 6px 6px 0; }
  .review1-criterion .review1-stepper input { appearance:textfield; margin:0; padding:0 2px; border:0; border-left:1px solid #d0d5dd; border-right:1px solid #d0d5dd; border-radius:0; text-align:center; font-size:11px; font-weight:600; color:#6941c6; min-width:0; width:100%; height:28px; line-height:normal; }
  .review1-stepper input::-webkit-inner-spin-button,.review1-stepper input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
  .review1-criterion [data-marks-slider] { min-width:0; padding:0; margin:0; accent-color:#7f56d9; }
  .review1-award [data-range] { margin:0; padding:5px 8px; border:1px solid #bdb4fe; border-radius:6px; background:#ebe9fe; color:#42307d; font-size:12px; font-weight:700; line-height:1.4; font-variant-numeric:tabular-nums; text-align:right; }
  .review1-criterion:is([data-level="0"],[data-level="1"]) .review1-award [data-range] { border-color:#fec84b; background:#fef0c7; color:#7a2e0e; }
  .review1-awarded-total { white-space:nowrap; font-size:11px; font-weight:600; color:#344054; }
  .review1-feedback-heading { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:11px; }
  .review1-feedback-title { display:flex; align-items:center; flex-wrap:wrap; gap:6px; min-width:0; }
  .review1-feedback-title strong { color:#182230; }
  .review1-feedback-heading [data-feedback-required] { padding:2px 5px; border-radius:4px; background:#fef0c7; color:#b54708; font-size:10px; font-weight:500; line-height:1.4; white-space:nowrap; }
  .review1-feedback-heading [data-feedback-status] { flex-shrink:0; font-size:10px; color:#667085; }
  .review1-criterion:is([data-level="3"],[data-level="4"],[data-level="5"]) [data-feedback-status] { color:#067647; background:#ecfdf3; border-radius:4px; padding:2px 6px; font-weight:500; line-height:1.4; }
  .review1-feedback-options { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
  .review1-feedback-options { --pill-border:#d6bbfb; --pill-bg:#faf5ff; --pill-text:#6941c6; --pill-active:#6941c6; --pill-hover:#53389e; }
  .review1-feedback-options button { max-width:100%; min-height:32px; padding:6px 12px; border:1px solid var(--pill-border); border-radius:999px; background:var(--pill-bg); color:var(--pill-text); text-align:left; font-size:11px; line-height:1.5; overflow-wrap:anywhere; transition:background-color .15s ease,color .15s ease,border-color .15s ease; }
  .review1-feedback-options button[aria-pressed="true"] { border-color:var(--pill-active); background:var(--pill-active); color:#fff; }
  .review1-feedback-options button:is(:hover,:focus-visible):enabled { border-color:var(--pill-hover); background:var(--pill-hover); color:#fff; }
  .review1-feedback-options button:focus-visible { outline:3px solid #9e77ed; outline-offset:3px; }
  .review1-feedback-options button:disabled { cursor:default; }
  .review1-criterion:is([data-level="0"],[data-level="1"]) .review1-feedback-options { --pill-border:#fedf89; --pill-bg:#fffaeb; --pill-text:#93370d; --pill-active:#b54708; --pill-hover:#93370d; }
  @media(prefers-reduced-motion:reduce) { .review1-feedback-options button { transition:none; } }
  .review1-criterion .review1-feedback-label { font-size:11px; font-weight:400; }
  .review1-criterion :is(textarea) { font-size:12px; line-height:1.5; min-height:48px; resize:vertical; }
  .review1-criterion:is([data-level="0"],[data-level="1"]) .review1-descriptor { background:#fffaeb; border-color:#fedf89; color:#93370d; }
  .review1-criterion:is([data-level="0"],[data-level="1"]) [data-feedback-status] { color:#b54708; }
  .review1-criterion:is([data-level="0"],[data-level="1"]) textarea { border-color:#fec84b; }
  .review1-progress { display:flex; align-items:center; gap:8px; margin-left:auto; padding:5px 8px; border:1px solid #d9d6fe; border-radius:6px; background:#f4f3ff; font-size:13px; font-weight:700; line-height:1.5; color:#42307d; }
  .review1-progress > span { white-space:nowrap; }
  .review1-progress progress { width:70px; max-width:100%; height:6px; accent-color:#7f56d9; }
  @media(max-width:400px) { .review1-criterion { padding:12px; } .review1-drawer .team-drawer-content { padding:14px; } }
  .review1-drawer :is(button,input,select,textarea):focus-visible { outline:3px solid #9e77ed; outline-offset:2px; }
  .review1-drawer .review1-stepper :is(button,input):focus-visible { outline:2px solid #6941c6; outline-offset:-2px; }
  .review1-actions { display:flex; justify-content:center; align-items:center; flex-wrap:wrap; gap:8px; flex:0 0 auto; width:100%; box-sizing:border-box; z-index:2; isolation:isolate; background:#fff; padding:12px 14px; padding-bottom:max(12px,env(safe-area-inset-bottom)); border-top:1px solid #eaecf0; }
  .review1-actions button { padding:10px 12px; border:1px solid #d0d5dd; border-radius:8px; background:#fff; }
  .review1-actions [data-submit] { background:#6941c6; color:#fff; }
  .review1-drawer :disabled { cursor:default; opacity:.7; }`;
}
