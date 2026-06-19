import { ChevronDown, ChevronRight, Plus, Search, Trash2, Users } from "lucide-react";
import { Alert, Button, PageHeader } from "@carshow/carshow-components";
import type { PcoServicesTeam, PcoTeamRole, StaffRole } from "@carshow/carshow-components";
import { FormEvent, useEffect, useState } from "react";
import {
  createTeamRole,
  ApiError,
  deleteTeamRole,
  getPcoServicesTeam,
  listTeamRoles,
  searchPcoServicesTeams,
  updateTeamRole,
} from "../api";

const ROLE_OPTIONS: StaffRole[] = ["REGISTRAR", "JUDGE", "ADMIN"];
const fallbackAdminMappingId = "default-admin-team";

function planningCenterWarning(error: unknown) {
  if (!(error instanceof ApiError)) return null;
  const details = error.details;
  const code = details && typeof details === "object" ? (details as { code?: unknown }).code : null;
  if (code === "PCO_NOT_CONFIGURED") {
    return "Planning Center team lookup is not configured yet. Add the Planning Center API app ID/secret secrets and run the Terraform apply workflow so the API can browse Services teams.";
  }
  if (code === "PCO_UNAUTHORIZED") {
    return "Planning Center rejected the team lookup credentials. Verify the API app ID/secret, then run Terraform apply so the API receives the updated secrets.";
  }
  if (code === "PCO_FORBIDDEN") {
    return "Planning Center connected, but these credentials do not have permission to browse Services teams. Use credentials from a Planning Center admin with Services access, or reconnect using the OAuth setup flow once enabled.";
  }
  if (code === "PCO_RATE_LIMITED") {
    return "Planning Center is rate limiting team lookup requests. Wait a minute and try again.";
  }
  if (code === "PCO_UNAVAILABLE") {
    return "Planning Center could not be reached for team lookup. Try again shortly.";
  }
  return null;
}

function teamLabel(team: PcoServicesTeam | PcoTeamRole) {
  const isMapping = "pcoTeamName" in team;
  const name = isMapping ? team.pcoTeamName : team.name;
  const serviceTypeName = isMapping ? team.pcoServiceTypeName : team.serviceTypeName;
  return [name, serviceTypeName].filter(Boolean).join(" · ");
}

function mappingLabel(mapping: PcoTeamRole) {
  return mapping.positionName ? `Position: ${mapping.positionName}` : "Whole team";
}

