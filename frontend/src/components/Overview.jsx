import React, { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { api, fmtBytes } from "../api.js";

export default function Overview() {
  const [hours, setHours] = useState(1);
  const [usage, setUsage] = useState([]);
  const [top, setTop] = useState([]);
  const [protos, setProtos] = useState([]);

  useEffect(() => {
    const load = () => {
      api(`/usage?hours=${hours}`).then(setUsage).catch(() => {});
      api(`/top-domains?hours=${hours}`).then(setTop).catch(() => {});
      api(`/protocols?hours=${hours}`).then(setProtos).catch(() => {});
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [hours]);

  const data = usage.map((u) => ({
    t: new Date(u.minute).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    In: u.bytesIn,
    Out: u.bytesOut,
  }));

  return (
    <>
      <div className="toolbar">
        <label>Range </label>
        <select value={hours} onChange={(e) => setHours(+e.target.value)}>
          <option value={1}>Last hour</option>
          <option value={6}>Last 6 hours</option>
          <option value={24}>Last 24 hours</option>
          <option value={168}>Last 7 days</option>
        </select>
        <a className="btn" href={`/api/report.csv?hours=${hours}`}>Download CSV report</a>
      </div>

      <section className="card">
        <h2>Bandwidth</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data}>
            <XAxis dataKey="t" fontSize={12} />
            <YAxis tickFormatter={fmtBytes} fontSize={12} width={70} />
            <Tooltip formatter={fmtBytes} />
            <Area type="monotone" dataKey="In" stroke="#2563eb" fill="#bfdbfe" />
            <Area type="monotone" dataKey="Out" stroke="#16a34a" fill="#bbf7d0" />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <div className="grid2">
        <section className="card">
          <h2>Top domains</h2>
          <table>
            <thead><tr><th>Domain</th><th>Hits</th><th>PCs</th></tr></thead>
            <tbody>
              {top.map((d) => (
                <tr key={d.domain}><td>{d.domain}</td><td>{d.hits}</td><td>{d.pcCount}</td></tr>
              ))}
              {!top.length && <tr><td colSpan={3} className="muted">No data yet</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Protocol breakdown</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={protos} layout="vertical">
              <XAxis type="number" tickFormatter={fmtBytes} fontSize={12} />
              <YAxis type="category" dataKey="name" width={60} fontSize={12} />
              <Tooltip formatter={fmtBytes} />
              <Bar dataKey="bytes" fill="#7c3aed" />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
    </>
  );
}
