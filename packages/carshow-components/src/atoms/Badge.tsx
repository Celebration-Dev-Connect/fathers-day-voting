export function Badge({
  variant,
  modifier,
  children,
}: {
  variant: "entry-code" | "qr-pill" | "status" | "rank";
  modifier?: string;
  children: React.ReactNode;
}) {
  const baseClass: Record<typeof variant, string> = {
    "entry-code": "entry-code",
    "qr-pill": "qr-pill",
    status: "status-badge",
    rank: "rank-badge",
  };

  const className = modifier ? `${baseClass[variant]} ${modifier}` : baseClass[variant];

  return <span className={className}>{children}</span>;
}
