from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.src.core.database import init_db_pool, close_db_pool
from backend.src.core.redis_client import init_redis, close_redis
from backend.src.api.routes import router as api_router
from backend.src.api.auth_routes import auth_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Postgres pool & Redis client
    await init_db_pool()
    await init_redis()
    yield
    # Shutdown
    await close_redis()
    await close_db_pool()

app = FastAPI(
    title="CortexPay MVP API",
    description="Double-Entry Financial Ledger, FX Quote Engine & Virtual Card Issuance",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(auth_router, prefix="/api")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "cortex-pay-core"}
