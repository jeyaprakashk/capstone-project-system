/** Byte-exact v4 repository initialization. All mutation callers hold the script lock. */
function githubTemplatePendingKey_(slug) {
  return 'GITHUB_TEMPLATE_PENDING_' + String(slug).toLowerCase();
}

function githubTemplateRequest_(method, path, payload, expected) {
  const response = makeGithubRequest_(method, path, payload);
  if (!(expected || [200, 201]).includes(response.status)) {
    const error = new Error('Template GitHub request failed: ' + method + ' ' + path + ' (HTTP ' + response.status + ').');
    error.githubStatus = response.status;
    throw error;
  }
  return response.body;
}

function githubTemplateSnapshot_(slug) {
  const base = '/repos/' + slug;
  const repo = githubTemplateRequest_('GET', base);
  if (!repo.default_branch) throw new Error('Repository has no default branch.');
  const branch = repo.default_branch;
  const ref = makeGithubRequest_('GET', base + '/git/ref/heads/' + encodeURIComponent(branch));
  if (ref.status === 404 || ref.status === 409) {
    const commits = makeGithubRequest_('GET', base + '/commits?per_page=1');
    if (commits.status === 409 || (commits.status === 200 && Array.isArray(commits.body) && !commits.body.length)) {
      return {branch, head:null, tree:null, entries:{}};
    }
  }
  if (ref.status !== 200 || !ref.body || !ref.body.object) throw new Error('Cannot read repository branch (HTTP ' + ref.status + ').');
  const head = ref.body.object.sha;
  const commit = githubTemplateRequest_('GET', base + '/git/commits/' + head);
  const tree = githubTemplateRequest_('GET', base + '/git/trees/' + commit.tree.sha + '?recursive=1');
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('Repository tree is incomplete; no files were changed.');
  const entries = {};
  tree.tree.forEach(entry => { entries[entry.path] = {sha:entry.sha,type:entry.type,mode:entry.mode}; });
  return {branch,head,tree:commit.tree.sha,entries};
}

function githubTemplateLegacyReadme_(slug, entry, teamIds) {
  if (!entry || entry.type !== 'blob' || !['100644','100755'].includes(entry.mode)) return false;
  const blob = githubTemplateRequest_('GET', '/repos/' + slug + '/git/blobs/' + entry.sha);
  if (blob.encoding !== 'base64') throw new Error('Cannot inspect existing README encoding.');
  const content = Utilities.newBlob(Utilities.base64Decode(blob.content.replace(/\s/g,''))).getDataAsString('UTF-8');
  // Exactly the legacy generator output, including trailing newline; never a partial match.
  return (teamIds || []).some(id => {
    const prefix = '# Team ' + id + ': ';
    if (!content.startsWith(prefix) || !content.endsWith('\n\nCapstone Project\n')) return false;
    const title = content.slice(prefix.length, -'\n\nCapstone Project\n'.length);
    return title.length > 0 && !/[\r\n]/.test(title);
  });
}

function githubTemplatePlan_(slug, snapshot, teamIds) {
  const expected = {}, baseline = {}, changes = [], preserved = [], conflicts = [];
  githubTemplateManifest_().forEach(file => {
    const entry = snapshot.entries[file.path];
    const parts = file.path.split('/');
    for (let n=1;n<parts.length;n++) {
      const parent = parts.slice(0,n).join('/');
      if (snapshot.entries[parent] && snapshot.entries[parent].type !== 'tree') conflicts.push(parent);
    }
    if (entry && (entry.type !== 'blob' || !['100644','100755'].includes(entry.mode))) {
      conflicts.push(file.path); return;
    }
    const replace = file.path === 'README.md' && entry && entry.sha !== file.sha && githubTemplateLegacyReadme_(slug,entry,teamIds);
    expected[file.path] = entry && !replace ? entry.sha : file.sha;
    if (!entry || replace) {
      baseline[file.path] = entry ? entry.sha : null;
      changes.push(file.path);
    } else if (entry.sha !== file.sha) preserved.push(file.path);
  });
  return {version:4, expected, baseline, changes, preserved, conflicts:[...new Set(conflicts)]};
}

function githubTemplateVerify_(snapshot, receipt) {
  const errors = [];
  Object.keys(receipt.expected).forEach(path => {
    const entry = snapshot.entries[path];
    if (!entry || entry.type !== 'blob' || !['100644','100755'].includes(entry.mode) || entry.sha !== receipt.expected[path]) errors.push(path);
  });
  return errors;
}

function githubTemplatePayload_(file) {
  const payload = globalThis[file.payload]();
  const bytes = Utilities.base64Decode(payload);
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(value => ('0' + ((value + 256) % 256).toString(16)).slice(-2)).join('');
  if (bytes.length !== file.size || hash !== file.sha256) throw new Error('Template asset checksum mismatch: ' + file.path);
  return payload;
}

