import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Key, Field, Toast } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useSession, type User } from '../lib/session.tsx';

function CodeReveal({ code, onDone }: { code: string; onDone(): void }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="form-card form">
      <h2>Keep this recovery code</h2>
      <p className="field-hint">Croon has no email address for you, so this code is the only way back in if you forget your password. It is shown once. Write it down or save it in your password manager.</p>
      <div className="code-box num" aria-label="Recovery code">{code}</div>
      <div className="row">
        <Key onClick={() => navigator.clipboard?.writeText(code)}>Copy</Key>
      </div>
      <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I have saved my recovery code</label>
      <Key tone="hot" disabled={!ok} onClick={onDone}>Continue</Key>
    </div>
  );
}

export default function Auth({ mode }: { mode: 'signin' | 'signup' | 'recover' }) {
  const { setUser } = useSession();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'signin') {
        const r = await api<{ user: User }>('/auth/login', { method: 'POST', body: { username, password } });
        setUser(r.user);
        nav(from, { replace: true });
      } else if (mode === 'signup') {
        const r = await api<{ user: User; recoveryCode: string }>('/auth/register', { method: 'POST', body: { username, displayName: displayName || undefined, password } });
        setUser(r.user);
        setNewCode(r.recoveryCode);
      } else {
        const r = await api<{ user: User; recoveryCode: string }>('/auth/recover', { method: 'POST', body: { username, recoveryCode: code, newPassword: password } });
        setUser(r.user);
        setNewCode(r.recoveryCode);
      }
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (newCode) return <CodeReveal code={newCode} onDone={() => nav(from, { replace: true })} />;
  const title = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Make an account' : 'Reset your password';
  return (
    <form className="form-card form" onSubmit={submit} style={{ margin: '4vh auto 0' }}>
      <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.4rem)' }}>{title}</h1>
      {mode === 'signup' && <p className="field-hint">An account keeps your scores, favourites, playlists and achievements. Joining rooms never needs one.</p>}
      {mode === 'recover' && <p className="field-hint">Use the recovery code you were given when you signed up. You will get a new one after resetting.</p>}
      <Field label="Username" hint={mode === 'signup' ? '3 to 20 letters, numbers or underscores. Public on leaderboards.' : undefined}>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={20} autoCapitalize="none" />
      </Field>
      {mode === 'signup' && <Field label="Display name (optional)"><input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} autoComplete="nickname" /></Field>}
      {mode === 'recover' && <Field label="Recovery code"><input type="text" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" /></Field>}
      <Field label={mode === 'recover' ? 'New password' : 'Password'} hint={mode !== 'signin' ? 'At least 8 characters. A short phrase works well.' : undefined}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={mode === 'signin' ? 1 : 8} />
      </Field>
      <Toast msg={err} tone="error" />
      <Key tone="hot" type="submit" disabled={busy}>{busy ? 'One moment…' : title}</Key>
      <p className="field-hint">
        {mode === 'signin' && <>New here? <Link to="/signup" state={{ from }}>Make an account</Link> · <Link to="/recover">Forgot your password?</Link></>}
        {mode === 'signup' && <>Already have one? <Link to="/signin" state={{ from }}>Sign in</Link></>}
        {mode === 'recover' && <><Link to="/signin">Back to sign in</Link></>}
      </p>
    </form>
  );
}
