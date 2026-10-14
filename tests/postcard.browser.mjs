/* Approved postcard acceptance: real localhost app + Firestore emulator.
   playwright-cli -s=hph-postcard-qa run-code --filename=tests/postcard.browser.mjs
   Uses fresh fictional visitors, never personal profiles or live model calls. */
async originalPage => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const contexts = [], checks = [], snapshots = [], responsive = [], screenshots = [], runtimeErrors = [];
  let checkpoint='setup';
  const origin = 'http://localhost:8080';
  const choices = [
    { id:'DEMO_EQUIVALENT', hotel:'Example Harbour Hotel', price:54000, refund:5500, pills:['Same hotel','Equivalent room','Refundable'] },
    { id:'DEMO_DIFFERENT_ROOM', hotel:'Example Harbour Hotel', price:52000, refund:7500, pills:['Same hotel','Different room','Refundable'] },
    { id:'DEMO_DIFFERENT_HOTEL', hotel:'Example Garden Hotel', price:51000, refund:8500, pills:['Different hotel','Refundable'] }
  ];
  const stages = ['revalidated','replacement-secured','fulfilment-verified','cancellation-requested','cancellation-verified','refund-completed'];
  const mutation = request => request.method() === 'POST' && request.url().startsWith(origin);
  const command = response => response.request().method() === 'POST' && (/\/api\/offer-approvals$/.test(response.url()) || /\/advances$/.test(response.url()));
  function watch(page) {
    const writes = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('request', request => { if (mutation(request)) writes.push(request.url().slice(origin.length).split('?')[0]); });
    page.setDefaultTimeout(15000);
    return writes;
  }
  async function settled(page) { await page.waitForFunction(() => document.getElementById('simulated-switch')?.getAttribute('aria-busy') !== 'true'); }
  async function state(page) {
    const response = await page.request.get(`${origin}/api/bootstrap?scenario=jury-booking`);
    assert(response.ok(), 'Public bootstrap read failed');
    return response.json();
  }
  async function fresh({ dark=false, width=390, failPhotos=false }={}) {
    const context = await originalPage.context().browser().newContext({ viewport:{width,height:900}, colorScheme:dark?'dark':'light' });
    contexts.push(context);
    const page = await context.newPage();
    const writes = watch(page);
    if (failPhotos) await page.route('**/assets/illustrative-stays.jpg', route => route.abort('failed'));
    await page.goto(origin);
    await page.locator('#content').waitFor({state:'visible'});
    await page.locator('#offers [data-offer-id]').first().waitFor({state:'visible'});
    await settled(page);
    assert(writes.length === 0, 'Opening postcard sent an automatic mutation');
    return {context,page,writes};
  }
  async function reload(page, writes) {
    const before = writes.length;
    await page.reload();
    await page.locator('#content').waitFor({state:'visible'});
    await settled(page);
    assert(writes.length === before, 'Reload sent an automatic mutation');
    return state(page);
  }
  async function review(page, choice, {keyboard=false}={}) {
    const button = page.locator(`#offers button[data-offer-id="${choice.id}"]`);
    if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
    await page.locator('#comparison').waitFor({state:'visible'});
    await settled(page);
    assert((await page.locator('#comparison-title').textContent()).trim() === choice.hotel, `${choice.id}: hotel must be the main review heading`);
    assert(await page.locator('#comparison-title').evaluate(el => el === document.activeElement), 'Review heading did not receive keyboard focus');
    assert((await page.locator('#comparison-saving').textContent()).trim() === `-USD ${choice.refund/100}`, `${choice.id}: exact net saving format/amount is wrong`);
    const text = await page.locator('#comparison').innerText();
    assert(text.includes('Net saving after fees') && text.includes('Potential refund after USD 5 fees'), 'Review lacks net fee/potential wording');
    assert(text.includes('USD 600') && text.includes(`USD ${choice.price/100}`), 'Review lacks trusted whole-stay comparison prices');
    assert(/12 Nov.*15 Nov.*3 nights/.test(await page.locator('#comparison-stay').innerText()) && (await page.locator('#comparison-guests').innerText()).includes('2 adults + 1 child'), 'Review lost stay/occupancy facts');
    for (const pill of choice.pills) assert(text.includes(pill), `${choice.id}: missing review pill ${pill}`);
    if (choice.id !== 'DEMO_EQUIVALENT') assert(!/Equivalent room/.test(text), 'Different room/hotel represented as equivalent');
    await page.locator('#price-details summary').click();
    const facts=await page.locator('#differences').innerText();
    assert(facts.includes('Current cancellation') && facts.includes('Alternative cancellation') && facts.includes('Free cancellation until'), 'Review lacks both cancellation terms');
    if(choice.id==='DEMO_DIFFERENT_ROOM') assert(facts.includes('Room') && facts.includes('→'), 'Different-room review lost changed room facts');
    if(choice.id==='DEMO_DIFFERENT_HOTEL') assert(facts.includes('Hotel') && facts.includes('Example Harbour Hotel → '+choice.hotel), 'Different-hotel review lost changed hotel facts');
    await page.locator('#price-details summary').click();
  }
  async function clickCommand(page, id, {keyboard=false, double=false}={}) {
    const reply = page.waitForResponse(command);
    const button = page.locator(`#${id}`);
    if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); }
    else if (double) await button.dblclick();
    else await button.click();
    const response = await reply;
    const data = await response.json();
    await settled(page);
    return {status:response.status(),data};
  }
  function compact(data) {
    const op = data.simulation.operation;
    return {offerId:op.offerId || op.originalOffer?.offerId || op.offerApproval?.offerId, stage:op.stage,revision:op.revision,status:op.status,
      bookingVersion:data.booking.version,bookingTotalMinor:data.booking.retail.totalMinor,savingSecured:op.savingSecured,
      refundStatus:op.refund.status,refundMinor:op.refund.amountMinor,historyCount:op.history.length};
  }
  async function capture(page, label) {
    const path = `.playwright-cli/postcard-${label}.png`;
    await page.screenshot({path,fullPage:true}); screenshots.push(path);
  }
  async function widths(page, label) {
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:1000});
      const geometry = await page.evaluate(() => ({viewport:innerWidth,document:document.documentElement.scrollWidth,
        boxes:[...document.querySelectorAll('#booking-summary,#offers,#comparison,#simulated-switch,button,a,.proposal')]
          .filter(el => el.getClientRects().length && !el.closest('[hidden]')).map(el => {
            const rect=el.getBoundingClientRect();return {name:el.id||el.className||el.tagName,x:rect.x,right:rect.right,width:rect.width};
          })}));
      assert(geometry.document <= width, `${label}: document overflows at ${width}`);
      for (const box of geometry.boxes) assert(box.width===0 || (box.x>=-1 && box.right<=width+1), `${label}: clipped ${box.name} at ${width}`);
      if(await page.locator('#offers').isVisible()) {
        const photos=await page.locator('#offers .offer-card').evaluateAll(cards=>cards.map(card=>{
          const photo=card.querySelector('.stay-photo').getBoundingClientRect();const body=card.querySelector('.offer-body').getBoundingClientRect();
          return {photo:{x:photo.x,y:photo.y,right:photo.right,width:photo.width,height:photo.height},body:{x:body.x,y:body.y,right:body.right}};
        }));
        for(const card of photos) assert(card.photo.width>card.photo.height && card.photo.right<=card.body.x+1 && card.body.right<=width+1, `${label}: alternative photo not landscape left of text at ${width}`);
      }
      responsive.push({label,width,document:geometry.document});
    }
  }
  try {
    for (const choice of choices) {
      checkpoint=choice.id+': initial booking';
      const {page,writes} = await fresh();
      const before = await state(page);
      // Bind the expected fictional hotel name to the trusted current public offer.
      choice.hotel = before.offers.find(offer => offer.offerId===choice.id).hotel.name;
      assert(!before.enrolled && before.permissionRecord===null && !before.preferences.automaticEquivalentSwitches, 'Fresh visitor has standing authority');
      const cards = await page.locator('#offers article').count();
      assert(cards===3, 'Postcard must show exactly three approved alternatives');
      assert(await page.locator('dialog,form,textarea,#switch-scenario,#edit-preferences,#advice-form').count()===0, 'Obsolete modal/questionnaire/settings/chat/scenario controls remain');
      assert((await page.title()).includes('RoomDrop'), 'Approved RoomDrop identity missing');
      assert(await page.getByRole('link',{name:/Ask|Chat/i}).count()===0, 'Chat link remains');
      assert(!/equivalent-only scope|approval-scope/i.test(await page.locator('body').innerText()), 'Approval scope footer remains');
      for (const item of choices) {
        const card = page.locator('#offers article').filter({has:page.locator(`[data-offer-id="${item.id}"]`)});
        const text = await card.innerText();
        assert(text.includes(`USD ${item.refund/100}`) && text.includes('Potential refund after USD 5 fees'), `${item.id}: card net refund is wrong`);
        const heading = await card.locator('h2,h3').first().textContent();
        assert(heading.trim() === before.offers.find(offer=>offer.offerId===item.id).hotel.name, `${item.id}: card hotel is not primary heading`);
        for (const pill of item.pills) assert(text.includes(pill), `${item.id}: missing card pill ${pill}`);
      }
      if (choice.id==='DEMO_EQUIVALENT') { await widths(page,'booking'); await page.setViewportSize({width:390,height:900}); await capture(page,'booking-390'); }
      checkpoint=choice.id+': review';await review(page,choice,{keyboard:true});
      assert(writes.every(path => path==='/api/selection'), 'Review sent approval/start/advance');
      let selected = await reload(page,writes);
      assert(selected.selectedOfferId===choice.id && selected.simulation.operation===null, 'Selection did not persist without execution');
      await page.locator('#comparison').waitFor({state:'visible'});
      const beforeKeep=writes.length;
      await page.locator('#keep-booking').click();
      await page.locator('#comparison').waitFor({state:'hidden'});
      assert(writes.length===beforeKeep, 'Keep sent a mutation');
      await review(page,choice);
      const beforeBack=writes.length;
      await page.getByRole('link',{name:'Your booking',exact:true}).click();
      await page.locator('#comparison').waitFor({state:'hidden'});
      assert(writes.length===beforeBack, 'Back sent a mutation');
      await review(page,choice);
      if(choice.id==='DEMO_EQUIVALENT') { await widths(page,'review'); await page.setViewportSize({width:390,height:900}); await capture(page,'review-equivalent-390'); }
      else await capture(page,`review-${choice.id.toLowerCase()}-390`);
      checkpoint=choice.id+': approval';const approved=await clickCommand(page,'approve-offer',{keyboard:true});
      assert(approved.status===200, `${choice.id}: approval rejected`);
      let data=approved.data, operation=data.simulation.operation;
      assert(operation.stage==='ready' && operation.revision===0 && operation.authority==='offer-approval', 'Explicit approval must create only ready stage');
      assert(!data.enrolled && JSON.stringify(data.preferences)===JSON.stringify(before.preferences) && data.permissionRecord===before.permissionRecord, 'Offer approval changed enrolment/preferences/standing authority');
      assert(operation.offerApproval.offerId===choice.id && operation.offerApproval.scope==='selected-offer', 'Operation approval receipt is bound to wrong offer/scope');
      assert(writes.filter(path=>path==='/api/offer-approvals').length===1 && writes.every(path=>path==='/api/selection'||path==='/api/offer-approvals'), 'Approval made a hidden start/advance request');
      assert(await page.locator('#switch-history-details').evaluate(el=>!el.open), 'New operation history opened automatically');
      snapshots.push({choice:choice.id,...compact(data)});
      data=await reload(page,writes);
      assert(data.simulation.operation.stage==='ready', 'Reload advanced ready stage');
      for(let i=0;i<stages.length;i++) {
        checkpoint=choice.id+': '+stages[i];
        const result=await clickCommand(page,'advance-demo',{keyboard:i===0});
        assert(result.status===200, `${choice.id}: stage ${i+1} rejected`);
        data=result.data;operation=data.simulation.operation;
        assert(operation.stage===stages[i] && operation.revision===i+1 && operation.history.length===i+2, `${choice.id}: wrong manual stage ${i+1}`);
        assert(await page.locator('#switch-history-details').evaluate(el=>!el.open), 'History expanded during manual progress');
        if(i<4) assert(data.booking.retail.totalMinor===60000 && !operation.savingSecured && operation.refund.status==='not-started', 'Promoted/saved/refunded before cancellation proof');
        if(i===4) {
          assert(data.booking.retail.totalMinor===choice.price && operation.savingSecured && operation.refund.status==='pending', 'Cancellation proof did not promote/preserve pending refund');
          assert(data.offers.length===0 && data.selectedOfferId===null && await page.locator('#comparison').isHidden(), 'Old offers/review survive promotion');
          data=await reload(page,writes);
          assert(data.simulation.operation.stage==='cancellation-verified' && data.simulation.operation.refund.status==='pending', 'Reload settled pending refund');
          assert(/pending/i.test(await page.locator('#switch-money').innerText()), 'Pending refund not shown');
          if(choice.id==='DEMO_EQUIVALENT') {await widths(page,'pending refund');await page.setViewportSize({width:390,height:900});await capture(page,'pending-refund-390');}
        }
        snapshots.push({choice:choice.id,...compact(data)});
      }
      assert(operation.status==='complete' && operation.refund.amountMinor===choice.refund && operation.refund.currency==='USD' && operation.refund.receiptId, 'Completed refund lacks trusted amount/currency/receipt');
      assert(await page.locator('#advance-demo').isDisabled(), 'Completed operation can advance');
      data=await reload(page,writes);
      assert(data.simulation.operation.refund.status==='completed' && data.booking.retail.totalMinor===choice.price, 'Completed choice not persisted');
      if(choice.id==='DEMO_EQUIVALENT') {await page.setViewportSize({width:1440,height:1000});await capture(page,'completed-1440');}
      await page.locator('#switch-history-details summary').focus();await page.keyboard.press('Enter');
      assert(await page.locator('#switch-history-details').evaluate(el=>el.open), 'Native history cannot open with keyboard');
      assert(writes.filter(path=>/\/advances$/.test(path)).length===6, 'Journey used other than six deliberate advances');
      checks.push(`${choice.id}: keyboard review/consent, passive keep/back/reload, six manual stages, persisted pending/completed refund, no standing continuation`);
    }

    checkpoint='lost acknowledgment';const lost=await fresh();
    await review(lost.page,choices[0]);
    const lostRequests=[];
    lost.page.on('request', request=>{if(command({request:()=>request,url:()=>request.url()})) lostRequests.push({url:request.url(),body:request.postData(),key:request.headers()['idempotency-key']});});
    await lost.page.route('**/api/offer-approvals',async route=>{await route.fetch();await route.abort('failed');},{times:1});
    await lost.page.locator('#approve-offer').click();await settled(lost.page);
    assert(/could not be confirmed|uncertain|retry/i.test(await lost.page.locator('#review-message').innerText()), 'Lost approval response did not explain uncertainty');
    let result=await clickCommand(lost.page,'approve-offer');
    assert(result.data.replayed && result.data.simulation.operation.revision===0 && result.data.simulation.operation.history.length===1, 'Lost approval retry duplicated operation');
    assert(lostRequests[0].body===lostRequests[1].body && lostRequests[0].key===lostRequests[1].key, 'Approval retry changed initiating body/key');
    await lost.page.route('**/api/switches/*/advances',async route=>{await route.fetch();await route.abort('failed');},{times:1});
    await lost.page.locator('#advance-demo').click();await settled(lost.page);
    assert(/retry/i.test(await lost.page.locator('#advance-demo').innerText()), 'Lost advance response lacks explicit retry');
    result=await clickCommand(lost.page,'advance-demo');
    assert(result.data.replayed && result.data.simulation.operation.revision===1 && result.data.simulation.operation.history.length===2, 'Lost advance retry skipped stage');
    assert(lostRequests[2].body===lostRequests[3].body && lostRequests[2].url===lostRequests[3].url, 'Advance retry changed operation/revision');
    await lost.page.route('**/api/switches/*/advances',async route=>{await route.fetch();await route.abort('failed');},{times:1});
    await lost.page.locator('#advance-demo').click();await settled(lost.page);
    const reconciled=await reload(lost.page,lost.writes);
    assert(reconciled.simulation.operation.revision===2 && !(await lost.page.locator('#advance-demo').innerText()).includes('Retry'), 'Passive reload failed to reconcile committed pending command');
    checks.push('Committed lost approval/advance retries preserve exact command and replay without duplication; reload reads committed stage');

    checkpoint='concurrent tabs';const racing=await fresh();await review(racing.page,choices[0]);
    const other=await racing.context.newPage();const otherWrites=watch(other);
    await other.goto(origin);await other.locator('#comparison').waitFor({state:'visible'});await settled(other);
    const approvals=await Promise.all([clickCommand(racing.page,'approve-offer',{keyboard:true}),clickCommand(other,'approve-offer',{keyboard:true})]);
    assert(approvals.every(item=>item.status===200 && item.data.simulation.operation.revision===0) && approvals.some(item=>item.data.replayed), 'Concurrent approval does not converge on one ready operation');
    const advances=await Promise.all([clickCommand(racing.page,'advance-demo',{keyboard:true}),clickCommand(other,'advance-demo',{keyboard:true})]);
    assert(advances.every(item=>item.data.simulation.operation.revision===1 && item.data.simulation.operation.history.length===2) && advances.some(item=>item.data.replayed), 'Concurrent tabs advanced twice');
    await racing.page.route('**/api/switches/*/advances',async route=>{await racing.page.waitForTimeout(300);await route.continue();},{times:1});
    const beforeDouble=racing.writes.filter(path=>/\/advances$/.test(path)).length;
    result=await clickCommand(racing.page,'advance-demo',{double:true});
    assert(racing.writes.filter(path=>/\/advances$/.test(path)).length===beforeDouble+1 && result.data.simulation.operation.revision===2, 'Double click made duplicate advance');
    result=await clickCommand(other,'advance-demo');
    assert(result.data.replayed && result.data.simulation.operation.revision===2, 'Stale tab replay advanced next stage');
    assert(otherWrites.every(path=>path==='/api/offer-approvals'||/\/advances$/.test(path)), 'Other tab sent automatic action');
    checks.push('Concurrent approval and advances converge; double click and stale tab cannot duplicate progress');

    // Only synthetic localhost visitor cookies exist in these owned contexts.
    // Changing visitor identity must discard this tab's saved uncertain command.
    for(const kind of ['approval','advance']) {
      checkpoint='fresh visitor pending '+kind;
      const switched=await fresh();await review(switched.page,choices[0]);
      if(kind==='advance') await clickCommand(switched.page,'approve-offer');
      const pattern=kind==='approval'?'**/api/offer-approvals':'**/api/switches/*/advances';
      const control=kind==='approval'?'approve-offer':'advance-demo';
      await switched.page.route(pattern,async route=>{await route.fetch();await route.abort('failed');},{times:1});
      await switched.page.locator(`#${control}`).click();await settled(switched.page);
      await switched.context.clearCookies();
      const clean=await reload(switched.page,switched.writes);
      assert(clean.simulation.operation===null && clean.selectedOfferId===null && !clean.enrolled, `Fresh visitor inherited pending ${kind}`);
      assert(await switched.page.locator('#comparison').isHidden(), 'Fresh visitor inherited another selected comparison');
      assert(!(await switched.page.locator('body').innerText()).includes('Retry the same'), `Fresh visitor retained uncertain ${kind} retry`);
      await review(switched.page,choices[1]);
      const cleanApproval=await clickCommand(switched.page,'approve-offer');
      assert(cleanApproval.data.simulation.operation.offerApproval.offerId===choices[1].id && cleanApproval.data.simulation.operation.revision===0 && !cleanApproval.data.replayed, 'Fresh visitor replayed previous visitor command');
      checks.push(`Fresh fictional visitor discards pending ${kind} without automatic writes and can approve own selected offer`);
    }

    checkpoint='stale different-offer conflict';const conflict=await fresh();await review(conflict.page,choices[0]);
    const winner=await conflict.context.newPage();watch(winner);await winner.goto(origin);await winner.locator('#comparison').waitFor({state:'visible'});await settled(winner);
    await winner.getByRole('link',{name:'Your booking',exact:true}).click();await review(winner,choices[1]);
    const winning=await clickCommand(winner,'approve-offer');
    result=await clickCommand(conflict.page,'approve-offer');
    assert(result.status===409, 'Conflicting different-offer claim did not reject stale tab');
    await settled(conflict.page);
    const refreshed=await state(conflict.page);
    assert(refreshed.simulation.operation.operationId===winning.data.simulation.operation.operationId && refreshed.simulation.operation.revision===0, '409 failed to restore authoritative winning operation');
    checks.push('Stale different-offer approval rejects 409 and refreshes winning ready state without advance');

    checkpoint='competing uncertain offer';const competing=await fresh();await review(competing.page,choices[0]);
    const competingWinner=await competing.context.newPage();watch(competingWinner);
    await competingWinner.goto(origin);await competingWinner.locator('#comparison').waitFor({state:'visible'});await settled(competingWinner);
    await competingWinner.getByRole('link',{name:'Your booking',exact:true}).click();await review(competingWinner,choices[1]);
    let releaseHeld,requestHeld,rejectedStatus;
    const release=new Promise(resolve=>{releaseHeld=resolve;});const received=new Promise(resolve=>{requestHeld=resolve;});
    await competing.page.route('**/api/offer-approvals',async route=>{requestHeld();await release;const response=await route.fetch();rejectedStatus=response.status();await route.abort('failed');},{times:1});
    try {
      const heldClick=competing.page.locator('#approve-offer').click();
      await received;
      const winningCommand=await clickCommand(competingWinner,'approve-offer');
      releaseHeld();await heldClick;await settled(competing.page);
      assert(rejectedStatus===409, 'Held losing selected offer was not rejected by server');
      const saved=await reload(competing.page,competing.writes);
      assert(saved.simulation.operation.operationId===winningCommand.data.simulation.operation.operationId && saved.simulation.operation.revision===0
        && saved.simulation.operation.offerApproval.offerId===choices[1].id, 'Uncertain losing offer replaced or advanced saved winner');
      assert(!(await competing.page.locator('body').innerText()).includes('Retry the same'), 'Winning saved journey retained losing uncertain retry');
    } finally {releaseHeld();await competing.page.unroute('**/api/offer-approvals');}
    checks.push('Competing selected offer can win while losing response is uncertain; passive reload restores authoritative ready operation');

    checkpoint='dark preference';const dark=await fresh({dark:true,width:320});
    const palette=await dark.page.locator('body').evaluate(el=>({background:getComputedStyle(el).backgroundColor,scheme:getComputedStyle(document.documentElement).colorScheme}));
    const values=palette.background.match(/\d+/g).map(Number);
    assert(values.slice(0,3).every(value=>value>200), 'OS dark preference switched approved ivory UI to dark');
    await widths(dark.page,'dark-preference light booking');await dark.page.setViewportSize({width:320,height:900});await capture(dark.page,'dark-preference-320');
    checks.push('Approved light palette preserved under OS dark preference');
    checkpoint='photo failure';const failed=await fresh({failPhotos:true});await review(failed.page,choices[0]);
    assert((await failed.page.locator('body').innerText()).includes('Illustrative'), 'Failed photos lost honest illustrative labelling');
    assert(await failed.page.locator('#approve-offer').isEnabled(), 'Photo failure broke consent controls');
    await capture(failed.page,'photos-unavailable-390');checks.push('Illustrative photo failure keeps honest labels and usable review');
    assert(runtimeErrors.length===0, `Browser runtime errors: ${runtimeErrors.join('; ')}`);
    return {status:'passed',checks,snapshots,responsive,runtimeErrors,screenshots,liveModelRequests:0};
  } catch(error) {
    // The CLI transports returned evidence reliably even when an assertion fails.
    // A failed result is never passing acceptance and retains the precise check.
    return {status:'failed',checkpoint,error:error.message,stack:error.stack,checks,snapshots,responsive,runtimeErrors,screenshots,liveModelRequests:0};
  } finally {for(const context of contexts) await context.close();}
}
