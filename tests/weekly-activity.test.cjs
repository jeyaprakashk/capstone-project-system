const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function fixture() {
 const calls=[];
 const columns={TEAM_ID:0,GUIDE_EMAIL:1,COMMITTEE_NUMBER:2,S1_EMAIL:3,S2_EMAIL:4};
 const rows={teams:[['T1','guide@x','C1','a@x','b@x'],['T2','other@x','C2','c@x']],
 logs:[[10,'a@x','T1'],[10,'b@x','T1'],[9,'a@x','T1'],[10,'c@x','T2']],
 commits:[[10,'T1','message','alice'],[10,'T1','message','unknown'],[10,'T2','message','carol']],
 usernames:[[1,'a@x','T1','Alice'],[1,'b@x','T1','Bob']]};
 let user='coord@x', active=true;
 const norm=value=>String(value??'').trim().toLowerCase();
 const c=vm.createContext({Date,normalizeText_:norm,normalizeEmail:norm,emailsMatch:(a,b)=>norm(a)===norm(b),textEquals_:(a,b)=>norm(a)===norm(b),
  SHEET_NAMES:{TEAM_STATUS:'teams',RAW_LOG:'logs',COMMITS:'commits',GITHUB_USERNAME_RAW:'usernames'},FIELD_DEFINITIONS:{TEAM_STATUS:{}},
  getColumnMap:()=>columns,getSheet:()=>({getLastColumn:()=>5}),getSheetRows:name=>{calls.push(['all',name]);return rows[name];},
  withDashboardRead_:fn=>fn(),Session:{getActiveUser:()=>({getEmail:()=>user})},getCoordinatorEmail:()=> 'coord@x',getConfig:()=> 'pd@x',getCommitteeNumbersForReviewer:()=>[],
  getProjectSchedule_:()=>({week1:10}),getProjectClock_:()=>({active,today:active?10:9,week:active?1:0}),isCurrentProjectWeek_:date=>date===10
 });
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','weekly-activity.js'),'utf8'),c);
 c.readActivityRows_=(name,column,value,width)=>{calls.push([name,column,value,width]);return column===null?rows[name]:rows[name].filter(row=>norm(row[column-1])===norm(value));};
 return {c,rows,calls,user:value=>user=value,inactive:()=>active=false};
}
test('team and all-team scopes agree without calling each other; batch reads each activity sheet once',()=>{
 const f=fixture();const all=f.c.loadAllTeamsWeeklyActivity();
 assert.equal(all.teams.t1.logs,2);assert.equal(all.teams.t1.commits,2);assert.equal(all.activeTeams,2);
 assert.equal(f.calls.filter(call=>call[0]==='logs').length,1);assert.equal(f.calls.filter(call=>call[0]==='commits').length,1);
 f.c.loadAllTeamsWeeklyActivity=()=>{throw Error('must not call all');};f.calls.length=0;
 const team=f.c.loadTeamWeeklyActivity(' T1 ');
 assert.equal(JSON.stringify(team.teams.t1),JSON.stringify(all.teams.t1));
 assert(!f.calls.some(call=>call[0]==='all'));assert(f.calls.filter(call=>['logs','commits'].includes(call[0])).every(call=>call[1]!==null));
});
test('student scope counts own logs and mapped commits, leaving unknown authors at team level',()=>{
 const f=fixture();f.user('a@x');
 f.c.loadAllTeamsWeeklyActivity=f.c.loadTeamWeeklyActivity=()=>{throw Error('must not call another scope');};
 const result=f.c.loadStudentWeeklyActivity();
 assert.equal(result.teams.t1.logs,1);assert.equal(result.teams.t1.commits,1);
 f.rows.usernames.push([2,'b@x','T1','alice']);f.calls.length=0;
 const ambiguous=f.c.loadStudentWeeklyActivity();assert.equal(ambiguous.teams.t1.commits,null);
 assert.equal(ambiguous.commitAttribution,'unavailable');assert(!f.calls.some(call=>call[0]==='commits'));
});
test('unauthorized scopes fail before reading activity; inactive periods do not read activity',()=>{
 const f=fixture();f.user('a@x');
 assert.throws(()=>f.c.loadAllTeamsWeeklyActivity(),/Coordinator/);
 assert.throws(()=>f.c.loadTeamWeeklyActivity('T2'),/denied/);
 assert.throws(()=>f.c.loadStudentWeeklyActivity('b@x'),/denied/);
 assert(!f.calls.some(call=>['logs','commits','usernames'].includes(call[0])));
 f.user('coord@x');f.inactive();f.calls.length=0;
 const result=f.c.loadAllTeamsWeeklyActivity();assert.equal(result.state,'not-started');assert.equal(result.teams.t1.logs,null);
 assert(!f.calls.some(call=>['logs','commits'].includes(call[0])));
});
