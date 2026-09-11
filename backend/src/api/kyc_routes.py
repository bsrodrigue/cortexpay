import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import asyncpg

from backend.src.core.database import get_db_connection

kyc_router = APIRouter(prefix="/kyc", tags=["KYC & Compliance"])

class KYCSubmitRequestDTO(BaseModel):
    user_id: str
    document_type: str # 'NATIONAL_ID', 'PASSPORT', 'DRIVING_LICENSE'
    document_number: str
    country_code: str = "SEN"
    front_image_url: str
    back_image_url: Optional[str] = None
    selfie_url: str

class KYCDecisionRequestDTO(BaseModel):
    user_id: str
    decision: str # 'APPROVED' or 'REJECTED'
    rejection_reason: Optional[str] = None
    tier: int = 1

@kyc_router.get("/status/{user_id}")
async def get_kyc_status(user_id: str, conn: asyncpg.Connection = Depends(get_db_connection)):
    user = await conn.fetchrow(
        """
        SELECT user_id, kyc_status, kyc_tier, kyc_submitted_at, kyc_reviewed_at, kyc_rejection_reason
        FROM users WHERE user_id = $1;
        """,
        user_id
    )
    if not user:
        # Fallback for demo if user not in users table yet
        return {
            "user_id": user_id,
            "kyc_status": "NOT_STARTED",
            "kyc_tier": 0,
            "kyc_submitted_at": None,
            "kyc_reviewed_at": None,
            "kyc_rejection_reason": None,
            "documents": []
        }

    docs = await conn.fetch(
        """
        SELECT id, document_type, document_number, country_code, status, submitted_at, reviewed_at, rejection_reason
        FROM kyc_documents
        WHERE user_id = $1
        ORDER BY submitted_at DESC;
        """,
        user_id
    )

    return {
        "user_id": user["user_id"],
        "kyc_status": user["kyc_status"],
        "kyc_tier": user["kyc_tier"],
        "kyc_submitted_at": user["kyc_submitted_at"].isoformat() if user["kyc_submitted_at"] else None,
        "kyc_reviewed_at": user["kyc_reviewed_at"].isoformat() if user["kyc_reviewed_at"] else None,
        "kyc_rejection_reason": user["kyc_rejection_reason"],
        "documents": [
            {
                "id": str(d["id"]),
                "document_type": d["document_type"],
                "document_number": d["document_number"],
                "country_code": d["country_code"],
                "status": d["status"],
                "submitted_at": d["submitted_at"].isoformat() if d["submitted_at"] else None,
                "reviewed_at": d["reviewed_at"].isoformat() if d["reviewed_at"] else None,
                "rejection_reason": d["rejection_reason"],
            }
            for d in docs
        ]
    }

@kyc_router.post("/submit")
async def submit_kyc(
    payload: KYCSubmitRequestDTO,
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    async with conn.transaction():
        # Insert KYC Document
        doc_row = await conn.fetchrow(
            """
            INSERT INTO kyc_documents (
                user_id, document_type, document_number, country_code,
                front_image_url, back_image_url, selfie_url, status, submitted_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', NOW())
            RETURNING id, submitted_at;
            """,
            payload.user_id,
            payload.document_type,
            payload.document_number,
            payload.country_code,
            payload.front_image_url,
            payload.back_image_url,
            payload.selfie_url
        )

        # Update user status to SUBMITTED
        await conn.execute(
            """
            UPDATE users
            SET kyc_status = 'SUBMITTED',
                kyc_submitted_at = NOW(),
                kyc_rejection_reason = NULL
            WHERE user_id = $1;
            """,
            payload.user_id
        )

        return {
            "document_id": str(doc_row["id"]),
            "status": "SUBMITTED",
            "message": "Documents d'identité reçus et en attente de vérification."
        }

@kyc_router.post("/simulate-decision")
async def simulate_kyc_decision(
    payload: KYCDecisionRequestDTO,
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    decision = payload.decision.upper()
    if decision not in ("APPROVED", "REJECTED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La décision doit être 'APPROVED' ou 'REJECTED'."
        )

    new_tier = payload.tier if decision == "APPROVED" else 0
    rejection_reason = payload.rejection_reason if decision == "REJECTED" else None

    async with conn.transaction():
        # Update user
        await conn.execute(
            """
            UPDATE users
            SET kyc_status = $1,
                kyc_tier = $2,
                kyc_reviewed_at = NOW(),
                kyc_rejection_reason = $3
            WHERE user_id = $4;
            """,
            decision,
            new_tier,
            rejection_reason,
            payload.user_id
        )

        # Update latest document
        await conn.execute(
            """
            UPDATE kyc_documents
            SET status = $1,
                reviewed_at = NOW(),
                rejection_reason = $2
            WHERE id = (
                SELECT id FROM kyc_documents WHERE user_id = $3 ORDER BY submitted_at DESC LIMIT 1
            );
            """,
            decision,
            rejection_reason,
            payload.user_id
        )

        return {
            "user_id": payload.user_id,
            "kyc_status": decision,
            "kyc_tier": new_tier,
            "rejection_reason": rejection_reason
        }
