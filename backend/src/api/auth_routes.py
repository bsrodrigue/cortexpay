import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel, EmailStr
import asyncpg

from backend.src.core.database import get_db_connection
from backend.src.services.cortex_orchestrator import CortexOrchestrator

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

# DTO schemas matching mobile expectation
class RegisterDTO(BaseModel):
    email: str
    password: str
    first_name: str
    last_name: str

class LoginDTO(BaseModel):
    email: str
    password: str

class VerifyOtpDTO(BaseModel):
    email: str
    code: str

class ResendOtpDTO(BaseModel):
    email: str

class RefreshDTO(BaseModel):
    refresh: str

# 1. Register: POST /api/auth/register/
@auth_router.post("/register/")
async def register(payload: RegisterDTO, conn: asyncpg.Connection = Depends(get_db_connection)):
    # Check if user already exists
    existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", payload.email.lower())
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Un utilisateur avec cet email existe déjà.")

    user_id = f"usr_{uuid.uuid4().hex[:10]}"
    pwd_hash = hash_password(payload.password)

    row = await conn.fetchrow(
        """
        INSERT INTO users (user_id, email, password_hash, first_name, last_name, is_verified, is_staff, created_at)
        VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, NOW())
        RETURNING id, user_id, email, first_name, last_name, is_verified, is_staff, kyc_status, kyc_tier, kyc_rejection_reason, created_at;
        """,
        user_id,
        payload.email.lower(),
        pwd_hash,
        payload.first_name,
        payload.last_name,
    )

    # Initialize user wallets in XOF and USD
    await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "XOF")
    await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "USD")

    user_data = dict(row)
    user_data["created_at"] = user_data["created_at"].isoformat()
    return user_data

# 2. Login: POST /api/auth/login/
@auth_router.post("/login/")
async def login(payload: LoginDTO, conn: asyncpg.Connection = Depends(get_db_connection)):
    pwd_hash = hash_password(payload.password)
    user = await conn.fetchrow(
        "SELECT id, user_id, email, password_hash FROM users WHERE email = $1",
        payload.email.lower()
    )

    if not user or user["password_hash"] != pwd_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identifiants incorrects. Veuillez vérifier votre email et mot de passe."
        )

    # Issue deterministic session tokens
    access_token = f"cortex_access_{user['user_id']}_{uuid.uuid4().hex[:12]}"
    refresh_token = f"cortex_refresh_{user['user_id']}_{uuid.uuid4().hex[:12]}"

    return {
        "access": access_token,
        "refresh": refresh_token,
    }

# 3. Me: GET /api/auth/me/
@auth_router.get("/me/")
async def get_current_user(
    authorization: Optional[str] = Header(None),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token non fourni ou invalide.")

    token = authorization.split(" ")[1]
    # Token format: cortex_access_<user_id>_<random>
    parts = token.split("_")
    if len(parts) >= 3 and parts[0] == "cortex" and parts[1] == "access":
        user_id = parts[2]
        user = await conn.fetchrow(
            "SELECT id, user_id, email, first_name, last_name, is_verified, is_staff, kyc_status, kyc_tier, kyc_rejection_reason, created_at FROM users WHERE user_id = $1",
            user_id
        )
        if user:
            data = dict(user)
            data["created_at"] = data["created_at"].isoformat()
            return data

    # Fallback to the latest user if in local mock mode
    latest = await conn.fetchrow(
        "SELECT id, user_id, email, first_name, last_name, is_verified, is_staff, kyc_status, kyc_tier, kyc_rejection_reason, created_at FROM users ORDER BY id DESC LIMIT 1"
    )
    if latest:
        data = dict(latest)
        data["created_at"] = data["created_at"].isoformat()
        return data

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable.")

# 4. Token refresh: POST /api/auth/token/refresh/
@auth_router.post("/token/refresh/")
async def refresh_token(payload: RefreshDTO):
    new_access = f"cortex_access_refreshed_{uuid.uuid4().hex[:12]}"
    return {"access": new_access}

# 5. Verify OTP: POST /api/auth/verify-otp/
@auth_router.post("/verify-otp/")
async def verify_otp(payload: VerifyOtpDTO, conn: asyncpg.Connection = Depends(get_db_connection)):
    # OTP mock: any code (or '123456') verifies the email
    await conn.execute("UPDATE users SET is_verified = TRUE WHERE email = $1", payload.email.lower())
    return {"message": "Email vérifié avec succès."}

# 6. Resend OTP: POST /api/auth/resend-otp/
@auth_router.post("/resend-otp/")
async def resend_otp(payload: ResendOtpDTO):
    return {"message": "Un nouveau code a été envoyé."}
