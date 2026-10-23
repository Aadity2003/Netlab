import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function Alerts({ live, onSeen }) {
  const [alerts, setAlerts] = useState([]);
  const load = () => api("/alerts").then(setAlerts).catch(() => {});

  useEffect(() => { load(); onSeen(); }, []);
  useEffect(() => { if (live.length) { load(); onSeen(); } }, [live.length]);

  const ack = async (id) => { await api(`/alerts/${id}/ack`, { method: "POST" }); load(); };

  return (
    <section className="card">
      <h2>Alerts</h2>
      <table>
        <thead><tr><th>Time</th><th>Lab PC</th><th>Domain</th><th>Rule</th><th>Category</th><th></th></tr></thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={a._id} className={a.acknowledged ? "muted" : "alert"}>
              <td>{new Date(a.ts).toLocaleString()}</td>
              <td>{a.pcIp}</td>
              <td>{a.domain}</td>
              <td>{a.rule}</td>
              <td>{a.category}</td>
              <td>{!a.acknowledged && <button onClick={() => ack(a._id)}>Acknowledge</button>}</td>
            </tr>
          ))}
          {!alerts.length && <tr><td colSpan={6} className="muted">No alerts</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
