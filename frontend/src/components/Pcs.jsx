import React, { useEffect, useState } from "react";
import { api, fmtBytes } from "../api.js";

export default function Pcs() {
  const [pcs, setPcs] = useState([]);
  const [sel, setSel] = useState(null);
  const [domains, setDomains] = useState([]);

  const load = () => api("/pcs").then(setPcs).catch(() => {});
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (sel) api(`/pcs/${sel}/domains?hours=1`).then(setDomains).catch(() => {});
  }, [sel]);

  const rename = async (pc) => {
    const label = prompt("Label for " + pc.ip, pc.label || "");
    if (label !== null) { await api(`/pcs/${pc.ip}`, { method: "PATCH", body: { label } }); load(); }
  };

  return (
    <div className="grid2">
      <section className="card">
        <h2>Lab PCs ({pcs.filter((p) => p.online).length}/{pcs.length} online)</h2>
        <table>
          <thead><tr><th></th><th>IP</th><th>Label</th><th>MAC</th><th>↓ 5 min</th><th>↑ 5 min</th><th></th></tr></thead>
          <tbody>
            {pcs.map((p) => (
              <tr key={p.ip} className={sel === p.ip ? "sel" : ""} onClick={() => setSel(p.ip)}>
                <td><span className={`dot ${p.online ? "on" : ""}`} /></td>
                <td>{p.ip}</td>
                <td>{p.label || <span className="muted">—</span>}</td>
                <td className="mono">{p.mac || ""}</td>
                <td>{fmtBytes(p.bytesIn5m)}</td>
                <td>{fmtBytes(p.bytesOut5m)}</td>
                <td><button onClick={(e) => { e.stopPropagation(); rename(p); }}>Rename</button></td>
              </tr>
            ))}
            {!pcs.length && <tr><td colSpan={7} className="muted">No PCs seen yet</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>{sel ? `Sites visited by ${sel} (last hour)` : "Select a PC"}</h2>
        <table>
          <thead><tr><th>Domain</th><th>Hits</th><th>Last seen</th></tr></thead>
          <tbody>
            {sel && domains.map((d) => (
              <tr key={d.domain}><td>{d.domain}</td><td>{d.hits}</td><td>{new Date(d.last).toLocaleTimeString()}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
