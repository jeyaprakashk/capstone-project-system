/* Browser module is serialized into the dashboard shell; no persistent browser storage. */
function guideEvaluationBrowser_() {
  let current=null, busy=false, generation=0, dirty=false, pending=null;
  const el=id=>document.getElementById(id);
  const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const requestId=()=>crypto.randomUUID().replace(/-/g,'');
  function rpc(method,args,success,failure) {
    DashboardUI.guideRun().withSuccessHandler(success).withFailureHandler(failure)[method](...args);
  }
  function message(text) { if(el('guideEvalMessage')) el('guideEvalMessage').textContent=text; }
  function setBusy(value) {
    busy=value;
    const host=el('guideEvaluationEditor');
    if(host) host.querySelectorAll('input,select,textarea,button').forEach(node=>node.disabled=value || node.dataset.locked==='true');
  }
  function open(team,register) {
    if(busy) return;
    if(dirty && !confirm('Discard unsaved evaluation changes?')) return;
    let host=el('guideEvaluationEditor');
    if(!host) return;
    const version=++generation;
    host.hidden=false;host.innerHTML=DashboardUI.renderSkeleton('panel', 'Loading guide evaluation');busy=true;
    host.scrollIntoView({behavior:'smooth',block:'start'});
    rpc('loadGuideEvaluation',[team,register || ''],data=>{
      if(version!==generation)return;
      busy=false;dirty=false;pending=null;current=data;render();
    },err=>{if(version!==generation)return;busy=false;host.textContent='Unable to load: '+err.message;const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>open(team,register);host.appendChild(retry);});
  }
  function render() {
    const d=current, old=d.evaluation;
    const locked=old && old.status!=='Draft';
    const config=locked ? old.config : d.config;
    const same=old && JSON.stringify(old.config)===JSON.stringify(d.config);
    const scores=old && (locked || same) ? old.scores : {};
    const host=el('guideEvaluationEditor');
    host.innerHTML='<h3>Guide Evaluation · '+escape(d.roster.team)+'</h3><label>Student <select id="guideEvalStudent">'+d.roster.students.map(s=>'<option value="'+escape(s.register)+'" '+(s.register===d.student.register?'selected':'')+'>'+escape(s.name+' ('+s.register+') · '+(d.statuses.find(item=>item.register===s.register)||{}).status)+'</option>').join('')+'</select></label><p>'+escape(old ? old.status : 'Not started')+' · Deadline: '+new Date(config.due*86400000).toISOString().slice(0,10)+' · '+(d.overdue?'Overdue; late submission is allowed.':'Late submissions are recorded.')+'</p>'+
      (/^https:\/\//i.test(d.repository || '')?'<p><a href="'+escape(d.repository)+'" target="_blank" rel="noopener">Open team repository / commit history</a></p>':'')+
      (!same && old && !locked?'<p>Rubric changed. Previous revisions are retained; enter scores against the current rubric.</p>':'')+
      config.criteria.map(c=>{
        const score=scores[c.pi]||{};
        return '<fieldset class="guide-eval-criterion" data-pi="'+escape(c.pi)+'"><legend>'+escape(c.pi+' · '+c.name+' · '+c.co+' · '+c.maxMarks+' marks')+'</legend><details><summary>Performance descriptors</summary>'+c.descriptors.map((text,i)=>'<p><strong>Level '+i+':</strong> '+escape(text)+'</p>').join('')+'</details><label>Level <select data-level '+(locked?'disabled data-locked="true"':'')+'><option value="">Select</option>'+[0,1,2,3,4,5].map(i=>'<option '+(score.level===i?'selected':'')+'>'+i+'</option>').join('')+'</select></label> <label>Marks <input data-marks type="number" min="0" max="'+c.maxMarks+'" step="0.01" value="'+escape(score.marks??'')+'" '+(locked?'disabled data-locked="true"':'')+'></label><p data-range></p><label>Criterion feedback (required below Level 3)<textarea maxlength="2000" data-remark '+(locked?'disabled data-locked="true"':'')+'>'+escape(score.remark||'')+'</textarea></label></fieldset>';
      }).join('')+'<p id="guideEvalTotal"></p><p id="guideEvalMessage" role="status"></p><button type="button" id="guideEvalDraft" '+(locked?'disabled data-locked="true"':'')+'>Save Draft</button> <button type="button" id="guideEvalSubmit" '+(locked?'disabled data-locked="true"':'')+'>Submit Evaluation</button> <button type="button" id="guideEvalReload">Reload</button> <button type="button" id="guideEvalClose">Close</button>';
    el('guideEvalStudent').onchange=e=>{const selected=e.target.value;e.target.value=d.student.register;open(d.roster.team,selected);};
    el('guideEvalReload').onclick=()=>open(d.roster.team,d.student.register);
    el('guideEvalClose').onclick=()=>{if(!dirty || confirm('Discard unsaved changes?')){host.hidden=true;dirty=false;}};
    el('guideEvalDraft').onclick=()=>save(false);el('guideEvalSubmit').onclick=()=>save(true);
    host.querySelectorAll('fieldset').forEach((field,index)=>{
      const update=()=>{
        const level=field.querySelector('[data-level]').value, max=config.criteria[index].maxMarks;
        const bands=[0,40,60,75,85,95,100];
        field.querySelector('[data-range]').textContent=level===''?'Select a level to see the permitted marks.':'Permitted: '+(max*bands[Number(level)]/100).toFixed(2)+' ≤ marks '+(Number(level)===5?'≤':'<')+' '+(max*bands[Number(level)+1]/100).toFixed(2);
        const total=Array.from(host.querySelectorAll('[data-marks]')).reduce((n,input)=>n+(Number(input.value)||0),0);
        el('guideEvalTotal').textContent='Preview: '+total.toFixed(2)+' / '+config.maximum+' · '+(total/config.maximum*config.weight*100).toFixed(2)+' / '+(config.weight*100)+'. Validated on save.';
      };
      field.querySelectorAll('input,select,textarea').forEach(node=>node.oninput=()=>{dirty=true;pending=null;update();});update();
    });
    if(locked) message('Submitted scores are locked. Contact the coordinator for corrections.');
  }
  function save(submit) {
    if(busy)return;
    if(submit && !confirm('Submit this student’s evaluation? Scores will lock until the coordinator reopens it.'))return;
    const method=submit?'submitGuideEvaluation':'saveGuideEvaluationDraft';
    const scores={};el('guideEvaluationEditor').querySelectorAll('fieldset').forEach(field=>{
      const level=field.querySelector('[data-level]').value;
      scores[field.dataset.pi]={level:level===''?null:Number(level),marks:field.querySelector('[data-marks]').value,remark:field.querySelector('[data-remark]').value};
    });
    if(!pending || pending.method!==method)pending={method,input:{team:current.roster.team,student:current.student.register,revision:current.revision,token:current.token,scores,requestId:requestId()}};
    setBusy(true);message('Saving…');
    rpc(method,[pending.input],result=>{
      setBusy(false);dirty=false;pending=null;
      const team=current.roster.team,student=current.student.register;
      open(team,student);
    },err=>{setBusy(false);message(err.message+' Retry uses the same request ID unless you change the form.');});
  }
  let adminBusy=false;
  function admin() {
    const host=el('guideEvaluationAdmin');if(!host || adminBusy)return;
    adminBusy=true;host.innerHTML=DashboardUI.renderSkeleton('panel', 'Loading evaluations');
    rpc('loadCoordinatorGuideEvaluations',[],report=>{
      adminBusy=false;
      if(!report.ready){host.textContent=report.error;return;}
      const students=report.students || [];
      const submitted=students.filter(s=>s.status==='Submitted').length;
      const published=students.filter(s=>s.status==='Published').length;
      host.textContent=students.length+' students · '+submitted+' submitted · '+published+' published';
    },err=>{adminBusy=false;host.textContent=err.message;});
  }
  function setup() {
    if(adminBusy || !confirm('Create guide evaluation storage? Milestones and Rubrics must already be configured.'))return;
    adminBusy=true;
    rpc('setupGuideEvaluation',[],result=>{adminBusy=false;alert(result.message);admin();},err=>{adminBusy=false;alert(err.message);});
  }
  function student() {
    const host=el('studentGuideEvaluation');if(!host)return;
    rpc('loadPublishedGuideEvaluation',[],result=>{
      if(!result){host.textContent='Guide Evaluation: not published.';return;}
      host.innerHTML='<h3>Guide Evaluation</h3><p>'+result.total.toFixed(2)+' / '+result.config.maximum+' · Course contribution '+result.weighted.toFixed(2)+' / '+(result.config.weight*100)+'</p>'+result.config.criteria.map(c=>{
        const score=result.scores[c.pi];return '<p><strong>'+escape(c.name)+'</strong>: '+score.marks+' / '+c.maxMarks+' · Level '+score.level+'</p><p>'+escape(score.remark)+'</p>';
      }).join('');
    },err=>{host.textContent='Guide evaluation unavailable. ';const button=document.createElement('button');button.textContent='Retry';button.onclick=student;host.appendChild(button);});
  }
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  return {open,admin,setup,student};
}
function getGuideEvaluationClientScript() { return 'const GuideEvaluation = ('+guideEvaluationBrowser_.toString()+')();'; }
