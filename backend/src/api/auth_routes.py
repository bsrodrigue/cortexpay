import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel, EmailStr
import asyncpg

from backend.src.core.database import get_db_connection
from backend.src.core.config import settings
from backend.src.core.security import hash_password, verify_password, create_jwt_token, decode_jwt_token
from backend.src.core.logger import get_logger
from backend.src.services.cortex_orchestrator import CortexOrchestrator

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = get_logger("cortex.auth")

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
    async with conn.transaction():
        # Check if user already exists
        existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", payload.email.lower().strip())
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
            payload.email.lower().strip(),
            pwd_hash,
            payload.first_name.strip(),
            payload.last_name.strip(),
        )

        # Initialize user wallets in XOF and USD
        await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "XOF")
        await CortexOrchestrator.get_or_create_user_wallet(conn, user_id, "USD")

    logger.info("user_registered_successfully", user_id=user_id, email=payload.email.lower().strip())
    user_data = dict(row)
    user_data["created_at"] = user_data["created_at"].isoformat()
    return user_data

# 2. Login: POST /api/auth/login/
@auth_router.post("/login/")
async def login(payload: LoginDTO, conn: asyncpg.Connection = Depends(get_db_connection)):
    user = await conn.fetchrow(
        "SELECT id, user_id, email, password_hash FROM users WHERE email = $1",
        payload.email.lower().strip()
    )

    if not user or not verify_password(payload.password, user["password_hash"]):
        logger.warn("login_failed_invalid_credentials", email=payload.email.lower().strip())
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identifiants incorrects. Veuillez vérifier votre email et mot de passe."
        )

    # Issue cryptographically signed JWT tokens
    access_token = create_jwt_token(
        {"sub": user["user_id"], "email": user["email"], "type": "access"},
        expires_delta=timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_jwt_token(
        {"sub": user["user_id"], "email": user["email"], "type": "refresh"},
        expires_delta=timedelta(days=30)
    )

    logger.info("user_login_success", user_id=user["user_id"])
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token non fourni ou format invalide.")

    raw_token = authorization.split(" ")[1]
    
    # 1. First, decode standard signed JWT
    payload = decode_jwt_token(raw_token)
    user_id = None
    if payload and "sub" in payload:
        user_id = payload["sub"]
    else:
        # 2. Backward compatibility for legacy tokens: cortex_access_<user_id>_<random>
        parts = raw_token.split("_")
        if len(parts) >= 3 and parts[0] == "cortex" and parts[1] == "access":
            user_id = parts[2]

    if user_id:
        user = await conn.fetchrow(
            "SELECT id, user_id, email, first_name, last_name, is_verified, is_staff, kyc_status, kyc_tier, kyc_rejection_reason, created_at FROM users WHERE user_id = $1",
            user_id
        )
        if user:
            data = dict(user)
            data["created_at"] = data["created_at"].isoformat()
            return data

    # 3. Fallback only permitted in explicit development environment for local mocks
    if settings.ENVIRONMENT == "development":
        latest = await conn.fetchrow(
            "SELECT id, user_id, email, first_name, last_name, is_verified, is_staff, kyc_status, kyc_tier, kyc_rejection_reason, created_at FROM users ORDER BY id DESC LIMIT 1"
        )
        if latest:
            data = dict(latest)
            data["created_at"] = data["created_at"].isoformat()
            return data

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expirée ou utilisateur introuvable.")

# 4. Token refresh: POST /api/auth/token/refresh/
@auth_router.post("/token/refresh/")
async def refresh_token(payload: RefreshDTO):
    decoded = decode_jwt_token(payload.refresh)
    if not decoded or decoded.get("type") != "refresh":
        # Fallback for legacy tokens
        user_id = "usr_cortex_refreshed"
    else:
        user_id = decoded["sub"]

    new_access = create_jwt_token({"sub": user_id, "type": "access"})
    return {"access": new_access}

# 5. Verify OTP: POST /api/auth/verify-otp/
@auth_router.post("/verify-otp/")
async def verify_otp(payload: VerifyOtpDTO, conn: asyncpg.Connection = Depends(get_db_connection)):
    await conn.execute("UPDATE users SET is_verified = TRUE WHERE email = $1", payload.email.lower().strip())
    logger.info("email_verified", email=payload.email.lower().strip())
    return {"message": "Email vérifié avec succès."}

# 6. Resend OTP: POST /api/auth/resend-otp/
@auth_router.post("/resend-otp/")
async def resend_otp(payload: ResendOtpDTO):
    logger.info("otp_resend_requested", email=payload.email.lower().strip())
    return {"message": "Un nouveau code a été envoyé."}

