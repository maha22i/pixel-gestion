#!/bin/sh
# Reconstruit les conteneurs à partir du code déjà mis à jour.
# Le fichier .env et les volumes Docker (base, uploads) ne sont pas touchés.
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Fichier .env manquant dans $(pwd). Le déploiement ne le crée pas." >&2
  exit 1
fi

docker compose up -d --build
docker compose ps
