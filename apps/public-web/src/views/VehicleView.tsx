import { Alert } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getVehicle } from "../api";
import { getOrCreateVoterKey } from "../voter";

type Status = "loading" | "redirecting" | "unassigned" | "error";

export function VehicleView() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) return;
    const voterKey = getOrCreateVoterKey();
    getVehicle(token, voterKey)
      .then((result) => {
        if (result.assigned) {
          setStatus("redirecting");
          navigate(`/browse/entry/${result.vehicle.entryNumber}`, { replace: true });
        } else {
          setStatus("unassigned");
        }
      })
      .catch((err: Error) => {
        setErrorMsg(err.message);
        setStatus("error");
      });
  }, [token, navigate]);

  if (status === "loading" || status === "redirecting") {
    return (
      <div className="public-content">
        <p className="muted-copy">Looking up vehicle…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="public-content">
        <Alert variant="danger">{errorMsg}</Alert>
      </div>
    );
  }

  return (
    <div className="public-content">
      <div className="not-found-card">
        <p className="not-found-icon">🚗</p>
        <h1 className="not-found-title">Car Not Found</h1>
        <p className="not-found-body">
          This QR code isn't linked to a registered car yet.
        </p>
        <p className="not-found-body">
          <strong>Visitor?</strong> Try scanning a different QR code — each car has its own.
        </p>
        <p className="not-found-body">
          <strong>Car owner?</strong> Please visit the registration desk and they can get this sorted out for you.
        </p>
        <Link to="/browse" className="not-found-browse-link">← Browse all cars</Link>
      </div>
    </div>
  );
}
