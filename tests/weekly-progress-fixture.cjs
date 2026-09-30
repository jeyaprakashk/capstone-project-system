const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
function weeklyFixture() {
  let now = Date.parse('2026-01-02T12:00:00Z'), user='one@example.com', ready=true, locked=false, mailFails=false;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const sheets = new Map(), properties = new Map(), mails=[], errors=[], triggers=[];
  const config = {SUBMISSION_REMINDER_HOURS:24};
  function sheet(name, rows) {
    const value={rows,getName:()=>name,getLastRow:()=>rows.length,getLastColumn:()=>Math.max(0,...rows.map(r=>r.length)),getMaxRows:()=>1000,insertRowsAfter(){},
      getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),
      getRange:(r,c,n=1,w=1)=>({getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>rows[r+i-1]?.[c+j-1]??'')),
        setNumberFormat(){return this;},setValue(v){return this.setValues([[v]]);},setValues(values){values.forEach((row,i)=>row.forEach((cell,j)=>{rows[r+i-1] ||= [];rows[r+i-1][c+j-1]=typeof cell==='string' && cell.startsWith("'")?cell.slice(1):cell;}));},
        createTextFinder(pattern){const finder={useRegularExpression(){return this;},matchEntireCell(){return this;},matchCase(){return this;},
          findAll:()=>rows.slice(r-1,r-1+n).flatMap((row,i)=>new RegExp(pattern,'i').test(String(row[c-1]??''))?[{getRow:()=>r+i}]:[]),findNext(){return this.findAll()[0]||null;}};return finder;}
      })};
    sheets.set(name,value);return value;
  }
  const props={getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),deleteProperty:k=>properties.delete(k)};
  const book={getSpreadsheetTimeZone:()=> 'Asia/Kolkata',getSheetByName:n=>sheets.get(n)||null,getSheets:()=>[...sheets.values()],insertSheet:n=>sheet(n,[])};
  const lock={hasLock:()=>locked,tryLock:()=>{if(locked)return false;locked=true;return true;},waitLock:()=>{locked=true;},releaseLock:()=>{locked=false;}};
  const c=vm.createContext({Date:Clock,console:{log(){},error:m=>errors.push(m)},PropertiesService:{getScriptProperties:()=>props},
    SpreadsheetApp:{openById:()=>book,flush(){}},LockService:{getScriptLock:()=>lock},Session:{getActiveUser:()=>({getEmail:()=>user})},
    Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:(date,tz,pattern)=>pattern==='yyyy-MM-dd'?new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(date):date.toISOString()},
    MailApp:{sendEmail:(...args)=>{if(mailFails)throw Error('Mail unavailable');mails.push(args);}},
    ScriptApp:{getProjectTriggers:()=>triggers.slice(),deleteTrigger:t=>triggers.splice(triggers.indexOf(t),1),newTrigger:name=>({timeBased(){return this;},everyHours(n){this.hours=n;return this;},create(){triggers.push({getHandlerFunction:()=>name,hours:this.hours});}})}
  });
  for(const file of ['common-constants.js','sheet-reads.js','common-helpers.js','github-identity.js','weekly-activity.js','logbook-tracker.js','weekly-progress-phase2.js','marks-tracker.js','guide-dashboard.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
  c.parseGithubRepoUrl_=url=>{const m=String(url).match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i);return m?{owner:m[1],repo:m[2]}:null;};
  const definitions=vm.runInContext('FIELD_DEFINITIONS',c);
  const ts=Object.values(definitions.TEAM_STATUS).concat('Repo URL','Progress Eligible From Week ID'),tr=Object.values(definitions.TEAM_ROSTER);
  const member={'Team ID':'T1','Student 1 Name':'One','Student 1 Register No':'001','Student 1 Email':'one@example.com','Student 2 Name':'Two','Student 2 Register No':'002','Student 2 Email':'two@example.com','Title':'Project','Reviewer Decision':'Approved','Repo URL':'https://github.com/org/team'};
  const status=sheet('TeamStatus',[ts,ts.map(h=>member[h]||'')]),roster=sheet('TeamRoster',[tr,tr.map(h=>member[h]||'')]);
  sheet('LogEntries',[Object.values(definitions.LOG_ENTRIES)]);
  sheet('WeeklyWindows',[Object.values(definitions.WEEKLY_WINDOWS),
    ['W1',new Clock('2026-01-01T00:00:00Z'),new Clock('2026-01-05T18:00:00Z'),new Clock('2026-01-14T23:59:59Z')],
    ['W2',new Clock('2026-01-08T00:00:00Z'),new Clock('2026-01-12T18:00:00Z'),new Clock('2026-01-21T23:59:59Z')]]);
  const githubSetup={repoUrl:'https://github.com/org/team',members:[
    {email:'one@example.com',label:'001',username:'alice',githubId:'101',status:'valid'},
    {email:'two@example.com',label:'002',username:'bob',githubId:'102',status:'valid'}]};
  sheet('GitHubAccounts',[['Timestamp','Email address','Team ID','GitHub Username','GitHub ID','GitHub Display Name','GitHub Profile URL'],
    ...githubSetup.members.map(member=>['',member.email,'T1',member.username,member.githubId,'','https://github.com/'+member.username])]);
  sheet('Commits',[['Date','Team ID','Commit Message','GitHub Username','Repository URL','Commit SHA','GitHub Author ID'],
    ...['2026-01-01T00:00:00Z','2026-01-08T00:00:00Z'].flatMap((date,i)=>githubSetup.members.map((member,j)=>
      [new Clock(date),'T1','Project work',member.username,githubSetup.repoUrl,String(i*2+j+1).padStart(40,'0'),member.githubId]))]);
  sheet('CommitCollectionStatus',[Object.values(definitions.COMMIT_COLLECTION_STATUS),['T1','ok',new Clock()]]);
  const collectionStatus=value=>sheets.get('CommitCollectionStatus').rows[1][1]=value;
  Object.assign(c,{getConfig:key=>{if(!(key in config))throw Error('Missing '+key);return config[key];},getCoordinatorEmail:()=> 'coord@example.com',
    activityIsCoordinator_:email=>email==='coord@example.com',getDashboardUrl:()=> 'https://script.google.com/dashboard',
    getTeamGithubSetup_:()=>({...githubSetup,ready,message:ready?'Ready':'Unavailable'}),requireTeamGithubReady_:()=>{if(!ready)throw Error('GitHub unavailable');return c.getTeamGithubSetup_();}});
  const set=(header,value)=>status.rows[1][ts.indexOf(header)]=value;
  const input=(extra={})=>({requestId:crypto.randomUUID(),weekId:'W1',workCompleted:'Work',guideDiscussion:'Decision',blockers:'None',nextAction:'Next',...extra});
  return {c,collectionStatus,config,sheets,status,roster,ts,tr,mails,properties,errors,triggers,sheet,input,set,githubSetup,
    time:value=>{now=Date.parse(value);},user:value=>{user=value;},ready:value=>{ready=value;},mailFails:value=>{mailFails=value;},locked:()=>locked,
    entries:()=>c.readLogEntries_(),eligible:()=>status.rows[1][ts.indexOf('Progress Eligible From Week ID')]};
}
module.exports={weeklyFixture};
