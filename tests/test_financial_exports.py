import pytest
from datetime import date
from decimal import Decimal
import uuid
import asyncpg
from backend.src.core.config import settings
from backend.src.services.export_service import FinancialExportService
from backend.src.services.webhook_service import ReconciliationService
from backend.src.services.cortex_orchestrator import CortexOrchestrator
from backend.src.adapters.payment_gateway import MobileMoneyDepositRequest

@pytest.mark.asyncio(loop_scope="function")
async def test_financial_export_service_edge_cases(client):
    """
    Test direct service methods for FinancialExportService:
    1. Export empty/populated ledger CSV
    2. User-specific vs global ledger CSV filtering
    3. Handling nonexistent reconciliation batch errors
    4. Exact decimal format verification in CSV output
    """
    conn = await asyncpg.connect(settings.DATABASE_URL)
    try:
        # 1. Nonexistent batch throws ValueError directly in FinancialExportService
        with pytest.raises(ValueError, match="Reconciliation batch 'NONEXISTENT_999' not found."):
            await FinancialExportService.export_reconciliation_csv(conn, "NONEXISTENT_999")
    finally:
        await conn.close()

    bad_batch_res = await client.get("/api/export/reconciliation/NONEXISTENT_BATCH_999/csv")
    assert bad_batch_res.status_code == 404
    assert "not found" in bad_batch_res.json()["detail"].lower()

    # 2. Setup user and isolated deposit
    user_email = f"export_test_{uuid.uuid4().hex[:8]}@cortexcard.test"
    reg_res = await client.post("/api/auth/register/", json={
        "email": user_email,
        "password": "Password123!",
        "first_name": "Export",
        "last_name": "Tester"
    })
    assert reg_res.status_code == 200
    user_id = reg_res.json()["user_id"]

    dep_res = await client.post("/api/deposit/mobile-money", json={
        "user_id": user_id,
        "phone_number": "+221770000011",
        "operator": "WAVE",
        "amount": "45000.0000",
        "otp_code": "123456"
    })
    assert dep_res.status_code == 200
    tx_ref = dep_res.json()["gateway_result"]["provider_tx_id"]

    # 3. Export filtered by user_id
    user_csv_res = await client.get(f"/api/export/ledger/csv?user_id={user_id}")
    assert user_csv_res.status_code == 200
    user_csv = user_csv_res.text
    assert tx_ref in user_csv
    assert "45000.0000" in user_csv
    assert f"cortex_ledger_{user_id}_" in user_csv_res.headers["content-disposition"]

    # 4. Export without filter (system-wide)
    all_csv_res = await client.get("/api/export/ledger/csv?limit=50")
    assert all_csv_res.status_code == 200
    all_csv = all_csv_res.text
    assert "Entry ID" in all_csv
    assert tx_ref in all_csv
