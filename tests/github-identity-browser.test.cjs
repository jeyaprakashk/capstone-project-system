const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const { Sync } = require('./sync-promise.cjs');
const LEGACY = { API_student_previewGithub: 'previewStudentGithubAccount', API_student_confirmGithub: 'confirmStudentGithubAccount', API_student_completeGithubSetup: 'completeStudentGithubSetup' };
function fixture() {
  const {document}=parseHTML('<html><body><form><input name="profileUrl" value="https://github.com/student"><button type="submit">Continue</button><div data-github-confirmation hidden></div></form><p id="githubSubmitStatus"></p></body></html>');
  const form=document.querySelector('form'),input=form.querySelector('input'),requests=[],refreshes=[];
  form.elements={profileUrl:input};form.reportValidity=()=>true;
  const source=fs.readFileSync('dashboard-client-scripts.js','utf8').replace(/\r\n/g,'\n');
  const context=vm.createContext({document,renderSkeleton:()=>'<span>Skeleton</span>',
    escapeClientHtml:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    refreshGithubStatus:(button,message)=>refreshes.push(message),
    DataBridge:{write:(endpoint,args)=>{const p=new Sync(),req={endpoint,method:LEGACY[endpoint],args,success:v=>p.resolve(v),failure:e=>p.reject(e)};requests.push(req);return p;}}
  });
  vm.runInContext(source.slice(source.indexOf('  function byId('),source.indexOf('  // Session-only diagnostics:')),context);
  const start=source.indexOf('  function focusGithubAccountForm(');
  vm.runInContext(source.slice(start,source.indexOf('\n  return {',start)),context);
  const preview=()=>context.previewGithubAccount({preventDefault(){}},form);
  const reply=()=>requests.at(-1).success({token:'test-token',account:{githubId:'101',username:'canonical',displayName:'<Student>',profileUrl:'https://github.com/canonical',avatarUrl:'https://avatars.githubusercontent.com/u/101'}});
  return {document,form,input,requests,refreshes,preview,reply,context,panel:form.querySelector('[data-github-confirmation]')};
}

test('form jump scrolls and focuses inside the current card without navigation or RPC',()=>{
  const f=fixture(),calls=[];
  f.document.body.setAttribute('data-step-card','');f.input.id='studentGithubProfile';
  f.input.scrollIntoView=options=>calls.push(['scroll',options.block,options.behavior]);
  f.input.focus=options=>calls.push(['focus',options.preventScroll]);
  f.context.focusGithubAccountForm(f.form.querySelector('button'));
  assert.deepEqual(calls,[['scroll','center','auto'],['focus',true]]);
  assert.equal(f.requests.length,0);
  f.input.disabled=true;f.context.focusGithubAccountForm(f.form.querySelector('button'));assert.equal(calls.length,2);
  f.input.remove();assert.doesNotThrow(()=>f.context.focusGithubAccountForm(f.form.querySelector('button')));
});

test('profile lookup previews safely, prevents duplicate requests, and never saves before confirmation',()=>{
  const f=fixture();f.preview();f.preview();assert.equal(f.requests.length,1);assert.equal(f.requests[0].endpoint,'API_student_previewGithub');assert.deepEqual(Array.from(f.requests[0].args),['https://github.com/student']);assert.equal(f.panel.getAttribute('aria-busy'),'true');
  f.reply();assert.equal(f.panel.getAttribute('aria-busy'),'false');assert.match(f.panel.textContent,/Is this your GitHub account/);
  assert.match(f.panel.innerHTML,/&lt;Student&gt;/);assert.equal(f.requests.length,1);assert.equal(f.input.disabled,true);
  f.panel.querySelector('[data-change-account]').click();assert.equal(f.form.githubToken,null);assert.equal(f.input.disabled,false);assert.equal(f.panel.hidden,true);assert.equal(f.requests.length,1);
});

test('lookup failure retains profile input, settles skeleton, and permits retry; detached responses are ignored',()=>{
  const f=fixture();f.preview();f.requests[0].failure(Error('offline'));
  assert.equal(f.panel.getAttribute('aria-busy'),'false');assert.equal(f.input.value,'https://github.com/student');assert.equal(f.input.disabled,false);
  f.preview();f.form.remove();f.reply();assert.equal(f.form.githubToken,null);assert.equal(f.panel.getAttribute('aria-busy'),'false');
});

test('confirmation failure retains preview and enables correction; provisioning failure keeps registration connected',()=>{
  const f=fixture();f.preview();f.reply();f.panel.querySelector('[data-confirm-account]').click();f.panel.querySelector('[data-confirm-account]').click();
  assert.equal(f.requests.filter(r=>r.method==='confirmStudentGithubAccount').length,1);
  f.requests.at(-1).failure(Error('Account already assigned'));assert.equal(f.form.hidden,false);assert.equal(f.form.githubBusy,false);
  f.panel.querySelector('[data-confirm-account]').click();f.requests.at(-1).success({ok:true,message:'Connected'});
  assert.equal(f.form.hidden,true);assert.equal(f.requests.at(-1).method,'completeStudentGithubSetup');
  f.requests.at(-1).failure(Error('Provisioning offline'));assert.match(f.refreshes[0],/account connected.*pending/);
  assert.equal(f.form.hidden,true);assert.equal(f.requests.filter(r=>r.method==='confirmStudentGithubAccount').length,2);
});

test('confirmation panel uses compiled Tailwind utilities only',()=>{
  const {missingClasses,renderedClasses}=require('./compiled-css.cjs');
  const f=fixture();f.preview();f.reply();
  assert.deepEqual(missingClasses(renderedClasses(f.panel)),[]);
  assert.equal(f.panel.querySelector('.btn'),null);
  assert.equal(f.panel.querySelectorAll('button').length,2);
  assert.match(f.panel.textContent,/Is this your GitHub account\?/);
});
