import pytest
from decimal import Decimal
import uuid
import asyncpg
from backend.src.core.config import settings
from backend.src.core.state_machine import (
    DisputeStateMachine,
    DisputeStatus,
    DisputeEvent,
    CardStateMachine,
    CardStatus,
    CardEvent,
    ThreeDSStateMachine,
    ThreeDSStatus,
    ThreeDSEvent,
    InvalidStateTransitionError,
)

def test_dispute_state_machine_transitions():
    # 1. Normal Winning Lifecycle: OPENED -> UNDER_REVIEW -> WON_REFUNDED
    assert DisputeStateMachine.get_next_state(DisputeStatus.OPENED, DisputeEvent.SUBMIT_EVIDENCE) == DisputeStatus.UNDER_REVIEW
    assert DisputeStateMachine.get_next_state(DisputeStatus.UNDER_REVIEW, DisputeEvent.RESOLVE_WIN) == DisputeStatus.WON_REFUNDED

    # 2. Terminal State Invariant: WON_REFUNDED cannot transition
    with pytest.raises(InvalidStateTransitionError, match="Illegal dispute transition"):
        DisputeStateMachine.get_next_state(DisputeStatus.WON_REFUNDED, DisputeEvent.RESOLVE_LOSE)

    with pytest.raises(InvalidStateTransitionError, match="Illegal dispute transition"):
        DisputeStateMachine.get_next_state(DisputeStatus.WON_REFUNDED, DisputeEvent.SUBMIT_EVIDENCE)

    # 3. Normal Losing Lifecycle: OPENED -> LOST_CLOSED or UNDER_REVIEW -> LOST_CLOSED
    assert DisputeStateMachine.get_next_state(DisputeStatus.OPENED, DisputeEvent.WITHDRAW) == DisputeStatus.LOST_CLOSED
    assert DisputeStateMachine.get_next_state(DisputeStatus.UNDER_REVIEW, DisputeEvent.RESOLVE_LOSE) == DisputeStatus.LOST_CLOSED

    # 4. Terminal State Invariant: LOST_CLOSED cannot transition
    with pytest.raises(InvalidStateTransitionError, match="Illegal dispute transition"):
        DisputeStateMachine.get_next_state(DisputeStatus.LOST_CLOSED, DisputeEvent.RESOLVE_WIN)

def test_card_state_machine_transitions():
    # 1. Active <-> Frozen
    assert CardStateMachine.get_next_state(CardStatus.ACTIVE, CardEvent.FREEZE) == CardStatus.FROZEN
    assert CardStateMachine.get_next_state(CardStatus.FROZEN, CardEvent.UNFREEZE) == CardStatus.ACTIVE

    # 2. Terminated is irreversible
    assert CardStateMachine.get_next_state(CardStatus.ACTIVE, CardEvent.TERMINATE) == CardStatus.TERMINATED
    with pytest.raises(InvalidStateTransitionError, match="Illegal card transition"):
        CardStateMachine.get_next_state(CardStatus.TERMINATED, CardEvent.ACTIVATE)

    with pytest.raises(InvalidStateTransitionError, match="Illegal card transition"):
        CardStateMachine.get_next_state(CardStatus.TERMINATED, CardEvent.UNFREEZE)

def test_three_ds_state_machine_transitions():
    # 1. Success Terminal
    assert ThreeDSStateMachine.get_next_state(ThreeDSStatus.CHALLENGE_ISSUED, ThreeDSEvent.VERIFY_SUCCESS) == ThreeDSStatus.CHALLENGE_SUCCESS
    with pytest.raises(InvalidStateTransitionError, match="Illegal 3DS transition"):
        ThreeDSStateMachine.get_next_state(ThreeDSStatus.CHALLENGE_SUCCESS, ThreeDSEvent.VERIFY_FAIL)

    # 2. Expired Terminal
    assert ThreeDSStateMachine.get_next_state(ThreeDSStatus.CHALLENGE_ISSUED, ThreeDSEvent.TIMEOUT) == ThreeDSStatus.EXPIRED
    with pytest.raises(InvalidStateTransitionError, match="Illegal 3DS transition"):
        ThreeDSStateMachine.get_next_state(ThreeDSStatus.EXPIRED, ThreeDSEvent.VERIFY_SUCCESS)


