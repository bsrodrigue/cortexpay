#!/usr/bin/env bash

# ==============================================================================
# CortexPay — Script de Lancement Automatisé (Docker + Migrations + Backend API)
# ==============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "=================================================="
echo "🚀 [1/4] Démarrage des conteneurs Postgres & Redis"
echo "=================================================="
docker compose up -d postgres redis

echo "⏳ Attente de l'état healthy de PostgreSQL..."
until docker exec cortex_postgres pg_isready -U cortex -d cortex_pay > /dev/null 2>&1; do
    sleep 1
done
echo "✅ Base de données PostgreSQL prête."

echo "=================================================="
echo "📦 [2/4] Application des migrations SQL"
echo "=================================================="
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/001_initial_ledger.sql > /dev/null
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/002_cards_and_quotes.sql > /dev/null
echo "✅ Schéma comptable et cartes virtuelles synchronisés."

echo "=================================================="
echo "🐍 [3/4] Vérification de l'environnement Python"
echo "=================================================="
if [ ! -d ".venv" ]; then
    echo "Création de l'environnement virtuel avec uv..."
    uv venv .venv
    uv pip install -e backend
fi

source .venv/bin/activate

echo "=================================================="
echo "🧪 [4/4] Validation des tests de conformité (Optionnel)"
echo "=================================================="
if [ "$1" == "--test" ]; then
    echo "Exécution des tests pytest & Hypothesis..."
    pytest -v tests/
fi

echo "=================================================="
echo "🌐 Démarrage du serveur FastAPI sur http://localhost:8000"
echo "   - Swagger UI docs : http://localhost:8000/docs"
echo "   - Healthcheck     : http://localhost:8000/health"
echo "   (Arrêt avec Ctrl+C)"
echo "=================================================="
exec uvicorn backend.src.main:app --host 0.0.0.0 --port 8000 --reload
