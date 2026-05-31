import { Alert, VehicleProfileCard, VoteConfirmDialog } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { castVote, getVehicle, type VehicleResponse } from "../api";
import { getOrCreateVoterKey } from "../voter";

export function VehicleView() {
  const { token = "" } = useParams<{ token: string }>();
  const [data, setData] = useState<VehicleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    if (!token) return;
    const voterKey = getOrCreateVoterKey();
    setLoading(true);
    setError("");
    getVehicle(token, voterKey)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleVoteConfirmed() {
    if (!data?.assigned) return;
    const voterKey = getOrCreateVoterKey();
    setConfirming(false);
    setVoting(true);
    try {
      await castVote(token, voterKey);
      setData({ ...data, alreadyVotedInCategory: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setVoting(false);
    }
  }

  if (loading) {
    return (
      <div className="public-content">
        <p className="muted-copy">Loading vehicle…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="public-content">
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }

  if (!data) return null;

  if (!data.assigned) {
    return (
      <div className="public-content">
        <Alert variant="info">This QR code hasn't been assigned to a vehicle yet. Check back soon!</Alert>
      </div>
    );
  }

  return (
    <div className="public-content">
      {confirming ? (
        <VoteConfirmDialog
          categoryName={data.vehicle.category.name}
          onConfirm={handleVoteConfirmed}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
      <VehicleProfileCard
        vehicle={data.vehicle}
        votingOpen={data.votingOpen}
        cutoffPassed={data.cutoffPassed}
        alreadyVoted={data.alreadyVotedInCategory}
        onVote={() => setConfirming(true)}
        voting={voting}
      />
    </div>
  );
}
