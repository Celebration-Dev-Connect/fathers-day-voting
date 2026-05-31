export function Button({
  variant = "primary",
  light = false,
  type = "button",
  disabled,
  onClick,
  children,
  "aria-label": ariaLabel,
}: {
  variant?: "primary" | "secondary" | "icon";
  light?: boolean;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const className =
    variant === "icon"
      ? `icon-button${light ? " light" : ""}`
      : `${variant}-button`;

  return (
    <button
      type={type}
      className={className}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
