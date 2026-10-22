"""Deterministic OpenAPI specification exporter."""

import json
from pathlib import Path
from modelfit.main import create_app


def export_openapi() -> None:
    app = create_app()
    openapi_schema = app.openapi()

    output_path = Path(__file__).resolve().parent.parent / "openapi.json"
    formatted_json = json.dumps(openapi_schema, indent=2, sort_keys=True) + "\n"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(formatted_json)

    print(f"OpenAPI schema exported to {output_path}")


if __name__ == "__main__":
    export_openapi()
