export function Alert({
  variant = "info",
  children,
}: {
  variant?: "info" | "success" | "danger";
  children: React.ReactNode;
}) {
  return <div className={`alert${variant !== "info" ? ` ${variant}` : ""}`}>{children}</div>;
}
