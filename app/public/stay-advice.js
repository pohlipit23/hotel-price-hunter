/** Optional grounded advice; selection and cancellation consent remain independent. */
export function createStayAdviser({ parent, before, getData }) {
  const element = (tag, text, className) => { const item = document.createElement(tag); if (text) item.textContent = text; if (className) item.className = className; return item; };
  const section = element('section', null, 'stay-adviser'); section.setAttribute('aria-labelledby', 'stay-advice-title');
  const title = element('h2', 'Ask Gemini about this drop'); title.id = 'stay-advice-title';
  const form = element('form'); const label = element('label', 'What matters for your stay?'); label.htmlFor = 'stay-advice-question';
  const question = element('textarea'); question.id = 'stay-advice-question'; question.rows = 3; question.maxLength = 1200; question.required = true;
  question.placeholder = 'My dates might change. Is this drop worth it?'; question.setAttribute('aria-describedby', 'stay-advice-privacy');
  const privacy = element('p', 'Your question and comparison are sent to Google Gemini. Leave out personal details and booking references.', 'small muted'); privacy.id = 'stay-advice-privacy';
  const prompts = element('div', null, 'stay-advice-prompts');
  for (const [label, text] of [['My plans may change', 'My dates might change. Should I keep flexibility?'], ['Explain the price', 'Explain the estimated price difference and what still needs checking.']]) {
    const button = element('button', label); button.type = 'button'; button.addEventListener('click', () => { question.value = text; question.focus(); }); prompts.append(button);
  }
  const submit = element('button', 'Ask Gemini', 'secondary'); submit.type = 'submit';
  const status = element('p', null, 'small muted'); status.id = 'stay-advice-status'; status.setAttribute('role', 'status');
  const answer = element('div', null, 'stay-advice-answer'); answer.id = 'stay-advice-answer'; answer.hidden = true; answer.setAttribute('aria-live', 'polite');
  form.append(label, question, privacy, prompts, submit); section.append(element('p', 'Gemini 3.8 Flash', 'eyebrow'), title, form, status, answer);
  parent.insertBefore(section, before);
  let optionId, generation = 0, controller;
  const clear = () => { generation++; controller?.abort(); controller = undefined; answer.hidden = true; answer.replaceChildren(); question.value = ''; submit.removeAttribute('aria-busy');
    submit.disabled = !getData()?.model?.available; status.textContent = submit.disabled ? 'Gemini advice is unavailable. You can still review this drop.' : 'Ask about price, room differences or cancellation flexibility.'; };
  const display = text => text.replace(/\bquotation\b/g, 'starting option');
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (controller || !optionId || !getData()?.model?.available || !question.value.trim()) return;
    const current = ++generation; const selected = optionId; const data = getData(); controller = new AbortController();
    const requestController = controller; const timeout = setTimeout(() => requestController.abort(), 25000);
    submit.disabled = true; submit.setAttribute('aria-busy', 'true'); answer.hidden = true; status.textContent = 'Gemini is comparing this drop…';
    try {
      const response = await fetch('/api/booking-demo/advice', { method: 'POST', credentials: 'same-origin', signal: requestController.signal,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken }, body: JSON.stringify({ optionId: selected, snapshotVersion: data.snapshotVersion, message: question.value.trim() }) });
      if (current !== generation) return;
      if (!response.ok) { status.textContent = response.status === 429 ? 'Please wait a minute before asking again.' : 'Gemini could not answer. Your booking and room choice are unchanged.'; return; }
      const result = await response.json(); if (current !== generation || result.optionId !== optionId || result.snapshotVersion !== data.snapshotVersion) return;
      const list = element('ul'); for (const text of result.advice.tradeoffs) list.append(element('li', display(text)));
      answer.replaceChildren(element('p', display(result.advice.summary), 'stay-advice-summary'), list,
        element('p', display(result.advice.priceContext), 'small'), element('p', display(result.advice.limitations), 'small muted'));
      answer.hidden = false; status.textContent = result.source === 'test-injected' ? 'Test response · no live Gemini call' : 'Advice from Gemini 3.8 Flash · Google Vertex AI';
    } catch { if (current === generation) status.textContent = 'Gemini could not answer. Your booking and room choice are unchanged.'; }
    finally { clearTimeout(timeout); if (current === generation) { controller = undefined; submit.disabled = false; submit.removeAttribute('aria-busy'); } }
  });
  return { clear, select(id) { optionId = id; clear(); } };
}
