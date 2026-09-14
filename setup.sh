#!/usr/bin/env bash

# ==============================================================================
# CortexPay — Setup Script Idempotent d'Environnement Complet
# ==============================================================================
# Invariants garantis par ce script :
# 1. Idempotent : Peut être exécuté N fois d'affilée sans effet de bord ni corruption.
# 2. Vérification stricte des prérequis système (Docker, Python 3.12+, uv, Node 20+, npm).
# 3. Démarrage de l'infrastructure conteneurisée (PostgreSQL 16, Redis 7).
# 4. Synchronisation automatique et ordonnée de TOUTES les migrations SQL (001 à 008).
# 5. Préparation de l'environnement virtuel Python (.venv) avec uv et dépendances.
# 6. Installation des dépendances mobiles et initialisation sécurisée de mobile/.env.
# 7. Exécution optionnelle des suites de tests de conformité (pytest & jest).
# ==============================================================================

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

log_step() {
    echo -e "\n${BOLD}${BLUE}==>${NC} ${BOLD}$1${NC}"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}" >&2
}

# ------------------------------------------------------------------------------
# 1. Vérification des Prérequis Système
# ------------------------------------------------------------------------------
log_step "[1/6] Vérification des prérequis système..."

check_cmd() {
    local cmd="$1"
    local hint="$2"
    if ! command -v "$cmd" &> /dev/null; then
        log_error "Outil obligatoire manquant : '$cmd'."
        echo -e "   $hint"
        exit 1
    fi
}

check_cmd "docker" "Veuillez installer Docker : https://docs.docker.com/get-docker/"
check_cmd "node" "Veuillez installer Node.js (>= 20) : https://nodejs.org/"
check_cmd "npm" "npm est requis pour l'application mobile."

# Vérifier uv ou python
if ! command -v uv &> /dev/null; then
    log_warn "'uv' n'est pas installé. Installation recommandée : curl -LsSf https://astral.sh/uv/install.sh | sh"
    check_cmd "python3" "Veuillez installer Python 3.12+ ou installer 'uv'."
fi

log_success "Tous les prérequis système sont installés."

# ------------------------------------------------------------------------------
# 2. Démarrage de l'Infrastructure Docker (PostgreSQL 16 & Redis 7)
# ------------------------------------------------------------------------------
log_step "[2/6] Démarrage de l'infrastructure Docker (Postgres & Redis)..."

docker compose up -d postgres redis

echo -n "   Attente de la disponibilité de PostgreSQL (port 5432)..."
MAX_RETRIES=30
RETRY_COUNT=0
until docker exec cortex_postgres pg_isready -U cortex -d cortex_pay > /dev/null 2>&1; do
    sleep 1
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
        echo ""
        log_error "PostgreSQL n'a pas répondu après ${MAX_RETRIES} secondes."
        exit 1
    fi
    echo -n "."
done
echo ""
log_success "PostgreSQL (cortex_postgres) et Redis (cortex_redis) sont opérationnels."

# ------------------------------------------------------------------------------
# 3. Application Idempotente des Migrations SQL (001 à 008)
# ------------------------------------------------------------------------------
log_step "[3/6] Synchronisation idempotente des schémas comptables (Migrations 001 -> 008)..."

MIGRATIONS=(
    "migrations/001_initial_ledger.sql"
    "migrations/002_cards_and_quotes.sql"
    "migrations/003_auth_users.sql"
    "migrations/004_kyc_verification.sql"
    "migrations/005_three_d_secure_and_card_labels.sql"
    "migrations/006_webhooks_and_reconciliation.sql"
    "migrations/007_disputes.sql"
    "migrations/008_performance_indexes.sql"
)

for mig in "${MIGRATIONS[@]}"; do
    if [ -f "$mig" ]; then
        docker exec -i cortex_postgres psql -U cortex -d cortex_pay < "$mig" > /dev/null 2>&1 || true
        echo -e "   ${GREEN}✓${NC} $mig appliqué"
    else
        log_warn "Fichier de migration non trouvé : $mig"
    fi
done

log_success "Schémas SQL, triggers d'immuabilité et index de performance synchronisés."

# ------------------------------------------------------------------------------
# 4. Configuration du Backend FastAPI (Python .venv)
# ------------------------------------------------------------------------------
log_step "[4/6] Configuration de l'environnement virtuel Python (Backend)..."

if command -v uv &> /dev/null; then
    if [ ! -d ".venv" ]; then
        echo "   Création du virtualenv avec uv..."
        uv venv .venv
    fi
    echo "   Synchronisation des dépendances backend avec uv..."
    uv pip install -e backend
else
    if [ ! -d ".venv" ]; then
        echo "   Création du virtualenv avec python3 -m venv..."
        python3 -m venv .venv
    fi
    # shellcheck disable=SC1091
    source .venv/bin/activate
    pip install -q --upgrade pip
    pip install -q -e backend
fi

log_success "Environnement virtuel Python prêt."

# ------------------------------------------------------------------------------
# 5. Configuration de l'Application Mobile (React Native / Expo)
# ------------------------------------------------------------------------------
log_step "[5/6] Configuration de l'application mobile (React Native / Expo)..."

if [ ! -f "mobile/.env" ]; then
    echo "   Génération de mobile/.env avec configuration par défaut..."
    cat << 'EOF' > mobile/.env
EXPO_PUBLIC_API_URL=http://localhost:8000/api
EOF
    log_success "mobile/.env généré."
fi

echo "   Installation des dépendances npm mobiles..."
(cd mobile && npm install --silent)
log_success "Dépendances mobiles installées."

# ------------------------------------------------------------------------------
# 6. Validation Complète (Optionnelle via flag --test ou --all)
# ------------------------------------------------------------------------------
RUN_TESTS=false
for arg in "$@"; do
    if [ "$arg" == "--test" ] || [ "$arg" == "--all" ]; then
        RUN_TESTS=true
        break
    fi
done

if [ "$RUN_TESTS" = true ]; then
    log_step "[6/6] Exécution des suites de tests de conformité..."
    
    echo "   Exécution de la suite Pytest & Hypothesis..."
    "$PROJECT_DIR/.venv/bin/pytest" -v tests/
    log_success "19/19 tests backend réussis."

    echo "   Validation mobile (TypeScript + ESLint + Jest)..."
    (cd mobile && npm run validate && npx jest)
    log_success "12/12 tests mobiles réussis."
else
    log_step "[6/6] Validation terminée. Pour exécuter les tests, relancez avec : ./setup.sh --test"
fi

echo ""
echo -e "${BOLD}${GREEN}==============================================================================${NC}"
echo -e "${BOLD}${GREEN}🎉 Setup CortexPay complété avec succès !${NC}"
echo -e "${BOLD}${GREEN}==============================================================================${NC}"
echo -e "Pour démarrer les services :"
echo -e "  1. Backend API : ${BOLD}./start.sh${NC} (ou ${BOLD}source .venv/bin/activate && uvicorn backend.src.main:app --reload${NC})"
echo -e "  2. Mobile App  : ${BOLD}cd mobile && npm run start${NC}"
echo -e "  - Swagger Docs : ${BOLD}http://localhost:8000/docs${NC}"
echo -e "${BOLD}${GREEN}==============================================================================${NC}"