export function TeamAccessView() {
  const [teamRoles, setTeamRoles] = useState<PcoTeamRole[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PcoServicesTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<PcoServicesTeam | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState("");
  const [teamDetails, setTeamDetails] = useState<Record<string, PcoServicesTeam>>({});
  const [positionName, setPositionName] = useState("");
  const [role, setRole] = useState<StaffRole>("REGISTRAR");
  const [error, setError] = useState("");
  const [setupWarning, setSetupWarning] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [detailsLoadingId, setDetailsLoadingId] = useState("");

  function load() {
    listTeamRoles()
      .then(({ teamRoles }) => setTeamRoles(teamRoles))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load team access"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function searchTeams(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setError("");
    setSetupWarning("");
    setSelectedTeam(null);
    try {
      const result = await searchPcoServicesTeams(query.trim());
      setResults(result.teams);
    } catch (searchError) {
      const warning = planningCenterWarning(searchError);
      if (warning) {
        setSetupWarning(warning);
      } else {
        setError(searchError instanceof Error ? searchError.message : "Could not search Planning Center teams");
      }
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function toggleTeamDetails(team: PcoServicesTeam) {
    if (expandedTeamId === team.id) {
      setExpandedTeamId("");
      return;
    }
    setExpandedTeamId(team.id);
    if (teamDetails[team.id]?.members) return;
    setDetailsLoadingId(team.id);
    setError("");
    setSetupWarning("");
    try {
      const result = await getPcoServicesTeam(team.id);
      setTeamDetails((current) => ({ ...current, [team.id]: result.team }));
    } catch (detailError) {
      const warning = planningCenterWarning(detailError);
      if (warning) {
        setSetupWarning(warning);
      } else {
        setError(detailError instanceof Error ? detailError.message : "Could not load team members");
      }
    } finally {
      setDetailsLoadingId("");
    }
  }

  function chooseTeam(team: PcoServicesTeam) {
    const detail = teamDetails[team.id] ?? team;
    setSelectedTeam(detail);
    setPositionName("");
  }

  async function addMapping(event: FormEvent) {
    event.preventDefault();
    if (!selectedTeam) return;
    setError("");
    try {
      await createTeamRole({
        pcoTeamId: selectedTeam.id,
        pcoTeamName: selectedTeam.name,
        pcoServiceTypeName: selectedTeam.serviceTypeName ?? null,
        positionName: positionName || null,
        role,
      });
      setSelectedTeam(null);
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
    const label = mapping.positionName
      ? `${teamLabel(mapping)} / ${mapping.positionName}`
      : `${teamLabel(mapping)} / whole team`;
    if (!window.confirm(`Delete the Planning Center team mapping for ${label}?`)) return;
    setError("");
    try {
      await deleteTeamRole(mapping.id);
      load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete mapping");
    }
  }

  const selectedPositions = selectedTeam?.positionNames ?? [];

  return (
    <section>
      <PageHeader eyebrow="Admin Setup" title="Team Access" />
      <p className="setup-description">
        Search Planning Center Services teams, select the exact team, then assign an app role. The app stores the
        Planning Center team ID, so duplicate team names no longer collide. The built-in carshow admin fallback remains
        protected as a lockout safety net.
      </p>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {setupWarning ? <Alert>{setupWarning}</Alert> : null}

      <form className="inline-form inline-form-stacked" style={{ marginTop: 20 }} onSubmit={searchTeams}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search PCO Services teams, e.g. Registration"
        />
        <Button type="submit" disabled={query.trim().length < 2 || searching}>
          <Search size={20} />
          {searching ? "Searching..." : "Search Teams"}
        </Button>
      </form>

      {results.length ? (
        <div className="category-grid team-picker-results">
          {results.map((team) => {
            const detail = teamDetails[team.id] ?? team;
            const expanded = expandedTeamId === team.id;
            return (
              <article key={team.id} className={`category-card ${selectedTeam?.id === team.id ? "selected" : ""}`}>
                <div className="category-card-details">
                  <strong>{team.name}</strong>
                  <span>{team.serviceTypeName ?? "No service type listed"}</span>
                  <span>{team.memberCount} members · {team.leaderCount} leaders</span>
                  {team.updatedAt ? <span>Updated {new Date(team.updatedAt).toLocaleDateString()}</span> : null}
                </div>
                <div className="card-actions">
                  <Button variant="secondary" onClick={() => void toggleTeamDetails(team)}>
                    {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    Preview
                  </Button>
                  <Button onClick={() => chooseTeam(detail)}>Select</Button>
                </div>
                {expanded ? (
                  <div className="team-picker-preview">
                    {detailsLoadingId === team.id ? (
                      <span className="muted-copy">Loading members...</span>
                    ) : (
                      <>
                        <div>
                          <strong>Positions</strong>
                          <span>{detail.positionNames.length ? detail.positionNames.join(", ") : "No positions found"}</span>
                        </div>
                        <div>
                          <strong>People</strong>
                          {(detail.members ?? []).slice(0, 12).map((member) => (
                            <span key={member.id}>
                              {member.name}{member.leader ? " · leader" : ""}{member.positions.length ? ` · ${member.positions.join(", ")}` : ""}
                            </span>
                          ))}
                          {(detail.members?.length ?? 0) > 12 ? <span>{detail.members!.length - 12} more...</span> : null}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      <form className="inline-form inline-form-stacked" style={{ marginTop: 20 }} onSubmit={addMapping}>
        <div className="selected-team-summary">
          <Users size={20} />
          <div>
            <strong>{selectedTeam ? teamLabel(selectedTeam) : "No Planning Center team selected"}</strong>
            <span>
              {selectedTeam
                ? `${selectedTeam.memberCount} members · ${selectedTeam.leaderCount} leaders`
                : "Search above and select the exact Services team first."}
            </span>
          </div>
        </div>
        <select
          value={positionName}
          onChange={(event) => setPositionName(event.target.value)}
          disabled={!selectedTeam}
          aria-label="Planning Center position"
        >
          <option value="">Whole team</option>
          {selectedPositions.map((position) => (
            <option key={position} value={position}>{position}</option>
          ))}
        </select>
        <select value={role} onChange={(event) => setRole(event.target.value as StaffRole)} aria-label="App role">
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={!selectedTeam}>
          <Plus size={20} />
          Add Team Mapping
        </Button>
      </form>

      {loading ? (
        <div className="empty-state">Loading team access...</div>
      ) : teamRoles.length === 0 ? (
        <Alert>No teams mapped yet. Add a Planning Center team above to grant access.</Alert>
      ) : (
        <div className="category-grid">
          {teamRoles.map((mapping) => {
            const isFallback = mapping.id === fallbackAdminMappingId;
            return (
              <article key={mapping.id} className="category-card">
                <div className="category-card-details">
                  <strong>{teamLabel(mapping)}</strong>
                  <span>{mappingLabel(mapping)}</span>
                  <span>{mapping.pcoTeamId ? `PCO team ID: ${mapping.pcoTeamId}` : "Fallback name-based mapping"}</span>
                </div>
                <div className="card-actions">
                  <select
                    value={mapping.role}
                    onChange={(event) => changeRole(mapping, event.target.value as StaffRole)}
                    aria-label={`Role for ${mapping.pcoTeamName}`}
                    disabled={isFallback}
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <Button variant="secondary" disabled={isFallback} onClick={() => toggleActive(mapping)}>
                    {mapping.active ? "Active" : "Inactive"}
                  </Button>
                  <Button variant="secondary" disabled={isFallback} onClick={() => removeMapping(mapping)}>
                    <Trash2 size={18} />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
