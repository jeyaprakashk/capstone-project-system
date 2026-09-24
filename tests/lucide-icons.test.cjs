const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function icons() {
  const c = vm.createContext({});
  for (const file of ['lucide-icons.js', 'icon-renderer.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), c);
  return c;
}

test('Lucide icons are decorative by default and labelled icons escape accessible text', () => {
  const c = icons();
  const decorative = c.renderLucideIcon_('refresh-cw');
  assert.match(decorative, /aria-hidden="true"/);
  assert.match(decorative, /stroke="currentColor"/);
  assert.match(decorative, /focusable="false"/);
  const labelled = c.renderLucideIcon_('check', 'Done <test> "quote" & more');
  assert.match(labelled, /role="img"/);
  assert.match(labelled, /aria-label="Done &lt;test&gt; &quot;quote&quot; &amp; more"/);
  assert.match(labelled, /<title>Done &lt;test&gt;/);
  assert(!labelled.includes('aria-hidden="true"'));
  assert.throws(() => c.renderLucideIcon_('missing-icon'), /Unknown Lucide icon/);
  assert.throws(() => c.renderLucideIcon_('__proto__'), /Unknown Lucide icon/);
});

test('browser and Apps Script render the same bundled Lucide SVGs without network initialization', () => {
  const server = icons();
  const browser = vm.createContext({});
  vm.runInContext(server.getLucideIconNodes_.toString() + '\n' + server.renderLucideIcon_.toString(), browser);
  for (const name of Object.keys(server.getLucideIconNodes_())) {
    assert.equal(browser.renderLucideIcon_(name), server.renderLucideIcon_(name));
  }
  assert.match(server.getLucideIconNodes_.toString(), /ISC License/);
});

test('tracker uses Lucide for repository, title, health and completion states with correct tooltips', () => {
  const c = icons();
  Object.assign(c, {
    escapeHtml: v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
    getInternalReviews_: () => [{key:'r1',label:'Review 1'}],
    getSkeletonMarkup_: () => '<span>Loading</span>',
    buildTeamPagination_: () => ''
  });
  vm.runInContext(fs.readFileSync('coordinator-dashboard.js', 'utf8'), c);
  const base = {teamId:'T1',guide:'Guide',registerNumbers:[],pendingDeadlines:[],emailRecipients:[],titleStatus:'APPROVED',reviews:{r1:'Completed'},guideEvaluation:'Pending',health:'ontrack'};
  const ready = c.buildTeamTrackerTable([{...base,repoStatus:'ready'}]);
  assert.match(ready, /title="Repository URL recorded"><svg[^>]*lucide-check/);
  assert.match(ready, /aria-label="Completed"/);
  assert.match(ready, /lucide-clock/);
  assert(ready.indexOf('<th>Repo</th>') < ready.indexOf('<th>Title</th>'));
  const pending = c.buildTeamTrackerTable([{...base,repoStatus:'pending',health:'attention'}]);
  assert.match(pending, /status-badge red[^>]*title="Pending"><svg[^>]*lucide-x/);
  assert.match(pending, /lucide-triangle-alert/);
  assert(!/[✓×◷]/.test(pending));
});

test('student step icons and expandable sections use the shared library', () => {
  const c = icons();
  for (const file of ['student-dashboard.js','common-styles.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), c);
  assert.match(c.buildStepNode(1,'done'), /lucide-check/);
  assert.match(c.buildStepNode(2,'locked'), /lucide-lock-keyhole/);
  assert.match(c.buildStepNode(3,'active'), />3<\/div>/);
  assert.match(c.getCollapsibleStyles(), /lucide-chevron-right/);
  assert(!/[▸▾]/.test(c.getCollapsibleStyles()));
});
const events={}, appended=[];
function node(attrs={}) {return {attrs,style:{},hidden:false,setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},closest(selector){return selector==='dialog[open]'?null:this;},contains(n){return n===this;},getBoundingClientRect(){return {left:50,top:50,bottom:70,width:40,height:20};}};}
test('tooltips support hover, focus, Escape, scrolling and dynamically added icons',()=>{
 const c=icons();
 c.document={addEventListener:(name,fn)=>{events[name]=fn;},createElement:()=>node(),body:{appendChild:n=>appended.push(n)}};
 c.window={innerWidth:320,innerHeight:240,addEventListener(){}};
 c.initializeDashboardTooltips_();
 const pending=node({title:'Pending','aria-describedby':'existing'});
 events.pointerover({target:pending});
 const tip=appended[0];assert.equal(tip.textContent,'Pending');assert.equal(tip.hidden,false);
 assert.equal(pending.getAttribute('title'),null);assert.equal(pending.getAttribute('aria-describedby'),'existing dashboardTooltip');
 events.keydown({key:'Escape'});assert.equal(tip.hidden,true);assert.equal(pending.getAttribute('title'),'Pending');assert.equal(pending.getAttribute('aria-describedby'),'existing');
 const refreshed=node({'aria-label':'Repository ready'});
 events.focusin({target:refreshed});assert.equal(tip.textContent,'Repository ready');assert.equal(tip.hidden,false);
 events.scroll();assert.equal(tip.hidden,true);assert.equal(refreshed.getAttribute('aria-describedby'),null);
});

test('drawer tooltips follow their dialog across refreshes and return to the page',()=>{
 const c=icons(),handlers={},body={appendChild(n){n.parentNode=this;}},dialog={appendChild(n){n.parentNode=this;}},tip=node();
 c.document={addEventListener:(name,fn)=>{handlers[name]=fn;},createElement:()=>tip,body};
 c.window={innerWidth:320,innerHeight:240,addEventListener(){}};
 c.initializeDashboardTooltips_();
 const owner=node({title:'Drawer action'});
 owner.closest=selector=>selector==='dialog[open]'?dialog:owner;
 handlers.focusin({target:owner});assert.equal(tip.parentNode,dialog);assert.equal(tip.hidden,false);
 handlers.close();assert.equal(tip.hidden,true);assert.equal(owner.getAttribute('title'),'Drawer action');
 tip.parentNode=null;
 handlers.pointerover({target:owner});assert.equal(tip.parentNode,dialog);assert.equal(tip.hidden,false);
 handlers.pointerover({target:node({title:'Page action'})});assert.equal(tip.parentNode,body);assert.equal(tip.textContent,'Page action');
 assert.equal(owner.getAttribute('aria-describedby'),null);
});
