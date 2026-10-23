export const fmtBytes = (n = 0) => {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i ? 1 : 0)} ${u[i]}`;
};

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export function connectLive(onMessage) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  let ws, closed = false;
  const open = () => {
    ws = new WebSocket(`${proto}://${location.host}/live`);
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => !closed && setTimeout(open, 2000);
  };
  open();
  return () => { closed = true; ws && ws.close(); };
}
