from decimal import Decimal
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime

class AccountType(str, Enum):
    ASSET_WALLET = "ASSET_WALLET"
    FX_CLEARING = "FX_CLEARING"
    PAYMENT_PARTNER = "PAYMENT_PARTNER"
    REVENUE_SPREAD = "REVENUE_SPREAD"
    SYSTEM_EQUITY = "SYSTEM_EQUITY"

class PostingDirection(str, Enum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"

class PostingCreate(BaseModel):
    account_id: UUID
    amount: Decimal = Field(gt=Decimal("0.0000"), decimal_places=4)
    direction: PostingDirection
    currency: str
    sequence_no: int

class JournalEntryCreate(BaseModel):
    idempotency_key: str
    reference: str
    narration: str
    postings: List[PostingCreate]

class AccountResponse(BaseModel):
    id: UUID
    account_number: str
    user_id: str
    currency: str
    type: AccountType
    balance: Decimal
    created_at: datetime

class FXQuoteResponse(BaseModel):
    quote_id: str
    user_id: str
    from_currency: str
    to_currency: str
    from_amount: Decimal
    to_amount: Decimal
    market_rate: Decimal
    spread_pct: Decimal
    effective_rate: Decimal
    expires_at: datetime
    ttl_remaining_seconds: int

class VirtualCardResponse(BaseModel):
    card_id: str
    user_id: str
    currency: str
    masked_pan: str
    expiry_month: int
    expiry_year: int
    cardholder_name: str
    status: str
    balance: Decimal
    spending_limit_monthly: Decimal
    current_month_spent: Decimal
    created_at: datetime

class VirtualCardDetails(VirtualCardResponse):
    pan: str
    cvv: str
