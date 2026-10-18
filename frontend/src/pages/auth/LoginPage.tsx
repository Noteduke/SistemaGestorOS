import { useState } from "react";
import type { FormEvent } from "react";
import { authErrorMessage } from "../../api/auth";

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>;
  sessionMessage?: string;
}

export function LoginPage({ onLogin, sessionMessage }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onLogin(username, password);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setPassword("");
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand-mark" aria-hidden="true">G</div>
        <p className="eyebrow">Sistema interno</p>
        {import.meta.env.MODE === "homologation" && (
          <p className="login-environment-badge" role="note">AMBIENTE DE HOMOLOGAÇÃO</p>
        )}
        <h1 id="login-title">Acesse sua conta</h1>
        <p className="login-intro">Entre para continuar no Gestor OS.</p>
        {sessionMessage && <p className="login-notice" role="status">{sessionMessage}</p>}
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="username">Usuário</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            disabled={submitting}
          />
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={submitting}
          />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="button login-submit" type="submit" disabled={submitting || !username || !password}>
            {submitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="login-security-note">Sua senha é enviada somente para autenticação e não fica salva neste navegador.</p>
      </section>
    </main>
  );
}
