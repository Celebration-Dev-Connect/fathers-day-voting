import { Badge } from "../atoms/Badge.js";
import type { Registration } from "../types.js";
import { vehicleName } from "../utils.js";

export function RegistrationRow({
  registration,
  selected,
  onClick,
}: {
  registration: Registration;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`registration-row${selected ? " selected" : ""}`}
      onClick={onClick}
    >
      <Badge variant="entry-code">
        #{registration.entryNumber.toString().padStart(3, "0")}
      </Badge>
      <div>
        <strong>{vehicleName(registration)}</strong>
        <span>
          {registration.owner.firstName} {registration.owner.lastName}
        </span>
        <span>{registration.category.name}</span>
      </div>
      <Badge variant="status" modifier={registration.status.toLowerCase()}>
        {registration.status.replace("_", " ")}
      </Badge>
      <Badge variant="qr-pill">Owner {registration.ownerAccessCode}</Badge>
      <Badge variant="qr-pill">{registration.qrCard?.visibleCode ?? "No QR"}</Badge>
    </button>
  );
}
