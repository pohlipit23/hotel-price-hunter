// Generated inspiration for the fictional jury fixture, never evidence of amenities.
const photos = [
  { title: 'The hotel', box: '0 0 768 512', alt: 'Illustrative hotel exterior with a sunny courtyard' },
  { title: 'Deluxe King', box: '768 0 768 512', alt: 'Illustrative king room with white linen and a city view' },
  { title: 'Premier King', box: '0 512 768 512', alt: 'Illustrative larger king room with a sitting area' },
  { title: 'Garden hotel', box: '768 512 768 512', alt: 'Illustrative alternative hotel with a leafy courtyard' },
];
const namespace = 'http://www.w3.org/2000/svg';

export function stayPhoto(index, decorative = false) {
  const photo = photos[index] || photos[0];
  const frame = document.createElement('span');
  frame.className = 'stay-photo';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', photo.box);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  if (decorative) svg.setAttribute('aria-hidden', 'true');
  else { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', photo.alt); }
  const image = document.createElementNS(namespace, 'image');
  image.setAttribute('href', '/assets/illustrative-stays.jpg');
  image.setAttribute('width', '1536'); image.setAttribute('height', '1024');
  const fallback = document.createElement('span');
  fallback.className = 'photo-unavailable';
  fallback.textContent = 'Illustrative photo unavailable';
  fallback.hidden = true;
  image.addEventListener('error', () => { svg.setAttribute('hidden', ''); fallback.hidden = false; });
  svg.append(image); frame.append(svg, fallback);
  return frame;
}

export function offerPhotoIndex(offer) {
  return offer.category === 'different-hotel' ? 3 : offer.category === 'different-room' ? 2 : 1;
}

export function setupStayGallery() {
  const dialog = document.getElementById('photo-gallery');
  const open = document.getElementById('open-photos');
  const close = document.getElementById('close-photos');
  const tabs = document.getElementById('photo-tabs');
  const show = index => {
    document.getElementById('gallery-image').replaceChildren(stayPhoto(index));
    document.getElementById('gallery-caption').textContent = `${photos[index].title} · Illustrative image`;
    [...tabs.children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  };
  tabs.replaceChildren(...photos.map((photo, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    const label = document.createElement('span'); label.textContent = photo.title;
    button.append(stayPhoto(index, true), label);
    button.addEventListener('click', () => show(index));
    return button;
  }));
  document.getElementById('hotel-photo').replaceChildren(stayPhoto(0, true));
  document.getElementById('room-photo').replaceChildren(stayPhoto(1, true));
  open.addEventListener('click', () => { show(0); dialog.showModal(); close.focus(); });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => open.focus());
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const last = tabs.lastElementChild;
    if (event.shiftKey && document.activeElement === close) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); close.focus(); }
  });
}
