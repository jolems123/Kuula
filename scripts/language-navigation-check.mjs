// Isolated browser regression tests. All account/API data and GPS fixes are synthetic.
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const base = process.argv[2] || "http://127.0.0.1:5175";
mkdirSync("artifacts/ui-review", { recursive: true });
const executablePath = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const applicationId = "11111111-1111-4111-8111-111111111111";
const dictionary=JSON.parse(await (await import('node:fs/promises')).readFile('src/i18n/source-ui.json','utf8'));
try {
 for(const width of [393,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.addInitScript(()=>{sessionStorage.setItem('kuula_ephemeral_session_v2',JSON.stringify({accessToken:'synthetic',refreshToken:'synthetic',accessExpiresAt:Date.now()+900000}));if(!localStorage.getItem('kuula_lang'))localStorage.setItem('kuula_lang','en');});
  await context.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;if(!path.startsWith('/api/'))return route.continue();
   let data={};
   if(path==='/api/auth/me') data={token:'synthetic',refreshToken:'synthetic',user:{id:'language-test',role:'customer',initials:'HT',fullName:'Home',phone:'+256770000001',email:'synthetic@example.com',nationalId:'CM900000000001',verified:true,dateOfBirth:'1990-01-01',memberSince:'2026-01-01',district:'Wakiso',occupation:'Trader'},role:'customer',credit:null,loan:null,messages:[],unreadNotifications:0};
   if(path==='/api/kyc/status')data={kyc:{loanEligible:true,verified:true,status:'verified'}};
   if(path==='/api/network/overview')data={market:{currency:'UGX'},products:[],partners:[],growthLine:null,nextPayment:null};
   if(path==='/api/loans/applications')data={applications:[]};
   return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#/settings');
  await page.getByRole('button',{name:/App Language/}).click();
  await page.locator('[data-language-code="sw"]').click();
  await page.waitForFunction(()=>document.documentElement.lang==='sw');
  assert.equal(await page.locator('[data-language-code="sw"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-language-code="nyo"]').isEnabled(),false);
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.lang==='sw');
  await page.getByRole('button',{name:dictionary.sw['Back'],exact:true}).click();
  await page.waitForURL('**/#/settings');
  await page.getByText(dictionary.sw['App Language'],{exact:true}).waitFor();
  await page.getByRole('button',{name:new RegExp(dictionary.sw['Personal Information'])}).click();
  await page.waitForURL('**/#/personal-info');
  assert.equal(await page.locator('#profile-fullName').inputValue(),'Home');
  await page.getByRole('button',{name:dictionary.sw['Back'],exact:true}).click();
  await page.waitForURL('**/#/settings');
  await page.goto(base+'/#/loan-apply');
  await page.getByText(dictionary.sw['Your loan application guide'],{exact:true}).waitFor();
  await page.locator('#loan-sector').selectOption('Retail / shop');
  assert.equal(await page.locator('#loan-sector').inputValue(),'Retail / shop');
  assert.equal(await page.locator('#loan-sector option:checked').innerText(),dictionary.sw['Retail / shop']);
  await page.locator('#loan-businessName').fill('Home');
  await page.reload();
  assert.equal(await page.locator('#loan-businessName').inputValue(),'Home');
  assert.equal(await page.locator('#loan-sector').inputValue(),'Retail / shop');
  await page.getByRole('button',{name:dictionary.sw['Choose file']+': '+dictionary.sw['Bank statement'],exact:true}).waitFor();
  for(let i=0;i<2;i++){
   await page.locator('#statement-bank').setInputFiles({name:'bank.csv',mimeType:'text/csv',buffer:Buffer.from('date,amount\n2026-10-21,100')});
   await page.getByText(dictionary.sw['Attached:']+' bank.csv',{exact:true}).waitFor();
   const remove=dictionary.sw['Remove {{statement}}'].replace('{{statement}}',dictionary.sw['Bank statement']);
   await page.getByRole('button',{name:remove,exact:true}).click();
  }
  await page.screenshot({path:'artifacts/ui-review/language-sw-'+width+'.png'});
  await page.goto(base+'/#/settings');
  await page.getByRole('button',{name:new RegExp(dictionary.sw['App Language'])}).click();
  await page.locator('[data-language-code="lg"]').click();
  await page.waitForFunction(()=>document.documentElement.lang==='lg');
  await page.getByRole('button',{name:dictionary.lg['Back'],exact:true}).click();
  await page.waitForURL('**/#/settings');
  await page.goto(base+'/#/home');
  await page.getByRole('button',{name:dictionary.lg['Apply for Business Loan'],exact:true}).waitFor();
  await page.screenshot({path:'artifacts/ui-review/language-lg-'+width+'.png'});
  await page.goto(base+'/#/language');
  await page.locator('[data-language-code="en"]').click();
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.waitForURL('**/#/settings');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS settings return path, whole customer language flow, refresh and canonical values at '+width+'px');
 }
 const context=await browser.newContext();const page=await context.newPage();
 await page.goto(base+'/#/welcome');await page.getByRole('button',{name:/Change language/}).click();
 await page.locator('[data-language-code="sw"]').click();
 await page.waitForFunction(()=>document.documentElement.lang==='sw');
 await page.getByRole('button',{name:dictionary.sw['Back'],exact:true}).click();
 await page.waitForURL('**/#/welcome');
 await page.getByRole('button',{name:dictionary.sw['Create account'],exact:true}).waitFor();
 await context.close();console.log('PASS signed-out language return to welcome');
} finally {await browser.close();}
