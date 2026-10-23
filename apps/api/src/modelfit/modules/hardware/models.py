from sqlalchemy import BigInteger, Boolean, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from modelfit.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class HardwareProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Database entity representing a hardware device or preset."""

    __tablename__ = "hardware_profiles"

    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    kind: Mapped[str] = mapped_column(
        String(30), nullable=False, default="gpu", server_default="gpu"
    )
    memory_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reserved_memory_bytes: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
