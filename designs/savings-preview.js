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
const photos = [
  {title:'The hotel', box:'0 0 768 512', alt:'Illustrative boutique hotel with palms and a sunny courtyard pool'},
  {title:'Deluxe King', box:'768 0 768 512', alt:'Illustrative king room with white linen, oak finishes and a city view'},
  {title:'Premier King', box:'0 512 768 512', alt:'Illustrative larger king room with a lounge chair and sitting area'},
  {title:'Garden hotel', box:'768 512 768 512', alt:'Illustrative terracotta hotel with a leafy garden and courtyard pool'}
];
const photo = (index, decorative = false) => `<svg class="photo" viewBox="${photos[index].box}" preserveAspectRatio="xMidYMid slice" ${decorative ? 'aria-hidden="true"' : `role="img" aria-label="${photos[index].alt}"`}><image href="assets/illustrative-stays.jpg" width="1536" height="1024"/></svg>`;
const offers = [
  {title:'Same stay, lower price',short:'Equivalent room',hotel:'Example Harbour Hotel',room:'Deluxe King · city view · 32 m²',price:540,refund:55,description:'Same hotel, room and flexibility',change:'Your hotel, room, breakfast and cancellation deadline stay the same.',symbol:'check'},
  {title:'More room, less to pay',short:'Different room',hotel:'Example Harbour Hotel',room:'Premier King · city view · 38 m²',price:520,refund:75,description:'Premier King · 6 m² more space',change:'Deluxe King becomes Premier King. Room size increases from 32 m² to 38 m². Your hotel stays the same.',symbol:'room'},
  {title:'A different hotel',short:'Different hotel',hotel:'Example Garden Hotel',room:'Deluxe King · city view · 32 m²',price:510,refund:85,description:'Example Garden Hotel · Deluxe King',change:'Example Harbour Hotel becomes Example Garden Hotel. Review the new hotel before deciding.',symbol:'hotel'}
];
const blue = document.body.dataset.direction === 'blue';
document.getElementById('preview').innerHTML = `
<a class="skip" href="#main">Skip to offers</a>
<header class="header shell"><div class="brand"><span class="brand-mark">${icon('down')}</span>Hotel Price Hunter</div><span class="demo">Design preview</span></header>
<main id="main" class="shell layout">
  <div class="overview">
    <div class="intro"><p class="eyebrow">${blue ? 'Your next city escape' : 'Something to look forward to'}</p><h1>${blue ? 'A great stay.<br>An even better deal.' : 'The same lovely stay.<br>A little more to enjoy.'}</h1><p class="trip">12–15 Nov 2026 <span>·</span> 3 nights <span>·</span> 2 adults + 1 child</p></div>
    <section class="stay-card" aria-label="Your current booking">
      <button class="stay-gallery" id="gallery-open" aria-label="View illustrative hotel and room photos"><span class="gallery-main">${photo(blue?0:1,true)}</span><span class="gallery-small">${photo(blue?1:0,true)}</span><span class="photo-tag">Illustrative photos</span><span class="gallery-count">View photos ${icon('arrow')}</span></button>
      <div class="booking"><p class="eyebrow">Your booked stay</p><div class="booking-line"><div><h2>Example Harbour Hotel</h2><p class="sub">Deluxe King · city view · breakfast</p></div><div class="booking-price"><small>Booked total</small>$600<small>USD · 3 nights</small></div></div></div>
    </section>
    <section class="featured" aria-labelledby="lead-title"><div class="saving-story"><p class="eyebrow">${icon('check')}Same stay, lower rate</p><h2 id="lead-title">You could get <strong>$55 back</strong></h2><p class="featured-copy">Refund to you, after the $5 switch fee.</p></div><p class="price-path"><span>Booked total <b>$600</b></span><span aria-hidden="true">→</span><span>New stay total <b>$540</b></span></p><button class="primary" data-offer="0">Review $55 refund ${icon('arrow')}</button><p class="assurance">USD · Same room, breakfast & flexibility.<br>Your booking is unchanged.</p></section>
  </div>
  <div class="choices"><section class="options" aria-labelledby="options-title"><div class="section-heading"><div><p class="eyebrow">${blue?'Find your fit':'A stay worth looking forward to'}</p><h2 id="options-title">${blue ? 'Three stays. Your choice.' : 'A little less, or a little more room?'}</h2></div><span>03</span></div><p class="list-caption">These amounts are money back to you · USD, after fees</p><div class="offer-list">${offers.map((offer,index)=>`<button class="offer" data-offer="${index}" aria-label="Compare ${offer.short.toLowerCase()}, potential refund ${offer.refund} US dollars"><span class="offer-photo">${photo(index+1,true)}<span class="image-badge">${index===0?'Your room':index===1?'More space':'New surroundings'}</span></span><span class="offer-body"><span class="offer-kicker">0${index+1} / ${offer.short}</span><span class="offer-title">${index===0?'The room you already love':index===1?'Make yourself a little more at home':'A fresh setting for your escape'}</span><span class="offer-description">${offer.description}</span><span class="offer-prices">Stay total: $600 → $${offer.price}</span><span class="offer-bottom"><span class="offer-flag ${index?'approval':''}">${index?'Separate approval':'Equivalent stay'}<span>Refundable</span></span><span class="offer-end"><strong>Get $${offer.refund} back</strong><span>Potential refund, after fees</span></span></span></span></button>`).join('')}</div></section>
  <section class="watch" aria-label="Price watch"><span class="watch-icon">${icon('bell')}</span><div class="watch-copy"><h2>Let better rates come to you.</h2><p>Price watch, on your terms.</p></div><button class="text-button" id="watch-open">Explore <span aria-hidden="true">↗</span></button></section>
  </div>
</main>
<footer class="shell footer"><p>Fictional design preview · AI-generated illustrative photos.<br>Images do not verify hotel amenities or room features.<br>Simulated rates: 12 Oct 2026. No live monitoring or transactions.</p><a class="direction-link" href="${blue?'savings-mint.html':'savings-blue.html'}">View ${blue?'A · The stay journal':'B · The city escape'} <span aria-hidden="true">↗</span></a></footer>
<dialog id="comparison" aria-labelledby="comparison-title"><div class="dialog-head"><p class="eyebrow">Your offer, explained</p><button class="close" aria-label="Close comparison">${icon('close')}</button></div><div id="comparison-content"></div><button class="primary" id="return-to-options">Back to all offers ${icon('arrow')}</button><p class="dialog-note">Design preview only. Reviewing an offer does not approve a change.</p></dialog>
<dialog id="gallery-dialog" aria-labelledby="gallery-title"><div class="dialog-head"><div><p class="eyebrow">Picture your stay</p><h2 id="gallery-title">The hotel & the rooms</h2></div><button class="close" aria-label="Close photos">${icon('close')}</button></div><div id="gallery-image"></div><p id="gallery-caption"></p><div class="photo-tabs" role="group" aria-label="Illustrative photos">${photos.map((item,index)=>`<button data-photo="${index}" aria-pressed="${index===0}">${photo(index,true)}<span>${item.title}</span></button>`).join('')}</div><p class="dialog-note">AI-generated inspiration for fictional properties. These images do not represent verified hotel or room features.</p></dialog>
<dialog id="watch-dialog" aria-labelledby="watch-title"><div class="dialog-head"><p class="eyebrow">Price watch</p><button class="close" aria-label="Close price watch">${icon('close')}</button></div><h2 id="watch-title">Your stay. Your rules.</h2><p class="sub">A preview of how you could set up your watch.</p><ol class="steps"><li><div><strong>Tell us what matters</strong><span>Keep your breakfast, room essentials and cancellation flexibility.</span></div></li><li><div><strong>Choose how much to save</strong><span>Set a minimum refund after fees, and how often you want updates.</span></div></li><li><div><strong>Stay in control</strong><span>Automatic equivalent switches require explicit, separate permission. Other rooms or hotels always need offer approval.</span></div></li></ol><p class="dialog-note">This design preview does not save preferences or start monitoring.</p><button class="primary" id="watch-close">Got it ${icon('check')}</button></dialog>`;

