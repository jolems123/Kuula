// Isolated browser regression tests. All account/API data and GPS fixes are synthetic.
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const base = process.argv[2] || "http://127.0.0.1:5175";
mkdirSync("artifacts/ui-review", { recursive: true });
const executablePath = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const applicationId = "11111111-1111-4111-8111-111111111111";
try {
 for(const width of [393,1440]) {
  let approved=true, applicationPosts=0;
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.addInitScript(()=>sessionStorage.setItem('kuula_ephemeral_session_v2',JSON.stringify({accessToken:'synthetic',refreshToken:'synthetic',accessExpiresAt:Date.now()+900000})));
  await context.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(!path.startsWith('/api/'))return route.continue();
   if(path==='/api/loans/applications' && route.request().method()==='POST')applicationPosts++;
   const data=path==='/api/kyc/status'?{kyc:{loanEligible:approved,verified:approved,status:approved?'verified':'pending',submissionId:'synthetic'}}:{token:'synthetic',refreshToken:'synthetic',user:{id:'guide-test',role:'customer',initials:'GT',fullName:'Guide Test',phone:'+256770000001',verified:true},role:'customer',credit:null,loan:null,messages:[],unreadNotifications:0};
   return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#/loan-apply');
  await page.getByText('Identity documents: verified and approved',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Review Application',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.id==='loan-spending');
  const missingName=page.getByRole('button',{name:'Business or trading name: enter 1–120 characters.',exact:true});
  await missingName.click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'loan-businessName');
  await page.locator('#loan-businessName').fill('Test shop');
  assert.equal(await missingName.count(),0);
  await page.getByRole('button',{name:'Choose how often the business makes sales.',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'loan-salesFrequency');
  await page.locator('#loan-salesFrequency').selectOption('daily');
  await page.getByRole('button',{name:/Allocate exactly UGX/}).click();
  await page.getByLabel('Stock and inventory (UGX)',{exact:true}).fill('50000');
  assert.equal(await page.getByRole('button',{name:/Allocate exactly UGX/}).count(),0);
  await page.getByLabel('Requested loan amount',{exact:true}).fill('1');
  await page.getByRole('button',{name:'Review Application',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.id==='loan-amount');
  assert.equal(await page.locator('#loan-amount').getAttribute('aria-invalid'),'true');
  approved=false;await page.reload();
  await page.getByText('Identity documents: approval required before applying',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Review Application',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.id==='loan-identity');
  assert.equal(applicationPosts,0);
  await page.screenshot({path:'artifacts/ui-review/loan-guide-'+width+'.png'});
  assert.deepEqual(errors,[]);
  await context.close();console.log('PASS guided application focus, live corrections and unapproved identity gate at '+width+'px');
 }
} finally {await browser.close();}
