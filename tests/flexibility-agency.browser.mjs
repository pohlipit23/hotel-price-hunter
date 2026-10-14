/* Local-only acceptance. A direct Node runner reads the ignored credential file in memory.
   Credentials never enter CLI arguments, generated source or evidence.
   Uses isolated synthetic visitors; never personal browser state or model requests. */
async (originalPage, passphrase) => {
  const origin = 'http://localhost:8080';
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const contexts = [], checks = [], states = [], responsive = [], screenshots = [], errors = [];
  let liveModelRequests = 0;
  let checkpoint = 'setup';
  const stages = ['revalidated','replacement-secured','fulfilment-verified','cancellation-requested','cancellation-verified','refund-completed'];
  const summaryKeys = ['caseId','isSimulated','status','stage','hotelName','updatedAt','reasonCodes','cancellationStatus','savingSecured','refundStatus','monitoringStatus'];
  const detailKeys = ['caseId','isSimulated','status','stage','revision','reasonCodes','sourceBooking','replacement','authority','cancellation','savingSecured','refund','monitoring','history'];
  function keys(record, allowed, label) { assert(Object.keys(record).sort().join('|') === allowed.sort().join('|'), label + ': unexpected or missing projection fields'); }
  async function fresh(path = '/') {
    const context = await originalPage.context().browser().newContext({viewport:{width:390,height:1000}});
    contexts.push(context); const page = await context.newPage(); page.setDefaultTimeout(15000);
    const writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\/api\/advice(?:\?|$)|aiplatform\.googleapis\.com/.test(request.url()))liveModelRequests++; if (request.url().startsWith(origin) && ['POST','DELETE'].includes(request.method())) writes.push(request.url().slice(origin.length).split('?')[0]); });
    await page.goto(origin + path);
    await page.locator(path === '/' ? '#content' : '#agency-login').waitFor({state:'visible'});
    await settled(page); assert(writes.length === 0, 'Opening page mutated state');
    return {context,page,writes};
  }
  async function settled(page) { await page.waitForFunction(() => document.querySelector('[aria-busy="true"]') === null); }
  async function state(page) { const response=await page.request.get(origin+'/api/bootstrap?scenario=jury-booking'); assert(response.ok(),'Customer read failed'); return response.json(); }
  async function post(page, data, path, body, extra={}) {
    const response=await page.request.post(origin+path,{headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':data.csrfToken,...extra},data:body});
    assert(response.ok(),'Synthetic customer command failed: '+path+' HTTP '+response.status()); return response.json();
  }
  async function enrol(page,data,automatic=true,continuation=true) {
    return post(page,data,'/api/enrolment',{bookingVersion:data.booking.version,preferences:{...data.preferences,automaticEquivalentSwitches:automatic,continueMonitoring:continuation},
      ...(automatic?{permissionConfirmation:{confirmed:true,version:1,bookingVersion:data.booking.version,preferenceVersion:data.preferences.version,scope:'equivalent-only'}}:{})});
  }
  async function advance(page,data) { return post(page,data,'/api/switches/'+data.simulation.operation.operationId+'/advances',{expectedOperationRevision:data.simulation.operation.revision}); }
  async function command(page,id,keyboard=false) {
    const response=page.waitForResponse(response => response.request().method()==='POST' && (/\/api\/offer-approvals$/.test(response.url())||/\/advances$/.test(response.url())));
    if(keyboard){await page.locator('#'+id).focus();await page.keyboard.press('Enter');}else await page.locator('#'+id).click();
    const reply=await response; assert(reply.ok(),id+' rejected'); const data=await reply.json();await settled(page);return data;
  }
  async function compare(page,nonref=true) {
    if(nonref && !await page.locator('#lower-rate').evaluate(el=>el.open)) await page.locator('#lower-rate summary').click();
    await page.locator('button[data-offer-id="'+(nonref?'DEMO_NON_REFUNDABLE':'DEMO_EQUIVALENT')+'"]').focus();await page.keyboard.press('Enter');
    await page.locator('#comparison').waitFor({state:'visible'});await settled(page);
  }
  async function widths(page,label) {
    for(const width of [320,390,1440]) {
      await page.setViewportSize({width,height:1000});
      const geometry=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,boxes:[...document.querySelectorAll('main,section,button,input,.ticket,.offer-card')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]')).map(el=>{const r=el.getBoundingClientRect();return {name:el.id||el.className||el.tagName,x:r.x,right:r.right};})}));
      assert(geometry.document<=width,label+': document overflows '+width);
      for(const box of geometry.boxes) assert(box.x>=-1&&box.right<=width+1,label+': clipped '+box.name+' at '+width);
      responsive.push({label,width,document:geometry.document});
    }
    await page.setViewportSize({width:390,height:1000});
  }
  async function capture(page,label) {assert(await page.locator('#agency-passphrase').count()===0||await page.locator('#agency-passphrase').inputValue()==='','Password input must be empty before capture');const path='.playwright-cli/flexibility-agency-'+label+'.png';await page.screenshot({path,fullPage:true});screenshots.push(path);}
  async function login(page) {
    await page.locator('#agency-passphrase').fill(passphrase);
    await page.locator('#agency-login-submit').focus();await page.keyboard.press('Enter');
    await page.locator('#agency-session').waitFor({state:'visible'});await settled(page);
    assert(await page.locator('#agency-passphrase').inputValue()==='','Login retained passphrase input');
    assert(!page.url().includes(passphrase)&&!(await page.locator('body').innerText()).includes(passphrase),'Login exposed credential in URL or page');
  }
  function compact(data,label) {const op=data.simulation.operation;return {label,stage:op.stage,revision:op.revision,status:op.status,bookingTotalMinor:data.booking.retail.totalMinor,savingSecured:op.savingSecured,refundStatus:op.refund.status,refundMinor:op.refund.amountMinor,monitoring:data.monitoring,reasonCodes:op.reasonCodes};}
  try {
    for(const mode of ['unenrolled','enrolled-continue','enrolled-stop']) {
      checkpoint=mode+' customer approval';const {page,writes}=await fresh();let data=await state(page);
      assert(await page.locator('#offers article').count()===3,'Default postcard cards changed');
      assert(!await page.locator('#lower-rate').evaluate(el=>el.open)&&await page.locator('#lower-rate-offer').isHidden(),'Optional non-refundable offer is not collapsed');
      assert(data.simulation.operation===null&&!data.enrolled&&data.permissionRecord===null,'Fresh customer acquired authority');
      if(mode!=='unenrolled') {data=await enrol(page,data,true,mode==='enrolled-continue');await page.reload();await page.locator('#content').waitFor({state:'visible'});await settled(page);}
      const preferences=JSON.stringify(data.preferences),permission=JSON.stringify(data.permissionRecord);
      await page.locator('#lower-rate summary').focus();await page.keyboard.press('Enter');
      const card=await page.locator('#lower-rate-offer').innerText();
      assert(/Non-refundable/i.test(card)&&card.includes('USD 115')&&card.includes('Potential refund after USD 5 fees'),'Optional card has incorrect labels/refund');
      if(mode==='unenrolled')await widths(page,'optional card');
      await compare(page);
      assert(await page.locator('#comparison-title').evaluate(el=>el===document.activeElement),'Review did not receive keyboard focus');
      assert((await page.locator('#comparison-saving').innerText()).trim()==='-USD 115','Nonref net saving is incorrect');
      const review=await page.locator('#comparison').innerText();
      assert(review.includes('USD 480')&&review.includes('Net saving after fees')&&review.includes('Normal price monitoring ends')&&review.includes('lose free cancellation'),'Reduced flexibility consequences missing');
      assert(!await page.locator('#accept-reduced-flexibility').isChecked()&&await page.locator('#approve-offer').isDisabled(),'Acknowledgement must begin unchecked and block approval');
      await page.locator('#accept-reduced-flexibility').focus();await page.keyboard.press('Space');
      assert(await page.locator('#approve-offer').isEnabled(),'Separate acknowledgement did not enable approval');
      const before=writes.length;await page.locator('#keep-booking').click();await compare(page);
      assert(!await page.locator('#accept-reduced-flexibility').isChecked(),'New comparison inherited acknowledgement');
      assert(writes.slice(before).every(path=>path==='/api/selection'),'Keep/selection granted authority');
      data=await state(page);assert(data.simulation.operation===null&&JSON.stringify(data.permissionRecord)===permission,'Passive comparison changed authority');
      await page.reload();await page.locator('#comparison').waitFor({state:'visible'});await settled(page);
      assert(!await page.locator('#accept-reduced-flexibility').isChecked(),'Reload inferred acknowledgement');
      if(mode==='unenrolled'){await widths(page,'nonref review');await capture(page,'review-390');}
      await page.locator('#accept-reduced-flexibility').check();data=await command(page,'approve-offer',true);
      assert(data.simulation.operation.stage==='ready'&&data.simulation.operation.offerApproval.acceptReducedFlexibility===true,'Approval failed to record explicit reduced flexibility');
      assert(JSON.stringify(data.preferences)===preferences&&JSON.stringify(data.permissionRecord)===permission,'Selected approval changed standing permission/preferences');
      for(let i=0;i<stages.length;i++) {
        checkpoint=mode+' '+stages[i];data=await command(page,'advance-demo',i===0);const op=data.simulation.operation;
        assert(op.stage===stages[i]&&op.revision===i+1,'Wrong manual stage order');
        assert(!await page.locator('#switch-history-details').evaluate(el=>el.open),'Progress history opened automatically');
        if(i<4)assert(data.booking.retail.totalMinor===60000&&!op.savingSecured&&op.refund.status==='not-started','Promoted before cancellation proof');
        if(i===4){assert(data.booking.retail.totalMinor===48000&&op.savingSecured&&op.refund.status==='pending','Proof did not promote nonref / pending refund');assert(data.monitoring.status==='ended'&&data.monitoring.reason==='NON_REFUNDABLE_BASELINE'&&data.permissionRecord===null,'Nonref monitoring priority incorrect');await page.reload();await page.locator('#simulated-switch').waitFor({state:'visible'});await settled(page);assert((await state(page)).simulation.operation.refund.status==='pending','Reload settled pending refund');assert(/Ended.*non-refundable/.test(await page.locator('#switch-money').innerText()),'Monitoring consequence absent from promoted UI');}
        states.push(compact(data,mode));
      }
      assert(data.simulation.operation.refund.amountMinor===11500&&data.simulation.operation.refund.status==='completed'&&data.simulation.operation.status==='complete','Nonref completed refund incorrect');
      assert(await page.locator('#advance-demo').isDisabled(),'Completed operation can advance');
      if(mode==='unenrolled'){await widths(page,'nonref completed');await capture(page,'completed-390');}
      checks.push(mode+': default three cards; collapsed fourth; keyboard separate/reset acknowledgement; passive selection/keep/reload; six manual stages; USD480 promotion/USD115 refund; ended monitoring priority');
    }
    checkpoint='synthetic exception case preparation';
    for(const scenario of ['uncertain-cancellation','material-change','revoked']) {
      const {page}=await fresh();let data=await enrol(page,await state(page));
      const intent=data.simulation.scenarios.find(item=>item.id===(scenario==='revoked'?'equivalent-saving':scenario)).intent;const {idempotencyKey,...body}=intent;
      data=await post(page,data,'/api/switches',body,{'Idempotency-Key':idempotencyKey});
      for(let i=0;i<(scenario==='uncertain-cancellation'?5:scenario==='material-change'?1:2);i++)data=await advance(page,data);
      if(scenario==='revoked'){data=await enrol(page,data,false,false);data=await advance(page,data);}
      states.push(compact(data,scenario));
      if(scenario==='uncertain-cancellation')assert(data.simulation.operation.cancellation.status==='unknown'&&!data.simulation.operation.savingSecured&&data.booking.retail.totalMinor===60000,'Unknown fixture not genuine persisted exception');
      if(scenario==='revoked')assert(data.simulation.operation.status==='agency-exception'&&data.simulation.operation.reasonCodes.includes('STANDING_PERMISSION_REQUIRED'),'Revoked fixture not authority exception');
    }
    for(let i=0;i<18;i++){const {page}=await fresh();const data=await state(page);const {idempotencyKey,...body}=data.simulation.offerApprovalIntents.DEMO_EQUIVALENT;await post(page,data,'/api/offer-approvals',body,{'Idempotency-Key':idempotencyKey});}
    checkpoint='agency protected shell';const agency=await fresh('/agency');
    assert((await agency.page.request.get(origin+'/api/agency/cases')).status()===401,'Unauthenticated cases exposed');
    const spoof=await agency.page.request.get(origin+'/api/agency/cases',{headers:{'X-Role':'agency-reviewer','X-Forwarded-User':'agency-reviewer'}});assert(spoof.status()===401,'Spoofed role granted agency access');
    const customer=await fresh();assert((await customer.page.request.get(origin+'/api/agency/cases')).status()===401,'Real customer cookie granted agency access');
    await widths(agency.page,'agency login');await capture(agency.page,'login-390');
    await login(agency.page);assert((await agency.page.locator('#agency-session').innerText()).includes('Local fixture review')&&(await agency.page.locator('#agency-session-expiry').innerText()).includes('Session expires'),'Agency mode/expiry absent');
    const records=[];let cursor=null;
    do{const reply=await agency.page.request.get(origin+'/api/agency/cases?limit=20'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert(reply.ok(),'Agency listing denied');const list=await reply.json();assert(list.cases.length<=20,'Unbounded agency list');for(const item of list.cases){keys(item,summaryKeys.slice(),'Case summary');assert(item.isSimulated,'Agency case not labelled simulated');records.push(item);}cursor=list.nextCursor;}while(cursor);
    assert(records.length>=24&&new Set(records.map(item=>item.caseId)).size===records.length,'Pagination lost/duplicated newly indexed cases');
    await widths(agency.page,'agency cases');await capture(agency.page,'cases-390');
    assert(await agency.page.locator('#agency-next-page').isVisible(),'Agency pagination button missing');
    await agency.page.locator('#agency-next-page').focus();await agency.page.keyboard.press('Enter');await settled(agency.page);assert(await agency.page.locator('#agency-first-page').isVisible(),'Next page did not expose first-page return');
    await agency.page.locator('#agency-first-page').click();await settled(agency.page);
    let unknown=null,revoked=null,complete=null,paused=null;
    for(const item of records){const reply=await agency.page.request.get(origin+'/api/agency/cases/'+item.caseId);assert(reply.ok(),'Indexed case detail unreadable');const detail=(await reply.json()).case;keys(detail,detailKeys.slice(),'Case detail');
      keys(detail.sourceBooking,['version','hotelName','roomName','refundability'],'Source booking');keys(detail.refund,['status','amountMinor','currency'],'Refund');keys(detail.monitoring,['status','reason'],'Monitoring');
      if(detail.replacement)keys(detail.replacement,['hotelName','roomName','refundability','fulfilmentStatus','fulfilmentVerified'],'Replacement');
      assert(!/operationId|visitorId|sessionId|csrfToken|receiptId|intentId|idempotencyKey|materialFingerprint|supplier|requestHash|locator/.test(JSON.stringify(detail)),'Protected detail leaked private identifiers or supplier fields');
      if(detail.cancellation?.status==='unknown')unknown=detail;
      if(detail.status==='agency-exception'&&detail.authority.valid===false&&detail.replacement?.fulfilmentVerified===false)revoked=detail;
      if(detail.monitoring.status==='paused'&&detail.stage==='ready')paused=detail;
      if(detail.replacement?.refundability==='non-refundable'&&detail.refund.status==='completed')complete=detail;
    }
    assert(unknown&&revoked&&complete&&paused,'Genuine unknown/revoked/paused/nonref cases missing from protected index');
    async function openCase(detail,label){
      while(!await agency.page.locator('[data-case-id="'+detail.caseId+'"]').count()) {assert(await agency.page.locator('#agency-next-page').isVisible(),'Case not found through UI pages');await agency.page.locator('#agency-next-page').click();await settled(agency.page);}
      await agency.page.locator('[data-case-id="'+detail.caseId+'"]').focus();await agency.page.keyboard.press('Enter');await agency.page.locator('#agency-case-detail').waitFor({state:'visible'});await settled(agency.page);
      assert(await agency.page.locator('#agency-detail-title').evaluate(el=>el===document.activeElement),'Case heading missed keyboard focus');
      assert(!await agency.page.locator('#agency-case-detail details').evaluate(el=>el.open),'Agency history must start collapsed');
      assert(await agency.page.locator('#agency-case-detail button').count()===0,'Agency detail has a mutation action');
      await widths(agency.page,label);await capture(agency.page,label+'-390');
      if(await agency.page.locator('#agency-first-page').isVisible()){await agency.page.locator('#agency-first-page').click();await settled(agency.page);}
    }
    await openCase(unknown,'unknown-cancellation');const text=await agency.page.locator('#agency-case-detail').innerText();assert(text.includes('Cancellation outcome is unknown')&&text.includes('original remains active')&&text.includes('no saving is secured'),'Unknown case falsely claims completed saving');
    await openCase(revoked,'revoked-proof-gap');const revokedText=await agency.page.locator('#agency-case-detail').innerText();assert(revokedText.includes('Fulfilment verified')&&revokedText.includes('Current binding valid')&&revokedText.includes('Standing Permission Required'),'Revoked proof gap lacks actual authority reason');await openCase(paused,'monitoring-paused');await openCase(complete,'nonref-refunded');
    assert(agency.writes.filter(path=>path!=='/api/agency/session').length===0,'Read-only agency browsing mutated customer state');
    checks.push('Agency: unauthenticated/header/customer-cookie denial; actual password login; 20-case bounded pagination; strict detail projection; genuine unknown/revoked-with-unverified-fulfilment/paused-monitoring/nonref-refunded cases; keyboard focus/collapsed history; read-only UI');
    checkpoint='agency logout';await agency.page.locator('#agency-logout').click();await agency.page.locator('#agency-login').waitFor({state:'visible'});await settled(agency.page);
    assert(await agency.page.locator('#agency-cases').textContent()===''&&await agency.page.locator('#agency-case-detail').textContent()===''&&(await agency.page.request.get(origin+'/api/agency/cases')).status()===401,'Logout failed to clear protected data/access');
    await login(agency.page);await agency.page.locator('#agency-cases button').first().click();await settled(agency.page);
    // Actual server expiry belongs to injected-clock API tests. This only proves UI handling of a 401 response.
    await agency.page.route('**/api/agency/cases/*',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'AGENCY_SESSION_REQUIRED',message:'Sign in to review cases.'}})}),{times:1});
    await agency.page.locator('#agency-cases button').first().click();await agency.page.locator('#agency-login').waitFor({state:'visible'});await settled(agency.page);
    assert(await agency.page.locator('#agency-cases').textContent()===''&&await agency.page.locator('#agency-case-detail').textContent()==='','401 did not clear protected case data');
    await capture(agency.page,'expired-ui-390');checks.push('Actual logout revokes access/clears DOM; injected401 UI response clears stale protected case data (server expiry separately tested)');
    assert(errors.length===0,'Browser runtime error');assert(liveModelRequests===0,'Unexpected advice/model request');
    return {status:'passed',checks,states,responsive,screenshots,runtimeErrors:errors,indexedCaseCount:records.length,liveModelRequests};
  } catch(error) { return {status:'failed',checkpoint,error:String(error.message).replaceAll(passphrase,'[redacted]'),checks,states,responsive,screenshots,runtimeErrors:errors,liveModelRequests}; }
  finally {for(const context of contexts)await context.close();}
}
