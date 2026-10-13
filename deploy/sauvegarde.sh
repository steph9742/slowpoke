#!/usr/bin/env bash
# Sauvegarde de la base Slowpoke.
#
# Repris du Catalogue, où une base a été entièrement perdue lors d'une saturation disque :
# la seule sauvegarde présente faisait 0 octet — elle avait échoué sans que personne ne le
# sache. Ce script REFUSE donc de considérer une sauvegarde comme réussie tant qu'il ne
# l'a pas vérifiée : taille minimale, archive lisible, et présence effective de tables.
#
# Usage :
#   ./deploy/sauvegarde.sh                 # sauvegarde horodatée
#   ./deploy/sauvegarde.sh --avant-migration
#   ./deploy/sauvegarde.sh --restaurer <fichier.sql.gz>
#   ./deploy/sauvegarde.sh --restaurer-pieces <fichier.tar.gz>
#
# Chaque passage sauvegarde la base ET les pièces jointes des incidents (volume
# `uploads-data`) : une base restaurée sans ses pièces référence des fichiers disparus.
#
# La clé de `.secrets/` n'est PAS incluse, volontairement : ces sauvegardes quittent la
# machine, et y joindre la clé qui déchiffre les jetons livrerait la serrure avec la porte.
# Elle se sauvegarde à part.
#
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${SLOWPOKE_BACKUP_DIR:-$RACINE/backup}"
SERVICE_DB="postgres"
BASE="${POSTGRES_DB:-slowpoke}"
UTILISATEUR="${POSTGRES_USER:-postgres}"
RETENTION="${SLOWPOKE_BACKUP_KEEP:-14}"   # nombre de sauvegardes conservées

# Taille en dessous de laquelle un dump est forcément invalide (un schéma vide pèse déjà
# plusieurs Ko ; 1 Ko attrape le cas « fichier vide » qui nous a piégés).
TAILLE_MIN=1024

cd "$RACINE"
mkdir -p "$DEST"

compose() { docker compose "$@"; }

restaurer() {
  local fichier="$1"
  [[ -f "$fichier" ]] || { echo "❌ Fichier introuvable : $fichier" >&2; exit 1; }
  echo "⚠️  Restauration de « $fichier » dans la base « $BASE »."
  echo "    Le contenu actuel sera REMPLACÉ. Ctrl-C pour annuler, Entrée pour continuer."
  read -r _
  if [[ "$fichier" == *.gz ]]; then
    gunzip -c "$fichier" | compose exec -T "$SERVICE_DB" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  else
    compose exec -T "$SERVICE_DB" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$fichier"
  fi
  echo "✅ Restauration terminée."
}

SERVICE_APP="server"

restaurer_pieces() {
  local fichier="$1"
  [[ -f "$fichier" ]] || { echo "❌ Fichier introuvable : $fichier" >&2; exit 1; }
  # L'empreinte est vérifiée AVANT d'écraser quoi que ce soit : une archive altérée ne doit
  # pas remplacer des pièces saines.
  if [[ -f "$fichier.sha256" ]]; then
    ( cd "$(dirname "$fichier")" && sha256sum -c "$(basename "$fichier").sha256" ) \
      || { echo "❌ Empreinte non conforme — restauration refusée." >&2; exit 1; }
  else
    echo "⚠️  Aucune empreinte à côté de l'archive : intégrité non vérifiable."
  fi
  echo "⚠️  Restauration des pièces jointes depuis « $fichier »."
  echo "    Les fichiers de même nom seront REMPLACÉS. Ctrl-C pour annuler, Entrée pour continuer."
  read -r _
  compose exec -T "$SERVICE_APP" sh -c 'tar -C /app -xzf -' < "$fichier"
  echo "✅ Pièces restaurées."
}

if [[ "${1:-}" == "--restaurer" ]]; then
  restaurer "${2:-}"
  exit 0
fi

if [[ "${1:-}" == "--restaurer-pieces" ]]; then
  restaurer_pieces "${2:-}"
  exit 0
fi

suffixe=""
[[ "${1:-}" == "--avant-migration" ]] && suffixe="-avant-migration"

horodatage="$(date +%Y%m%d-%H%M%S)"
fichier="$DEST/slowpoke-$horodatage$suffixe.sql.gz"

