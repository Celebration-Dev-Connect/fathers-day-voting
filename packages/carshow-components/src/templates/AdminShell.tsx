export function AdminShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">{sidebar}</aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
