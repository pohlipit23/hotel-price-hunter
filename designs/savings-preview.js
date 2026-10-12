// Standalone visual prototypes. All figures mirror the fictional jury scenario.
const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  down: '<path d="M6 6l12 12M18 6v12H6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16"/>',
  room: '<path d="M4 19V9m16 10V9M4 16h16M7 12V6h10v6M4 16v-4h16v4"/>',
  hotel: '<path d="M5 21V3h14v18M3 21h18M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-6h4v6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 21h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
const offers = [
  {title:'Same stay, lower price',short:'Equivalent room',hotel:'Example Harbour Hotel',room:'Deluxe King · city view · 32 m²',price:540,refund:55,description:'Same hotel, room and flexibility',change:'Your hotel, room, breakfast and cancellation deadline stay the same.',symbol:'check'},
  {title:'More room, less to pay',short:'Different room',hotel:'Example Harbour Hotel',room:'Premier King · city view · 38 m²',price:520,refund:75,description:'Premier King · 6 m² more space',change:'Deluxe King becomes Premier King. Room size increases from 32 m² to 38 m². Your hotel stays the same.',symbol:'room'},
  {title:'A different hotel',short:'Different hotel',hotel:'Example Garden Hotel',room:'Deluxe King · city view · 32 m²',price:510,refund:85,description:'Example Garden Hotel · Deluxe King',change:'Example Harbour Hotel becomes Example Garden Hotel. Review the new hotel before deciding.',symbol:'hotel'}
];
const blue = document.body.dataset.direction === 'blue';
document.getElementById('preview').innerHTML = `
<a class="skip" href="#main">Skip to offers</a>
<header class="header shell"><div class="brand"><span class="brand-mark">${icon('down')}</span>Hotel Price Hunter</div><span class="demo">Demo</span></header>
<main id="main" class="shell layout">
  <div class="overview">
    <section class="booking" aria-label="Your current booking"><p class="eyebrow">Your booked stay</p><div class="booking-line"><div><h2>Example Harbour Hotel</h2><p class="sub">Deluxe King · breakfast included</p></div><div class="booking-price">$600<small>USD · full stay</small></div></div><p class="trip">${icon('calendar')}12–15 Nov 2026 · 3 nights</p><p class="sub">2 adults + 1 child</p></section>
    <section class="featured" aria-labelledby="lead-title"><p class="eyebrow">${icon('check')}${blue ? 'Equivalent stay · lower rate' : 'A little back, nothing given up'}</p><h1 id="lead-title">${blue ? 'Your stay.<br>A better price.' : 'Keep your stay.<br>Pay a little less.'}</h1><div class="refund"><div class="amount"><sup>$</sup>55</div><p class="sub">Potential refund · USD, after fees</p></div><p class="featured-copy">Same room. Same breakfast.<br>Same cancellation flexibility.</p><button class="primary" data-offer="0">Review this saving ${icon('arrow')}</button><p class="assurance">${icon('check')}Your booking is unchanged.</p></section>
  </div>
  <div class="choices"><section class="options" aria-labelledby="options-title"><div class="section-heading"><h2 id="options-title">${blue ? 'Compare your options' : 'Three ways to save'}</h2><span>3 offers</span></div><p class="list-caption">Potential refund after fees · USD</p><div class="offer-list">${offers.map((offer,index)=>`<button class="offer" data-offer="${index}" aria-label="Compare ${offer.short.toLowerCase()}, potential refund ${offer.refund} US dollars"><span class="offer-icon">${icon(offer.symbol)}</span><span class="offer-number">0${index+1}</span><span><span class="offer-title">${offer.title}</span><span class="offer-description">${offer.description}</span><span class="offer-flag ${index?'approval':''}">${index?'Refundable · separate approval':'Refundable · equivalent stay'}</span></span><span class="offer-end"><strong>$${offer.refund}</strong><span>Compare ${icon('arrow')}</span></span></button>`).join('')}</div></section>
  <section class="watch" aria-label="Price watch"><span class="watch-icon">${icon('bell')}</span><div class="watch-copy"><h2>Let better rates come to you.</h2><p>Price watch, on your terms.</p></div><button class="text-button" id="watch-open">Explore <span aria-hidden="true">↗</span></button></section>
  </div>
</main>
<footer class="shell footer"><p>Fictional design preview · Simulated rates checked 12 Oct 2026.<br>No live monitoring, bookings, cancellations or refunds.</p><a class="direction-link" href="${blue?'savings-mint.html':'savings-blue.html'}">View ${blue?'A · Quiet savings':'B · Clear comparison'} <span aria-hidden="true">↗</span></a></footer>
<dialog id="comparison" aria-labelledby="comparison-title"><div class="dialog-head"><p class="eyebrow">Your offer, explained</p><button class="close" aria-label="Close comparison">${icon('close')}</button></div><div id="comparison-content"></div><button class="primary" id="return-to-options">Back to all offers ${icon('arrow')}</button><p class="dialog-note">Design preview only. Reviewing an offer does not approve a change.</p></dialog>
<dialog id="watch-dialog" aria-labelledby="watch-title"><div class="dialog-head"><p class="eyebrow">Price watch</p><button class="close" aria-label="Close price watch">${icon('close')}</button></div><h2 id="watch-title">Your stay. Your rules.</h2><p class="sub">A preview of how you could set up your watch.</p><ol class="steps"><li><div><strong>Tell us what matters</strong><span>Keep your breakfast, room essentials and cancellation flexibility.</span></div></li><li><div><strong>Choose how much to save</strong><span>Set a minimum refund after fees, and how often you want updates.</span></div></li><li><div><strong>Stay in control</strong><span>Automatic equivalent switches require explicit, separate permission. Other rooms or hotels always need offer approval.</span></div></li></ol><p class="dialog-note">This design preview does not save preferences or start monitoring.</p><button class="primary" id="watch-close">Got it ${icon('check')}</button></dialog>`;

