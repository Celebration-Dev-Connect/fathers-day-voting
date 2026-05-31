import { Car, CheckCircle2, Plus, QrCode, Tags } from "lucide-react";
import { Button, Metric, PageHeader } from "@carshow/carshow-components";
import type { DashboardMetrics } from "@carshow/carshow-components";

export function DashboardView({
  metrics,
  onRegister,
}: {
  metrics: DashboardMetrics;
  onRegister: () => void;
}) {
  return (
    <section>
      <PageHeader
        eyebrow="2026 Event"
        title="Registration Overview"
        actions={
          <Button onClick={onRegister}>
            <Plus size={20} />
            Register Vehicle
          </Button>
        }
      />
      <div className="metric-grid">
        <Metric label="Registered Vehicles" value={metrics.total} icon={<Car />} />
        <Metric label="Checked In" value={metrics.checkedIn} icon={<CheckCircle2 />} />
        <Metric label="QR Assigned" value={metrics.assignedQr} icon={<QrCode />} />
        <Metric label="Active Categories" value={metrics.categories} icon={<Tags />} />
      </div>
      <div className="wide-card">
        <h2>Event-day focus</h2>
        <p>
          This slice is intentionally tight: register vehicles, check them in, assign QR cards, and keep
          audit history clean before adding judging, photo moderation, voting cutoff, and results.
        </p>
      </div>
    </section>
  );
}