echo "→ Sauvegarde de « $BASE » vers $fichier"
# --clean --if-exists : le dump peut être rejoué sur une base existante.
if ! compose exec -T "$SERVICE_DB" sh -c 'pg_dump -U "$POSTGRES_USER" --clean --if-exists "$POSTGRES_DB"' | gzip > "$fichier"; then
  rm -f "$fichier"
  echo "❌ Échec du pg_dump — aucune sauvegarde produite." >&2
  exit 1
fi

# --- Vérifications : une sauvegarde non vérifiée n'est pas une sauvegarde ---------------
taille=$(wc -c < "$fichier" | tr -d ' ')
if [[ "$taille" -lt "$TAILLE_MIN" ]]; then
  echo "❌ Sauvegarde suspecte : $taille octets (< $TAILLE_MIN). Fichier supprimé." >&2
  rm -f "$fichier"
  exit 1
fi
if ! gunzip -t "$fichier" 2>/dev/null; then
  echo "❌ Archive illisible. Fichier supprimé." >&2
  rm -f "$fichier"
  exit 1
fi
# Le dump doit contenir des créations de tables. On parcourt TOUT le fichier : avec
# --clean, pg_dump écrit d'abord des centaines d'instructions DROP, et se limiter aux
# premières lignes ferait rejeter une sauvegarde parfaitement valide.
nb_tables=$(gunzip -c "$fichier" | grep -c "^CREATE TABLE" || true)
if [[ "${nb_tables:-0}" -lt 1 ]]; then
  echo "❌ Aucune table dans le dump — contenu invalide. Fichier supprimé." >&2
  rm -f "$fichier"
  exit 1
fi

lisible=$(du -h "$fichier" | cut -f1)
echo "✅ Sauvegarde vérifiée : $fichier ($lisible, $nb_tables tables)"

# --- Pièces jointes ---------------------------------------------------------------------
pieces="$DEST/slowpoke-uploads-$horodatage$suffixe.tar.gz"
echo "→ Pièces jointes vers $pieces"
if ! compose exec -T "$SERVICE_APP" sh -c 'tar -C /app -czf - uploads' > "$pieces"; then
  rm -f "$pieces"
  echo "❌ Échec de l'archivage des pièces jointes. La base est sauvegardée, les pièces NON." >&2
  exit 1
fi
if ! gzip -t "$pieces" 2>/dev/null; then
  rm -f "$pieces"
  echo "❌ Archive des pièces illisible. Fichier supprimé." >&2
  exit 1
fi
nb_pieces=$(tar -tzf "$pieces" | grep -vc '/$' || true)
( cd "$DEST" && sha256sum "$(basename "$pieces")" > "$(basename "$pieces").sha256" )
echo "✅ Pièces vérifiées : $pieces ($(du -h "$pieces" | cut -f1), ${nb_pieces:-0} fichier(s), empreinte à côté)"

# --- Rotation ---------------------------------------------------------------------------
# Les sauvegardes « avant migration » sont conservées à part : ce sont les plus précieuses.
nb=$(ls -1t "$DEST"/slowpoke-*.sql.gz 2>/dev/null | { grep -v -- "-avant-migration" || true; } | wc -l | tr -d ' ')
if [[ "$nb" -gt "$RETENTION" ]]; then
  ls -1t "$DEST"/slowpoke-*.sql.gz | { grep -v -- "-avant-migration" || true; } | tail -n +$((RETENTION + 1)) | while read -r vieux; do
    echo "   rotation : suppression de $(basename "$vieux")"
    rm -f "$vieux"
  done
fi

nb=$(ls -1t "$DEST"/slowpoke-uploads-*.tar.gz 2>/dev/null | { grep -v -- "-avant-migration" || true; } | wc -l | tr -d ' ')
if [[ "$nb" -gt "$RETENTION" ]]; then
  ls -1t "$DEST"/slowpoke-uploads-*.tar.gz | { grep -v -- "-avant-migration" || true; } | tail -n +$((RETENTION + 1)) | while read -r vieux; do
    echo "   rotation : suppression de $(basename "$vieux")"
    rm -f "$vieux" "$vieux.sha256"
  done
fi
