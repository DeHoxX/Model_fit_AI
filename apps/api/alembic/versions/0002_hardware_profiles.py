"""Add hardware_profiles table.

Revision ID: 0002_hardware_profiles
Revises: 0001_baseline
Create Date: 2026-10-22 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_hardware_profiles"
down_revision: str | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "hardware_profiles",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("kind", sa.String(length=30), server_default="gpu", nullable=False),
        sa.Column("memory_bytes", sa.BigInteger(), nullable=False),
        sa.Column(
            "reserved_memory_bytes",
            sa.BigInteger(),
            server_default="0",
            nullable=False,
        ),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("is_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_hardware_profiles")),
    )
    op.create_index(
        op.f("ix_hardware_profiles_name"),
        "hardware_profiles",
        ["name"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_hardware_profiles_name"), table_name="hardware_profiles")
    op.drop_table("hardware_profiles")
