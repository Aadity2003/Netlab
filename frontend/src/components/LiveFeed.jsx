import React, { useState } from "react";
import { fmtBytes } from "../api.js";

export default function LiveFeed({ feed }) {
  const [filter, setFilter] = useState("");
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState([]);

  const rows = (paused ? frozen : feed).filter((e) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return [e.pcIp, e.domain, e.proto, e.app, e.dstIp].some((v) => v && String(v).toLowerCase().includes(q));
  });

  return (
    <section className="card">
      <div className="toolbar">
        <input placeholder="Filter by IP, domain, protocol…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button onClick={() => { setFrozen(feed); setPaused(!paused); }}>{paused ? "Resume" : "Pause"}</button>
      </div>
      <table className="mono">
        <thead>
          <tr><th>Time</th><th>Lab PC</th><th>Dir</th><th>Proto</th><th>App</th><th>Remote</th><th>Domain</th><th>Size</th></tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i}>
              <td>{new Date(e.ts).toLocaleTimeString()}</td>
              <td>{e.pcIp}</td>
              <td>{e.direction === "in" ? "←" : "→"}</td>
              <td>{e.proto}</td>
              <td>{e.app || ""}</td>
              <td>{e.dstIp}{e.dport ? `:${e.dport}` : ""}</td>
              <td>{e.domain || ""}</td>
              <td>{fmtBytes(e.bytes)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8} className="muted">Waiting for traffic…</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
