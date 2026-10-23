require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { WebSocketServer } = require("ws");
const { Event, Usage, Pc, Rule, Alert } = require("./models");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/live" });

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach((c) => c.readyState === 1 && c.send(msg));
}

// ---- Blocklist matching (cached, refreshed every 10 s) ----
let rules = [];
async function loadRules() {
  rules = await Rule.find({ enabled: true }).lean();
}
setInterval(() => loadRules().catch(() => {}), 10000);

function matchRule(domain) {
  if (!domain) return null;
  const d = domain.toLowerCase();
  return rules.find((r) => d === r.pattern || d.endsWith("." + r.pattern)) || null;
}

// Don't spam: one alert per PC+rule per 60 s
const lastAlert = new Map();

// ---- Ingest from the capture agent ----
app.post("/api/ingest", async (req, res) => {
  const list = Array.isArray(req.body.events) ? req.body.events : [];
  if (!list.length) return res.json({ ok: true, n: 0 });

  const docs = [];
  const usageOps = new Map();
  const pcs = new Map();
  const alerts = [];

  for (const e of list) {
    const ts = new Date((e.ts || Date.now() / 1000) * 1000);
    docs.push({
      ts, pcIp: e.pc_ip, srcMac: e.src_mac, direction: e.direction, proto: e.proto,
      app: e.app, domain: e.domain, dstIp: e.dst_ip, dport: e.dport, bytes: e.bytes,
    });

    const minute = new Date(Math.floor(ts.getTime() / 60000) * 60000);
    const key = `${e.pc_ip}|${minute.getTime()}`;
    const u = usageOps.get(key) || { pcIp: e.pc_ip, minute, bytesIn: 0, bytesOut: 0, packets: 0 };
    if (e.direction === "in") u.bytesIn += e.bytes || 0;
    else u.bytesOut += e.bytes || 0;
    u.packets += 1;
    usageOps.set(key, u);

    const p = pcs.get(e.pc_ip) || { ip: e.pc_ip, mac: null, last: ts };
    if (e.direction === "out" && e.src_mac) p.mac = e.src_mac;
    p.last = ts;
    pcs.set(e.pc_ip, p);

    const rule = matchRule(e.domain);
    if (rule) {
      const k = `${e.pc_ip}|${rule.pattern}`;
      if (!lastAlert.get(k) || Date.now() - lastAlert.get(k) > 60000) {
        lastAlert.set(k, Date.now());
        alerts.push({ pcIp: e.pc_ip, domain: e.domain, rule: rule.pattern, category: rule.category });
      }
    }
  }

  try {
    await Event.insertMany(docs, { ordered: false });
    await Usage.bulkWrite(
      [...usageOps.values()].map((u) => ({
        updateOne: {
          filter: { pcIp: u.pcIp, minute: u.minute },
          update: { $inc: { bytesIn: u.bytesIn, bytesOut: u.bytesOut, packets: u.packets } },
          upsert: true,
        },
      }))
    );
    await Pc.bulkWrite(
      [...pcs.values()].map((p) => ({
        updateOne: {
          filter: { ip: p.ip },
          update: {
            $set: { lastSeen: p.last, ...(p.mac ? { mac: p.mac } : {}) },
            $setOnInsert: { firstSeen: p.last },
          },
          upsert: true,
        },
      }))
    );
    if (alerts.length) {
      const saved = await Alert.insertMany(alerts);
      saved.forEach((a) => broadcast("alert", a));
    }
  } catch (err) {
    console.error("ingest error:", err.message);
  }

  broadcast("events", docs.slice(-100)); // live feed
  res.json({ ok: true, n: docs.length });
});

// ---- PCs ----
app.get("/api/pcs", async (_req, res) => {
  const pcs = await Pc.find().sort({ lastSeen: -1 }).lean();
  const since = new Date(Date.now() - 5 * 60000);
  const usage = await Usage.aggregate([
    { $match: { minute: { $gte: since } } },
    { $group: { _id: "$pcIp", bytesIn: { $sum: "$bytesIn" }, bytesOut: { $sum: "$bytesOut" } } },
  ]);
  const um = Object.fromEntries(usage.map((u) => [u._id, u]));
  res.json(
    pcs.map((p) => ({
      ...p,
      online: p.lastSeen && Date.now() - new Date(p.lastSeen) < 60000,
      bytesIn5m: um[p.ip]?.bytesIn || 0,
      bytesOut5m: um[p.ip]?.bytesOut || 0,
    }))
  );
});

app.patch("/api/pcs/:ip", async (req, res) => {
  const pc = await Pc.findOneAndUpdate({ ip: req.params.ip }, { label: req.body.label }, { new: true });
  res.json(pc);
});

