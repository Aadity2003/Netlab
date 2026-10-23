const mongoose = require("mongoose");

const ttl = (parseInt(process.env.EVENT_TTL_DAYS, 10) || 7) * 86400;

// Raw metadata events (auto-expire). No payloads are ever stored.
const eventSchema = new mongoose.Schema({
  ts: { type: Date, index: true, expires: ttl },
  pcIp: { type: String, index: true },
  srcMac: String,
  direction: String,
  proto: String,
  app: String,
  domain: { type: String, index: true },
  dstIp: String,
  dport: Number,
  bytes: Number,
});

// One document per PC per minute, kept for history/reports.
const usageSchema = new mongoose.Schema({
  pcIp: { type: String, index: true },
  minute: { type: Date, index: true },
  bytesIn: { type: Number, default: 0 },
  bytesOut: { type: Number, default: 0 },
  packets: { type: Number, default: 0 },
});
usageSchema.index({ pcIp: 1, minute: 1 }, { unique: true });

const pcSchema = new mongoose.Schema({
  ip: { type: String, unique: true },
  mac: String,
  label: String, // e.g. "Lab-3 PC-07"
  firstSeen: Date,
  lastSeen: Date,
});

const ruleSchema = new mongoose.Schema({
  pattern: { type: String, required: true, unique: true }, // "youtube.com"
  category: { type: String, default: "blocked" },
  enabled: { type: Boolean, default: true },
});

const alertSchema = new mongoose.Schema({
  ts: { type: Date, default: Date.now, index: true },
  pcIp: String,
  domain: String,
  rule: String,
  category: String,
  acknowledged: { type: Boolean, default: false },
});

module.exports = {
  Event: mongoose.model("Event", eventSchema),
  Usage: mongoose.model("Usage", usageSchema),
  Pc: mongoose.model("Pc", pcSchema),
  Rule: mongoose.model("Rule", ruleSchema),
  Alert: mongoose.model("Alert", alertSchema),
};
