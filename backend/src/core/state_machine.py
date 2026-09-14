from enum import Enum
from typing import Dict, Any, Optional

class InvalidStateTransitionError(Exception):
    """Raised when an illegal state machine transition is attempted."""
    pass


# ----------------------------------------------------------------------
# 1. Dispute State Machine (Visa / Card Disputes & Chargebacks)
# ----------------------------------------------------------------------
class DisputeStatus(str, Enum):
    OPENED = "OPENED"
    UNDER_REVIEW = "UNDER_REVIEW"
    WON_REFUNDED = "WON_REFUNDED"
    LOST_CLOSED = "LOST_CLOSED"

class DisputeEvent(str, Enum):
    SUBMIT_EVIDENCE = "SUBMIT_EVIDENCE"
    RESOLVE_WIN = "RESOLVE_WIN"
    RESOLVE_LOSE = "RESOLVE_LOSE"
    WITHDRAW = "WITHDRAW"

class DisputeStateMachine:
    """
    Finite State Machine governing Visa chargeback disputes:
    - OPENED -> UNDER_REVIEW (via SUBMIT_EVIDENCE)
    - OPENED -> LOST_CLOSED (via WITHDRAW or RESOLVE_LOSE)
    - UNDER_REVIEW -> WON_REFUNDED (via RESOLVE_WIN)
    - UNDER_REVIEW -> LOST_CLOSED (via RESOLVE_LOSE)
    WON_REFUNDED and LOST_CLOSED are terminal states (immutable).
    """
    _TRANSITIONS: Dict[DisputeStatus, Dict[DisputeEvent, DisputeStatus]] = {
        DisputeStatus.OPENED: {
            DisputeEvent.SUBMIT_EVIDENCE: DisputeStatus.UNDER_REVIEW,
            DisputeEvent.WITHDRAW: DisputeStatus.LOST_CLOSED,
            DisputeEvent.RESOLVE_LOSE: DisputeStatus.LOST_CLOSED,
        },
        DisputeStatus.UNDER_REVIEW: {
            DisputeEvent.RESOLVE_WIN: DisputeStatus.WON_REFUNDED,
            DisputeEvent.RESOLVE_LOSE: DisputeStatus.LOST_CLOSED,
        },
        DisputeStatus.WON_REFUNDED: {},
        DisputeStatus.LOST_CLOSED: {},
    }

    @classmethod
    def get_next_state(cls, current_status: DisputeStatus, event: DisputeEvent) -> DisputeStatus:
        if isinstance(current_status, str):
            try:
                current_status = DisputeStatus(current_status)
            except ValueError:
                raise InvalidStateTransitionError(f"Unknown dispute status '{current_status}'.")

        allowed = cls._TRANSITIONS.get(current_status, {})
        if event not in allowed:
            raise InvalidStateTransitionError(
                f"Illegal dispute transition: cannot trigger '{event.value}' from state '{current_status.value}'."
            )
        return allowed[event]


# ----------------------------------------------------------------------
# 2. Virtual Card State Machine
# ----------------------------------------------------------------------
class CardStatus(str, Enum):
    PENDING_ACTIVATION = "PENDING_ACTIVATION"
    ACTIVE = "ACTIVE"
    FROZEN = "FROZEN"
    TERMINATED = "TERMINATED"
    EXPIRED = "EXPIRED"

class CardEvent(str, Enum):
    ACTIVATE = "ACTIVATE"
    FREEZE = "FREEZE"
    UNFREEZE = "UNFREEZE"
    TERMINATE = "TERMINATE"
    EXPIRE = "EXPIRE"

