export function PageHeader({
  eyebrow,
  title,
  compact = false,
  actions,
}: {
  eyebrow?: string;
  title: string;
  compact?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`page-header${compact ? " compact" : ""}`}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
      </div>
      {actions ? <div className="header-actions">{actions}</div> : null}
    </div>
  );
}
