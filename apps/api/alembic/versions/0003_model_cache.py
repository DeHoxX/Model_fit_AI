"""Add model_cache table.

Revision ID: 0003_model_cache
Revises: 0002_hardware_profiles
Create Date: 2026-10-22 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_model_cache"
down_revision: str | None = "0002_hardware_profiles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "model_cache",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("hf_model_id", sa.String(length=255), nullable=False),
        sa.Column("author", sa.String(length=100), nullable=False),
        sa.Column("model_name", sa.String(length=150), nullable=False),
        sa.Column("pipeline_tag", sa.String(length=50), nullable=True),
        sa.Column("likes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("downloads", sa.Integer(), server_default="0", nullable=False),
        sa.Column("etag", sa.String(length=255), nullable=True),
        sa.Column("last_modified", sa.String(length=100), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw_config", sa.JSON(), nullable=False),
        sa.Column("normalized_payload", sa.JSON(), nullable=False),
        sa.Column("architecture_name", sa.String(length=100), nullable=True),
        sa.Column("is_supported", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("gated", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "param_provenance", sa.String(length=50), server_default="derived", nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_model_cache")),
    )
    op.create_index(
        op.f("ix_model_cache_hf_model_id"),
        "model_cache",
        ["hf_model_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_model_cache_author"),
        "model_cache",
        ["author"],
        unique=False,
    )
    op.create_index(
        op.f("ix_model_cache_model_name"),
        "model_cache",
        ["model_name"],
        unique=False,
    )
    op.create_index(
        op.f("ix_model_cache_expires_at"),
        "model_cache",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_model_cache_expires_at"), table_name="model_cache")
    op.drop_index(op.f("ix_model_cache_model_name"), table_name="model_cache")
    op.drop_index(op.f("ix_model_cache_author"), table_name="model_cache")
    op.drop_index(op.f("ix_model_cache_hf_model_id"), table_name="model_cache")
    op.drop_table("model_cache")
