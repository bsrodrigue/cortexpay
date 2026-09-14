from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://cortex:cortex_secret_password@localhost:5432/cortex_pay")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    FX_QUOTE_TTL_SECONDS: int = 90
    DEFAULT_FX_RATE_USD_XOF: float = 610.00  # 1 USD = 610 XOF
    MIN_SPREAD_PCT: float = 0.035  # 3.5%
    MAX_SPREAD_PCT: float = 0.045  # 4.5%
    OTP_MOCK_CODE: str = "123456"
    WEBHOOK_SECRET_KEY: str = os.getenv("WEBHOOK_SECRET_KEY", "cortex_webhook_secret_hmac_2026")
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "cortex_jwt_super_secret_signing_key_2026_fintech_production")
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    def model_post_init(self, __context):
        if self.ENVIRONMENT == "production":
            raw_secret = os.getenv("JWT_SECRET_KEY")
            if not raw_secret or "fintech_production" in raw_secret:
                raise ValueError("FATAL SECURITY MISCONFIGURATION: An explicit, secure JWT_SECRET_KEY environment variable is required in production.")

settings = Settings()