const comparison = document.getElementById('comparison');
function showOffer(index) {
  const offer = offers[index];
  document.getElementById('comparison-content').innerHTML = `
    <h2 id="comparison-title">${offer.title}</h2><p class="sub">12–15 Nov · 3 nights · 2 adults + 1 child</p>
    <div class="dialog-refund"><p>Potential refund after fees</p><strong>USD ${offer.refund}</strong></div>
    <div class="comparison-grid"><div><p class="eyebrow">Currently booked</p><h3>Example Harbour Hotel</h3><p class="sub">Deluxe King · city view · 32 m²</p><strong>$600</strong><small>Full stay · taxes included</small></div><div class="new"><p class="eyebrow">New offer</p><h3>${offer.hotel}</h3><p class="sub">${offer.room}</p><strong>$${offer.price}</strong><small>Full stay · taxes included</small></div></div>
    <div class="terms"><p><strong>What changes?</strong><br>${offer.change}</p><p><strong>What stays?</strong><br>Dates, guests and breakfast. Free cancellation until 10 Nov 2026, 6 pm Kuala Lumpur time.</p></div>
    ${index?'<p class="approval-note">This '+(index===1?'room':'hotel')+' change requires your separate approval.</p>':'<p class="dialog-note">An automatic equivalent switch would require your explicit standing permission first.</p>'}
    <dl class="bill"><div><dt>Price difference</dt><dd>$${600-offer.price}</dd></div><div><dt>Switch fee</dt><dd>−$5</dd></div><div><dt>Cancellation fee</dt><dd>$0</dd></div><div><dt>Your potential refund</dt><dd>USD ${offer.refund}</dd></div></dl>
    <details><summary>Will I keep free cancellation?</summary><p>Yes, in this fictional offer. The cancellation deadline stays 10 Nov 2026 at 6 pm Kuala Lumpur time. Live terms would need to be checked again before any switch.</p></details>
    <details><summary>Has my booking changed?</summary><p>No. This is a comparison only. No booking, cancellation or refund happens in this preview.</p></details><p class="dialog-note">Offer snapshot: 12 Oct 2026, 10 am Kuala Lumpur time. Simulated rates, not a live check.</p>`;
  comparison.showModal();
  comparison.scrollTop = 0;
}
document.querySelectorAll('[data-offer]').forEach(button => button.addEventListener('click', () => showOffer(Number(button.dataset.offer))));
document.querySelectorAll('dialog .close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.getElementById('return-to-options').addEventListener('click', () => comparison.close());
const watchDialog = document.getElementById('watch-dialog');
document.getElementById('watch-open').addEventListener('click', () => watchDialog.showModal());
document.getElementById('watch-close').addEventListener('click', () => watchDialog.close());
