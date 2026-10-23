"""Add support_status, support_reason_code, support_reason_message to model_cache.

Revision ID: 0005_model_support_status
Revises: 0004_add_model_cache_license
Create Date: 2026-10-23 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_model_support_status"
down_revision: str | None = "0004_add_model_cache_license"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "model_cache",
        sa.Column(
            "support_status",
            sa.String(length=50),
            server_default="supported_llm",
            nullable=False,
        ),
    )
    op.add_column(
        "model_cache",
        sa.Column(
            "support_reason_code",
            sa.String(length=50),
            nullable=True,
        ),
    )
    op.add_column(
        "model_cache",
        sa.Column(
            "support_reason_message",
            sa.Text(),
            nullable=True,
        ),
    )

    # Backfill strategy: expire all cached rows so that they are re-classified
    # with the deterministic classifier upon next access, ensuring any existing
    # non-decoder models are re-evaluated and not left with an inaccurate default.
    op.execute("UPDATE model_cache SET expires_at = NOW() - INTERVAL '1 second'")


def downgrade() -> None:
    op.drop_column("model_cache", "support_reason_message")
    op.drop_column("model_cache", "support_reason_code")
    op.drop_column("model_cache", "support_status")
