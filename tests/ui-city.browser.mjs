/* Local app + Firestore emulator; no live model calls. Run with Playwright CLI. */
async originalPage => {
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.setViewportSize({ width:390, height:844 });
    await page.goto('http://localhost:8080/');
    await page.locator('#not-now').click();
    assert(await page.locator('#featured-saving s').textContent() === '$600', 'Missing original stay total');
    assert(await page.locator('#featured-saving .price-drop strong').textContent() === '$540', 'Wrong replacement price');
    assert(await page.locator('#featured-saving .saving strong').textContent() === '−$55', 'Gross price drop was confused with net refund');
    for (const width of [320,390,768,1024,1440]) {
      await page.setViewportSize({ width, height:900 });
      await page.evaluate(() => scrollTo(0,0));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
      await page.locator('#open-photos').click();
      for (let index=0; index<4; index++) {
        const tab = page.locator('#photo-tabs button').nth(index);
        await tab.click();
        assert(await tab.getAttribute('aria-pressed') === 'true', 'Photo tab state is wrong');
        assert(await page.locator('#gallery-image svg').getAttribute('aria-label'), 'Missing image description');
      }
      await page.keyboard.press('Tab');
      assert(await page.locator('#close-photos').evaluate(el => el === document.activeElement), 'Gallery focus escaped');
      await page.keyboard.press('Escape');
      assert(await page.locator('#open-photos').evaluate(el => el === document.activeElement), 'Gallery focus was not restored');
    }
    await page.setViewportSize({ width:390, height:844 });
    await page.locator('#review-featured').click();
    await page.locator('#comparison').waitFor({ state:'visible' });
    assert(await page.locator('#comparison-saving').textContent() === '−$55', 'Featured selection changed refund');
    await page.locator('#close-comparison').click();
    assert(await page.locator('[data-offer="DEMO_EQUIVALENT"] button').evaluate(el => el === document.activeElement), 'Focus lost after offer rerender');
    await page.locator('#edit-preferences').click();
    await page.locator('[data-value="boardBasis"]').selectOption('ROOM_ONLY');
    await page.locator('#save-preferences').click();
    await page.locator('#enrolment').waitFor({ state:'hidden' });
    assert(await page.locator('#review-featured').count() === 0, 'Blocked equivalent offer still advertised');
    assert((await page.locator('#featured-saving').textContent()).includes('No verified equivalent refund'), 'No-offer state missing');
    assert(await page.locator('[data-offer="DEMO_EQUIVALENT"] .saving strong').textContent() === 'Unavailable', 'Blocked offer fell back to raw quote amount');
    await page.locator('#edit-preferences').click();
    await page.locator('[data-value="boardBasis"]').selectOption('BREAKFAST');
    await page.locator('#save-preferences').click();
    await page.locator('#enrolment').waitFor({ state:'hidden' });
    await page.locator('#review-featured').waitFor();
    await page.evaluate(() => { document.activeElement.blur(); scrollTo(0,0); });
    await page.screenshot({ path:'.playwright-cli/city-mobile.png', fullPage:true });
    await page.locator('#open-photos').click();
    await page.screenshot({ path:'.playwright-cli/city-gallery.png' });
    await page.locator('#close-photos').click();
    await page.setViewportSize({ width:1440, height:1000 });
    await page.evaluate(() => { document.activeElement.blur(); scrollTo(0,0); });
    await page.screenshot({ path:'.playwright-cli/city-desktop.png', fullPage:true });
    await page.emulateMedia({ colorScheme:'dark' });
    assert(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme) === 'light', 'Theme switched to dark');
    await page.route('**/assets/illustrative-stays.jpg', route => route.abort());
    await page.reload();
    await page.locator('#content').waitFor({ state:'visible' });
    await page.locator('#hotel-photo .photo-unavailable').waitFor({ state:'visible' });
    assert(await page.locator('#review-featured').isVisible(), 'Image failure prevents price comparison');
    assert(errors.length === 0, errors.join('\n'));
    return { status:'passed', checks:['5 widths','four-photo gallery and focus','featured selection saves comparison','blocked refund never advertised','eligible refund restores after preference correction','local images and missing-image fallback','light-only theme'], runtimeErrors:errors };
  } finally { await context.close(); }
}
