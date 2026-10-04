/* Browser module is serialized into the dashboard shell; no persistent browser storage. */
function guideEvaluationBrowser_(bridge) {
  let current=null, busy=false, generation=0, dirty=false, pending=null, detach=null;
  const el=id=>document.getElementById(id);
  const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const requestId=()=>crypto.randomUUID().replace(/-/g,'');
  const FIELD='mt-1 block w-full rounded-md border border-control px-3 py-1.5 text-sm font-normal';
  const SMALL='border-0 rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const BUTTON='border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const PRIMARY='border-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  function message(text) { if(el('guideEvalMessage')) el('guideEvalMessage').textContent=text; }
  function setBusy(value) {
    busy=value;
    const host=el('guideEvaluationEditor');
    if(host) host.querySelectorAll('input,select,textarea,button').forEach(node=>node.disabled=value || node.dataset.locked==='true');
  }
  async function open(team,register) {
    if(busy) return;
    if(dirty && !await DashboardUI.ask('Discard unsaved evaluation changes?')) return;
    let host=el('guideEvaluationEditor');
    if(!host) return;
    host.dataset.team=String(team);
    if(!host.retryAttached){host.retryAttached=true;host.addEventListener('click',event=>{const retry=event.target.closest && event.target.closest('[data-guide-retry]');if(retry)open(retry.dataset.team,retry.dataset.register);});}
    if(typeof GuideWeekly!=='undefined')GuideWeekly.selectView('evaluation',true);
    const version=++generation;
    host.hidden=false;host.innerHTML=DashboardUI.renderSkeleton('panel', 'Loading guide evaluation');busy=true;
    host.scrollIntoView({behavior:'smooth',block:'start'});
    bridge.read('guide-evaluation','API_guide_getEvaluation',[team,register || ''],{timeoutMs:60000}).then(data=>{
      if(version!==generation)return;
      busy=false;dirty=false;pending=null;current=data;render();if(typeof GuideWeekly!=='undefined')GuideWeekly.evaluationStatus(data.roster.team,data.statuses);
    },err=>{if(version!==generation || (err && err.superseded))return;busy=false;host.textContent='Unable to load: '+err.message;const retry=document.createElement('button');retry.type='button';retry.className=SMALL;retry.textContent='Retry';retry.setAttribute('data-guide-retry','');retry.dataset.team=String(team);retry.dataset.register=String(register||'');host.appendChild(retry);});
  }
  function render() {
    const d=current, old=d.evaluation;
    const locked=old && old.status!=='Draft';
    const config=locked ? old.config : d.config;
    const same=old && JSON.stringify(old.config)===JSON.stringify(d.config);
    const scores=old && (locked || same) ? old.scores : {};
    const host=el('guideEvaluationEditor');
    host.innerHTML='<h3 class="m-0 text-base font-semibold text-ink">Guide Evaluation · '+escape(d.roster.team)+'</h3><label class="mt-2 flex flex-col text-sm font-semibold">Student <select id="guideEvalStudent" class="'+FIELD+'">'+d.roster.students.map(s=>'<option value="'+escape(s.register)+'" '+(s.register===d.student.register?'selected':'')+'>'+escape(s.name+' ('+s.register+') · '+(d.statuses.find(item=>item.register===s.register)||{}).status)+'</option>').join('')+'</select></label><p class="mt-2 text-sm text-ink-2">'+escape(old ? old.status : 'Not started')+' · Deadline: '+new Date(config.due*86400000).toISOString().slice(0,10)+' · '+(d.overdue?'Overdue; late submission is allowed.':'Late submissions are recorded.')+'</p>'+
      (/^https:\/\//i.test(d.repository || '')?'<p class="mt-1 text-sm"><a class="text-primary underline" href="'+escape(d.repository)+'" target="_blank" rel="noopener">Open team repository / commit history</a></p>':'')+
      (!same && old && !locked?'<p class="mt-2 text-sm text-warning">Rubric changed. Previous revisions are retained; enter scores against the current rubric.</p>':'')+
      config.criteria.map(c=>{
        const score=scores[c.pi]||{};
        return '<fieldset class="mt-3 rounded-lg border border-edge bg-paper p-3" data-pi="'+escape(c.pi)+'"><legend class="px-1 text-sm font-semibold text-ink">'+escape(c.pi+' · '+c.name+' · '+c.co+' · '+c.maxMarks+' marks')+'</legend><details class="mt-1"><summary class="cursor-pointer text-sm font-semibold text-primary">Performance descriptors</summary>'+c.descriptors.map((text,i)=>'<p class="mt-1 text-sm text-ink-2"><strong>Level '+i+':</strong> '+escape(text)+'</p>').join('')+'</details><div class="mt-2 grid gap-3 sm:grid-cols-2"><label class="text-sm font-semibold">Level <select class="'+FIELD+'" data-level '+(locked?'disabled data-locked="true"':'')+'><option value="">Select</option>'+[0,1,2,3,4,5].map(i=>'<option '+(score.level===i?'selected':'')+'>'+i+'</option>').join('')+'</select></label> <label class="text-sm font-semibold">Marks <input class="'+FIELD+'" data-marks type="number" min="0" max="'+c.maxMarks+'" step="0.01" value="'+escape(score.marks??'')+'" '+(locked?'disabled data-locked="true"':'')+'></label></div><p data-range class="mt-1 text-xs text-muted"></p><label class="mt-2 block text-sm font-semibold">Criterion feedback (required below Level 2)<textarea class="'+FIELD+'" maxlength="2000" data-remark '+(locked?'disabled data-locked="true"':'')+'>'+escape(score.remark||'')+'</textarea></label></fieldset>';
      }).join('')+'<p id="guideEvalTotal" class="mt-3 text-sm font-semibold text-ink"></p><p id="guideEvalMessage" role="status" class="mt-1 text-sm text-ink-2"></p><div class="mt-3 flex flex-wrap items-center gap-2"><button class="'+BUTTON+'" type="button" id="guideEvalDraft" '+(locked?'disabled data-locked="true"':'')+'>Save Draft</button> <button class="'+PRIMARY+'" type="button" id="guideEvalSubmit" '+(locked?'disabled data-locked="true"':'')+'>Submit Evaluation</button> <button class="'+SMALL+'" type="button" id="guideEvalReload">Reload</button> <button class="'+BUTTON+'" type="button" id="guideEvalClose">Close</button></div>';
    // One delegated listener set per render; the previous set is removed first.
    if(detach)detach();
    const update=field=>{
      const level=field.querySelector('[data-level]').value, max=config.criteria.find(c=>c.pi===field.dataset.pi).maxMarks;
      const bands=[0,40,60,75,85,95,100];
      field.querySelector('[data-range]').textContent=level===''?'Select a level to see the permitted marks.':'Permitted: '+(max*bands[Number(level)]/100).toFixed(2)+' ≤ marks '+(Number(level)===5?'≤':'<')+' '+(max*bands[Number(level)+1]/100).toFixed(2);
      const total=Array.from(host.querySelectorAll('[data-marks]')).reduce((n,input)=>n+(Number(input.value)||0),0);
      el('guideEvalTotal').textContent='Preview: '+total.toFixed(2)+' / '+config.maximum+' · '+(total/config.maximum*config.weight*100).toFixed(2)+' / '+(config.weight*100)+'. Validated on save.';
    };
    const onInput=event=>{const field=event.target.closest && event.target.closest('fieldset');if(!field)return;dirty=true;pending=null;update(field);};
    const onChange=event=>{if(event.target.id!=='guideEvalStudent')return;const selected=event.target.value;event.target.value=d.student.register;open(d.roster.team,selected);};
    const onClick=async event=>{
      const button=event.target.closest && event.target.closest('button');if(!button)return;
      if(button.id==='guideEvalReload')open(d.roster.team,d.student.register);
      else if(button.id==='guideEvalClose'){if(!dirty || await DashboardUI.ask('Discard unsaved changes?')){host.hidden=true;dirty=false;delete host.dataset.team;if(typeof GuideWeekly!=='undefined')GuideWeekly.selectView('title');}}
      else if(button.id==='guideEvalDraft')save(false);
      else if(button.id==='guideEvalSubmit')save(true);
    };
    host.addEventListener('click',onClick);host.addEventListener('input',onInput);host.addEventListener('change',onChange);
    detach=()=>{host.removeEventListener('click',onClick);host.removeEventListener('input',onInput);host.removeEventListener('change',onChange);detach=null;};
    host.querySelectorAll('fieldset').forEach(update);
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
    setBusy(true);message('Saving…');
    bridge.write(submit?'API_guide_submitEvaluation':'API_guide_saveEvaluationDraft',[pending.input]).then(result=>{
      setBusy(false);dirty=false;pending=null;
      const team=current.roster.team,student=current.student.register;
      open(team,student);
    },err=>{setBusy(false);message(err.message+' Retry uses the same request ID unless you change the form.');});
  }
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  return {open};
}
function getGuideEvaluationClientScript_() { return 'const GuideEvaluation = ('+guideEvaluationBrowser_.toString()+')(DataBridge);'; }
