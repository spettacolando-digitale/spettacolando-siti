// Posizioni dei ragazzi di SpettacolApp.
// POST: un ragazzo invia la sua posizione (nome, lat, lng, precisione). Ogni invio è salvato e conservato.
// GET:  la presidente legge le posizioni (serve il PIN, impostato nella variabile MAPPA_PIN).
import { getStore } from "@netlify/blobs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const pulisci = (s, max) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

export default async (req) => {
  const store = getStore({ name: "posizioni", consistency: "strong" });

  if (req.method === "POST") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "Richiesta non valida" }, 400); }
    const nome = pulisci(b.nome, 60);
    const lat = Number(b.lat), lng = Number(b.lng), acc = Math.round(Number(b.acc) || 0);
    if (!nome) return json({ error: "Manca il nome" }, 400);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: "Posizione non valida" }, 400);
    const at = new Date().toISOString();
    const key = "p/" + at.slice(0, 10) + "/" + at + "-" + Math.random().toString(36).slice(2, 8);
    await store.setJSON(key, { nome, lat, lng, acc, at });
    return json({ ok: true, at });
  }

  if (req.method === "GET") {
    const pin = process.env.MAPPA_PIN || "";
    const url = new URL(req.url);
    if (!pin || url.searchParams.get("pin") !== pin) return json({ error: "PIN errato" }, 401);
    const giorni = Math.min(Math.max(parseInt(url.searchParams.get("giorni") || "30", 10) || 30, 1), 3650);
    const da = new Date(Date.now() - giorni * 86400000).toISOString().slice(0, 10);
    const { blobs } = await store.list({ prefix: "p/" });
    const chiavi = blobs.map((x) => x.key).filter((k) => k.slice(2, 12) >= da).sort().reverse().slice(0, 2000);
    const righe = [];
    for (let i = 0; i < chiavi.length; i += 25) {
      const parte = await Promise.all(chiavi.slice(i, i + 25).map((k) => store.get(k, { type: "json" })));
      for (const r of parte) if (r) righe.push(r);
    }
    return json({ posizioni: righe });
  }

  return json({ error: "Metodo non permesso" }, 405);
};

export const config = { path: "/api/posizioni" };
