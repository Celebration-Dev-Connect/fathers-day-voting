export function SidebarNavButton({
  active,
  onClick,
  children,
  ...buttonProps
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "onClick">) {
  return (
    <button className={active ? "active" : ""} onClick={onClick} {...buttonProps}>
      {children}
    </button>
  );
}
