const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const template = name => fs.readFileSync(path.join(root,'releases/github-identity',name),'utf8');
function replaceFunction(source,name,replacement) {
  const start = source.indexOf('function '+name+'(');
  if(start<0)throw Error('Missing function '+name);
  const next = source.slice(start+1).search(/^function /m);
  return source.slice(0,start)+replacement+'\n\n'+(next<0?'':source.slice(start+1+next));
}
function releaseSource(file,release) {
  let source=fs.readFileSync(path.join(root,file),'utf8');
  if(release===2)return source;
  if(file==='weekly-activity.js')return template('weekly-activity.release1.txt');
  if(file==='github-identity.js') {
    source=source.replace('function githubIdentityRequiresSchema_() { return true; }','function githubIdentityRequiresSchema_() { return false; }');
    source=replaceFunction(source,'githubResolveSubmission_',`function githubResolveSubmission_(submission, columns, request, cache) {
  if (submission && submission[columns.ID]) return resolveGithubAccountId_(submission[columns.ID],request,cache);
  const name = String(submission && submission[3] || '').trim(), key = 'legacy:'+name.toLowerCase();
  if (!cache.has(key)) cache.set(key,validateStudentGithubUsername_(name,request));
  return cache.get(key);
}`);
  }
  if(file==='student-github.js') {
    const old=template('student-github.original.txt');
    source=old.slice(0,old.indexOf('function getStudentGithubState_'))+source;
    const begin=old.indexOf('function submitStudentGithubUsername('),end=old.indexOf('/** Separate request',begin);
    const legacy=old.slice(begin,end).replace('function submitStudentGithubUsername(username) {',`function submitStudentGithubUsername(username) {
  if (githubCaptureReady_()) throw new Error('Open Connect GitHub Account and confirm the resolved profile.');`);
    source=replaceFunction(source,'submitStudentGithubUsername',legacy);
    source=source.replace("const githubNeedsUsername = !!mine && !mine.githubId && !mine.username;", "const githubNeedsUsername = !!mine && (githubCaptureReady_() ? !mine.githubId && !mine.username : ['missing','invalid'].includes(mine.status));");
    source=source.replace(": setup.message };", ": !githubCaptureReady_() && githubNeedsUsername ? (mine.status === 'invalid' ? 'Your saved GitHub username is invalid. Enter a valid personal GitHub username. ' : 'Enter your GitHub username. ') + setup.message : setup.message };");
  }
  if(file==='team-github-setup.js') {
    source=source.replace("    if (id) names.push('/user/' + id);", "    if (id) names.push('/user/' + id);\n    else if (name) names.push('/users/' + encodeURIComponent(name));");
    source=source.replace('githubAuthorMatches_(member.githubId,invite.invitee && invite.invitee.id)', '(member.githubId ? githubAuthorMatches_(member.githubId,invite.invitee && invite.invitee.id) : textEquals_(member.username,invite.invitee && invite.invitee.login))');
  }
  if(file==='student-dashboard.js') {
    source=source.replace('  const githubCta =', '  let githubCta =');
    source=source.replace('  const githubCard =', '  if (!d.githubCaptureReady) {\n'+template('student-cta.release1.txt').replace('const githubCta =','githubCta =')+'\n  }\n  const githubCard =');
  }
  if(file==='dashboard-client-scripts.js') {
    source=source.replace('  function previewGithubAccount(',template('student-client.release1.txt')+'\n  function previewGithubAccount(');
    source=source.replace('    previewGithubAccount,','    previewGithubAccount, submitGithubUsername,');
  }
  return source;
}
if(require.main===module) {
  const release=Number(process.argv[2]);
  if(![1,2].includes(release))throw Error('Usage: node scripts/build-github-identity-release.cjs 1|2');
  const target=path.join(root,'tmp','github-identity-release-'+release);
  fs.mkdirSync(target,{recursive:true});
  for(const file of fs.readdirSync(root).filter(f=>/\.(js|html)$/.test(f)||f==='appsscript.json'))fs.writeFileSync(path.join(target,file),releaseSource(file,release));
  fs.writeFileSync(path.join(target,'RELEASE.txt'),'GitHub student identity release '+release+'\nDeploy only this directory. No credentials or deployment configuration copied.\n');
  console.log(target);
}
module.exports={releaseSource};
