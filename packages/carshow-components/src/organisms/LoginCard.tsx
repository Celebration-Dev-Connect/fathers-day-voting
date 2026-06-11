import { ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "../atoms/Button.js";

function PcoLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M11 1L20 5.95V16.05L11 21L2 16.05V5.95L11 1Z"
        fill="white"
        fillOpacity="0.18"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 7.25H12.25C13.49 7.25 14.5 8.26 14.5 9.5C14.5 10.74 13.49 11.75 12.25 11.75H10.25V14.75H8.5V7.25ZM10.25 8.75V10.25H12.25C12.66 10.25 13 9.91 13 9.5C13 9.09 12.66 8.75 12.25 8.75H10.25Z"
        fill="white"
      />
    </svg>
  );
}

export type DevLoginOption = {
  label: string;
  email: string;
};

export function LoginCard({
  title,
  subtitle,
  brandMark,
  loginOptions = [],
  error,
  onLogin,
  planningCenterUrl,
}: {
  title: string;
  subtitle: string;
  brandMark: string;
  loginOptions?: DevLoginOption[];
  error: string;
  onLogin?: (email: string) => Promise<void>;
  planningCenterUrl?: string;
}) {
  const [email, setEmail] = useState(loginOptions[0]?.email ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!onLogin) return;
    setSubmitting(true);
    await onLogin(email);
    setSubmitting(false);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">{brandMark}</div>
        <p className="eyebrow">{subtitle}</p>
        <h1>{title}</h1>
        {planningCenterUrl ? (
          <div className="stack">
            {error ? <p className="form-error">{error}</p> : null}
            <a href={planningCenterUrl} className="pco-signin-btn">
              <PcoLogo />
              Sign in with Planning Center
            </a>
          </div>
        ) : null}
        {loginOptions.length > 0 && onLogin ? (
          <form onSubmit={submit} className="stack">
            <label>
              Dev staff account
              <select value={email} onChange={(event) => setEmail(event.target.value)}>
                {loginOptions.map((option) => (
                  <option key={option.email} value={option.email}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {!planningCenterUrl && error ? <p className="form-error">{error}</p> : null}
            <Button type="submit" disabled={submitting}>
              <ShieldCheck size={20} />
              {submitting ? "Signing in..." : "Dev Login"}
            </Button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
