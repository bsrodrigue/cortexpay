"""
Application settings — loaded from environment variables and .env file.

Validation rules (fail-fast on startup):
  - DATABASE_URL / REDIS_URL must be valid connection strings
  - ENVIRONMENT must be one of: development | staging | production
  - JWT_SECRET_KEY must be ≥ 32 chars and must not be the default in production
  - WEBHOOK_SECRET_KEY must be ≥ 16 chars
  - ADMIN_PASSWORD must be ≥ 8 chars
  - MIN_SPREAD_PCT must be strictly less than MAX_SPREAD_PCT
  - FX_QUOTE_TTL_SECONDS must be between 30 and 600
  - When ORANGE_MONEY_ENABLED=true, all three OM credentials are required
"""

from typing import Literal, Optional
from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",          # silently drop unknown env vars
    )

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = Field(
        default="postgresql://cortex:cortex_secret_password@localhost:5432/cortex_pay",
        description="asyncpg-compatible PostgreSQL connection string",
    )
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection string for FX quote TTL cache",
    )

    # ── Runtime ───────────────────────────────────────────────────────────────
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"

    # ── FX Engine ─────────────────────────────────────────────────────────────
    FX_QUOTE_TTL_SECONDS: int = Field(default=90, ge=30, le=600)
    DEFAULT_FX_RATE_USD_XOF: float = Field(default=610.00, gt=0)
    MIN_SPREAD_PCT: float = Field(default=0.035, gt=0, lt=1)
    MAX_SPREAD_PCT: float = Field(default=0.045, gt=0, lt=1)

    # ── Auth ──────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: SecretStr = Field(
        default="cortex_jwt_super_secret_signing_key_2026_fintech_production",
        min_length=32,
    )
    JWT_ALGORITHM: Literal["HS256", "HS384", "HS512"] = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60 * 24, ge=5, le=60 * 24 * 7)

    # ── Webhooks ──────────────────────────────────────────────────────────────
    WEBHOOK_SECRET_KEY: SecretStr = Field(
        default="cortex_webhook_secret_hmac_2026",
        min_length=16,
    )

    # ── Admin portal ──────────────────────────────────────────────────────────
    ADMIN_PASSWORD: str = Field(default="cortexpay-admin", min_length=8)

    # ── Mock / testing ────────────────────────────────────────────────────────
    OTP_MOCK_CODE: str = Field(default="123456", min_length=4, max_length=8)

    # ── Orange Money (West Africa / WAEMU) ────────────────────────────────────
    ORANGE_MONEY_ENABLED: bool = False
    ORANGE_MONEY_BASE_URL: str = Field(
        default="https://api.orange.com/orange-money-webpay/dev/v1",
        description="Sandbox: .../dev/v1 — Production Senegal: .../sn/v1",
    )
    ORANGE_MONEY_CLIENT_ID: Optional[str] = None
    ORANGE_MONEY_CLIENT_SECRET: Optional[SecretStr] = None
    ORANGE_MONEY_MERCHANT_KEY: Optional[SecretStr] = None
    ORANGE_MONEY_WEBHOOK_SECRET: Optional[SecretStr] = Field(
        default=None,
        description="HMAC secret Orange uses to sign its notif_url callbacks",
    )

    # ── Field validators ──────────────────────────────────────────────────────

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        allowed = ("postgresql://", "postgresql+asyncpg://", "postgres://")
        if not any(v.startswith(p) for p in allowed):
            raise ValueError(
                f"DATABASE_URL must start with one of {allowed}. Got: {v!r}"
            )
        return v

    @field_validator("REDIS_URL")
    @classmethod
    def validate_redis_url(cls, v: str) -> str:
        if not v.startswith(("redis://", "rediss://")):
            raise ValueError(
                f"REDIS_URL must start with redis:// or rediss://. Got: {v!r}"
            )
        return v

    @field_validator("ORANGE_MONEY_BASE_URL")
    @classmethod
    def validate_om_base_url(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("ORANGE_MONEY_BASE_URL must use HTTPS.")
        return v.rstrip("/")

    # ── Cross-field validators ─────────────────────────────────────────────────

    @model_validator(mode="after")
    def validate_spread_order(self) -> "Settings":
        if self.MIN_SPREAD_PCT >= self.MAX_SPREAD_PCT:
            raise ValueError(
                f"MIN_SPREAD_PCT ({self.MIN_SPREAD_PCT}) must be strictly less than "
                f"MAX_SPREAD_PCT ({self.MAX_SPREAD_PCT})."
            )
        return self

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            raw_jwt = self.JWT_SECRET_KEY.get_secret_value()
            if "fintech_production" in raw_jwt:
                raise ValueError(
                    "FATAL: JWT_SECRET_KEY still contains the default placeholder. "
                    "Set a strong, unique JWT_SECRET_KEY before deploying to production."
                )
            raw_webhook = self.WEBHOOK_SECRET_KEY.get_secret_value()
            if "cortex_webhook_secret" in raw_webhook:
                raise ValueError(
                    "FATAL: WEBHOOK_SECRET_KEY still contains the default placeholder. "
                    "Set a strong, unique WEBHOOK_SECRET_KEY before deploying to production."
                )
            if self.ADMIN_PASSWORD == "cortexpay-admin":
                raise ValueError(
                    "FATAL: ADMIN_PASSWORD is still the default. "
                    "Set a strong ADMIN_PASSWORD before deploying to production."
                )
        return self

    @model_validator(mode="after")
    def validate_orange_money_credentials(self) -> "Settings":
        if self.ORANGE_MONEY_ENABLED:
            missing = [
                name for name, val in [
                    ("ORANGE_MONEY_CLIENT_ID", self.ORANGE_MONEY_CLIENT_ID),
                    ("ORANGE_MONEY_CLIENT_SECRET", self.ORANGE_MONEY_CLIENT_SECRET),
                    ("ORANGE_MONEY_MERCHANT_KEY", self.ORANGE_MONEY_MERCHANT_KEY),
                    ("ORANGE_MONEY_WEBHOOK_SECRET", self.ORANGE_MONEY_WEBHOOK_SECRET),
                ]
                if not val
            ]
            if missing:
                raise ValueError(
                    f"ORANGE_MONEY_ENABLED=true but the following required variables are "
                    f"missing or empty: {', '.join(missing)}"
                )
        return self


settings = Settings()