// Domains visited by one PC
app.get("/api/pcs/:ip/domains", async (req, res) => {
  const hours = parseInt(req.query.hours, 10) || 1;
  const since = new Date(Date.now() - hours * 3600000);
  const rows = await Event.aggregate([
    { $match: { pcIp: req.params.ip, domain: { $ne: null }, ts: { $gte: since } } },
    { $group: { _id: "$domain", hits: { $sum: 1 }, last: { $max: "$ts" } } },
    { $sort: { hits: -1 } },
    { $limit: 100 },
  ]);
  res.json(rows.map((r) => ({ domain: r._id, hits: r.hits, last: r.last })));
});

// ---- Usage / history ----
app.get("/api/usage", async (req, res) => {
  const hours = parseInt(req.query.hours, 10) || 1;
  const since = new Date(Date.now() - hours * 3600000);
  const match = { minute: { $gte: since } };
  if (req.query.pc) match.pcIp = req.query.pc;
  const rows = await Usage.aggregate([
    { $match: match },
    { $group: { _id: "$minute", bytesIn: { $sum: "$bytesIn" }, bytesOut: { $sum: "$bytesOut" } } },
    { $sort: { _id: 1 } },
  ]);
  res.json(rows.map((r) => ({ minute: r._id, bytesIn: r.bytesIn, bytesOut: r.bytesOut })));
});

app.get("/api/top-domains", async (req, res) => {
  const hours = parseInt(req.query.hours, 10) || 1;
  const since = new Date(Date.now() - hours * 3600000);
  const rows = await Event.aggregate([
    { $match: { domain: { $ne: null }, ts: { $gte: since } } },
    { $group: { _id: "$domain", hits: { $sum: 1 }, pcs: { $addToSet: "$pcIp" } } },
    { $project: { hits: 1, pcCount: { $size: "$pcs" } } },
    { $sort: { hits: -1 } },
    { $limit: 15 },
  ]);
  res.json(rows.map((r) => ({ domain: r._id, hits: r.hits, pcCount: r.pcCount })));
});

app.get("/api/protocols", async (req, res) => {
  const since = new Date(Date.now() - (parseInt(req.query.hours, 10) || 1) * 3600000);
  const rows = await Event.aggregate([
    { $match: { ts: { $gte: since } } },
    { $group: { _id: { $ifNull: ["$app", "$proto"] }, bytes: { $sum: "$bytes" }, packets: { $sum: 1 } } },
    { $sort: { bytes: -1 } },
  ]);
  res.json(rows.map((r) => ({ name: r._id || "OTHER", bytes: r.bytes, packets: r.packets })));
});

// CSV report of per-PC usage
app.get("/api/report.csv", async (req, res) => {
  const hours = parseInt(req.query.hours, 10) || 24;
  const since = new Date(Date.now() - hours * 3600000);
  const rows = await Usage.aggregate([
    { $match: { minute: { $gte: since } } },
    { $group: { _id: "$pcIp", bytesIn: { $sum: "$bytesIn" }, bytesOut: { $sum: "$bytesOut" }, packets: { $sum: "$packets" } } },
    { $sort: { bytesIn: -1 } },
  ]);
  const labels = Object.fromEntries((await Pc.find().lean()).map((p) => [p.ip, p.label || ""]));
  const csv = ["pc_ip,label,bytes_in,bytes_out,packets"]
    .concat(rows.map((r) => `${r._id},"${labels[r._id] || ""}",${r.bytesIn},${r.bytesOut},${r.packets}`))
    .join("\n");
  res.set("Content-Type", "text/csv").set("Content-Disposition", "attachment; filename=netlab-report.csv").send(csv);
});

// ---- Blocklist rules ----
app.get("/api/rules", async (_req, res) => res.json(await Rule.find().sort({ pattern: 1 })));
app.post("/api/rules", async (req, res) => {
  try {
    const pattern = String(req.body.pattern || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!pattern) return res.status(400).json({ error: "pattern required" });
    const rule = await Rule.create({ pattern, category: req.body.category || "blocked" });
    await loadRules();
    res.status(201).json(rule);
  } catch (e) {
    res.status(400).json({ error: e.code === 11000 ? "rule already exists" : e.message });
  }
});
app.patch("/api/rules/:id", async (req, res) => {
  const rule = await Rule.findByIdAndUpdate(req.params.id, { enabled: !!req.body.enabled }, { new: true });
  await loadRules();
  res.json(rule);
});
app.delete("/api/rules/:id", async (req, res) => {
  await Rule.findByIdAndDelete(req.params.id);
  await loadRules();
  res.json({ ok: true });
});

// ---- Alerts ----
app.get("/api/alerts", async (_req, res) => res.json(await Alert.find().sort({ ts: -1 }).limit(200)));
app.post("/api/alerts/:id/ack", async (req, res) => {
  res.json(await Alert.findByIdAndUpdate(req.params.id, { acknowledged: true }, { new: true }));
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

(async () => {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/netlab");
  await loadRules();
  const port = process.env.PORT || 5000;
  server.listen(port, () => console.log(`Netlab backend on :${port}`));
})();
