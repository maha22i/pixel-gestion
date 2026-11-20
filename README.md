# Pixel Nomade — Gestion financière

Web app interne : utilisateurs & droits, clients, projets, catalogue, devis → factures, suivi des paiements, dépenses, tableau de bord.

**Stack** : Next.js 14 (App Router, TypeScript) · Tailwind · PostgreSQL 16 + Drizzle ORM · sessions JWT (cookie httpOnly) · PDF générés côté serveur (pdfkit, police Carlito = équivalent Calibri) · Docker Compose.

---

## Déploiement sur le VPS

```bash
# 1. Copier le dossier sur le VPS puis :
cd pixel-finance
cp .env.example .env
nano .env            # mots de passe, AUTH_SECRET (openssl rand -base64 48), admin

# 2. Lancer
docker compose up -d --build

# 3. Suivre le démarrage
docker compose logs -f app
```

Au premier démarrage, l'app applique les migrations et crée l'administrateur défini par `ADMIN_EMAIL` / `ADMIN_PASSWORD` (uniquement si aucun utilisateur n'existe). Changez ensuite ce mot de passe depuis **Mon profil**.

L'app écoute sur `127.0.0.1:3000` : exposez-la via votre reverse proxy en HTTPS. Exemple Nginx :

```nginx
server {
  server_name gestion.pixel-nomade.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```
puis `certbot --nginx -d gestion.pixel-nomade.com`.

> Pour un test rapide en `http://IP:3000` sans HTTPS, mettez `COOKIE_SECURE=false` (sinon le navigateur refuse le cookie de session) et retirez `127.0.0.1:` du port dans `docker-compose.yml`.

### Mise à jour
```bash
docker compose up -d --build   # les migrations s'appliquent automatiquement
```

### Sauvegarde de la base
```bash
docker compose exec db pg_dump -U pixel pixel_finance | gzip > sauvegarde-$(date +%F).sql.gz
# restauration
gunzip -c sauvegarde.sql.gz | docker compose exec -T db psql -U pixel pixel_finance
```
À mettre en cron quotidien (`crontab -e`).

---

## Fonctionnement

| Module | Ce qu'il fait |
|---|---|
| **Utilisateurs & droits** (admin) | Rôles Admin / Utilisateur. Pour chaque utilisateur et chaque module : aucun accès / lecture / lecture + écriture. Droits vérifiés côté serveur sur chaque page, action et PDF. |
| **Clients** | Particulier / entreprise / institution, coordonnées, historique projets-devis-factures, total facturé, encaissé, reste dû. |
| **Projets** | Types : Mariage, Entreprise privée, Public, Autonome (interne, client facultatif). Pour un mariage : cases à cocher des types d'événement, avec une date par événement. Marge du projet = encaissé − dépenses rattachées. |
| **Catalogue** | Services et produits (catégorie, unité, prix FDJ, archivage). Onglet **Types d'événement** : vous saisissez vos événements de mariage. |
| **Devis** | Lignes depuis le catalogue ou libres, quantités, remise par ligne et globale, acompte %. Pour un mariage, chaque ligne est rattachée à un événement → le PDF regroupe par événement. Statuts, duplication, numéro **PN-AAAA-MMJJ-XXX**. |
| **Factures** | **Convertir en facture** en 1 clic depuis un devis (copie des lignes + échéancier acompte/solde, le projet passe en « Confirmé »). Facture directe possible. Numéro **FAC-AAAA-MMJJ-XXX**. Échéancier modifiable (plusieurs versements). |
| **Paiements** | Encaissement depuis la fiche facture (WAAFI, CACPAY, D-Money, virement, espèces + référence). Calcul automatique payé / reste à payer / statut (non payée, acompte versé, partielle, soldée) et **en retard** si une échéance est dépassée. Reçu PDF **REC-AAAA-MMJJ-XXX** à chaque paiement. |
| **Dépenses** | Par catégorie, rattachables à un projet ou en frais généraux. |
| **Tableau de bord** | Facturé / encaissé / dépenses / résultat du mois, impayés, retards, devis en attente, CA annuel, taux de conversion des devis, graphique 12 mois, CA par type de projet. |
| **Paramètres** (admin) | Coordonnées, modalités et moyens de paiement imprimés sur les PDF (tél. par défaut **+253 77 36 06 07**). |

Les compteurs XXX repartent à 001 chaque 1er janvier (un compteur par type de document).

---

## Développement local

```bash
npm install
cp .env.example .env    # DATABASE_URL=postgres://...@localhost:5432/pixel_finance
npm run db:migrate      # migrations + admin
npm run dev
```
Après modification de `src/db/schema.ts` : `npm run db:generate` (crée une nouvelle migration dans `drizzle/`).

### Structure
```
src/app/(app)/…        pages par module (+ actions serveur)
src/app/api/pdf/…      génération des PDF devis / facture / reçu
src/components/        éditeur de devis-factures, UI
src/lib/               auth & droits, numérotation, calculs, PDF, montant en lettres
src/db/schema.ts       schéma de la base
drizzle/               migrations SQL
scripts/migrate.mjs    migrations + création de l'admin au démarrage
```
