/* Local, synthetic-data preview. Never connects to Apps Script or real sheets.
 * Run: node scripts/preview-internal-publishing.cjs
 * Open: http://127.0.0.1:8765/?assessment=review1 (also review2, guide_eval)
 * Add &narrow=1 for a 390px frame, or &details=1 for student details.
 */
const http=require('node:http'),fs=require('node:fs'),vm=require('node:vm');
const {publishingFixture}=require('../tests/internal-publishing-fixture.cjs');
const styles=vm.createContext({escapeHtml:value=>String(value)});vm.runInContext(fs.readFileSync('common-styles.js','utf8'),styles);
vm.runInContext(fs.readFileSync('icon-renderer.js','utf8'),styles);
vm.runInContext(fs.readFileSync('common-helpers.js','utf8').split('function renderAssessmentHistory_')[1].replace(/^/,'function renderAssessmentHistory_'),styles);
const clone=value=>JSON.parse(JSON.stringify(value));
function reportFor(key){
  const teams=[];
  for(let index=0;index<6;index++){
    const f=publishingFixture(key);
    if(key==='guide_eval'){
      if(index!==0)f.students.forEach((s,j)=>{if(index!==2 || j!==2)f.guideSubmit(s.regNo);});
      if(index===3 || index===4){f.report();f.c.publishGuideEvaluation({team:'g18',student:'s1',revision:1,requestId:'preview-publish-first'});}
      if(index===4){for(const student of ['s2','s3'])f.c.publishGuideEvaluation({team:'g18',student,revision:1,requestId:'preview-publish-'+student});}
    } else if(index!==0){
      const input=f.input();
      if(index===2){input.students[2].absence={type:'REVIEW_DAY_ABSENCE',approved:true,reason:'Documented'};input.students[2].scores={};}
      f.submit(input);if(index===3)f.publish('s1');if(index===4)f.publish();
    }
    if(index===5)f.students[0].name='Updated roster member';
    const team=clone(f.report().teams[0]);team.team='g'+(index+1);team.displayTeam='G'+(index+1);
    if(key!=='guide_eval' && index===3)team.students[0].decisions=[
      {decision:'exception',at:'2026-09-24T23:04:44.087Z',reason:'Prolonged absence source facts updated.',previousStatus:'ABSENT_UNAPPROVED',resultingStatus:'INCOMPLETE',reviewer:'coordinator@example.test'},
      {decision:'targetSubmit',at:'2026-09-24T23:05:12.872Z',reason:'Updated assessment date.',previousStatus:'INCOMPLETE',resultingStatus:'COMPLETED',reviewer:'coordinator@example.test'}
    ];
    teams.push(team);
  }
  const f=publishingFixture(key);return {ready:true,config:clone(f.c.internalPublishingConfig_(key)),teams};
}
function page(url){
  const key=['review1','review2','guide_eval'].includes(url.searchParams.get('assessment'))?url.searchParams.get('assessment'):'review1';
  if(url.searchParams.has('narrow'))return '<!doctype html><title>Publishing · narrow preview</title><style>body{margin:0;background:#e8edee}iframe{display:block;width:390px;height:1050px;border:0;margin:auto}</style><iframe title="390 pixel publishing preview" src="/?assessment='+key+'&details=1"></iframe>';
  const f=publishingFixture(key),report=reportFor(key);
  f.c.getSkeletonMarkup_=styles.getSkeletonMarkup_;
  f.c.escapeHtml=value=>String(value);
  const css=styles.getBaseStyles()+styles.getCardStyles()+styles.getTableStyles()+styles.getLoadingStyles_()+styles.getDashboardSurfaceStyles_()+styles.getEditorialStyles_()+styles.getLucideStyles_();
  const source=fs.readFileSync('dashboard-client-scripts.js','utf8');
  const begin=source.slice(source.indexOf('  function beginContentLoading('),source.indexOf('  function setText('));
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+report.config.title+' · Publishing preview</title><style>'+css+'body{padding:28px;background:#f3f6f6}main{max-width:1200px;margin:auto}.assessment-section{padding:24px;background:white;border:1px solid #dde5e5;border-radius:12px}.preview-nav{display:flex;gap:18px;margin:0 auto 18px;max-width:1200px;font-size:12px}.preview-nav a{color:#0f766e}@media(max-width:640px){body{padding:12px}.assessment-section{padding:14px}}</style></head><body><nav class="preview-nav"><a href="/?assessment=review1">Review 1</a><a href="/?assessment=review2">Review 2</a><a href="/?assessment=guide_eval">Guide Evaluation</a><a href="/?assessment='+key+'&narrow=1">Narrow</a><span>Synthetic data only</span></nav><main>'+f.c.buildInternalAssessmentPublishing_(key)+'</main><script>const previewReport='+JSON.stringify(report).replace(/</g,'\\u003c')+';const renderSkeleton='+styles.getSkeletonMarkup_.toString()+';function escapeHtml(s){return String(s).replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;"}[c]));}'+begin+`
  ${fs.readFileSync('lucide-icons.js','utf8')}
  ${fs.readFileSync('icon-renderer.js','utf8')}
  initializeDashboardTooltips_();
  const DashboardUI={renderAssessmentHistory:${styles.renderAssessmentHistory_.toString()},renderIcon:renderLucideIcon_,beginContentLoading,ask:async text=>confirm(text),requestText:async text=>prompt(text),guideRun:()=>runner()};
  function runner(ok,fail){return new Proxy({withSuccessHandler:fn=>runner(fn,fail),withFailureHandler:fn=>runner(ok,fn)},{get:(target,name)=>target[name]||((...args)=>setTimeout(()=>{
    if(name==='loadInternalAssessmentPublishing')ok(JSON.parse(JSON.stringify(previewReport)));
    else fail({message:'Preview only: no records were changed.'});
  },120))});}
  `+f.c.getInternalAssessmentPublishingClientScript_()+`;InternalAssessmentPublishing.refresh('${key}').then(()=>{`+(url.searchParams.has('details')?`document.querySelector('[data-details="3"]').click();document.querySelector('[data-details="5"]').click();document.querySelectorAll('.review1-history').forEach(node=>node.open=true);`:'')+`});</script></body></html>`;
}
http.createServer((request,response)=>{try{response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(page(new URL(request.url,'http://127.0.0.1')).replace('<body><nav','<body data-dashboard-theme="editorial"><nav'));}catch(error){response.writeHead(500);response.end(error.stack);}}).listen(8765,'127.0.0.1',()=>console.log('Synthetic publishing preview: http://127.0.0.1:8765'));
