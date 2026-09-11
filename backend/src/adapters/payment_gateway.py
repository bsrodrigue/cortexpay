import asyncio
import uuid
from decimal import Decimal
from typing import Dict, Any
from pydantic import BaseModel

class MobileMoneyDepositRequest(BaseModel):
    user_id: str
    phone_number: str
    operator: str # 'WAVE' or 'ORANGE_MONEY'
    amount: Decimal
    otp_code: str # Expected "123456"

class PaymentGatewayResult(BaseModel):
    success: bool
    provider_tx_id: str
    message: str

class MockPaymentGateway:
    """
    Deterministic Mock Adapter for Mobile Money (Wave / Orange Money Push USSD).
    Allows full local testing without waiting for third-party sandbox / KYC.
    Simulates:
    - USSD push delivery
    - OTP validation (code 123456)
    - Deterministic network latency
    - Simulated failures if phone ends with 999
    """

    @staticmethod
    async def process_deposit(request: MobileMoneyDepositRequest) -> PaymentGatewayResult:
        # Simulate slight USSD prompt network latency (e.g. 50ms in local testing)
        await asyncio.sleep(0.05)

        # Failure test hook for chaos/error testing
        if request.phone_number.endswith("999"):
            return PaymentGatewayResult(
                success=False,
                provider_tx_id="",
                message="USSD Push timeout: user rejected USSD prompt."
            )

        if request.otp_code != "123456":
            return PaymentGatewayResult(
                success=False,
                provider_tx_id="",
                message="Invalid OTP code. Authentication failed."
            )

        if request.amount <= Decimal("0.0000"):
            return PaymentGatewayResult(
                success=False,
                provider_tx_id="",
                message="Invalid deposit amount."
            )

        tx_id = f"{request.operator[:3]}_TX_{uuid.uuid4().hex[:12]}"
        return PaymentGatewayResult(
            success=True,
            provider_tx_id=tx_id,
            message=f"Push USSD accepted on {request.operator}."
        )
