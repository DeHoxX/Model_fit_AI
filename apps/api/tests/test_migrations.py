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
    assert heads[0] == "0005_model_support_status"

    status_rev = script.get_revision("0005_model_support_status")
    assert status_rev is not None
    assert status_rev.down_revision == "0004_add_model_cache_license"

    license_rev = script.get_revision("0004_add_model_cache_license")
    assert license_rev is not None
    assert license_rev.down_revision == "0003_model_cache"


    cache_rev = script.get_revision("0003_model_cache")
    assert cache_rev is not None
    assert cache_rev.down_revision == "0002_hardware_profiles"

    hardware_rev = script.get_revision("0002_hardware_profiles")
    assert hardware_rev is not None
    assert hardware_rev.down_revision == "0001_baseline"

    baseline_rev = script.get_revision("0001_baseline")
    assert baseline_rev is not None
    assert baseline_rev.down_revision is None
