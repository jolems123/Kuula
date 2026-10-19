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
 for (const width of [393,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.addInitScript(()=>sessionStorage.setItem('kuula_ephemeral_session_v2',JSON.stringify({accessToken:'synthetic',refreshToken:'synthetic',accessExpiresAt:Date.now()+900000})));
  await context.route('**/api/**',route=>!new URL(route.request().url()).pathname.startsWith('/api/') ? route.continue() : route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({token:'synthetic',refreshToken:'synthetic',user:{id:'test',role:'customer',initials:'FT',fullName:'Form Test',phone:'+256770000001',email:'synthetic@example.com',nationalId:'CM900000000001',dateOfBirth:'1990-01-01',memberSince:'2026-01-01',verified:true},role:'customer',credit:null,loan:null,messages:[],unreadNotifications:0})}));
  const page=await context.newPage(); page.on("pageerror",e=>console.log(e.message));
  await page.goto(base+'/#/loan-apply');
  await page.getByRole('button',{name:'Agriculture and livestock',exact:true}).click();
  await page.getByText('Add expenditure details (optional)',{exact:true}).click();
  await page.getByRole('button',{name:'Add expenditure item',exact:true}).click();
  const row=page.getByRole('group',{name:'Expenditure item 1',exact:true});
  await row.getByLabel('Item description',{exact:true}).fill('Seed and feed');
  await row.getByLabel('Amount (UGX)',{exact:true}).fill('50000');
  await page.getByText(/Expenditure details must match every spending category/).waitFor();
  await page.getByLabel('Stock and inventory (UGX)',{exact:true}).fill('50000');
  assert.equal(await page.getByText(/Expenditure details must match every spending category/).count(),0);
  await page.reload();
  await page.getByLabel('Item description',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Item description',{exact:true}).inputValue(),'Seed and feed');
  assert.equal(await page.getByLabel('Amount (UGX)',{exact:true}).inputValue(),'50000');
  await page.locator('.kuula-expenditure').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/ui-review/expenditure-'+width+'.png'});
  await page.getByRole('button',{name:'Remove item 1',exact:true}).click();
  assert.equal(await page.getByLabel('Item description',{exact:true}).count(),0);
  const cards=page.locator('.kuula-statement-card');
  await cards.first().waitFor({timeout:15000}).catch(async error=>{console.log(await page.locator("body").innerText());throw error;});
  const a=await cards.nth(0).boundingBox(),b=await cards.nth(1).boundingBox();
  assert.ok(width<640 ? b.y>=a.y+a.height+19 : b.x>=a.x+a.width+19);
  const input=page.locator('#statement-bank');
  const file={name:'bank.csv',mimeType:'text/csv',buffer:Buffer.from('date,amount\n2026-10-01,100')};
  for(let i=0;i<2;i++){
   await input.setInputFiles(file);
   await page.getByText('Attached: bank.csv',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Remove bank statement',exact:true}).click();
   assert.equal(await page.getByText('Attached: bank.csv',{exact:true}).count(),0);
  }
  const style=await page.locator('.kx-input').first().evaluate(el=>({border:getComputedStyle(el).borderTopWidth,height:el.getBoundingClientRect().height}));
  assert.ok(parseFloat(style.border)>=1 && style.height>=48);
  await cards.first().scrollIntoViewIfNeeded();
  await page.screenshot({path:`artifacts/ui-review/customer-fields-${width}.png`});
  await context.close();console.log(`PASS customer fields and repeat upload/removal at ${width}px`);
 }
} finally {await browser.close();}




