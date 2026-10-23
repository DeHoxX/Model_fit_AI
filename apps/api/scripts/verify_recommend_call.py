"""Script to execute ONE real /recommend call and report real JSON output and Hub call count."""

import asyncio
import json
import os

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from modelfit.db.base import Base
from modelfit.modules.catalog.models import ModelCache  # noqa: F401
from modelfit.modules.hardware.models import HardwareProfile  # noqa: F401
from modelfit.modules.catalog.repository import CatalogRepository
from modelfit.modules.catalog.service import CatalogService
from modelfit.modules.estimator.schemas import HardwareKind, HardwareProfileInput
from modelfit.modules.recommend.schemas import RequirementSpec
from modelfit.modules.recommend.service import RecommendService

hub_call_count = 0
original_request = httpx.AsyncClient.request

async def instrumented_request(self, method, url, *args, **kwargs):
    global hub_call_count
    url_str = str(url)
    if "huggingface.co" in url_str:
        hub_call_count += 1
        print(f"  [HF Hub Call #{hub_call_count}] {method} {url_str[:85]}...")
    return await original_request(self, method, url, *args, **kwargs)

httpx.AsyncClient.request = instrumented_request

async def main():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    async with session_factory() as session:
        catalog_repo = CatalogRepository()
        catalog_service = CatalogService(repository=catalog_repo)
        recommend_service = RecommendService(catalog_service=catalog_service)

        req = RequirementSpec(
            task="coding",
            hardware=HardwareProfileInput(
                name="NVIDIA GeForce RTX 4070",
                memory_bytes=12 * (1024**3),
                kind=HardwareKind.GPU,
                reserved_memory_bytes=int(12 * (1024**3) * 0.05),
            ),
            max_context=8192,
        )

        print("\n>>> Executing live recommend call against Hugging Face Hub...")
        result = await recommend_service.recommend(spec=req, session=session)

        result_dict = result.model_dump()
        print("\n===============================")
        print(f"TOTAL HUGGING FACE HUB HTTP CALLS: {hub_call_count}")
        print("===============================\n")
        print("RECOMMENDATION RESPONSE JSON:")
        print(json.dumps(result_dict, indent=2))

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
