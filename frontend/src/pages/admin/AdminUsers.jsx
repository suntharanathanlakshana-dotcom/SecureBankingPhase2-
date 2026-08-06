import { useEffect, useState } from "react";
import { api } from "../../api";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  function refresh() { api.get("/admin/users").then((d) => setUsers(d.users)); }
  useEffect(refresh, []);

  async function toggle(u) {
    await api.post(`/admin/users/${u.id}/${u.status === "frozen" ? "unfreeze" : "freeze"}`, {});
    refresh();
  }

  return (
    <div className="page">
      <h1>Users</h1>
      <p style={{ marginBottom: 20 }}>All registered customers and staff accounts.</p>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td className="mono">{u.username}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td><span className={"badge " + (u.status === "active" ? "badge-success" : "badge-danger")}>{u.status}</span></td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  {u.role !== "admin" && (
                    <button className="btn btn-sm btn-secondary" onClick={() => toggle(u)}>
                      {u.status === "frozen" ? "Unfreeze" : "Freeze"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