/** Receipt is persisted BEFORE upload, so retries cannot misclassify edited installed files. */
function installGithubTemplate_(slug, options) {
  options = options || {};
  let receipt = options.receipt || null;
  const files = githubTemplateManifest_();
  const deadline = options.deadline || Date.now() + 240000;
  const checkTime = () => { if (Date.now() >= deadline) throw new Error('Template batch time limit reached; resume the batch.'); };
  const blobs = {};
  for (let attempt=0;attempt<3;attempt++) {
    checkTime();
    let snapshot = githubTemplateSnapshot_(slug);
    if (!receipt) {
      receipt = githubTemplatePlan_(slug,snapshot,options.teamIds);
      if (receipt.conflicts.length) throw new Error('Template path conflicts: ' + receipt.conflicts.join(', '));
      if (options.saveReceipt) options.saveReceipt(receipt);
    }
    if (receipt.version !== 4) throw new Error('Unexpected template receipt version.');
    const pending = [];
    for (const file of files) {
      const entry = snapshot.entries[file.path];
      if (entry && entry.type === 'blob' && ['100644','100755'].includes(entry.mode) && entry.sha === receipt.expected[file.path]) continue;
      const ownsChange = Object.prototype.hasOwnProperty.call(receipt.baseline,file.path);
      if (!ownsChange || (entry ? entry.sha !== receipt.baseline[file.path] || entry.type !== 'blob' || !['100644','100755'].includes(entry.mode) : receipt.baseline[file.path] !== null)) {
        throw new Error('File changed since template preview; preserving it for review: ' + file.path);
      }
      const parts = file.path.split('/');
      for (let n=1;n<parts.length;n++) {
        const parent = snapshot.entries[parts.slice(0,n).join('/')];
        if (parent && parent.type !== 'tree') throw new Error('Template parent path conflict: ' + file.path);
      }
      pending.push(file);
    }
    if (!pending.length) return {verified:true,head:snapshot.head,addedOrReplaced:receipt.changes,preserved:receipt.preserved,receipt};
    if (!snapshot.head) {
      const readme = files.find(file=>file.path === 'README.md');
      checkTime();
      const initialized = makeGithubRequest_('PUT','/repos/' + slug + '/contents/README.md', {
        message:'Initialize Capstone template v4',content:githubTemplatePayload_(readme),branch:snapshot.branch,
        committer:{name:'System',email:'system@capstone.local'}
      });
      if (![200,201,409,422].includes(initialized.status)) throw new Error('Template initialization failed (HTTP ' + initialized.status + ').');
      continue; // Refresh after initialization or a concurrent initial commit.
    }
    const base = '/repos/' + slug;
    for (const file of pending) {
      checkTime();
      if (!blobs[file.sha]) {
        const blob = githubTemplateRequest_('POST',base + '/git/blobs',{content:githubTemplatePayload_(file),encoding:'base64'});
        if (blob.sha !== file.sha) throw new Error('Uploaded blob checksum mismatch: ' + file.path);
        blobs[file.sha] = blob.sha;
      }
    }
    checkTime();
    const tree = githubTemplateRequest_('POST',base + '/git/trees',{base_tree:snapshot.tree,
      tree:pending.map(file=>({path:file.path,mode:snapshot.entries[file.path] ? snapshot.entries[file.path].mode : '100644',type:'blob',sha:file.sha}))});
    // Verify unchanged leaf paths and all target hashes before publishing the commit.
    const built = githubTemplateRequest_('GET',base + '/git/trees/' + tree.sha + '?recursive=1');
    if (built.truncated || !Array.isArray(built.tree)) throw new Error('Cannot verify constructed template tree.');
    const entries = Object.fromEntries(built.tree.map(entry=>[entry.path,entry]));
    const changed = new Set(pending.map(file=>file.path));
    for (const path of Object.keys(snapshot.entries)) {
      const old = snapshot.entries[path], next = entries[path];
      if (old.type !== 'tree' && !changed.has(path) && (!next || old.sha !== next.sha || old.mode !== next.mode)) throw new Error('Unrelated file would change: ' + path);
    }
    if (githubTemplateVerify_({entries},receipt).length) throw new Error('Constructed template tree failed verification.');
    const commit = githubTemplateRequest_('POST',base + '/git/commits',{
      message:'Install Capstone repository template v4',tree:tree.sha,parents:[snapshot.head],
      author:{name:'System',email:'system@capstone.local'},committer:{name:'System',email:'system@capstone.local'}
    });
    checkTime();
    const update = makeGithubRequest_('PATCH',base + '/git/refs/heads/' + encodeURIComponent(snapshot.branch),{sha:commit.sha,force:false});
    if ([409,422].includes(update.status)) continue;
    if (update.status !== 200) throw new Error('Template branch update failed (HTTP ' + update.status + ').');
    snapshot = githubTemplateSnapshot_(slug);
    const errors = githubTemplateVerify_(snapshot,receipt);
    if (errors.length) throw new Error('Template verification failed: ' + errors.join(', '));
    return {verified:true,head:snapshot.head,addedOrReplaced:receipt.changes,preserved:receipt.preserved,receipt};
  }
  throw new Error('Repository branch changed repeatedly; retry template installation.');
}

function resumeGithubTemplateInitialization_(slug, teamId) {
  const properties = PropertiesService.getScriptProperties(), key = githubTemplatePendingKey_(slug);
  const raw = properties.getProperty(key);
  if (!raw) return; // Never restore intentionally removed template folders in completed repos.
  const state = JSON.parse(raw);
  const result = installGithubTemplate_(slug,{teamIds:[String(teamId)],receipt:state.receipt,
    saveReceipt:receipt=>properties.setProperty(key,JSON.stringify({version:4,receipt}))});
  if (result.verified) properties.deleteProperty(key);
}
