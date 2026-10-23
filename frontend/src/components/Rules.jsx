import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const PRESETS = ["youtube.com", "facebook.com", "instagram.com", "netflix.com", "steampowered.com", "roblox.com"];

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("blocked");
  const [err, setErr] = useState("");

  const load = () => api("/rules").then(setRules).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async (p = pattern) => {
    setErr("");
    try { await api("/rules", { method: "POST", body: { pattern: p, category } }); setPattern(""); load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <section className="card">
      <h2>Blocklist (alert rules)</h2>
      <p className="muted">A rule matches the domain and all its subdomains. Netlab raises an alert when a lab PC visits a listed domain.</p>
      <div className="toolbar">
        <input placeholder="example.com" value={pattern} onChange={(e) => setPattern(e.target.value)} />
        <input placeholder="category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 120 }} />
        <button onClick={() => add()}>Add rule</button>
        {err && <span className="err">{err}</span>}
      </div>
      <div className="toolbar">
        <span className="muted">Quick add:</span>
        {PRESETS.map((p) => <button key={p} onClick={() => add(p)}>{p}</button>)}
      </div>
      <table>
        <thead><tr><th>Domain</th><th>Category</th><th>Enabled</th><th></th></tr></thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r._id}>
              <td>{r.pattern}</td>
              <td>{r.category}</td>
              <td>
                <input type="checkbox" checked={r.enabled}
                  onChange={async (e) => { await api(`/rules/${r._id}`, { method: "PATCH", body: { enabled: e.target.checked } }); load(); }} />
              </td>
              <td><button onClick={async () => { await api(`/rules/${r._id}`, { method: "DELETE" }); load(); }}>Delete</button></td>
            </tr>
          ))}
          {!rules.length && <tr><td colSpan={4} className="muted">No rules yet</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