const comparison = document.getElementById('comparison');
function showOffer(index) {
  const offer = offers[index];
  document.getElementById('comparison-content').innerHTML = `
    <div class="comparison-photo">${photo(index+1)}<span class="photo-tag">Illustrative ${index===2?'hotel':'room'}</span></div><h2 id="comparison-title">${offer.title}</h2><p class="sub">12–15 Nov · 3 nights · 2 adults + 1 child</p>
    <div class="dialog-refund"><p>You could get back</p><strong>USD ${offer.refund}</strong><p>Refund to you, after the $5 switch fee.</p></div>
    <div class="comparison-grid"><div><p class="eyebrow">Currently booked</p><h3>Example Harbour Hotel</h3><p class="sub">Deluxe King · city view · 32 m²</p><strong>$600</strong><small>Full stay · taxes included</small></div><div class="new"><p class="eyebrow">New offer</p><h3>${offer.hotel}</h3><p class="sub">${offer.room}</p><strong>$${offer.price}</strong><small>Full stay · taxes included</small></div></div>
    <div class="terms"><p><strong>What changes?</strong><br>${offer.change}</p><p><strong>What stays?</strong><br>Dates, guests and breakfast. Free cancellation until 10 Nov 2026, 6 pm Kuala Lumpur time.</p></div>
    ${index?'<p class="approval-note">This '+(index===1?'room':'hotel')+' change requires your separate approval.</p>':'<p class="dialog-note">An automatic equivalent switch would require your explicit standing permission first.</p>'}
    <dl class="bill"><div><dt>Reduction in stay price</dt><dd>$${600-offer.price}</dd></div><div><dt>Switch fee deducted</dt><dd>−$5</dd></div><div><dt>Cancellation fee</dt><dd>$0</dd></div><div><dt>Money back to you</dt><dd>USD ${offer.refund}</dd></div></dl>
    <details><summary>Will I keep free cancellation?</summary><p>Yes, in this fictional offer. The cancellation deadline stays 10 Nov 2026 at 6 pm Kuala Lumpur time. Live terms would need to be checked again before any switch.</p></details>
    <details><summary>Has my booking changed?</summary><p>No. This is a comparison only. No booking, cancellation or refund happens in this preview.</p></details><p class="dialog-note">Offer snapshot: 12 Oct 2026, 10 am Kuala Lumpur time. Simulated rates, not a live check.</p>`;
  comparison.showModal();
  comparison.scrollTop = 0;
}
document.querySelectorAll('[data-offer]').forEach(button => button.addEventListener('click', () => showOffer(Number(button.dataset.offer))));
document.querySelectorAll('dialog .close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.querySelectorAll('button:not(:disabled), summary, a[href]')].filter(element => element.getClientRects().length);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}));
document.getElementById('return-to-options').addEventListener('click', () => comparison.close());
const watchDialog = document.getElementById('watch-dialog');
document.getElementById('watch-open').addEventListener('click', () => watchDialog.showModal());
document.getElementById('watch-close').addEventListener('click', () => watchDialog.close());
const galleryDialog = document.getElementById('gallery-dialog');
function showPhoto(index) {
  document.getElementById('gallery-image').innerHTML = photo(index);
  document.getElementById('gallery-caption').textContent = photos[index].title + ' · Illustrative image';
  document.querySelectorAll('[data-photo]').forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.photo)===index));
}
document.getElementById('gallery-open').addEventListener('click', () => {showPhoto(blue?0:1); galleryDialog.showModal();});
document.querySelectorAll('[data-photo]').forEach(button => button.addEventListener('click', () => showPhoto(Number(button.dataset.photo))));
