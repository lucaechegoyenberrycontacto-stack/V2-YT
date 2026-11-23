import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await playwright.launch({executablePath:await chromium.executablePath(),args:chromium.args});
try{
for(const width of [Number(process.argv[2])||390]){
 const page=await browser.newPage({viewport:{width,height:850},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.hostname!=='127.0.0.1')return route.abort();
 if(url.pathname==='/dataLayer.js')return route.fulfill({contentType:'text/javascript',body:`
 const sample={id:'a',date:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Cordoba'}).format(new Date()),title:'Fuerza de prueba',discipline:'pesas',source:'manual',exercises:[{name:'Bench Press',sets:[{weight:80,reps:5,rir:0}]}]};
 window.DataLayer={init:async()=>true,list:async c=>c==='gym_workouts'?[sample]:c==='gym_body_weight'?JSON.parse(localStorage.getItem('test-weights')||'[]'):[],getSingleton:async()=>null,put:async(c,id,d)=>localStorage.setItem('test-weights',JSON.stringify([{id,...d}])),setLegacyMirror(){},subscribe(){},collectionVerified:()=>true};`});
 return route.continue();
 });
 await page.goto('http://127.0.0.1:8765/index.html');errors.length=0;
 await page.goto('http://127.0.0.1:8765/gym.html');await page.waitForTimeout(250);
 await page.screenshot({path:'/tmp/fitness-'+width+'.png'});console.log(width,errors);assert.deepEqual(errors,[]);
 const range=await page.locator('#fitnessRange').innerText();
 await page.locator('#fitnessWeek [data-weeks="-1"]').click();
 assert.notEqual(await page.locator('#fitnessRange').innerText(),range);
 await page.locator('#fitnessWeek [data-weeks="0"]').click();
 await page.locator('.tr-body-svg.active [data-muscle="Pecho"]').first().click({force:true});
 await page.locator('#trMuscleDetailClose').click({timeout:2500});
 await page.locator('#whPrList button').first().click();
 assert(await page.locator('#session-0').evaluate(e=>e.open));
 await page.locator('#wtInput').fill('78,4');await page.locator('#wtSaveBtn').click();
 await page.reload();await page.waitForTimeout(100);assert.equal(await page.locator('#wtNum').innerText(),'78.4');
 await page.locator('#wtEditBtn').click();await page.locator('#wtInput').fill('78,6');await page.locator('#wtSaveBtn').click();
 assert.equal(await page.locator('#wtNum').innerText(),'78.6');assert.deepEqual(errors,[]);
 assert.equal(await page.locator('#trPesasLogModalBg,#trCardioModalBg,#trCards').count(),0);
 await page.locator('#stepsPillYesterday').click();
 await page.locator('#stepsPillToday').click();
 assert.equal(await page.locator('#stepsPillToday').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
 console.log('ancho',width,'contenido',await page.evaluate(()=>document.documentElement.scrollWidth));

}
}finally{await browser.close();}
