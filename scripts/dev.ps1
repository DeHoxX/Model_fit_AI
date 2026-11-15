<#
.SYNOPSIS
    Development runner script for ModelFit on Windows / PowerShell.
.DESCRIPTION
    Provides commands for local development (no Docker required):
    dev, dev-api, dev-web, lint, format, typecheck, test, migrate, migration-new, gen-apiclient, check
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $false)]
    [ValidateSet(
        "dev", "dev-api", "dev-web",
        "lint", "format", "typecheck", "test",
        "migrate", "migration-new", "gen-apiclient", "check"
    )]
    [string]$Target = "dev",

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

function Get-ApiPort {
    if ($env:API_PORT) {
        return $env:API_PORT
    }
    # Check if .env defines API_PORT
    $envFile = "$RepoRoot\.env"
    if (Test-Path $envFile) {
        $match = Select-String -Path $envFile -Pattern "^API_PORT\s*=\s*(\d+)"
        if ($match) {
            return $match.Matches[0].Groups[1].Value
        }
    }
    return "8000"
}

switch ($Target) {
    "dev" {
        $ErrorActionPreference = "Continue"
        $ApiPort = Get-ApiPort
        Write-Host "==> Starting ModelFit local stack (API on port $ApiPort, Web on port 3000)..." -ForegroundColor Green
        Write-Host "Press Ctrl+C to stop all services." -ForegroundColor Yellow

        $apiJob = Start-Job -ScriptBlock {
            param($root, $port)
            Set-Location "$root\apps\api"
            cmd.exe /c "uv run uvicorn modelfit.main:app --reload --port $port 2>&1"
            if ($LASTEXITCODE -ne 0) {
                exit $LASTEXITCODE
            }
        } -ArgumentList $RepoRoot, $ApiPort

        $webJob = Start-Job -ScriptBlock {
            param($root)
            Set-Location "$root\apps\web"
            cmd.exe /c "npm run dev 2>&1"
            if ($LASTEXITCODE -ne 0) {
                exit $LASTEXITCODE
            }
        } -ArgumentList $RepoRoot

        try {
            while ($true) {
                Receive-Job -Job $apiJob -ErrorAction SilentlyContinue | ForEach-Object {
                    Write-Host "[API] $_" -ForegroundColor Cyan
                }
                Receive-Job -Job $webJob -ErrorAction SilentlyContinue | ForEach-Object {
                    Write-Host "[WEB] $_" -ForegroundColor Magenta
                }

                # Check if API service unexpectedly stopped
                if ($apiJob.State -ne "Running") {
                    Receive-Job -Job $apiJob -ErrorAction SilentlyContinue | ForEach-Object {
                        Write-Host "[API] $_" -ForegroundColor Cyan
                    }
                    Write-Host "[API] Service stopped unexpectedly (Job state: $($apiJob.State))." -ForegroundColor Red
                    break
                }

                # Check if Web service unexpectedly stopped
                if ($webJob.State -ne "Running") {
                    Receive-Job -Job $webJob -ErrorAction SilentlyContinue | ForEach-Object {
                        Write-Host "[WEB] $_" -ForegroundColor Magenta
                    }
                    Write-Host "[WEB] Service stopped unexpectedly (Job state: $($webJob.State))." -ForegroundColor Red
                    break
                }

                Start-Sleep -Milliseconds 250
            }
        } finally {
            Write-Host "Stopping development jobs..." -ForegroundColor Yellow
            Stop-Job -Job $apiJob, $webJob -ErrorAction SilentlyContinue
            Remove-Job -Job $apiJob, $webJob -ErrorAction SilentlyContinue
        }
    }
    "dev-api" {
        $ApiPort = Get-ApiPort
        Run-Step "Starting FastAPI backend development server on port $ApiPort" {
            Push-Location "$RepoRoot\apps\api"
            try {
                cmd.exe /c "uv run uvicorn modelfit.main:app --reload --port $ApiPort"
            } finally {
                Pop-Location
            }
        }
    }
    "dev-web" {
        Run-Step "Starting Next.js frontend development server" {
            Push-Location "$RepoRoot\apps\web"
            try {
                cmd.exe /c "npm run dev"
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
            try { npx tsc --noEmit } finally { Pop-Location }
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
        Run-Step "Running all checks via scripts/check.ps1" {
            & "$PSScriptRoot\check.ps1"
        }
    }
}
