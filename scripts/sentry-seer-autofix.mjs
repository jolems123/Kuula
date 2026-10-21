/**
 * Poll recent unresolved Sentry issues and ask Seer to create fix PRs.
 * Each issue is tracked in GitHub to prevent repeated paid Seer runs.
 * Requires SENTRY_AUTH_TOKEN (event:write), SENTRY_ORG and SENTRY_PROJECT.
 * Deliberately never merges PRs or changes production itself.
 */
const { SENTRY_AUTH_TOKEN: token, SENTRY_ORG: org, SENTRY_PROJECT: project,
  GITHUB_TOKEN: githubToken, GITHUB_REPOSITORY: repository } = process.env;
const missing = ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT","GITHUB_TOKEN","GITHUB_REPOSITORY"].filter(k=>!process.env[k]);
if(missing.length){ console.error("Missing required configuration: "+missing.join(", ")); process.exitCode=1; }
else {
  const base="https://sentry.io/api/0";
  const enc=encodeURIComponent;
  const sentry=async (path, options={})=>{
    const res=await fetch(base+path,{...options,headers:{Authorization:"Bearer "+token,Accept:"application/json",...options.headers}});
    if(!res.ok)throw new Error("Sentry API HTTP "+res.status+" for "+path.split("?")[0]);
    return res.json();
  };
  const github=async(path,options={})=>{
    const res=await fetch("https://api.github.com"+path,{...options,headers:{Authorization:"Bearer "+githubToken,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",...options.headers}});
    if(!res.ok)throw new Error("GitHub HTTP "+res.status+" for "+path.split("?")[0]);
    return res.json();
  };
  const issuesUrl="/organizations/"+enc(org)+"/issues/?query="+enc("is:unresolved issue.category:error")+"&project="+enc(project)+"&statsPeriod=24h&sort=date&limit=10";
  const issues=await sentry(issuesUrl);
  if(!Array.isArray(issues))throw new Error("Unexpected Sentry response");
  let launched=0;
  for(const issue of issues){
    if(launched>=2)break; // bounded per-run agent spending
    const id=String(issue.id||"");
    if(!/^\d+$/.test(id) || issue.seerAutofixLastTriggered || issue.derivedData?.hasOpenFixPr)continue;
    if(!["error","default"].includes(String(issue.issueCategory||"error")))continue;
    const issueTitle="[Sentry #"+id+"] "+String(issue.title||"Runtime error").slice(0,150);
    const q=enc('repo:'+repository+' in:title is:issue "[Sentry #'+id+']"');
    const seen=await github("/search/issues?q="+q+"&per_page=5");
    if(seen.total_count>0)continue;
    // Issue tracking is created BEFORE triggering Seer; a retry must be explicit.
    const tracking=await github("/repos/"+repository+"/issues",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      title:issueTitle,
      body:"Automated Sentry investigation requested.\n\nSentry issue: "+String(issue.permalink||"https://sentry.io/issues/"+id+"/")+
      "\n\nSeer will attempt root cause, patch and PR creation. PR is not automatically merged. Do not paste PII or credentials into this issue."
    })});
    try{
      const run=await sentry("/organizations/"+enc(org)+"/issues/"+id+"/autofix/",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({stopping_point:"open_pr",repo_name:repository,referrer:"kuula-scheduled-autofix",
          user_context:"Create a minimal safe fix and regression tests. Do not modify authentication, access control, financial ledgers, disbursement, migrations, secrets, or deployment configuration without human review."})
      });
      await github("/repos/"+repository+"/issues/"+tracking.number+"/comments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:"Sentry Seer fix started. Run ID: "+String(run.sentry_run_id||run.run_id||"unknown")+". Review the resulting PR and required checks."})});
      console.log("Started Sentry #"+id+" linked to GitHub #"+tracking.number);launched++;
    }catch(e){
      await github("/repos/"+repository+"/issues/"+tracking.number+"/comments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:"Sentry Seer request failed: "+String(e.message).slice(0,300)+". Manual retry required after diagnosing."})});
      console.error("Failed Sentry #"+id+": "+e.message);process.exitCode=1;
    }
  }
  console.log("Seer runs started: "+launched);
}
