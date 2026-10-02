const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
function fixture(coord=false){
 const c=vm.createContext({getConfig:key=>key==='ACADEMIC_YEAR'?'2026-27':'https://example.com/new',renderLucideIcon_:()=>'<svg></svg>',dashboardUpdatedLabel_:()=> 'Updated now',Utilities:{formatDate:()=> '29 Sep 2026, 10:00 AM'},Session:{getScriptTimeZone:()=> 'Asia/Kolkata'}});
 const helpers=fs.readFileSync('common-helpers.js','utf8');
 for(const file of ['lucide-icons.js','icon-renderer.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
 c.escapeHtml=value=>String(value).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 vm.runInContext(helpers.slice(helpers.indexOf('function formatAnnouncementTimestamp_'),helpers.indexOf('/**',helpers.indexOf('function buildAnnouncementsTabContent_'))),c);
 const records=Array.from({length:8},(_,i)=>({message:i<2?'Step '+(2-i)+' Template':'Notice '+i,fileLink:'https://example.com/'+i,timestamp:'2026-09-29',studentVisible:i%2===0,guideVisible:i%2!==0,reviewerVisible:true}));
 const html=c.buildAnnouncementsTabContent_(records,coord);
 const {document}=parseHTML('<html><body><main>'+html+'</main></body></html>');
 const target=document.querySelector('main');
 const source=fs.readFileSync('dashboard-client-scripts.js','utf8');
 const start=source.indexOf('  const announcementsState =');
 const end=source.indexOf('  function renderAnnouncementsLoading()',start);
 const client=vm.createContext({});vm.runInContext(source.slice(start,end),client);
 client.initializeAnnouncementSearch(target);
 return {c,target,document,html};
}
test('announcement feed filters and expands locally',()=>{
 const f=fixture();const visible=()=>Array.from(f.target.querySelectorAll('[data-announcement-item]')).filter(x=>!x.hidden);
 assert.equal(visible().length,5);
 f.target.querySelector('[data-announcement-more]').click();assert.equal(visible().length,8);
 f.target.querySelector('[data-announcement-audience="teams"]').click();assert.equal(visible().length,4);
 const search=f.target.querySelector('#announcementSearch');search.value='notice 6';search.dispatchEvent(new f.document.defaultView.Event('input'));assert.equal(visible().length,1);
 search.value='nothing';search.dispatchEvent(new f.document.defaultView.Event('input'));assert.equal(visible().length,0);assert.equal(f.target.querySelector('[data-announcement-no-results]').hidden,false);
 assert.deepEqual(Array.from(f.target.querySelectorAll('[data-step-number]')).map(x=>x.textContent),['1','2']);
 search.value='';search.dispatchEvent(new f.document.defaultView.Event('input'));
 f.target.querySelector('[data-announcement-audience="all"]').click();
 const type=f.target.querySelector('[data-announcement-type-filter]');
 type.querySelectorAll('option')[1].selected=true;
 type.dispatchEvent(new f.document.defaultView.Event('change'));assert.equal(visible().length,2);
});
test('announcement content is escaped and management/status metadata is not invented',()=>{
 const f=fixture();assert(!f.html.includes('announcement-manage'));assert(!f.html.includes('Upcoming dates'));assert(!f.html.includes('NEW'));assert(!f.html.includes('New announcement'));
 assert(fixture(true).html.includes('New announcement'));
 const p=f.c.announcementPresentation_({message:'[Pinned] <script>alert(1)</script>',fileLink:'javascript:alert(1)'});assert.equal(p.link,'');assert(p.text.includes('[Pinned]'));assert.equal(p.pinned,undefined);
 const html=f.c.buildAnnouncementsTabContent_([{message:'<script>alert(1)</script>',fileLink:'javascript:alert(1)'}],false);assert(!html.includes('<script>'));assert(!html.includes('javascript:'));
 const form=f.c.buildAnnouncementsTabContent_([{message:'Guide approval form',fileLink:'https://example.com/form'}],false);
 assert(form.includes('Open form'));assert(form.includes('<svg'));
});
