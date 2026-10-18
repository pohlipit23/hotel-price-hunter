import assert from 'node:assert/strict';
import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
const input=process.argv.find(a=>a.startsWith('--snapshot='))?.slice(11);if(!input)throw Error('A private snapshot is required.');
const bundle=JSON.parse(await readFile(resolve(input),'utf8'));const output=resolve('.local/restore-booking-ui/browser');await mkdir(output,{recursive:true});
let playwright;try{playwright=await import('playwright')}catch{playwright=await import(pathToFileURL(join(process.env.APPDATA||'','npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs')).href)};
const cache=join(process.env.LOCALAPPDATA||join(homedir(),'AppData/Local'),'ms-playwright');const builds=(await readdir(cache)).filter(n=>/^chromium-\d+$/.test(n)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]));
const browser=await playwright.chromium.launch({headless:true,executablePath:join(cache,builds[0],'chrome-win64/chrome.exe')});
const server=createBookingDemoServer({bundle});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const report={status:'started',checks:[],errors:[],external:[]};
try{for(const width of [320,768,1440]){const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(report.external.push(route.request().url()),route.abort()));
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
await page.goto(origin);await page.locator('#content').waitFor({state:'visible'});
const inspect=async stage=>{assert.doesNotMatch(await page.locator('body').innerText(),/quotation|fictional|potential refund after/i);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),stage+' overflow');for(const button of await page.locator('button:visible').all()){assert((await button.boundingBox()).height>=44,stage+' small control')}await page.screenshot({path:join(output,stage+'-'+width+'.png'),fullPage:true})};
assert.equal(await page.locator('.offer-ticket .room-key-action').count(),bundle.options.length);assert.equal(await page.locator('.offer-stamp .stamp-amount').count(),bundle.options.length);assert.match(await page.locator('#offers').innerText(),/Estimated saving/);
await inspect('drops');
await page.locator('.offer-action').first().focus();await page.keyboard.press('Enter');await page.locator('#comparison').waitFor({state:'visible'});
assert.equal(await page.locator('#accept-reduced-flexibility').isChecked(),false);await page.locator('#approve-offer').click();await page.getByText('Please confirm the cancellation flexibility').waitFor();
await page.locator('#accept-reduced-flexibility').check();await inspect('review');await page.locator('#approve-offer').click();await page.locator('#simulated-switch').waitFor({state:'visible'});await inspect('confirmed');
assert.match(await page.locator('#switch-reassurance').innerText(),/No reservation, cancellation, payment or refund was made/);await page.reload();await page.locator('#simulated-switch').waitFor({state:'visible'});
const api=await(await context.request.get(origin+'/api/booking-demo')).json();assert.equal(api.confirmation.reservationCreated,false);assert.equal(api.confirmation.quoteModified,false);
await page.locator('#done-button').click();await page.locator('#deal-list').waitFor({state:'visible'});const free=bundle.options.find(o=>o.freeCancellation===true);const button=page.locator('[data-offer-id="'+free.optionId+'"]');await button.click();await page.locator('#comparison').waitFor({state:'visible'});assert.equal(await page.locator('#flexibility-warning').isVisible(),false);
await page.locator('#keep-booking').click();assert.equal(await button.evaluate(e=>document.activeElement===e),true);
report.checks.push({width,dropCards:'passed',savings:'passed',review:'passed',nonRefundableConsent:'passed',confirmation:'passed',reload:'passed',returnFocus:'passed'});await context.close();}
assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.status='passed';}
catch(e){report.status='failed';report.error=e.message;throw e}
finally{await writeFile(join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();await new Promise(r=>{server.closeAllConnections();server.close(r)})}
