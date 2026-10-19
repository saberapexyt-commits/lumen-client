import { api, state, h, btn, profileLabel } from '../core.js';

export async function renderConsole(root) {
  const page = h('div.page');
  root.append(page);
  let target = state.profileId || 'launcher';
  const log = h('div.log');
  const sel = h('select.input', { style: { width: 'auto' }, onchange: (e) => ((target = e.target.value), fill()) });
  const stick = () => (log.scrollTop = log.scrollHeight);

  const lineEl = (text, stream) => h('div' + (/ERROR|Exception|FATAL/.test(text) || stream === 'err' ? '.err' : /WARN/.test(text) ? '.warn' : ''), text);
  async function fill() {
    sel.replaceChildren(h('option', { value: 'launcher', selected: target === 'launcher' }, 'Launcher log'), ...state.profiles.map((p) => h('option', { value: p.id, selected: p.id === target }, `Game: ${p.name} (${profileLabel(p)})`)));
    log.replaceChildren();
    if (target === 'launcher') {
      (await api('logs:recent')).forEach((l) => log.append(lineEl(l)));
    } else {
      (state.gameLogs[target] || []).forEach((l) => log.append(lineEl(l.line, l.stream)));
    }
    stick();
  }
  const onGame = (e) => {
    if (e.detail.profileId === target) {
      const atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
      log.append(lineEl(e.detail.line, e.detail.stream));
      if (atEnd) stick();
    }
  };
  const offLog = window.lumen.on('log:line', (l) => {
    if (target === 'launcher') {
      log.append(lineEl(l));
      stick();
    }
  });
  window.addEventListener('gamelog', onGame);

  page.append(
    h('h1', 'Console'),
    h('p.sub', 'Live game output and launcher diagnostics. Your access token is never written to logs.'),
    h('div.toolbar', sel, h('div.grow'), btn('Copy', { onclick: () => navigator.clipboard.writeText(log.innerText) }), btn('Open logs folder', { onclick: () => api('shell:openLogs') })),
    log,
  );
  await fill();
  return () => (offLog(), window.removeEventListener('gamelog', onGame));
}
