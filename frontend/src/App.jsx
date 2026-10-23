import React, { useEffect, useState } from "react";
import { connectLive } from "./api.js";
import Overview from "./components/Overview.jsx";
import LiveFeed from "./components/LiveFeed.jsx";
import Pcs from "./components/Pcs.jsx";
import Rules from "./components/Rules.jsx";
import Alerts from "./components/Alerts.jsx";

const TABS = ["Overview", "Live Traffic", "Lab PCs", "Blocklist", "Alerts"];

export default function App() {
  const [tab, setTab] = useState("Overview");
  const [feed, setFeed] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const stop = connectLive((msg) => {
      setConnected(true);
      if (msg.type === "events") setFeed((f) => [...msg.data.reverse(), ...f].slice(0, 300));
      if (msg.type === "alert") setLiveAlerts((a) => [msg.data, ...a].slice(0, 50));
    });
    return stop;
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Netlab</h1>
        <span className={`dot ${connected ? "on" : ""}`} title={connected ? "Live" : "Waiting for data"} />
        <nav>
          {TABS.map((t) => (
            <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
              {t}
              {t === "Alerts" && liveAlerts.length > 0 && <b className="badge">{liveAlerts.length}</b>}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === "Overview" && <Overview />}
        {tab === "Live Traffic" && <LiveFeed feed={feed} />}
        {tab === "Lab PCs" && <Pcs />}
        {tab === "Blocklist" && <Rules />}
        {tab === "Alerts" && <Alerts live={liveAlerts} onSeen={() => setLiveAlerts([])} />}
      </main>
    </div>
  );
}
