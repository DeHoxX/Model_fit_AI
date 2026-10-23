"""Add license column to model_cache table.

Revision ID: 0004_add_model_cache_license
Revises: 0003_model_cache
Create Date: 2026-10-23 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_add_model_cache_license"
down_revision: str | None = "0003_model_cache"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "model_cache",
        sa.Column("license", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("model_cache", "license")
