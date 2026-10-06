(() => {
  'use strict';
  const apiOrigin = ['tap-tap.live', 'www.tap-tap.live'].includes(location.hostname)
    ? 'https://taptap-admin.admin-service.workers.dev' : '';
  const $ = (id) => document.getElementById(id);
  const state = { links: [], revision: '', filter: 'all', query: '', mode: '', key: '', loading: false, saving: false, editing: null };
  const publicUrl = (id) => `${state.mode === 'local' ? location.origin : 'https://tap-tap.live'}/r/${id}/`;
  const icons = {
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h4M8 12h8M8 16h5"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5"/></svg>',
  };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function icon(kind, className = '') {
    const element = node('span', className);
    element.innerHTML = icons[kind]; // Only fixed icon strings; redirect data uses textContent.
    return element;
  }
  function safeUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url : null; } catch { return null; }
  }
  function externalLink(text, url, className) {
    const link = node('a', className, text);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }
  let toastTimer;
  function toast(message, commitUrl) {
    clearTimeout(toastTimer);
    $('toast').replaceChildren(document.createTextNode(message));
    if (commitUrl) {
      const link = externalLink(' View change ↗', commitUrl);
      $('toast').append(link);
    }
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
  }
  async function copyUrl(url) {
    try { await navigator.clipboard.writeText(url); toast('Card link copied.'); }
    catch { toast(`Copy this card link: ${url}`); }
  }
  async function api(path, options = {}) {
    const response = await fetch(apiOrigin + path, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: { 'X-TapTap-Admin': '1', ...(state.key ? { Authorization: `Bearer ${state.key}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `The admin service returned ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function setMode(mode) {
    state.mode = mode;
    $('mode-note').hidden = false;
    const messages = {
      local: 'Local database · Destinations are saved in SQLite. Changes apply immediately to card links served by this local service.',
      database: 'Database connected · Destination changes apply immediately to card links served by the connected redirect service.',
      readonly: 'Read-only preview · To edit destinations, open this panel through the admin service. For local access, run npm run admin in the website folder.',
    };
    $('mode-message').textContent = messages[mode] || '';
    $('session-label').textContent = mode === 'local' ? 'SQLite database' : mode === 'database' ? 'Signed in securely' : 'Read-only preview';
    $('signout').hidden = mode !== 'database';
    $('new-redirect').disabled = mode === 'readonly' || !state.revision;
  }
  function render() {
    const active = state.links.filter((link) => link.status === 'active').length;
    const inactive = state.links.length - active;
    for (const [id, count] of Object.entries({ 'total-count': state.links.length, 'active-count': active, 'inactive-count': inactive, 'nav-count': state.links.length, 'list-count': state.links.length, 'filter-all': state.links.length, 'filter-active': active, 'filter-inactive': inactive })) $(id).textContent = count;
    const links = state.links.filter((link) => (state.filter === 'all' || link.status === state.filter) && `${link.id} ${link.destination}`.toLowerCase().includes(state.query));
    const rows = links.map((link) => {
      const row = node('tr');
      const cardCell = node('td');
      const card = node('div', 'card-cell');
      const details = node('div');
      details.append(node('div', 'card-name', link.id));
      const cardLink = node('div', 'card-link');
      cardLink.append(externalLink(publicUrl(link.id).replace(/^https?:\/\//, ''), publicUrl(link.id)));
      const copy = node('button', 'copy-link');
      copy.type = 'button';
      copy.setAttribute('aria-label', `Copy card link for ${link.id}`);
      copy.title = 'Copy card link';
      copy.append(icon('copy'));
      copy.addEventListener('click', () => copyUrl(publicUrl(link.id)));
      cardLink.append(copy);
      details.append(cardLink);
      card.append(icon('card', 'card-icon'), details);
      cardCell.append(card);
      const destinationCell = node('td', 'destination-cell');
      const destination = safeUrl(link.destination);
      const domain = node('div', 'destination-domain');
      if (destination) domain.append(externalLink(destination.hostname, destination.href), icon('arrow'));
      else domain.textContent = 'Invalid destination';
      const path = node('div', 'destination-path', destination ? destination.pathname + destination.search + destination.hash : link.destination);
      path.title = link.destination;
      destinationCell.append(domain, path);
      const statusCell = node('td');
      const badge = node('span', `status-badge ${link.status}`);
      badge.append(node('span', `small-dot ${link.status === 'active' ? 'green-dot' : 'muted-dot'}`), document.createTextNode(link.status === 'active' ? 'Active' : 'Inactive'));
      statusCell.append(badge);
      const actions = node('td');
      const edit = node('button', 'edit-button');
      edit.type = 'button';
      edit.disabled = state.mode === 'readonly';
      edit.setAttribute('aria-label', `Edit redirect ${link.id}`);
      edit.append(icon('edit'), document.createTextNode('Edit'));
      edit.addEventListener('click', () => openEdit(link));
      actions.append(edit);
      row.append(cardCell, destinationCell, statusCell, actions);
      return row;
    });
    $('redirect-rows').replaceChildren(...rows);
    $('empty-state').hidden = links.length > 0;
    $('empty-title').textContent = state.links.length ? 'No matching redirects' : 'Your first connection starts here';
    $('empty-message').textContent = state.links.length ? 'Try another search or status filter.' : 'Create a redirect and choose where your card takes people.';
    $('empty-create').hidden = state.links.length > 0 || state.mode === 'readonly';
    $('result-count').textContent = `Showing ${links.length} of ${state.links.length} redirect${state.links.length === 1 ? '' : 's'}`;
  }
  async function loadLinks() {
    if (state.loading) return;
    state.loading = true;
    $('refresh').disabled = true;
    $('refresh').setAttribute('aria-busy', 'true');
    $('list-error').hidden = true;
    try {
      const data = await api('/api/links');
      if (!Array.isArray(data.links) || typeof data.revision !== 'string') throw new Error('The admin service returned invalid redirect data.');
      state.links = data.links.sort((a, b) => a.id.localeCompare(b.id));
      state.revision = data.revision;
      setMode(data.mode);
      render();
      $('updated-at').textContent = `Updated ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
    } catch (error) {
      $('list-error').textContent = error.message;
      $('list-error').hidden = false;
      if (!state.revision) {
        $('empty-state').hidden = false;
        $('empty-title').textContent = 'Could not load redirects';
        $('empty-message').textContent = 'Check the admin service, then select Refresh.';
        $('result-count').textContent = 'Redirects unavailable';
      }
      if (error.status === 401) lockPanel();
    } finally {
      state.loading = false;
      $('refresh').disabled = false;
      $('refresh').removeAttribute('aria-busy');
    }
  }
  function openEdit(link = null) {
    if (state.mode === 'readonly' || !state.revision) return;
    state.editing = link;
    $('edit-form').reset();
    $('edit-error').hidden = true;
    $('edit-title').textContent = link ? 'Edit redirect' : 'New redirect';
    $('edit-description').textContent = link ? `Update the destination for ${link.id}.` : 'Give your card a permanent link and a destination.';
    $('card-id').readOnly = !!link;
    $('card-id').value = link?.id || '';
    $('id-hint').textContent = link ? 'This ID stays fixed so existing cards keep working.' : '3–32 lowercase letters, numbers, hyphens, or underscores.';
    $('destination').value = link?.destination || '';
    $('edit-form').elements.status.value = link?.status || 'active';
    $('save-redirect').textContent = link ? 'Save changes ↗' : 'Create redirect ↗';
    $('save-note').textContent = state.mode === 'local' ? 'This saves to your local SQLite database. Local card links use the new destination immediately; the live website needs the hosted database service.' : 'This saves to the connected database. Card links served by this service use the new destination immediately.';
    updateCardPreview();
    $('edit-dialog').showModal();
    (link ? $('destination') : $('card-id')).focus();
  }
  function updateCardPreview() {
    const id = $('card-id').value;
    $('card-url').textContent = publicUrl(id || '…');
    $('copy-edit-url').disabled = !/^[a-z0-9][a-z0-9_-]{2,31}$/.test(id);
  }
  function closeEdit() { if (!state.saving) $('edit-dialog').close(); }
  function lockPanel() {
    state.key = '';
    state.links = [];
    state.revision = '';
    $('redirect-rows').replaceChildren();
    $('new-redirect').disabled = true;
    $('signout').hidden = true;
    $('session-label').textContent = 'Signed out';
    $('mode-note').hidden = true;
    for (const id of ['total-count', 'active-count', 'inactive-count', 'nav-count', 'list-count', 'filter-all', 'filter-active', 'filter-inactive']) $(id).textContent = '—';
    $('result-count').textContent = 'Sign in to see your redirects';
    $('updated-at').textContent = '';
    $('empty-state').hidden = true;
    $('edit-dialog').close();
    $('access-key').value = '';
    $('login-error').hidden = true;
    if (!$('login-dialog').open) $('login-dialog').showModal();
  }
  $('login-dialog').addEventListener('cancel', (event) => event.preventDefault());
  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('login-submit').disabled = true;
    $('login-error').hidden = true;
    state.key = $('access-key').value.trim();
    try {
      await api('/api/session');
      $('access-key').value = '';
      $('login-dialog').close();
      await loadLinks();
    } catch (error) {
      state.key = '';
      $('login-error').textContent = error.message;
      $('login-error').hidden = false;
    } finally { $('login-submit').disabled = false; }
  });
  $('signout').addEventListener('click', lockPanel);
  $('new-redirect').addEventListener('click', () => openEdit());
  $('empty-create').addEventListener('click', () => openEdit());
  $('refresh').addEventListener('click', () => state.mode === 'readonly' ? readOnlyPreview() : loadLinks());
  $('search').addEventListener('input', (event) => { state.query = event.target.value.trim().toLowerCase(); render(); });
  for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    for (const filter of document.querySelectorAll('[data-filter]')) {
      const selected = filter.dataset.filter === state.filter;
      filter.classList.toggle('selected', selected);
      filter.setAttribute('aria-pressed', selected);
    }
    render();
  });
  $('card-id').addEventListener('input', updateCardPreview);
  $('copy-edit-url').addEventListener('click', () => copyUrl(publicUrl($('card-id').value)));
  $('close-edit').addEventListener('click', closeEdit);
  $('cancel-edit').addEventListener('click', closeEdit);
  $('edit-dialog').addEventListener('cancel', (event) => { if (state.saving) event.preventDefault(); });
  $('edit-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.saving) return;
    $('edit-error').hidden = true;
    const destination = $('destination').value.trim();
    if (!safeUrl(destination)) {
      $('edit-error').textContent = 'Enter a complete HTTPS URL without embedded credentials.';
      $('edit-error').hidden = false;
      $('destination').focus();
      return;
    }
    const id = $('card-id').value;
    const status = $('edit-form').elements.status.value;
    state.saving = true;
    for (const control of $('edit-form').querySelectorAll('button, input')) control.disabled = true;
    const buttonLabel = $('save-redirect').textContent;
    $('save-redirect').textContent = 'Saving…';
    try {
      const result = await api(`/api/links/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ destination, status, revision: state.revision, create: !state.editing }) });
      const existing = state.links.findIndex((link) => link.id === id);
      const saved = { ...result.record, id };
      if (existing >= 0) state.links[existing] = saved;
      else state.links.push(saved);
      state.links.sort((a, b) => a.id.localeCompare(b.id));
      state.revision = result.revision;
      render();
      $('edit-dialog').close();
      $('updated-at').textContent = 'Updated just now';
      toast(result.changed === false ? 'No changes to save.' : state.mode === 'local' ? 'Saved to SQLite. Local card destination updated.' : 'Saved to the database. Card destination updated.', result.commitUrl);
    } catch (error) {
      $('edit-error').textContent = error.status === 409 ? `${error.message} Close this editor and refresh the list before trying again.` : error.message;
      $('edit-error').hidden = false;
      if (error.status === 401) lockPanel();
    } finally {
      state.saving = false;
      for (const control of $('edit-form').querySelectorAll('button, input')) control.disabled = false;
      $('save-redirect').textContent = buttonLabel;
      updateCardPreview();
    }
  });

  async function readOnlyPreview() {
    try {
      const response = await fetch('../links.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Redirect data could not be loaded.');
      const records = await response.json();
      state.links = Object.entries(records).map(([id, record]) => ({ ...record, id })).sort((a, b) => a.id.localeCompare(b.id));
      state.revision = '';
      $('list-error').hidden = true;
      setMode('readonly');
      render();
      $('updated-at').textContent = 'Published redirect data';
    } catch (error) {
      $('list-error').textContent = error.message;
      $('list-error').hidden = false;
      $('empty-state').hidden = true;
    }
  }
  async function start() {
    $('empty-state').hidden = false;
    try {
      const session = await api('/api/session');
      setMode(session.mode);
      await loadLinks();
    } catch (error) {
      if (error.status === 404) await readOnlyPreview();
      else if (error.status === 401) lockPanel();
      else {
        $('list-error').textContent = 'The admin service is unavailable. Start it with npm run admin, then reload this page.';
        $('list-error').hidden = false;
        $('empty-state').hidden = true;
      }
    }
  }
  start();
})();
