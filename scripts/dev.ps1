<#
.SYNOPSIS
    Development and CI helper script for ModelFit on Windows / PowerShell.
.DESCRIPTION
    Provides commands matching the project Makefile:
    dev-api, dev-web, up, down, logs, lint, format, typecheck, test, migrate, migration-new, gen-apiclient, check
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet(
        "up", "down", "logs", "dev-api", "dev-web",
        "lint", "format", "typecheck", "test",
        "migrate", "migration-new", "gen-apiclient", "check"
    )]
    [string]$Target,

    [Parameter(Position = 1, Mandatory = $false)]
    [string]$Name = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Run-Step([string]$Description, [scriptblock]$Action) {
    Write-Host "==> $Description" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Write-Error "Command failed with exit code $LASTEXITCODE"
    }
}

switch ($Target) {
    "up" {
        Run-Step "Starting Docker Compose services" { docker compose up -d }
    }
    "down" {
        Run-Step "Stopping Docker Compose services" { docker compose down }
    }
    "logs" {
        Run-Step "Following Docker Compose logs" { docker compose logs -f }
    }
    "dev-api" {
        Run-Step "Starting FastAPI backend development server" {
            Push-Location "$RepoRoot\apps\api"
            try {
                uv run uvicorn modelfit.main:app --reload --port 8000
            } finally {
                Pop-Location
            }
        }
    }
    "dev-web" {
        Run-Step "Starting Next.js frontend development server" {
            Push-Location "$RepoRoot\apps\web"
            try {
                npm run dev
            } finally {
                Pop-Location
            }
        }
    }
    "lint" {
        Run-Step "Linting backend (ruff)" {
            Push-Location "$RepoRoot\apps\api"
            try { uv run ruff check . } finally { Pop-Location }
        }
        Run-Step "Linting frontend (eslint)" {
            Push-Location "$RepoRoot\apps\web"
            try { npm run lint } finally { Pop-Location }
        }
    }
    "format" {
        Run-Step "Formatting backend (ruff)" {
            Push-Location "$RepoRoot\apps\api"
            try { uv run ruff format . } finally { Pop-Location }
        }
        Run-Step "Formatting frontend" {
            Push-Location "$RepoRoot\apps\web"
            try { npm run format } finally { Pop-Location }
        }
    }
    "typecheck" {
        Run-Step "Typechecking backend (mypy strict)" {
            Push-Location "$RepoRoot\apps\api"
            try { uv run mypy --strict src/modelfit } finally { Pop-Location }
        }
        Run-Step "Typechecking frontend (tsc)" {
            Push-Location "$RepoRoot\apps\web"
            try { npm run typecheck } finally { Pop-Location }
        }
    }
    "test" {
        Run-Step "Running backend tests (pytest)" {
            Push-Location "$RepoRoot\apps\api"
            try { uv run pytest -v } finally { Pop-Location }
        }
        Run-Step "Running frontend tests (vitest)" {
            Push-Location "$RepoRoot\apps\web"
            try { npm run test } finally { Pop-Location }
        }
    }
    "migrate" {
        Run-Step "Applying database migrations (alembic)" {
            Push-Location "$RepoRoot\apps\api"
            try { uv run alembic upgrade head } finally { Pop-Location }
        }
    }
    "migration-new" {
        if (-not $Name) {
            Write-Error "Please provide a migration message: .\scripts\dev.ps1 migration-new 'migration message'"
        }
        Run-Step "Creating new alembic revision" {
            Push-Location "$RepoRoot\apps\api"
            try { uv run alembic revision --autogenerate -m "$Name" } finally { Pop-Location }
        }
    }
    "gen-apiclient" {
        Run-Step "Exporting OpenAPI specification" {
            Push-Location "$RepoRoot\apps\api"
            try { uv run python scripts/export_openapi.py } finally { Pop-Location }
        }
        Run-Step "Generating TypeScript API client" {
            Push-Location "$RepoRoot\apps\web"
            try { npm run gen:api } finally { Pop-Location }
        }
    }
    "check" {
        Run-Step "Checking lint, types, and tests" {
            & $PSCommandPath lint
            & $PSCommandPath typecheck
            & $PSCommandPath test
        }
    }
}
