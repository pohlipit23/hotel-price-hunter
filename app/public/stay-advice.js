/** One conversation shared by the compact adviser and the floating Gemini dialog. */
export function createStayAdviser({ parent, before, getData }) {
  const el = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  const section = el('section', null, 'stay-adviser');
  section.setAttribute('aria-labelledby', 'stay-advice-title');
  const heading = el('div', null, 'stay-advice-heading');
  const title = el('h2', 'A little help choosing?'); title.id = 'stay-advice-title';
  const openInline = el('button', 'Open full chat', 'stay-chat-link'); openInline.type = 'button';
  heading.append(title, openInline);
  const latest = el('p', 'Weigh the pros and cons with Gemini.', 'stay-advice-answer');
  latest.id = 'stay-advice-answer'; latest.setAttribute('aria-live', 'polite');
  section.append(heading, latest);
  const inlineStatus = el('p', null, 'stay-chat-status'); inlineStatus.setAttribute('role', 'status');
  section.append(inlineStatus);
  parent.insertBefore(section, before);

  const launcher = el('button', null, 'gemini-launcher');
  launcher.type = 'button'; launcher.id = 'gemini-launcher'; launcher.hidden = true;
  launcher.setAttribute('aria-haspopup', 'dialog'); launcher.setAttribute('aria-controls', 'gemini-dialog');
  const star = el('span', '✦', 'gemini-star'); star.setAttribute('aria-hidden', 'true');
  launcher.append(star, el('span', 'Ask Gemini'));

  const dialog = el('dialog', null, 'gemini-dialog'); dialog.id = 'gemini-dialog';
  dialog.setAttribute('aria-labelledby', 'gemini-title');
  const header = el('header', null, 'gemini-header');
  const identity = el('div');
  const dialogTitle = el('h2', 'Gemini'); dialogTitle.id = 'gemini-title';
  const contextLabel = el('p', 'RoomDrop support', 'gemini-context');
  const close = el('button', '×', 'gemini-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close Gemini chat');
  identity.append(dialogTitle, contextLabel); header.append(identity, close);
  const log = el('div', null, 'gemini-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-label', 'Conversation with Gemini');
  const privacy = el('p', 'Your question and comparison go to Google Gemini. Leave out personal details.', 'stay-chat-privacy');
  dialog.append(header, log);
  document.body.append(launcher, dialog);

  let context, controller, generation = 0, draft = '', returnFocus;
  let notice = '', noticeKey;
  const turns = [], openings = new Set(), composers = [];
  function makeComposer(container, suffix, compact) {
    const form = el('form', null, 'stay-chat-form');
    const label = el('label', 'Ask about your options', 'sr-only'); label.htmlFor = 'stay-question-' + suffix;
    const question = el('textarea');
    question.id = 'stay-question-' + suffix; question.rows = compact ? 1 : 2; question.maxLength = 1200; question.required = true;
    question.placeholder = 'What matters most for your stay?';
    question.setAttribute('aria-describedby', 'stay-privacy-' + suffix);
    const send = el('button', 'Send', 'stay-chat-send'); send.type = 'submit';
    const privacyNote = compact ? privacy.cloneNode(true) : privacy;
    privacyNote.id = 'stay-privacy-' + suffix;
    const prompts = el('div', null, 'stay-advice-prompts');
    for (const text of ['Help me choose', 'My plans may change']) {
      const button = el('button', text, 'stay-chat-prompt'); button.type = 'button';
      button.addEventListener('click', () => { updateDraft(text); question.focus(); });
      prompts.append(button);
    }
    const input = el('div', null, 'stay-chat-input'); input.append(label, question, send);
    form.append(prompts, input, privacyNote); container.append(form);
    question.addEventListener('input', () => updateDraft(question.value));
    form.addEventListener('submit', event => { event.preventDefault(); question.focus(); request('question'); });
    composers.push({ question, send, prompts });
  }
  makeComposer(section, 'inline', true);
  makeComposer(dialog, 'dialog', false);
  const status = el('p', null, 'stay-chat-status'); status.id = 'stay-advice-status'; status.setAttribute('role', 'status');
  dialog.append(status);

  function updateDraft(value) {
    draft = value;
    for (const composer of composers) composer.question.value = value;
  }
  function refresh() {
    const active = Boolean(context?.enabled);
    launcher.hidden = !active; section.hidden = !active || context.pageContext !== 'drop-detail';
    launcher.setAttribute('aria-expanded', String(dialog.open));
    contextLabel.textContent = context?.label || 'RoomDrop support';
    const available = Boolean(getData()?.model?.available);
    for (const composer of composers) {
      composer.send.disabled = !available || Boolean(controller) || !active;
      composer.send.setAttribute('aria-busy', String(Boolean(controller)));
    }
    status.textContent = controller ? 'Gemini is weighing your options…' : noticeKey === context?.key ? notice : '';
    inlineStatus.textContent = status.textContent;
    const currentReply = turns.filter(turn => turn.role === 'assistant' && turn.key === context?.key).at(-1);
    latest.textContent = currentReply?.text || (controller ? 'Gemini is weighing your options…'
      : !available ? 'Gemini is unavailable right now. You can still review the drops.' : noticeKey === context?.key && notice ? notice : 'Weigh the pros and cons with Gemini.');
    const entries = turns.map(turn => {
      const entry = el('div', null, 'stay-chat-turn ' + turn.role);
      entry.append(el('span', (turn.role === 'user' ? 'You' : 'Gemini') + ' · ' + turn.label, 'stay-chat-speaker'), el('p', turn.text));
      return entry;
    });
    log.replaceChildren(...entries);
    if (!entries.length && !controller) log.append(el('p', available ? 'Compare the options and what matters to you.' : 'Gemini is unavailable right now.', 'stay-chat-empty'));
    if (dialog.open) log.scrollTop = log.scrollHeight;
  }
  async function request(intent) {
    if (!context?.enabled || controller || !getData()?.model?.available) { refresh(); return; }
    const message = draft.trim();
    if (intent === 'question' && !message) return;
    if (intent === 'opening' && (openings.has(context.key) || turns.some(turn => turn.key === context.key && turn.role === 'assistant'))) return;
    const current = context, data = getData(), version = ++generation;
    const requestController = new AbortController(); controller = requestController;
    if (intent === 'question') { turns.push({ role: 'user', text: message, key: current.key, label: current.label }); updateDraft(''); }
    notice = ''; noticeKey = current.key;
    refresh();
    const timeout = setTimeout(() => requestController.abort(), 25000);
    try {
      const response = await fetch('/api/booking-demo/chat', { method: 'POST', credentials: 'same-origin', signal: requestController.signal,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
        body: JSON.stringify({ snapshotVersion: data.snapshotVersion, pageContext: current.pageContext, intent,
          ...(current.optionId ? { optionId: current.optionId } : {}), ...(intent === 'question' ? { message } : {}) }) });
      if (version !== generation || current.key !== context.key) return;
      if (!response.ok) {
        notice = response.status === 429 ? 'Please wait a minute before asking again.'
          : response.status === 409 || response.status === 401 || response.status === 403 ? 'Reload RoomDrop to use the latest comparison.'
          : 'Gemini could not answer. Try a question when you are ready.';
        if (intent === 'question' && !draft) updateDraft(message);
        return;
      }
      const result = await response.json();
      if (version !== generation) return;
      if (result.snapshotVersion !== data.snapshotVersion || result.pageContext !== current.pageContext
        || result.optionId !== current.optionId || typeof result.advice?.reply !== 'string') throw Error('Comparison changed');
      if (intent === 'opening') openings.add(current.key);
      turns.push({ role: 'assistant', text: result.advice.reply, key: current.key, label: current.label });
      notice = result.source === 'test-injected' ? 'Test response · no live Gemini call' : 'Advice from Gemini';
      while (turns.length > 40) turns.shift();
    } catch {
      if (version === generation) {
        notice = 'Gemini could not answer. Your room choice is unchanged.';
        if (intent === 'question' && !draft) updateDraft(message);
      }
    } finally {
      clearTimeout(timeout);
      if (version === generation) { controller = undefined; refresh(); }
    }
  }
  function open(trigger) {
    if (!context?.enabled) return;
    returnFocus = trigger;
    if (!dialog.open) dialog.showModal();
    refresh();
    composers[1].question.focus();
    request('opening');
  }
  launcher.addEventListener('click', () => open(launcher));
  openInline.addEventListener('click', () => open(openInline));
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    launcher.setAttribute('aria-expanded', 'false');
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus();
    else if (!launcher.hidden) launcher.focus();
  });
  return {
    setContext(next) {
      const key = [getData()?.snapshotVersion, next.pageContext, next.optionId || 'overview'].join(':');
      if (context?.key !== key || !next.enabled) { generation++; controller?.abort(); controller = undefined; }
      context = { ...next, optionId: next.optionId ?? null, key };
      if (!next.enabled && dialog.open) dialog.close();
      refresh();
    },
  };
}
