import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, Field, Input } from '../components/ui.jsx';
import { createApi } from '../lib/api.js';

export function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = createApi();

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const d = await request('/api/admin/auth/login', { method: 'POST', body: { username, password } });
      onLogin(d.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <img className="login-logo" src="/logo.png" alt="قلقلی" />
        <h2>ورود پنل مدیریت قلقلی</h2>
        <p className="login-hint">فقط ادمین‌های مجاز به این پنل دسترسی دارند</p>
        <Field label="نام کاربری">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </Field>
        <Field label="رمز عبور">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" icon={ShieldCheck} loading={loading} className="btn-block">
          ورود امن
        </Button>
        {error && <p className="form-error">{error}</p>}
      </form>
    </div>
  );
}
