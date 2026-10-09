// Richieste di consulenza dal sito di Raffaella Pizzo.
// POST: il sito invia il PDF della richiesta (dati del cliente + foto). Il file viene conservato
//       e la funzione risponde con un codice segreto per aprirlo.
// GET:  apre il PDF (serve id + codice k, contenuti nel link mandato a Raffaella).
// Indirizzo: /.netlify/functions/richiesta (percorso riservato di Netlify, non toccato dai redirect).
import { getStore } from "@netlify/blobs";

const MAX = 5.8 * 1024 * 1024; // limite del corpo di una funzione Netlify: 6 MB

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const casuale = (n) => {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  const v = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(v, (x) => a[x % a.length]).join("");
};

export default async (req) => {
  const store = getStore({ name: "richieste", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "POST") {
    const dati = await req.arrayBuffer();
    if (dati.byteLength < 100) return json({ error: "Il PDF è vuoto" }, 400);
    if (dati.byteLength > MAX) return json({ error: "Il PDF è troppo grande" }, 413);
    const testa = new TextDecoder().decode(new Uint8Array(dati, 0, 5));
    if (testa !== "%PDF-") return json({ error: "Il file non è un PDF" }, 400);
    const nome = String(url.searchParams.get("nome") || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cliente";
    const at = new Date().toISOString();
    const id = at.slice(0, 10) + "-" + nome + "-" + casuale(5);
    const k = casuale(20);
    await store.set("pdf/" + id, dati, { metadata: { k, at } });
    return json({ ok: true, id, k });
  }

  if (req.method === "GET") {
    const id = String(url.searchParams.get("id") || "");
    const k = String(url.searchParams.get("k") || "");
    if (!/^[A-Za-z0-9-]{8,80}$/.test(id) || !k) return json({ error: "Richiesta non trovata" }, 404);
    const r = await store.getWithMetadata("pdf/" + id, { type: "arrayBuffer" });
    if (!r || !r.metadata || r.metadata.k !== k) return json({ error: "Richiesta non trovata" }, 404);
    return new Response(r.data, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="Richiesta-${id}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  }

  return json({ error: "Metodo non permesso" }, 405);
};
