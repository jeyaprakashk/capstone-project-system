// Test fixtures: follow the attribute-based hooks; fake elements gain the dataset every real element has.
const e = (file, find, replace) => ({ file, find, replace });
const DL = 'tests/dashboard-loading.test.cjs', PS = 'tests/project-schedule.test.cjs', RE = 'tests/review-evaluation.test.cjs', GI = 'tests/github-identity-browser.test.cjs';
module.exports = [
  e(DL, `nodes[id]={innerHTML:'',attrs:{},isConnected:true,`, `nodes[id]={innerHTML:'',attrs:{},dataset:{},isConnected:true,`),
  e(DL, `selector==='[data-role-panel].active'?{getAttribute:()=> 'guide'}`, `selector==='[data-role-panel]:not([hidden])'?{getAttribute:()=> 'guide'}`),
  e(DL, `/id="rubricDrawer" class="team-drawer drawer" role="dialog"/`, `/id="rubricDrawer" class="team-drawer drawer" data-tooltip-boundary role="dialog"/`),
  e(PS, `return {innerHTML:'',children:[],setAttribute(){},`, `return {innerHTML:'',children:[],dataset:{},setAttribute(){},`),
  e(PS, `if(selector==='[data-role-panel].active')return`, `if(selector==='[data-role-panel]:not([hidden])')return`),
  e(RE, `if(selector==='.review-actions')return`, `if(selector==='[data-review-actions]')return`),
  e(RE, `s==='.team-drawer-content'?content`, `s==='[data-drawer-content]'?content`),
  e(RE, `selector==='.review-header-students'?chips`, `selector==='[data-review-students]'?chips`),
  e(GI, `f.document.body.className='step-card';`, `f.document.body.setAttribute('data-step-card','');`),
];
