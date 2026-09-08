import pytest
from decimal import Decimal
from uuid import uuid4
from hypothesis import given, strategies as st, settings, HealthCheck

from backend.src.domain.models import PostingCreate, PostingDirection, JournalEntryCreate
from backend.src.services.ledger import LedgerService, UnbalancedJournalEntryError

# Strategy to generate valid positive financial amounts as strict Decimal with up to 4 decimal places
amount_strategy = st.decimals(
    min_value=Decimal("0.0001"),
    max_value=Decimal("1000000.0000"),
    places=4
)

@given(st.lists(amount_strategy, min_size=1, max_size=10))
@settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
def test_balanced_entries_invariant_pass(amounts):
    """
    Hypothesis property test:
    Invariant: Débit = Crédit mathématique.
    Any balanced entry must pass without raising UnbalancedJournalEntryError.
    """
    total = sum(amounts)
    account_a = uuid4()
    account_b = uuid4()

    postings = []
    # Generate balanced postings
    for i, amt in enumerate(amounts):
        postings.append(
            PostingCreate(
                account_id=account_a,
                amount=amt,
                direction=PostingDirection.DEBIT,
                currency="XOF",
                sequence_no=i + 1
            )
        )
    # Counter-posting balancing the exact total
    postings.append(
        PostingCreate(
            account_id=account_b,
            amount=total,
            direction=PostingDirection.CREDIT,
            currency="XOF",
            sequence_no=len(amounts) + 1
        )
    )

    # Invariant assertion
    LedgerService.validate_postings_balance(postings)


@given(
    st.lists(amount_strategy, min_size=1, max_size=5),
    st.decimals(min_value=Decimal("0.0001"), max_value=Decimal("10.0000"), places=4)
)
@settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
def test_unbalanced_entries_invariant_rejection(amounts, delta):
    """
    Hypothesis property test:
    Any difference between debit and credit (even 0.0001) must be strictly rejected.
    """
    total = sum(amounts)
    account_a = uuid4()
    account_b = uuid4()

    postings = []
    for i, amt in enumerate(amounts):
        postings.append(
            PostingCreate(
                account_id=account_a,
                amount=amt,
                direction=PostingDirection.DEBIT,
                currency="XOF",
                sequence_no=i + 1
            )
        )
    # Inject discrepancy
    postings.append(
        PostingCreate(
            account_id=account_b,
            amount=total + delta,
            direction=PostingDirection.CREDIT,
            currency="XOF",
            sequence_no=len(amounts) + 1
        )
    )

    with pytest.raises(UnbalancedJournalEntryError):
        LedgerService.validate_postings_balance(postings)
