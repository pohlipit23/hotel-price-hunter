/* Run with playwright-cli -s=hph-simulation-qa run-code --filename=tests/simulation.browser.mjs.
   Requires the real localhost app, Firestore emulator and unconfigured Gemini.
   All mutations below are ordinary UI actions on fresh fictional visitor contexts. */
async originalPage => {
  const browser = originalPage.context().browser();
  const contexts = [];
  const checks = [];
  const snapshots = [];
  const responsive = [];
  const runtimeErrors = [];
  const screenshots = [];
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const compact = state => ({ bookingVersion: state.booking.version, totalMinor: state.booking.retail.totalMinor,
    selectedOfferId: state.selectedOfferId, offerCount: state.offers.length, monitoring: state.monitoring,
    operation: state.simulation.operation && { id: state.simulation.operation.operationId,
      stage: state.simulation.operation.stage, status: state.simulation.operation.status,
      revision: state.simulation.operation.revision, savingSecured: state.simulation.operation.savingSecured,
      refund: state.simulation.operation.refund, historyCount: state.simulation.operation.history.length } });
  async function settled(page) {
    await page.locator('#simulated-switch[aria-busy="false"]').waitFor();
  }
  async function fresh() {
    const context = await browser.newContext({ viewport: { width:390, height:844 } });
    contexts.push(context);
    await context.route('**/*', route => {
      return route.request().url().startsWith('http://localhost:8080/') ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => runtimeErrors.push(error.message));
    const loaded = page.waitForResponse(r => r.url().includes('/api/bootstrap?'));
    await page.goto('http://localhost:8080/');
    const state = await (await loaded).json();
    assert(state.model.available === false, 'Browser QA must never have an available model');
    await page.locator('#not-now').click();
    return { context, page, state };
  }
  async function reload(page) {
    const loaded = page.waitForResponse(r => r.url().includes('/api/bootstrap?'));
    await page.reload();
    const state = await (await loaded).json();
    await page.locator('#content').waitFor({ state:'visible' });
    await settled(page);
    return state;
  }
  async function permission(page, allow = true) {
    await page.locator('#edit-preferences').click();
    if (allow) { await page.locator('#automatic').check(); await page.locator('#permission-confirmed').check(); }
    else await page.locator('#automatic').uncheck();
    const reply = page.waitForResponse(r => r.url().endsWith('/api/enrolment') && r.request().method() === 'POST');
    await page.locator('#save-preferences').click();
    const response = await reply;
    assert(response.status() === 200, 'Permission save failed');
    const state = await response.json();
    await page.locator('#enrolment').waitFor({ state:'hidden' });
    await settled(page);
    return state;
  }
  async function step(page, { start = false, keyboard = false } = {}) {
    const reply = page.waitForResponse(r => r.request().method() === 'POST'
      && (start ? r.url().endsWith('/api/switches') : /\/api\/switches\/[^/]+\/advances$/.test(r.url())));
    if (keyboard) await page.locator('#advance-demo').press('Enter');
    else { await page.bringToFront(); await page.locator('#advance-demo').click(); }
    const response = await reply;
    const state = await response.json();
    assert(response.status() === 200, `Simulation rejected: ${JSON.stringify(state.error)}`);
    await settled(page);
    return state;
  }
  async function capture(page, name, { fullPage = false } = {}) {
    const path = `.playwright-cli/${name}.png`;
    if (fullPage) await page.screenshot({ path, fullPage:true });
    else await page.locator('#simulated-switch').screenshot({ path });
    screenshots.push(path);
  }
  async function widths(page, label) {
    for (const width of [320,390,1440]) {
      await page.setViewportSize({ width, height:900 });
      const geometry = await page.evaluate(() => ({ viewport:innerWidth, document:document.documentElement.scrollWidth,
        boxes:['switch-scenario','advance-demo','switch-money','switch-history'].map(id => {
          const element = document.getElementById(id); const r = element.getBoundingClientRect();
          return { id, hidden:element.hidden, x:r.x, right:r.right, width:r.width };
        }) }));
      assert(geometry.document <= width, `${label}: horizontal overflow at ${width}`);
      for (const box of geometry.boxes) assert(box.width === 0 || (box.x >= 0 && box.right <= width + 1), `${label}: clipped ${box.id} at ${width}`);
      responsive.push({ label, width, document:geometry.document });
    }
  }
  try {
    // Neither a comparison nor a checkbox without separate confirmation grants authority.
    const happy = await fresh();
    const page = happy.page;
    assert(await page.locator('#advance-demo').isDisabled(), 'Unenrolled visitor can start a switch');
    await page.locator('#review-featured').click();
    await page.locator('#comparison').waitFor({ state:'visible' });
    assert(await page.locator('#advance-demo').isDisabled(), 'Selecting an offer granted authority');
    await page.locator('#close-comparison').click();
    await page.locator('#switch-permission').click();
    await page.locator('#automatic').check();
    await page.locator('#save-preferences').click();
    await page.locator('#preferences-error').filter({ hasText:'Confirm equivalent-only' }).waitFor();
    assert(await page.locator('#advance-demo').isDisabled(), 'Unconfirmed checkbox granted authority');
    await page.locator('#permission-confirmed').check();
    const enrolment = page.waitForResponse(r => r.url().endsWith('/api/enrolment'));
    await page.locator('#save-preferences').click();
    assert((await enrolment).status() === 200, 'Confirmed enrolment failed');
    await page.locator('#enrolment').waitFor({ state:'hidden' });
    await settled(page);
    assert(await page.locator('#advance-demo').isEnabled(), 'Confirmed permission did not enable the journey');
    checks.push('selection and incomplete permission grant no execution authority');
    await widths(page, 'permitted start');
    await page.setViewportSize({ width:390, height:844 });
    await capture(page, 'simulation-start-mobile');
    let state = await step(page, { start:true, keyboard:true });
    assert(state.simulation.operation.stage === 'ready' && state.simulation.operation.revision === 0, 'Start advanced beyond ready');
    const stages = ['revalidated','replacement-secured','fulfilment-verified','cancellation-requested','cancellation-verified','refund-completed'];
    const titles = ['Offer checked again','Replacement secured','Replacement fulfilment verified','Original cancellation requested','Saving secured','Refund completed'];
    for (let i=0; i<stages.length; i++) {
      state = await step(page, { keyboard:i === 0 });
      const operation = state.simulation.operation;
      assert(operation.stage === stages[i] && operation.revision === i+1, `Unexpected happy stage ${i}`);
      assert((await page.locator('#switch-stage').textContent()).includes(titles[i]), `UI stage missing ${titles[i]}`);
      assert(operation.isSimulated === true && operation.history.length === i+2, 'Stage history or simulated label missing');
      if (i<4) assert(state.booking.retail.totalMinor === 60000 && operation.savingSecured === false && operation.refund.status === 'not-started', 'Original changed before verified cancellation');
      snapshots.push({ scenario:'equivalent-saving', ...compact(state) });
      if (i === 4) {
        assert(state.booking.retail.totalMinor === 54000 && operation.savingSecured && operation.refund.status === 'pending', 'Secured saving did not retain pending refund');
        assert(state.selectedOfferId === null && state.offers.length === 0 && await page.locator('#comparison').isHidden(), 'Old comparisons were not retired');
        assert(state.monitoring.status === 'active' && state.monitoring.bookingVersion === state.booking.version, 'Monitoring has wrong replacement baseline');
        assert((await page.locator('#enrolment-summary').textContent()).includes('replacement stay at $540'), 'UI monitoring baseline is not replacement');
        state = await reload(page);
        assert(state.simulation.operation.refund.status === 'pending' && state.simulation.operation.stage === 'cancellation-verified', 'Refresh completed refund prematurely');
        assert((await page.locator('#switch-money').textContent()).includes('$55 · pending'), 'UI does not distinguish pending refund');
        await widths(page, 'saving secured, refund pending');
        await page.setViewportSize({ width:390, height:844 });
        await capture(page, 'simulation-refund-pending-mobile');
      }
    }
    assert(state.simulation.operation.refund.amountMinor === 5500 && state.simulation.operation.refund.currency === 'USD'
      && state.simulation.operation.refund.receiptId && await page.locator('#advance-demo').isDisabled(), 'Completed refund missing receipt or allows another advance');
    state = await reload(page);
    assert(state.simulation.operation.refund.status === 'completed' && state.booking.retail.totalMinor === 54000, 'Completed replacement did not persist');
    await page.setViewportSize({ width:1440, height:1000 });
    await capture(page, 'simulation-refund-completed-desktop', { fullPage:true });
    checks.push('keyboard start and six separate happy advances', 'pending refund survives reload and completes only on next advance', 'replacement baseline540 retires old offers/comparison and persists completed refund');

    // Material changes stop after revalidation, with a recalculated USD50 amount.
    const changed = await fresh();
    await permission(changed.page);
    await changed.page.locator('#switch-scenario').selectOption('material-change');
    await step(changed.page, { start:true });
    state = await step(changed.page);
    assert(state.simulation.operation.status === 'awaits-renewed-approval'
      && state.simulation.operation.refund.amountMinor === 5000 && state.simulation.operation.replacementBooking === null
      && state.simulation.operation.cancellation === null && state.booking.retail.totalMinor === 60000, 'Material change failed to stop safely');
    assert((await changed.page.locator('#switch-explanation').textContent()).includes('38') && (await changed.page.locator('#switch-money').textContent()).includes('$50'), 'Changed room/price facts are not visible');
    assert(await changed.page.locator('#advance-demo').isDisabled(), 'Material change can continue without renewed approval');
    await widths(changed.page, 'material change safety stop');
    await changed.page.setViewportSize({ width:320, height:844 });
    await capture(changed.page, 'simulation-material-change-320');
    state = await reload(changed.page);
    assert(state.simulation.operation.status === 'awaits-renewed-approval', 'Safety stop lost on refresh');
    snapshots.push({ scenario:'material-change', ...compact(state) });
    checks.push('material price/room change pauses at50 without replacement or cancellation');

    // Unknown cancellation observes the same recorded intent before any promotion or refund.
    const uncertain = await fresh();
    await permission(uncertain.page);
    await uncertain.page.locator('#switch-scenario').selectOption('uncertain-cancellation');
    await step(uncertain.page, { start:true });
    for (let i=0; i<5; i++) state = await step(uncertain.page);
    const operationId = state.simulation.operation.operationId;
    const intentId = state.simulation.operation.cancellation.intentId;
    const replacementId = state.simulation.operation.replacementBooking.replacementId;
    assert(state.simulation.operation.status === 'agency-exception' && state.simulation.operation.cancellation.status === 'unknown'
      && !state.simulation.operation.savingSecured && state.simulation.operation.refund.status === 'not-started'
      && state.booking.retail.totalMinor === 60000, 'Unknown cancellation promoted or refunded a booking');
    await capture(uncertain.page, 'simulation-cancellation-unknown-mobile');
    snapshots.push({ scenario:'uncertain-cancellation', ...compact(state) });
    state = await reload(uncertain.page);
    assert((await uncertain.page.locator('#advance-demo').textContent()).includes('check cancellation result'), 'Refresh lost reconciliation control');
    state = await step(uncertain.page);
    assert(state.simulation.operation.operationId === operationId && state.simulation.operation.cancellation.intentId === intentId
      && state.simulation.operation.replacementBooking.replacementId === replacementId
      && state.simulation.operation.cancellation.observations.length === 2 && state.simulation.operation.refund.status === 'pending'
      && state.booking.retail.totalMinor === 54000, 'Reconciliation created another intent/replacement or skipped pending refund');
    state = await step(uncertain.page);
    assert(state.simulation.operation.refund.status === 'completed', 'Recovered refund did not complete');
    snapshots.push({ scenario:'uncertain-cancellation recovered', ...compact(state) });
    checks.push('unknown cancellation leaves original active with no secured saving/refund', 'reconciliation observes same cancellation/replacement before pending and completed refund');

    // Lost HTTP responses after real commits must retry the same command, never the next step.
    const lost = await fresh();
    await permission(lost.page);
    async function loseResponse(pattern) {
      await lost.page.route(pattern, async route => { await route.fetch(); await route.abort('failed'); }, { times:1 });
      await lost.page.locator('#advance-demo').click();
      await lost.page.locator('#advance-demo').filter({ hasText:'Retry the same demo step' }).waitFor();
    }
    await loseResponse('**/api/switches');
    state = await step(lost.page, { start:true });
    assert(state.replayed && state.simulation.operation.revision === 0 && state.simulation.operation.history.length === 1, 'Lost start retry duplicated intent');
    await loseResponse('**/api/switches/*/advances');
    state = await step(lost.page);
    assert(state.replayed && state.simulation.operation.revision === 1 && state.simulation.operation.history.length === 2, 'Lost advance retry moved to next stage');
    await loseResponse('**/api/switches/*/advances');
    state = await reload(lost.page);
    assert(state.simulation.operation.revision === 2 && state.simulation.operation.stage === 'replacement-secured'
      && !(await lost.page.locator('#advance-demo').textContent()).includes('Retry'), 'Refresh failed to reconcile saved pending command');
    checks.push('committed-but-lost start/advance retry returns replay without duplicate progress', 'refresh reconciles committed pending command');

    // Two tabs racing the same revision converge on one stage; a double click also records one.
    const racing = await fresh();
    await permission(racing.page);
    await step(racing.page, { start:true });
    const other = await racing.context.newPage();
    other.on('pageerror', error => runtimeErrors.push(error.message));
    await other.goto('http://localhost:8080/');
    await other.locator('#switch-progress').waitFor({ state:'visible' });
    await settled(other);
    const pair = await Promise.all([step(racing.page, { keyboard:true }), step(other, { keyboard:true })]);
    assert(pair.every(item => item.simulation.operation.revision === 1 && item.simulation.operation.history.length === 2)
      && pair.some(item => item.replayed), 'Concurrent tabs advanced twice');
    let advances = 0;
    racing.page.on('request', request => { if (/\/advances$/.test(request.url()) && request.method() === 'POST') advances++; });
    await racing.page.bringToFront();
    assert(await racing.page.locator('#advance-demo').isEnabled(), 'Double-click target is unavailable');
    const doubleReply = racing.page.waitForResponse(r => /\/advances$/.test(r.url()));
    await racing.page.locator('#advance-demo').dblclick();
    state = await (await doubleReply).json();
    await settled(racing.page);
    assert(advances === 1 && state.simulation.operation.revision === 2, 'Double click recorded two advances');
    state = await step(other);
    assert(state.replayed && state.simulation.operation.revision === 2 && state.simulation.operation.history.length === 3, 'Stale tab replay moved ahead');
    checks.push('concurrent tabs converge on one revision', 'double click and stale-tab retry cannot advance twice');

    // Revoking standing permission in another tab stops the existing journey safely.
    const revoked = await fresh();
    await permission(revoked.page);
    await step(revoked.page, { start:true });
    const revoker = await revoked.context.newPage();
    await revoker.goto('http://localhost:8080/');
    await revoker.locator('#content').waitFor({ state:'visible' });
    await permission(revoker, false);
    state = await step(revoked.page);
    assert(state.simulation.operation.status === 'failed' && state.simulation.operation.replacementBooking === null
      && state.booking.retail.totalMinor === 60000 && await revoked.page.locator('#advance-demo').isDisabled(), 'Stale standing authority secured a replacement');
    checks.push('revoked permission in a stale tab stops before replacement');

    // A new fictional visitor cookie must discard another visitor's pending command.
    for (const kind of ['start','advance']) {
      const switched = await fresh();
      await permission(switched.page);
      if (kind === 'advance') await step(switched.page, { start:true });
      const pattern = kind === 'start' ? '**/api/switches' : '**/api/switches/*/advances';
      await switched.page.route(pattern, async route => { await route.fetch(); await route.abort('failed'); }, { times:1 });
      await switched.page.locator('#advance-demo').click();
      await switched.page.locator('#advance-demo').filter({ hasText:'Retry the same demo step' }).waitFor();
      // This fresh test context contains only the synthetic localhost visitor cookie.
      await switched.context.clearCookies();
      let automaticWrites = 0;
      switched.page.on('request', request => { if (request.method() === 'POST') automaticWrites++; });
      state = await reload(switched.page);
      assert(state.simulation.operation === null && state.enrolled === false, 'Fresh visitor inherited another operation');
      await switched.page.locator('#not-now').click();
      assert(await switched.page.locator('#advance-demo').isDisabled()
        && await switched.page.locator('#switch-permission').isVisible()
        && !(await switched.page.locator('#advance-demo').textContent()).includes('Retry')
        && automaticWrites === 0, `Old visitor pending ${kind} retained retry or wrote automatically`);
      checks.push(`fresh visitor discards pending ${kind} and restores permission guidance without a write`);
    }

    // A different scenario may win while this tab's request/response is uncertain.
    const competing = await fresh();
    await permission(competing.page);
    await competing.page.locator('#switch-scenario').selectOption('material-change');
    const winner = await competing.context.newPage();
    await winner.goto('http://localhost:8080/');
    await winner.locator('#content').waitFor({ state:'visible' });
    let releaseHeld;
    let requestHeld;
    const release = new Promise(resolve => { releaseHeld = resolve; });
    const received = new Promise(resolve => { requestHeld = resolve; });
    let rejectedStatus;
    await competing.page.route('**/api/switches', async route => {
      requestHeld(); await release;
      const response = await route.fetch(); rejectedStatus = response.status();
      await route.abort('failed');
    }, { times:1 });
    try {
      await competing.page.bringToFront();
      const heldClick = competing.page.locator('#advance-demo').click();
      await Promise.race([received, competing.page.waitForTimeout(30000).then(() => { throw new Error('Competing request gate was not reached'); })]);
      const winningState = await step(winner, { start:true });
      releaseHeld(); await heldClick;
      await competing.page.locator('#advance-demo').filter({ hasText:'Retry the same demo step' }).waitFor();
      assert(rejectedStatus === 409, 'Competing request was not rejected by the real server');
      state = await reload(competing.page);
      assert(state.simulation.operation.operationId === winningState.simulation.operation.operationId
        && state.simulation.operation.scenarioId === 'equivalent-saving'
        && await competing.page.locator('#switch-scenario').inputValue() === 'equivalent-saving'
        && !(await competing.page.locator('#advance-demo').textContent()).includes('Retry')
        && state.simulation.operation.revision === 0 && state.simulation.operation.history.length === 1,
        'Losing uncertain scenario overrides the winning saved operation or advances it');
    } finally {
      releaseHeld();
      await competing.page.unroute('**/api/switches');
    }
    checks.push('competing scenario commit replaces losing uncertain retry with the authoritative saved journey');
    assert(runtimeErrors.length === 0, `Browser runtime errors: ${runtimeErrors.join('; ')}`);
    return { status:'passed', checks, snapshots, responsive, runtimeErrors, screenshots, liveModelRequests:0 };
  } finally { for (const context of contexts) await context.close(); }
}
