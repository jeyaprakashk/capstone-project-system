/** Right-side native dialog; dynamically rendered forms do not need icon initialization. */
function getReviewerMarkingScript_() {
  return `
const ReviewerMarks = (function() {
  const icon = ${renderLucideIcon_.toString()};
  ${getLucideIconNodes_.toString()}
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let dialog, model, trigger, request=0, busy=false, dirty=false, saved=false;
  function status(text) { dialog.querySelector('[data-marks-status]').textContent=text; }
  function ensureDialog() {
    if (dialog) return;
    dialog=document.createElement('dialog'); dialog.className='reviewer-marks-dialog';
    dialog.setAttribute('aria-labelledby','reviewerMarksHeading');
    dialog.addEventListener('cancel',function(event) { event.preventDefault(); close(); });
    dialog.addEventListener('click',function(event) {
      const button=event.target.closest('button'); if (!button) return;
      if (button.hasAttribute('data-marks-close')) close();
      if (button.hasAttribute('data-marks-save')) save();
      if (button.hasAttribute('data-marks-retry')) refresh();
    });
    dialog.addEventListener('input',function() { dirty=true; });
    dialog.addEventListener('submit',function(event) { event.preventDefault(); save(); });
    document.body.appendChild(dialog);
  }
  async function close() {
    if (busy) return;
    if (dirty && !await DashboardUI.ask('Discard unsaved review marks?')) return;
    request++; dialog.close(); model=null; dirty=false;
    if (trigger && trigger.isConnected) trigger.focus();
    else { const search=document.getElementById('reviewerAssignedSearch'); if (search) search.focus(); }
  }
  function header(title) { return '<div class="reviewer-marks-header"><h2 id="reviewerMarksHeading">'+escape(title)+'</h2><button type="button" data-marks-close aria-label="Close marking drawer">'+icon('x')+'</button></div>'; }
  function open(team,review,button) {
    if (review==='review1') {Review1Evaluation.open(team,button);return;}
    if (review==='review2') {Review2Evaluation.open(team,button);return;}
    ensureDialog(); trigger=button; model=null;dirty=false;saved=false;busy=false;
    const token=++request;
    dialog.innerHTML=header('Review marks')+'<p role="status" data-marks-status>' + DashboardUI.renderSkeleton('panel', 'Loading rubric and marks') + '</p>';
    if (!dialog.open) dialog.showModal();
    DashboardUI.guideRun().withSuccessHandler(function(data) {
      if (token!==request || !dialog.open) return;
      model=data; render();
    }).withFailureHandler(function(error) {
      if (token===request && dialog.open) status(error.message || 'Unable to load marks. Close and reopen to retry.');
    }).getReviewerEvaluation(team,review);
  }
  function criterionControl(criterion,index,student,level) {
    return '<label>'+escape(criterion.pi+' · '+criterion.name)+'<small> — '+escape(criterion.co)+' · max '+criterion.maxMarks+'</small><select data-criterion="'+index+'" data-student="'+student+'" required><option value="">Select level</option>'+[0,1,2,3,4,5].map(function(n) {
      return '<option value="'+n+'"'+(level===n?' selected':'')+'>'+n+(criterion.descriptors && criterion.descriptors[n]?' — '+escape(criterion.descriptors[n]):'')+'</option>';
    }).join('')+'</select></label>';
  }
  function render() {
    const teamCriteria=model.criteria.map(function(c,i) {
      if (c.type!=='Team') return '';
      const first=model.students[0].levels[i];
      const same=model.students.every(function(student) { return student.levels[i]===first; });
      return criterionControl(c,i,'team',same?first:null);
    }).join('');
    dialog.innerHTML=header(model.review.label+' · '+model.team)+'<p>'+escape(model.title)+'</p><p><small>Select rubric levels from 0 to 5. Zero is a valid mark. All criteria are required; existing total formulas are preserved.</small></p><form id="reviewerMarksForm">'+
      (teamCriteria?'<fieldset><legend>Team criteria · applies to all students</legend>'+teamCriteria+'</fieldset>':'')+
      model.students.map(function(student,index) { return '<fieldset><legend>'+escape(student.name)+' · '+escape(student.register)+'</legend>'+model.criteria.map(function(c,i) { return c.type==='Individual'?criterionControl(c,i,index,student.levels[i]):''; }).join('')+'<label>Comments<textarea data-comments="'+index+'" rows="2" maxlength="5000">'+escape(student.comments)+'</textarea></label></fieldset>'; }).join('')+
      '</form><p role="status" aria-live="polite" data-marks-status></p><div class="reviewer-marks-footer"><button type="button" class="marks-save" data-marks-save>'+icon('check')+' Save marks</button><button type="button" data-marks-close>Cancel</button><button type="button" data-marks-retry hidden>Retry table refresh</button></div>';
    dialog.querySelector('[data-marks-close]').focus();
  }
  function lock(value) { busy=value;dialog.querySelectorAll('button,select,textarea').forEach(function(el) {el.disabled=value;}); }
  function save() {
    if (busy || saved || !model) return;
    if (!dialog.querySelector('form').reportValidity()) return;
    const payload={revision:model.revision,students:model.students.map(function(student,index) {
      return {register:student.register,comments:dialog.querySelector('[data-comments="'+index+'"]').value,
        levels:model.criteria.map(function(c,i) { return Number(dialog.querySelector('[data-criterion="'+i+'"][data-student="'+(c.type==='Team'?'team':index)+'"]').value); })};
    })};
    lock(true);status('Saving marks…');
    DashboardUI.guideRun().withSuccessHandler(function(result) {
      if (!result || !result.ok) {lock(false);status('Unable to save marks.');return;}
      saved=true;dirty=false;status(result.message);refresh();
    }).withFailureHandler(function(error) {lock(false);status(error.message || 'Save failed. Your entries are still here.');}).saveReviewerEvaluation(model.team,model.review.key,payload);
  }
  function refresh() {
    if (!saved) return;
    lock(true);status('Marks saved. Updating assigned teams…');
    const search=document.getElementById('reviewerAssignedSearch');const query=search?search.value:'';
    DashboardUI.guideRun().withSuccessHandler(function(html) {
      const content=document.getElementById('reviewerContent'); if (content) content.innerHTML=html;
      const box=document.getElementById('reviewerAssignedSearch'); if (box) box.value=query;
      DashboardUI.filterReviewerAssignedTeams(false);
      lock(false);close();
    }).withFailureHandler(function(error) {
      lock(false);
      dialog.querySelectorAll('select,textarea,[data-marks-save]').forEach(function(el) {el.disabled=true;});
      dialog.querySelector('[data-marks-retry]').hidden=false;
      status('Marks saved, but the table could not refresh. Retry table refresh; do not submit again. '+(error.message||''));
    }).refreshReviewerContentForCurrentUser();
  }
  return {open};
})();
`;
}
