from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
import jwt
import bcrypt
from backend.src.core.config import settings

def hash_password(password: str) -> str:
    """
    Hashes a password using bcrypt with salt.
    """
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against a bcrypt hash, with backward-compatibility for legacy sha256 hashes.
    """
    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    
    # Backward-compat fallback for legacy sha256
    import hashlib
    legacy_hash = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    return legacy_hash == hashed_password

def create_jwt_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Creates a signed cryptographically-secure JWT access token.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "iat": now})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def decode_jwt_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decodes and validates a JWT token's signature and expiration.
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except (jwt.PyJWTError, Exception):
        return None