@pytest.mark.asyncio(loop_scope="function")
async def test_dispute_end_to_end_chargeback_flow(client):
    """
    End-to-end integration test of dispute FSM lifecycle & atomic double-entry chargeback:
    1. Register user & KYC approval
    2. Fund XOF -> Convert to USD -> Issue virtual card
    3. Merchant debit 35.00 USD at AWS
    4. Open Dispute for 35.00 USD -> Status OPENED
    5. Attempt invalid transition (e.g. resolve without review or duplicate dispute) -> 400
    6. Submit Evidence -> Status UNDER_REVIEW
    7. Resolve WON -> Status WON_REFUNDED & Verify double-entry chargeback posted to USD wallet
    8. Attempt second resolution on terminal state -> Rejection 400
    """
    user_email = f"disp_{uuid.uuid4().hex[:8]}@cortexcard.test"
    reg_res = await client.post("/api/auth/register/", json={
        "email": user_email,
        "password": "Password123!",
        "first_name": "Dispute",
        "last_name": "Tester"
    })
    assert reg_res.status_code == 200
    user_id = reg_res.json()["user_id"]

    # Approve KYC
    await client.post("/api/kyc/simulate-decision", json={
        "user_id": user_id,
        "decision": "APPROVED",
        "tier": 1
    })

    # Deposit 50,000 XOF
    await client.post("/api/deposit/mobile-money", json={
        "user_id": user_id,
        "phone_number": "+221770000022",
        "operator": "WAVE",
        "amount": "50000.0000",
        "otp_code": "123456"
    })

    # Convert XOF to USD
    quote_res = await client.post("/api/fx/quote", json={
        "user_id": user_id,
        "from_amount_xof": "40000.0000"
    })
    assert quote_res.status_code == 200
    quote_id = quote_res.json()["quote_id"]

    conv_res = await client.post("/api/fx/convert", json={
        "user_id": user_id,
        "quote_id": quote_id,
        "idempotency_key": f"CONV_{uuid.uuid4().hex[:10]}"
    })
    assert conv_res.status_code == 200

    # Issue Card with 50.00 USD funding
    card_res = await client.post("/api/cards/issue", json={
        "user_id": user_id,
        "cardholder_name": "Dispute Tester",
        "initial_funding_usd": "50.0000",
        "card_type": "STANDARD"
    })
    assert card_res.status_code == 200
    card_id = card_res.json()["card_id"]

    # Simulate 35.00 USD debit at AWS Cloud
    debit_res = await client.post("/api/cards/simulate-merchant-debit", json={
        "card_id": card_id,
        "merchant_name": "AWS Cloud Services",
        "amount_usd": "35.0000"
    })
    assert debit_res.status_code == 200
    tx_id = debit_res.json()["transaction_id"]

    # 1. Open Dispute -> Must be OPENED
    open_res = await client.post("/api/disputes/open", json={
        "user_id": user_id,
        "transaction_reference": tx_id,
        "card_id": card_id,
        "amount": "35.0000",
        "reason": "FRAUD_OR_UNAUTHORIZED_CHARGE",
        "description": "AWS unauthorized recurring subscription"
    })
    assert open_res.status_code == 200
    disp_data = open_res.json()
    dispute_id = disp_data["dispute_id"]
    assert disp_data["status"] == "OPENED"
    assert Decimal(str(disp_data["amount"])) == Decimal("35.0000")

    # 2. Duplicate Dispute on active transaction must fail
    dup_disp = await client.post("/api/disputes/open", json={
        "user_id": user_id,
        "transaction_reference": tx_id,
        "card_id": card_id,
        "amount": "35.0000",
        "reason": "FRAUD_OR_UNAUTHORIZED_CHARGE"
    })
    assert dup_disp.status_code == 400
    assert "already exists" in dup_disp.json()["detail"].lower()

    # 3. Submit Evidence -> Moves FSM to UNDER_REVIEW
    evid_res = await client.post(f"/api/disputes/{dispute_id}/evidence", json={
        "evidence_url": "https://storage.cortexcard.test/evidence/dispute_123.pdf",
        "description": "Screenshot of AWS portal with wrong account billing"
    })
    assert evid_res.status_code == 200
    assert evid_res.json()["status"] == "UNDER_REVIEW"

    # 4. Resolve Dispute: WIN -> Transitions to WON_REFUNDED and executes double-entry refund
    resolve_res = await client.post(f"/api/disputes/{dispute_id}/resolve", json={
        "decision": "WON",
        "resolution_notes": "Chargeback confirmed by card network arbitration"
    })
    assert resolve_res.status_code == 200
    resolved_data = resolve_res.json()
    assert resolved_data["status"] == "WON_REFUNDED"
    assert "journal_entry" in resolved_data

    # 5. Check user USD wallet: must reflect the refunded 35.00 USD
    wallets_res = await client.get(f"/api/wallets/{user_id}")
    assert wallets_res.status_code == 200
    usd_wallet = wallets_res.json()["wallets"]["USD"]
    # User had converted ~60 USD, sent 50 to card (leaving ~10 in wallet), now refunded +35.00 USD -> ~45 USD
    assert Decimal(str(usd_wallet["balance"])) >= Decimal("35.0000")

    # 6. Terminal State Guarantee: Attempting to resolve or modify an already WON dispute must be strictly rejected
    illegal_res = await client.post(f"/api/disputes/{dispute_id}/resolve", json={
        "decision": "LOST"
    })
    assert illegal_res.status_code == 400
    assert "illegal dispute transition" in illegal_res.json()["detail"].lower()
