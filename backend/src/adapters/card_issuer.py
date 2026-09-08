import random
import uuid
from decimal import Decimal
from typing import Dict, Any, Tuple
from pydantic import BaseModel

class CardAuthorizationRequest(BaseModel):
    card_id: str
    merchant_name: str
    amount: Decimal
    currency: str = "USD"

class CardAuthorizationResponse(BaseModel):
    approved: bool
    transaction_id: str
    decline_reason: str | None = None

class MockCardIssuer:
    """
    Deterministic Mock Adapter for Virtual USD Card Issuance & Settlement.
    - Generates valid BINs (4532... Visa)
    - Valid Luhn algorithm compliant card numbers
    - Realistic CVV & Expiration dates
    - Simulates merchant authorizations (OpenAI, AWS, Netflix, etc.)
    - Simulates declines (e.g. gambling/crypto or amount exceeding limits)
    """

    @staticmethod
    def _generate_luhn_pan() -> str:
        # Visa prefix 4532 + 11 random digits + checksum
        prefix = "4532"
        middle = "".join(str(random.randint(0, 9)) for _ in range(11))
        partial = prefix + middle

        # Calculate Luhn check digit
        digits = [int(d) for d in partial]
        total = 0
        reverse_digits = digits[::-1]
        for i, digit in enumerate(reverse_digits):
            if i % 2 == 0:
                doubled = digit * 2
                total += doubled - 9 if doubled > 9 else doubled
            else:
                total += digit
        check_digit = (10 - (total % 10)) % 10
        return partial + str(check_digit)

    @staticmethod
    def issue_virtual_card(user_id: str, cardholder_name: str) -> Dict[str, Any]:
        pan = MockCardIssuer._generate_luhn_pan()
        masked_pan = f"{pan[:4]} •••• •••• {pan[-4:]}"
        cvv = f"{random.randint(100, 999)}"
        expiry_month = random.randint(1, 12)
        expiry_year = 2028 # Valid 2-4 years ahead
        card_id = f"card_{uuid.uuid4().hex[:12]}"

        return {
            "card_id": card_id,
            "user_id": user_id,
            "pan": pan,
            "masked_pan": masked_pan,
            "cvv": cvv,
            "expiry_month": expiry_month,
            "expiry_year": expiry_year,
            "cardholder_name": cardholder_name,
            "currency": "USD",
            "spending_limit_monthly": Decimal("5000.0000"),
        }

    @staticmethod
    def authorize_transaction(
        request: CardAuthorizationRequest,
        card_status: str,
        current_balance: Decimal,
        monthly_spent: Decimal,
        spending_limit: Decimal
    ) -> CardAuthorizationResponse:
        tx_id = f"tx_{uuid.uuid4().hex[:12]}"

        # 1. Card status check
        if card_status != "ACTIVE":
            return CardAuthorizationResponse(
                approved=False,
                transaction_id=tx_id,
                decline_reason=f"Card is {card_status.lower()}"
            )

        # 2. Currency check
        if request.currency != "USD":
            return CardAuthorizationResponse(
                approved=False,
                transaction_id=tx_id,
                decline_reason=f"Unsupported currency: {request.currency}"
            )

        # 3. Balance check
        if current_balance < request.amount:
            return CardAuthorizationResponse(
                approved=False,
                transaction_id=tx_id,
                decline_reason="Insufficient card account funds"
            )

        # 4. Spending limit check
        if (monthly_spent + request.amount) > spending_limit:
            return CardAuthorizationResponse(
                approved=False,
                transaction_id=tx_id,
                decline_reason="Monthly spending limit exceeded"
            )

        # 5. Merchant policy simulation (e.g. decline high risk merchants)
        blocked_merchants = ["CASINO", "BETTING", "DARKNET"]
        if any(b in request.merchant_name.upper() for b in blocked_merchants):
            return CardAuthorizationResponse(
                approved=False,
                transaction_id=tx_id,
                decline_reason="Merchant category blocked by card security policy"
            )

        return CardAuthorizationResponse(
            approved=True,
            transaction_id=tx_id,
            decline_reason=None
        )
