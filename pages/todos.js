import Head from 'next/head';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from '../styles/Todos.module.css';

export async function getServerSideProps({ req, res, query }) {
  const { authenticated, configured, secureHeaders } = await import('../lib/display-auth.mjs');
  const { createTodoStore } = await import('../lib/todo-store.mjs');
  const { listTodos } = await import('../lib/todos.mjs');
  secureHeaders(res);
  const signedIn = authenticated(req);
  let initial = null;
  if (signedIn) {
    try { const store = createTodoStore(); if (store) initial = listTodos(await store.read(), 'all'); } catch { /* Show a retryable error, never an empty successful list. */ }
  }
  return { props: { signedIn, ready: configured(), loginError: query.error === '1', initial } };
}

function Icon({ name, ...props }) {
  const paths = { check: 'm5 12 4 4L19 6', plus: 'M12 5v14M5 12h14', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5', up: 'm6 14 6-6 6 6', down: 'm6 10 6 6 6-6', grip: 'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01', undo: 'M9 5 4 10l5 5M4 10h10a5 5 0 0 1 0 10' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}

export default function Todos({ signedIn, ready, loginError, initial }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState('active');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [dragOrder, setDragOrder] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(signedIn && !initial ? 'The list is unavailable. Please try again.' : '');
  const [expired, setExpired] = useState(false);
  const [signInError, setSignInError] = useState(loginError ? 'That password wasn’t right. Please try again.' : '');
  const input = useRef(null);
  const requestVersion = useRef(0);
  const busyRef = useRef(false);
  const drag = useRef(null);
  const pendingAdd = useRef(null);
  const online = useRef(true);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch('/api/todos?status=all', { cache: 'no-store' });
      if (response.status === 401) { setExpired(true); throw new Error('Your session has expired. Sign in to continue.'); }
      if (!response.ok) throw new Error('The list is unavailable. Your last loaded list is shown.');
      const next = await response.json();
      if (version === requestVersion.current) { setData(next); setError(''); }
      return true;
    } catch (failure) { if (version === requestVersion.current) setError(failure.message || 'Could not refresh the list.'); return false; }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    online.current = navigator.onLine;
    const update = () => { if (!document.hidden && !busyRef.current && !drag.current) refresh(); };
    const connected = () => { online.current = true; update(); };
    const disconnected = () => { online.current = false; setError('You’re offline. Reconnect before making changes.'); };
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    document.addEventListener('visibilitychange', update);
    update();
    return () => { clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected); document.removeEventListener('visibilitychange', update); requestVersion.current++; };
  }, [signedIn, refresh]);

  async function mutate(path, method, body, headers = {}, success = 'Saved.') {
    if (busyRef.current) return false;
    if (!online.current) { setError('You’re offline. Reconnect before making changes.'); return false; }
    busyRef.current = true;
    setBusy(true); setError(''); setMessage(''); requestVersion.current++;
    try {
      const response = await fetch(`/api/todos${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.status === 401) { setExpired(true); throw new Error('Your session has expired. Sign in to continue.'); }
      if (response.status === 412) { await refresh(); throw new Error('The list changed on another device. Check the latest order and try again.'); }
      if (response.status === 429) throw new Error('A few too many changes at once. Try again in a minute.');
      if (!response.ok) throw new Error('Could not confirm this change. Please try again.');
      setMessage(success);
      await refresh();
      return true;
    } catch (failure) { setError(failure.message || 'Could not confirm this change. Please try again.'); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function add(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (!pendingAdd.current || pendingAdd.current.text !== text) pendingAdd.current = { text, key: crypto.randomUUID() };
    if (await mutate('', 'POST', { text }, { 'Idempotency-Key': pendingAdd.current.key }, 'Added to your list.')) {
      setDraft(''); setTab('active'); pendingAdd.current = null; input.current?.focus();
    }
  }

  async function signIn(event) {
    event.preventDefault();
    setBusy(true); setSignInError('');
    try {
      // Fetch the existing login endpoint without navigating outside the web app's scope.
      const response = await fetch('/api/display/login', { method: 'POST', body: new URLSearchParams(new FormData(event.currentTarget)) });
      const destination = new URL(response.url);
      if (!response.ok) throw new Error('Could not sign in. Please try again.');
      if (destination.searchParams.get('error') === '1') throw new Error('That password wasn’t right. Please try again.');
      window.location.replace('/todos');
    } catch (failure) { setSignInError(failure.message || 'Could not sign in. Please try again.'); setBusy(false); }
  }

  const active = data?.items.filter((item) => !item.done) || [];
  const archive = data?.items.filter((item) => item.done) || [];
  const visible = tab === 'done' ? archive : dragOrder ? dragOrder.map((id) => active.find((item) => item.id === id)).filter(Boolean) : active;
  const disabled = busy || expired || !data;

  async function reorder(ids, revision = data?.revision) {
    await mutate('/order', 'PUT', { ids }, { 'If-Match': `"todos-${revision}"` }, 'Order saved.');
    setDragOrder(null);
  }
  function move(id, offset) {
    const ids = active.map((item) => item.id), index = ids.indexOf(id), target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder(ids);
  }
  function startDrag(event, id) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, ids: active.map((item) => item.id), original: active.map((item) => item.id).join(','), revision: data.revision };
    setDragOrder(drag.current.ids);
  }
  function moveDrag(event) {
    const state = drag.current;
    if (!state) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-todo-id]')?.dataset.todoId;
    if (!target || target === state.id || !state.ids.includes(target)) return;
    const ids = [...state.ids], from = ids.indexOf(state.id), to = ids.indexOf(target);
    ids.splice(from, 1); ids.splice(to, 0, state.id);
    drag.current = { ...state, ids }; setDragOrder(ids);
  }
  function endDrag(cancelled = false) {
    const state = drag.current; drag.current = null;
    if (!state) return;
    if (!cancelled && state.ids.join(',') !== state.original) reorder(state.ids, state.revision);
    else setDragOrder(null);
  }

  return <>
    <Head>
      <title>Our to-do list · At home</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="robots" content="noindex,nofollow" />
      <meta name="theme-color" content="#f5f1e7" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="To do" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <link rel="manifest" href="/todos/manifest.webmanifest" />
      <link rel="apple-touch-icon" href="/todos/icon-180.png" />
      <link rel="icon" type="image/png" href="/todos/icon-192.png" />
    </Head>
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div className={styles.brand}><span className={styles.brandIcon}><Icon name="check" /></span><span>AT HOME</span></div>
          <h1>Our to-do list<span>.</span></h1>
          <p>A shared list. A little more headspace.</p>
        </header>
        {!signedIn ? <section className={styles.login} aria-label="Sign in">
          <h2>Welcome home.</h2><p>Use your family dashboard password.</p>
          {signInError && <p role="alert" className={styles.error}>{signInError}</p>}
          {ready ? <form method="post" action="/api/display/login" onSubmit={signIn}>
            <input type="hidden" name="returnTo" value="/todos" />
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" maxLength={256} required />
            <button className={styles.primary} type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Open our list'} <span aria-hidden="true">↗</span></button>
          </form> : <p>Sign-in is not configured yet.</p>}
          <p className={styles.small}>Your browser will stay signed in for six months.</p>
        </section> : <>
          <form className={styles.addForm} onSubmit={add}>
            <label className={styles.srOnly} htmlFor="new-todo">Add a to-do</label>
            <input ref={input} id="new-todo" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What needs doing?" maxLength={300} enterKeyHint="done" autoComplete="off" disabled={busy || expired} />
            <button type="submit" aria-label="Add to-do" disabled={disabled || !draft.trim()}><Icon name="plus" /></button>
          </form>
          <div className={styles.tabs} aria-label="List views">
            <button aria-pressed={tab === 'active'} className={tab === 'active' ? styles.selected : ''} onClick={() => { setTab('active'); setMessage(''); }}>To do <span>{data ? active.length : '—'}</span></button>
            <button aria-pressed={tab === 'done'} className={tab === 'done' ? styles.selected : ''} onClick={() => { setTab('done'); setArranging(false); setMessage(''); }}>Completed <span>{data ? archive.length : '—'}</span></button>
          </div>
          <div className={styles.listToolbar}>
            <span>{tab === 'done' ? 'A record of things done' : 'One thing at a time'}</span>
            {tab === 'active' && active.length > 1 && <button onClick={() => setArranging(!arranging)} disabled={busy} aria-pressed={arranging}>{arranging ? 'Finish arranging' : 'Arrange'}</button>}
          </div>
          {error && <div role="alert" className={styles.error}>{error} {expired ? <a href="/todos">Sign in</a> : <button onClick={refresh} disabled={busy}>Retry</button>}</div>}
          <div className={styles.srOnly} role="status" aria-live="polite">{message}{busy ? ' Saving…' : ''}</div>
          {arranging && <p className={styles.arrangeHelp}>Drag a handle or use the arrows to move an item.</p>}
          {data && visible.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}><Icon name="check" /></span><h2>{tab === 'done' ? 'Good things take a start.' : 'A little room to breathe.'}</h2><p>{tab === 'done' ? 'Completed to-dos will be kept here.' : 'You’re all caught up. Add something when it comes to mind.'}</p></div> : <ul className={styles.list} aria-label={tab === 'done' ? 'Completed to-dos' : 'Outstanding to-dos'} aria-busy={busy}>
            {visible.map((item, index) => <li key={item.id} data-todo-id={item.id} className={`${styles.item} ${item.done ? styles.completed : ''} ${drag.current?.id === item.id ? styles.dragging : ''}`}>
              {arranging ? <button className={styles.grip} aria-label={`Drag ${item.text}`} disabled={disabled} onPointerDown={(event) => startDrag(event, item.id)} onPointerMove={moveDrag} onPointerUp={() => endDrag()} onPointerCancel={() => endDrag(true)}><Icon name="grip" /></button>
                : <button className={`${styles.check} ${item.done ? styles.checked : ''}`} aria-label={item.done ? `Restore ${item.text}` : `Complete ${item.text}`} disabled={disabled} onClick={() => mutate(`/${item.id}`, 'PATCH', { done: !item.done }, {}, item.done ? 'Restored to your list.' : 'Marked complete.')}><Icon name={item.done ? 'undo' : 'check'} /></button>}
              <div className={styles.itemText}><span>{item.text}</span>{item.done && <time dateTime={item.completedAt}>{new Date(item.completedAt).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' })}</time>}</div>
              {arranging ? <div className={styles.arrows}><button aria-label={`Move ${item.text} up`} disabled={disabled || index === 0} onClick={() => move(item.id, -1)}><Icon name="up" /></button><button aria-label={`Move ${item.text} down`} disabled={disabled || index === active.length - 1} onClick={() => move(item.id, 1)}><Icon name="down" /></button></div>
                : <button className={styles.delete} aria-label={`Delete ${item.text}`} disabled={disabled} onClick={() => { if (window.confirm(`Delete “${item.text}”? This cannot be undone.`)) mutate(`/${item.id}`, 'DELETE', undefined, {}, 'Deleted.'); }}><Icon name="trash" /></button>}
            </li>)}
          </ul>}
          <footer className={styles.footer}><span>Shared with your family</span><span aria-hidden="true">✳</span><span>{busy ? 'Saving…' : 'Made for home'}</span></footer>
        </>}
        <details className={styles.install}><summary>Keep this list on your Home Screen</summary><p>In Safari, tap Share, then Add to Home Screen. Keep “Open as Web App” enabled if shown. Open the new icon and sign in if needed.</p></details>
      </main>
    </div>
    <style jsx global>{`html,body{margin:0;padding:0;background:#f5f1e7}`}</style>
  </>;
}
