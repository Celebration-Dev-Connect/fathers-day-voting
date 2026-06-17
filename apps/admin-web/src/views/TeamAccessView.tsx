import { Plus, Trash2 } from "lucide-react";
import { Alert, Button, PageHeader } from "@carshow/carshow-components";
import type { PcoTeamRole, StaffRole } from "@carshow/carshow-components";
import { FormEvent, useEffect, useState } from "react";
import { createTeamRole, deleteTeamRole, listTeamRoles, updateTeamRole } from "../api";

const ROLE_OPTIONS: StaffRole[] = ["REGISTRAR", "JUDGE", "ADMIN"];

export function TeamAccessView() {
  const [teamRoles, setTeamRoles] = useState<PcoTeamRole[]>([]);
  const [teamName, setTeamName] = useState("");
  const [positionName, setPositionName] = useState("");
  const [role, setRole] = useState<StaffRole>("REGISTRAR");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    listTeamRoles()
      .then(({ teamRoles }) => setTeamRoles(teamRoles))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load team access"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function addMapping(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createTeamRole({
        pcoTeamName: teamName.trim(),
        positionName: positionName.trim() || null,
        role,
      });
      setTeamName("");
      setPositionName("");
      setRole("REGISTRAR");
      load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not add team mapping");
    }
  }

  async function toggleActive(mapping: PcoTeamRole) {
    setError("");
    try {
      await updateTeamRole(mapping.id, { active: !mapping.active });
      load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update mapping");
    }
  }

  async function changeRole(mapping: PcoTeamRole, nextRole: StaffRole) {
    setError("");
    try {
      await updateTeamRole(mapping.id, { role: nextRole });
      load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update mapping");
    }
  }

  async function removeMapping(mapping: PcoTeamRole) {
    setError("");
    try {
      await deleteTeamRole(mapping.id);
      load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete mapping");
    }
  }

  return (
    <section>
      <PageHeader eyebrow="Admin Setup" title="Team Access" />
      <p className="setup-description">
        Grant app roles to Planning Center teams. Anyone who signs in via Planning Center and belongs to a mapped
        team receives that role. Leave the position blank to grant the role to the whole team, or enter a position
        name to restrict it to people holding that position. Team and position names must match Planning Center
        Services exactly. When someone matches more than one mapping, the highest-privilege role wins.
      </p>
      {error ? <Alert variant="danger">{error}</Alert> : null}

      <form className="inline-form inline-form-stacked" onSubmit={addMapping}>
        <input
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="PCO team name (e.g. Registration)"
        />
        <input
          value={positionName}
          onChange={(event) => setPositionName(event.target.value)}
          placeholder="Position name (optional — blank = whole team)"
        />
        <select value={role} onChange={(event) => setRole(event.target.value as StaffRole)} aria-label="Role">
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={!teamName.trim()}>
          <Plus size={20} />
          Add Team
        </Button>
      </form>

      {loading ? (
        <div className="empty-state">Loading team access...</div>
      ) : teamRoles.length === 0 ? (
        <Alert>No teams mapped yet. Add a Planning Center team above to grant access.</Alert>
      ) : (
        <div className="category-grid">
          {teamRoles.map((mapping) => (
            <article key={mapping.id} className="category-card">
              <div className="category-card-details">
                <strong>{mapping.pcoTeamName}</strong>
                <span>{mapping.positionName ? `Position: ${mapping.positionName}` : "Whole team"}</span>
              </div>
              <div className="card-actions">
                <select
                  value={mapping.role}
                  onChange={(event) => changeRole(mapping, event.target.value as StaffRole)}
                  aria-label={`Role for ${mapping.pcoTeamName}`}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" onClick={() => toggleActive(mapping)}>
                  {mapping.active ? "Active" : "Inactive"}
                </Button>
                <Button variant="secondary" onClick={() => removeMapping(mapping)}>
                  <Trash2 size={18} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
