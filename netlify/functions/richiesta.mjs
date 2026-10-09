// Richieste di consulenza dal sito di Raffaella Pizzo.
// POST: il sito invia il PDF della richiesta (dati del cliente + foto) e i dati del modulo.
//       Il PDF viene conservato e, se è impostata la chiave Resend, parte un'email
//       a Raffaella con il PDF allegato.
// GET:  apre il PDF (serve id + codice k, contenuti nel link mandato a Raffaella).
// Indirizzo: /.netlify/functions/richiesta (percorso riservato di Netlify, non toccato dai redirect).
//
// Variabili di ambiente (progetto Netlify "raffaellapizzo"):
//   RESEND_API_KEY   chiave del servizio Resend (senza, l'email non parte ma il PDF resta salvato)
//   RICHIESTE_EMAIL  destinatario delle richieste (predefinito: spettacolandoeventi@gmail.com)
//   RICHIESTE_FROM   mittente (predefinito: indirizzo di prova di Resend)
import { getStore } from "@netlify/blobs";

const MAX = 5.8 * 1024 * 1024; // limite del corpo di una funzione Netlify: 6 MB

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const env = (k) => String((globalThis.Netlify && Netlify.env.get(k)) || process.env[k] || "").trim();

const casuale = (n) => {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  const v = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(v, (x) => a[x % a.length]).join("");
};

const pulisci = (s, max) => String(s || "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function inviaEmail({ dati, id, link, pdf }) {
  const key = env("RESEND_API_KEY");
  if (!key) return { inviata: false, motivo: "chiave Resend non impostata" };
  const a = env("RICHIESTE_EMAIL") || "spettacolandoeventi@gmail.com";
  const da = env("RICHIESTE_FROM") || "Sito Raffaella Pizzo <onboarding@resend.dev>";
  const righe = [
    ["Nome", dati.nome], ["Telefono", dati.telefono], ["Evento", dati.evento], ["Data", dati.data || "Da definire"],
    ["Location", dati.location || "Da definire"], ["Ospiti", dati.ospiti ? "circa " + dati.ospiti : "Da definire"],
    ["Foto allegate", dati.foto || "0"],
  ];
  const html = `<div style="font-family:Georgia,serif;color:#1c2b45;max-width:560px">
  <h2 style="font-weight:normal;margin:0 0 4px">Nuova richiesta dal sito</h2>
  <p style="margin:0 0 18px;color:#66708a">Raffaella Pizzo · Luxury Events</p>
  <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px">
  ${righe.map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid #e7e1d4;color:#66708a;width:130px">${k}</td><td style="padding:8px 0;border-bottom:1px solid #e7e1d4">${esc(v || "—")}</td></tr>`).join("")}
  </table>
  ${dati.messaggio ? `<p style="font-family:Arial,sans-serif;font-size:14px;margin:18px 0 0"><b>Il desiderio del cliente</b><br>${esc(dati.messaggio).replace(/\n/g, "<br>")}</p>` : ""}
  <p style="font-family:Arial,sans-serif;font-size:14px;margin:22px 0 0">Il PDF completo con le foto è allegato. Si può aprire anche da qui: <a href="${esc(link)}">apri il PDF</a></p>
  ${dati.telefono ? `<p style="font-family:Arial,sans-serif;font-size:14px">Per rispondere su WhatsApp: <a href="https://wa.me/39${esc(String(dati.telefono).replace(/\D/g, "").replace(/^39(?=\d{9,10}$)/, ""))}">scrivi a ${esc(dati.nome)}</a></p>` : ""}
  </div>`;
  const oggetto = `Nuova richiesta: ${dati.evento || "evento"} – ${dati.nome}${dati.data ? " (" + dati.data + ")" : ""}`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({
      from: da, to: [a], subject: oggetto, html,
      attachments: [{ filename: `Richiesta-${id}.pdf`, content: Buffer.from(pdf).toString("base64") }],
    }),
  });
  if (!r.ok) return { inviata: false, motivo: "Resend " + r.status + " " + (await r.text()).slice(0, 200) };
  return { inviata: true };
}

export default async (req) => {
  const store = getStore({ name: "richieste", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "POST") {
    let form;
    try { form = await req.formData(); } catch { return json({ error: "Richiesta non valida" }, 400); }
    const file = form.get("pdf");
    if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Manca il PDF" }, 400);
    const pdf = await file.arrayBuffer();
    if (pdf.byteLength < 100) return json({ error: "Il PDF è vuoto" }, 400);
    if (pdf.byteLength > MAX) return json({ error: "Il PDF è troppo grande" }, 413);
    if (new TextDecoder().decode(new Uint8Array(pdf, 0, 5)) !== "%PDF-") return json({ error: "Il file non è un PDF" }, 400);
    if (pulisci(form.get("bot-field"), 10)) return json({ ok: true }); // trappola anti-spam

    const dati = {
      nome: pulisci(form.get("nome"), 80) || "Cliente",
      telefono: pulisci(form.get("telefono"), 30),
      evento: pulisci(form.get("evento"), 60),
      data: pulisci(form.get("data"), 20),
      location: pulisci(form.get("location"), 120),
      ospiti: pulisci(form.get("ospiti"), 10),
      messaggio: pulisci(form.get("messaggio"), 3000),
      foto: pulisci(form.get("foto"), 2),
    };
    const nome = dati.nome.normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cliente";
    const at = new Date().toISOString();
    const id = at.slice(0, 10) + "-" + nome + "-" + casuale(5);
    const k = casuale(20);
    await store.set("pdf/" + id, pdf, { metadata: { k, at } });
    const link = url.origin + "/.netlify/functions/richiesta?id=" + encodeURIComponent(id) + "&k=" + k;

    let email;
    try { email = await inviaEmail({ dati, id, link, pdf }); }
    catch (e) { email = { inviata: false, motivo: String(e).slice(0, 200) }; }
    if (!email.inviata) console.log("Email non inviata:", email.motivo);
    return json({ ok: true, id, k, email: email.inviata });
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
