export function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <article className="metric-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