class CardStateMachine:
    """
    Finite State Machine governing Virtual Cards:
    - ACTIVE <-> FROZEN
    - ACTIVE / FROZEN -> TERMINATED (terminal)
    - ACTIVE / FROZEN -> EXPIRED (terminal)
    """
    _TRANSITIONS: Dict[CardStatus, Dict[CardEvent, CardStatus]] = {
        CardStatus.PENDING_ACTIVATION: {
            CardEvent.ACTIVATE: CardStatus.ACTIVE,
            CardEvent.TERMINATE: CardStatus.TERMINATED,
        },
        CardStatus.ACTIVE: {
            CardEvent.FREEZE: CardStatus.FROZEN,
            CardEvent.TERMINATE: CardStatus.TERMINATED,
            CardEvent.EXPIRE: CardStatus.EXPIRED,
        },
        CardStatus.FROZEN: {
            CardEvent.UNFREEZE: CardStatus.ACTIVE,
            CardEvent.TERMINATE: CardStatus.TERMINATED,
            CardEvent.EXPIRE: CardStatus.EXPIRED,
        },
        CardStatus.TERMINATED: {},
        CardStatus.EXPIRED: {},
    }

    @classmethod
    def get_next_state(cls, current_status: CardStatus, event: CardEvent) -> CardStatus:
        if isinstance(current_status, str):
            try:
                current_status = CardStatus(current_status)
            except ValueError:
                raise InvalidStateTransitionError(f"Unknown card status '{current_status}'.")

        allowed = cls._TRANSITIONS.get(current_status, {})
        if event not in allowed:
            raise InvalidStateTransitionError(
                f"Illegal card transition: cannot trigger '{event.value}' from state '{current_status.value}'."
            )
        return allowed[event]


# ----------------------------------------------------------------------
# 3. 3D Secure Challenge State Machine
# ----------------------------------------------------------------------
class ThreeDSStatus(str, Enum):
    CHALLENGE_ISSUED = "CHALLENGE_ISSUED"
    CHALLENGE_SUCCESS = "CHALLENGE_SUCCESS"
    CHALLENGE_FAILED = "CHALLENGE_FAILED"
    EXPIRED = "EXPIRED"

class ThreeDSEvent(str, Enum):
    VERIFY_SUCCESS = "VERIFY_SUCCESS"
    VERIFY_FAIL = "VERIFY_FAIL"
    TIMEOUT = "TIMEOUT"

class ThreeDSStateMachine:
    """
    Finite State Machine governing 3D Secure challenges:
    - CHALLENGE_ISSUED -> CHALLENGE_SUCCESS (terminal)
    - CHALLENGE_ISSUED -> CHALLENGE_FAILED (terminal)
    - CHALLENGE_ISSUED -> EXPIRED (terminal)
    Once resolved or expired, no replay or transition is permitted.
    """
    _TRANSITIONS: Dict[ThreeDSStatus, Dict[ThreeDSEvent, ThreeDSStatus]] = {
        ThreeDSStatus.CHALLENGE_ISSUED: {
            ThreeDSEvent.VERIFY_SUCCESS: ThreeDSStatus.CHALLENGE_SUCCESS,
            ThreeDSEvent.VERIFY_FAIL: ThreeDSStatus.CHALLENGE_FAILED,
            ThreeDSEvent.TIMEOUT: ThreeDSStatus.EXPIRED,
        },
        ThreeDSStatus.CHALLENGE_SUCCESS: {},
        ThreeDSStatus.CHALLENGE_FAILED: {},
        ThreeDSStatus.EXPIRED: {},
    }

    @classmethod
    def get_next_state(cls, current_status: ThreeDSStatus, event: ThreeDSEvent) -> ThreeDSStatus:
        if isinstance(current_status, str):
            try:
                current_status = ThreeDSStatus(current_status)
            except ValueError:
                raise InvalidStateTransitionError(f"Unknown 3DS status '{current_status}'.")

        allowed = cls._TRANSITIONS.get(current_status, {})
        if event not in allowed:
            raise InvalidStateTransitionError(
                f"Illegal 3DS transition: cannot trigger '{event.value}' from state '{current_status.value}'."
            )
        return allowed[event]
