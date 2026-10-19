// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright MCP loads this test as a function expression.
async (page) => {
  const base = 'http://localhost:5192';
  const out = 'landing/evidence/LANDING-LEAD-CAPTURE-001A';
  const results = { scope: '001A fresh local synthetic capture only; no public receiver or external mail', widths: [], checks: [] };
  const check = (value, label) => { if (!value) throw new Error(label); };
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440,1280,768,390,320]) {
    await page.setViewportSize({ width, height:900 });
    await page.goto(base, { waitUntil:'networkidle' });
    const form=page.locator('#demo form'); await form.scrollIntoViewIfNeeded();
    check(await form.count() === 1,'single existing form');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1),'no horizontal overflow');
    check(await page.locator('#demo h2').evaluate(el => getComputedStyle(el).color) === 'rgb(255, 255, 255)','white heading');
    for (const name of ['name','email','company','phone','interest','message','consent']) {
      const control=form.locator(`[name="${name}"]`); check(await control.isVisible(),`visible ${name}`);
      const box=await control.boundingBox(); check(box.x>=0 && box.x+box.width<=width+1,`bounds ${name}`);
    }
    await form.locator('[name="name"]').focus(); await page.keyboard.press('Tab');
    check(await form.locator('[name="email"]').evaluate(el => el===document.activeElement),'keyboard tab order');
    const focus=await form.locator('[name="email"]').evaluate(el=>getComputedStyle(el).outlineStyle);
    check(focus!=='none','visible keyboard focus');
    await page.screenshot({path:`${out}/form-${width}.png`});
    results.widths.push({width,overflow:false,whiteHeading:true,keyboard:true});
  }
  check(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),'reduced motion active');
  check(await page.locator('.pin-spacer').count()===0,'reduced motion avoids pinning');
  const form=page.locator('#demo form'); const button=form.locator('button[type="submit"]');
  await button.click(); check(await form.locator(':invalid').count()>0,'required fields');
  await form.locator('[name="name"]').fill('Synthetic Person'); await form.locator('[name="company"]').fill('Synthetic Business');
  await form.locator('[name="email"]').fill('invalid'); check(!await form.locator('[name="email"]').evaluate(el=>el.checkValidity()),'invalid email');
  await form.locator('[name="email"]').fill('lead@example.test'); await button.click();
  check(!await form.locator('[name="consent"]').evaluate(el=>el.checkValidity()),'required consent'); await form.locator('[name="consent"]').check();
  const endpoint='**/__lead-local/leads'; let requestKey;
  // Stub ONLY the negative acceptance case; real persistence is exercised below.
  const unconfirmed=async route=>{requestKey=route.request().headers()['idempotency-key'];await route.fulfill({status:200,contentType:'application/json',body:'{"accepted":true}'});};
  await page.route(endpoint,unconfirmed); await page.waitForTimeout(2100); await button.click();
  await page.getByText('No se confirmó la recepción.',{exact:false}).waitFor();
  check(await page.getByText('¡Solicitud recibida!',{exact:true}).count()===0,'HTTP200 is not durable proof');
  await page.unroute(endpoint,unconfirmed);
  // Commit at the real receiver then drop its response: same-key retry must not duplicate.
  let first;
  const lostAck=async route=>{const response=await route.fetch();first=await response.json();check(response.status()===201,'real receiver201');await route.abort('failed');};
  await page.route(endpoint,lostAck); await button.click();
  await page.getByText('No se confirmó la recepción.',{exact:false}).waitFor(); await page.unroute(endpoint,lostAck);
  const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/__lead-local/leads')),button.click()]);
  const retry=await response.json(); check(response.status()===201 && retry.accepted && retry.receipt==='stored','real durable receipt');
  check(retry.duplicate && retry.reference===first.reference,'same key replay'); check(response.request().headers()['idempotency-key']===requestKey,'stable retry key');
  await page.getByText('¡Solicitud recibida!',{exact:true}).waitFor(); check(await button.isDisabled(),'success disables submission');
  check(await form.locator('[role="status"]').evaluate(el=>el===document.activeElement),'success focus');
  await page.screenshot({path:`${out}/success-320.png`});
  // Independent key cannot discover the earlier request, even for identical content.
  await page.reload({waitUntil:'networkidle'});
  for (const [name,value] of Object.entries({name:'Synthetic Person',company:'Synthetic Business',email:'lead@example.test'})) await form.locator(`[name="${name}"]`).fill(value);
  await form.locator('[name="consent"]').check(); await page.waitForTimeout(2100);
  const [independentResponse]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/__lead-local/leads')),button.click()]);
  const independent=await independentResponse.json(); check(independent.duplicate===false && independent.reference!==first.reference,'independent key privacy');
  check(independent.notification==='pending','independent key never discloses prior state');
  // Fill the real budget without assuming earlier requests share a clock bucket.
  await page.reload({waitUntil:'networkidle'});
  for(const [name,value] of Object.entries({name:'Synthetic Person',company:'Synthetic Business',email:'lead@example.test'})) await form.locator(`[name="${name}"]`).fill(value);
  await form.locator('[name="consent"]').check(); await page.waitForTimeout(2100);
  let budgetReached=false;
  for(let i=0;i<12;i++) {
    const status=await page.evaluate(async()=> (await fetch('/__lead-local/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status);
    if(status===429) { budgetReached=true; break; }
    check(status===400,'invalid attempts consume budget');
  }
  check(budgetReached,'bounded real rate budget reached'); await button.click();
  await page.getByText('Demasiadas solicitudes.',{exact:false}).waitFor();
  const limited=await page.evaluate(async()=> { const response=await fetch('http://localhost:4021/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); return {status:response.status,retry:response.headers.get('Retry-After')}; });
  check(limited.status===429 && Number(limited.retry)>0,'real cross-origin Retry-After readable');
  await page.screenshot({path:`${out}/rate-limit-320.png`});
  results.checks=['required fields','invalid email','explicit consent','unconfirmed HTTP200 rejected (negative stub)','real receiver commit with lost acknowledgment','same-key retry','independent-key privacy','success focus','reduced-motion no pinning','real429 UX','cross-origin Retry-After readable'];
  results.pageErrors=errors; check(errors.length===0,'no runtime page errors');
  return results;
}
