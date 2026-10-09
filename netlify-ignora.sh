#!/bin/bash
# Decide se Netlify deve ripubblicare (exit 1) o saltare (exit 0), per non consumare crediti.
# Il sito di Raffaella Pizzo è pubblicato su GitHub Pages: su Netlify resta solo la funzione delle richieste.
if [ "$SITE_NAME" = "raffaellapizzo" ]; then
  echo "raffaellapizzo: pubblicato su GitHub Pages, nessuna ripubblicazione su Netlify"; exit 0
fi
# spettacolando-iscriviti: ripubblica solo se cambiano le sue pagine, funzioni o configurazione
git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- tesseramento associati app mappa lib netlify/functions/posizioni.mjs _redirects netlify.toml package.json
