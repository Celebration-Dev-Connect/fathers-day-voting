import { ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "../atoms/Button.js";

export type DevLoginOption = {
  label: string;
  email: string;
};

export function LoginCard({
  title,
  subtitle,
  brandMark,
  loginOptions,
  error,
  onLogin,
  planningCenterUrl,
}: {
  title: string;
  subtitle: string;
  brandMark: string;
  loginOptions: DevLoginOption[];
  error: string;
  onLogin: (email: string) => Promise<void>;
  planningCenterUrl?: string;
}) {
  const [email, setEmail] = useState(loginOptions[0]?.email ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
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
            <a href={planningCenterUrl} className="btn btn-primary">
              <ShieldCheck size={20} />
              Login with Planning Center
            </a>
          </div>
        ) : null}
        {loginOptions.length > 0 ? (
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
