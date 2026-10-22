"""Tests for Alembic migration definitions and revision chain."""

from pathlib import Path
from alembic.config import Config
from alembic.script import ScriptDirectory


def test_alembic_revision_chain() -> None:
    api_dir = Path(__file__).resolve().parent.parent
    ini_path = api_dir / "alembic.ini"
    alembic_cfg = Config(str(ini_path))
    alembic_cfg.set_main_option("script_location", str(api_dir / "alembic"))

    script = ScriptDirectory.from_config(alembic_cfg)
    heads = script.get_heads()

    assert len(heads) == 1
    assert heads[0] == "0001_baseline"

    baseline_rev = script.get_revision("0001_baseline")
    assert baseline_rev is not None
    assert baseline_rev.down_revision is None
