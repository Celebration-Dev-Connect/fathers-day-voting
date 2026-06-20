import { Plus, Search, Trash2, Users } from "lucide-react";
import { Alert, Button, PageHeader } from "@carshow/carshow-components";
import type { PcoServicesTeam, PcoTeamRole, StaffRole } from "@carshow/carshow-components";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
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
  if (code === "PCO_SESSION_EXPIRED") {
    return "Your Planning Center session has expired. Sign out and sign back in to browse Services teams.";
  }
  if (code === "PCO_FORBIDDEN") {
    return "Your Planning Center account does not have permission to browse Services teams. Sign in with an account that has Services access.";
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
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState<PcoServicesTeam | null>(null);
  const [positionName, setPositionName] = useState("");
  const [role, setRole] = useState<StaffRole>("REGISTRAR");
  const [error, setError] = useState("");
  const [setupWarning, setSetupWarning] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);

  function load() {
    listTeamRoles()
      .then(({ teamRoles }) => setTeamRoles(teamRoles))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load team access"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function searchTeams(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setError("");
    setSetupWarning("");
    try {
      const result = await searchPcoServicesTeams(query.trim());
      setResults(result.teams);
      setHighlight(0);
      setOpen(true);
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

  async function chooseTeam(team: PcoServicesTeam) {
    setOpen(false);
    setQuery(team.name);
    setPositionName("");
    setError("");
    setSetupWarning("");
    setLoadingDetail(true);
    try {
      // Search returns lightweight rows; load positions + counts for the chosen team.
      const result = await getPcoServicesTeam(team.id);
      setSelectedTeam(result.team);
    } catch (detailError) {
      const warning = planningCenterWarning(detailError);
      if (warning) {
        setSetupWarning(warning);
      } else {
        setSelectedTeam(team);
        setError(detailError instanceof Error ? detailError.message : "Could not load team details");
      }
    } finally {
      setLoadingDetail(false);
    }
  }

  function onComboKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && results[highlight]) {
      event.preventDefault();
      void chooseTeam(results[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
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
      setQuery("");
      setResults([]);
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
        Search Planning Center Services teams, pick the exact team from the dropdown, then assign an app role. The app
        stores the Planning Center team ID, so duplicate team names no longer collide. The built-in carshow admin
        fallback remains protected as a lockout safety net.
      </p>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {setupWarning ? <Alert>{setupWarning}</Alert> : null}

      <div className="team-combobox" ref={comboboxRef}>
        <form className="team-combobox-input-row" onSubmit={searchTeams}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onComboKeyDown}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Search PCO Services teams, e.g. Registration"
            role="combobox"
            aria-expanded={open}
            aria-controls="team-combobox-listbox"
          />
          <Button type="submit" disabled={query.trim().length < 2 || searching}>
            <Search size={20} />
            {searching ? "Searching..." : "Search"}
          </Button>
        </form>

        {open ? (
          <ul className="team-combobox-listbox" id="team-combobox-listbox" role="listbox">
            {results.length === 0 ? (
              <li className="team-combobox-empty">No teams match “{query.trim()}”.</li>
            ) : (
              results.map((team, index) => (
                <li
                  key={team.id}
                  role="option"
                  aria-selected={index === highlight}
                  className={`team-combobox-option ${index === highlight ? "active" : ""}`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => void chooseTeam(team)}
                >
                  <strong>{team.name}</strong>
                  <span>{team.serviceTypeName ?? "No service type listed"}</span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      <form className="inline-form inline-form-stacked" style={{ marginTop: 20 }} onSubmit={addMapping}>
        <div className="selected-team-summary">
          <Users size={20} />
          <div>
            <strong>{selectedTeam ? teamLabel(selectedTeam) : "No Planning Center team selected"}</strong>
            <span>
              {loadingDetail
                ? "Loading team details..."
                : selectedTeam
                  ? `${selectedTeam.memberCount ?? 0} members · ${selectedTeam.leaderCount ?? 0} leaders`
                  : "Search above and pick the exact Services team first."}
            </span>
          </div>
        </div>
        <select
          value={positionName}
          onChange={(event) => setPositionName(event.target.value)}
          disabled={!selectedTeam || loadingDetail}
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
        <Button type="submit" disabled={!selectedTeam || loadingDetail}>
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
