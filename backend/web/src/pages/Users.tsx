// Users tab — details on users, groups, and the organization. Reads are open
// to any authenticated user; mutating actions (role change, deactivate,
// remove) are admin-only and gated by identity. There is no dedicated org
// endpoint, so the "Organization" view is derived from members + groups + the
// session-init manifest.

import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  Group,
  GroupDetail,
  Member,
  OrgManifest,
  VALID_ROLES,
  changeUserRole,
  deactivateUser,
  getGroup,
  getManifest,
  listGroups,
  listMembers,
  removeUser,
} from "../api";
import { isAdmin, useIdentity } from "../identity";
import { toast } from "../components/Toast";
import { useMutationCounter } from "../mutations";

type Section = "users" | "groups" | "org";

export function Users() {
  const [section, setSection] = useState<Section>("users");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [manifest, setManifest] = useState<OrgManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bump, setBump] = useState(0);
  const admin = isAdmin(useIdentity());
  const mutationN = useMutationCounter();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listMembers().catch((e) => {
        // Non-admins get 403 on /org/members; treat as "no visibility".
        if (e instanceof ApiError && e.status === 403) return [] as Member[];
        throw e;
      }),
      listGroups(),
      getManifest().catch(() => null),
    ])
      .then(([m, g, man]) => {
        if (cancelled) return;
        setMembers(m);
        setGroups(g);
        setManifest(man);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [bump, mutationN]);

  const reload = () => setBump((n) => n + 1);

  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <div className="filter-row" style={{ marginBottom: 16 }}>
        {(["users", "groups", "org"] as Section[]).map((s) => (
          <span
            key={s}
            className={`chip ${section === s ? "active" : ""}`}
            onClick={() => setSection(s)}
          >
            {s === "org" ? "organization" : s}
            {s === "users" && members && <span className="count">{members.length}</span>}
            {s === "groups" && groups && <span className="count">{groups.length}</span>}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : section === "users" ? (
        <UsersSection members={members || []} admin={admin} onChanged={reload} />
      ) : section === "groups" ? (
        <GroupsSection groups={groups || []} members={members || []} />
      ) : (
        <OrgSection members={members || []} groups={groups || []} manifest={manifest} />
      )}
    </>
  );
}

function RoleBadge({ role }: { role: string }) {
  return <span className={`role-badge role-${role}`}>{role}</span>;
}

function UsersSection({
  members,
  admin,
  onChanged,
}: {
  members: Member[];
  admin: boolean;
  onChanged: () => void;
}) {
  const identity = useIdentity();
  const myId = identity.status === "ok" ? identity.user.id : "";
  const [busyId, setBusyId] = useState<string | null>(null);

  if (members.length === 0) {
    return (
      <div className="empty">
        No users visible. Listing all org members requires an admin key.
      </div>
    );
  }

  async function setRole(m: Member, role: string) {
    if (role === m.role) return;
    setBusyId(m.id);
    try {
      await changeUserRole(m.id, role);
      toast.success(`${m.display_name} is now ${role}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function deactivate(m: Member) {
    if (!window.confirm(`Deactivate ${m.display_name}? They won't be able to sign in.`)) return;
    setBusyId(m.id);
    try {
      await deactivateUser(m.id);
      toast.success(`${m.display_name} deactivated`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(m: Member) {
    if (!window.confirm(`Permanently remove ${m.display_name}? This cannot be undone.`)) return;
    setBusyId(m.id);
    try {
      await removeUser(m.id);
      toast.success(`${m.display_name} removed`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <table className="entry-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th style={{ width: 130 }}>Role</th>
          <th style={{ width: 130 }}>Department</th>
          <th style={{ width: 80 }}>Status</th>
          {admin && <th style={{ width: 160 }}>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {members.map((m) => {
          const isSelf = m.id === myId;
          return (
            <tr key={m.id}>
              <td>
                <div className="title">
                  {m.display_name}
                  {isSelf && <span className="muted small"> (you)</span>}
                </div>
              </td>
              <td className="muted">{m.email || "—"}</td>
              <td>
                {admin && !isSelf ? (
                  <select
                    value={m.role}
                    disabled={busyId === m.id}
                    onChange={(e) => setRole(m, e.target.value)}
                  >
                    {VALID_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <RoleBadge role={m.role} />
                )}
              </td>
              <td className="muted">{m.department || "—"}</td>
              <td>
                <span className={m.is_active ? "status-ok" : "status-off"}>
                  {m.is_active ? "active" : "inactive"}
                </span>
              </td>
              {admin && (
                <td onClick={(e) => e.stopPropagation()}>
                  {isSelf ? (
                    <span className="muted small">—</span>
                  ) : (
                    <>
                      {m.is_active && (
                        <button
                          className="link-btn"
                          disabled={busyId === m.id}
                          onClick={() => deactivate(m)}
                        >
                          deactivate
                        </button>
                      )}
                      <button
                        className="link-btn danger"
                        disabled={busyId === m.id}
                        onClick={() => remove(m)}
                      >
                        remove
                      </button>
                    </>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GroupsSection({ groups, members }: { groups: Group[]; members: Member[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const nameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.display_name] as const)),
    [members],
  );

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    getGroup(selected)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setDetail(null))
      .finally(() => !cancelled && setLoadingDetail(false));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (groups.length === 0) return <div className="empty">No groups in this organization.</div>;

  return (
    <div className="tags-layout">
      <div>
        <table className="entry-table">
          <thead>
            <tr>
              <th>Group</th>
              <th>Description</th>
              <th style={{ width: 80 }} className="num">Members</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr
                key={g.id}
                className={selected === g.id ? "sel" : ""}
                onClick={() => setSelected(g.id)}
              >
                <td className="title">{g.name}</td>
                <td className="muted">{g.description || "—"}</td>
                <td className="num muted">{g.member_count ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <aside className="tags-side">
        {!selected ? (
          <div className="muted small">Select a group to see its members.</div>
        ) : loadingDetail ? (
          <div className="muted small">Loading…</div>
        ) : !detail ? (
          <div className="muted small">Couldn't load this group.</div>
        ) : (
          <>
            <h4>{detail.name}</h4>
            {detail.description && <p className="muted small">{detail.description}</p>}
            <div className="muted small" style={{ marginBottom: 8 }}>
              created {detail.created_at.slice(0, 10)}
            </div>
            {detail.members && detail.members.length > 0 ? (
              <ul className="cooc-list">
                {detail.members.map((mem) => (
                  <li key={mem.user_id}>
                    <span>{nameById.get(mem.user_id) || mem.user_id}</span>
                    <span className="muted">{mem.added_at.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="muted small">
                {detail.members === null ? "Members hidden (not a member)." : "No members."}
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function OrgSection({
  members,
  groups,
  manifest,
}: {
  members: Member[];
  groups: Group[];
  manifest: OrgManifest | null;
}) {
  const orgId = members[0]?.org_id || groups[0]?.org_id || "—";
  const active = members.filter((m) => m.is_active).length;

  const byRole = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) map.set(m.role, (map.get(m.role) || 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [members]);

  const byDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      const d = m.department || "(none)";
      map.set(d, (map.get(d) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [members]);

  return (
    <>
      <div className="grid">
        <div className="tile">
          <h3>Organization</h3>
          <div className="value" style={{ fontSize: 18 }}>{orgId}</div>
        </div>
        <div className="tile">
          <h3>Members</h3>
          <div className="value">{members.length}</div>
          <div className="sub">{active} active</div>
        </div>
        <div className="tile">
          <h3>Groups</h3>
          <div className="value">{groups.length}</div>
        </div>
        {manifest && (
          <>
            <div className="tile">
              <h3>Entries</h3>
              <div className="value">{manifest.total_entries}</div>
            </div>
            <div className="tile">
              <h3>Last updated</h3>
              <div className="value" style={{ fontSize: 16 }}>
                {manifest.last_updated ? manifest.last_updated.slice(0, 10) : "—"}
              </div>
            </div>
          </>
        )}
      </div>

      {members.length === 0 && (
        <p className="page-note">
          Role and department breakdowns need an admin key to list org members.
        </p>
      )}

      {members.length > 0 && (
        <>
          <div className="section">
            <h2>By role</h2>
            {byRole.map(([role, n]) => (
              <div key={role} className="bar-row">
                <span><RoleBadge role={role} /></span>
                <span className="bar">
                  <span style={{ width: `${(n / members.length) * 100}%` }} />
                </span>
                <span className="count">{n}</span>
              </div>
            ))}
          </div>
          <div className="section">
            <h2>By department</h2>
            {byDept.map(([dept, n]) => (
              <div key={dept} className="bar-row">
                <span>{dept}</span>
                <span className="bar">
                  <span style={{ width: `${(n / members.length) * 100}%` }} />
                </span>
                <span className="count">{n}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
