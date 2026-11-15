<#
.SYNOPSIS
    Compact validation and quality gate script for ModelFit (PowerShell).
.DESCRIPTION
    Runs all code quality checks, linters, type checks, and tests:
    - Backend: ruff check, ruff format --check, mypy strict, lint-imports, pytest
    - Frontend: eslint, tsc, vitest
    Emits compact single-line PASS/FAIL output, persists full raw logs to
    scripts/.check-logs/<step>.log, and prints a copyable === FAILED SUMMARY === block on failure.
#>

[CmdletBinding()]
param()

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $PSScriptRoot ".check-logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$FailedSteps = [System.Collections.Generic.List[PSCustomObject]]::new()

function Run-CompactStep {
    param(
        [Parameter(Mandatory = $true)][string]$StepId,
        [Parameter(Mandatory = $true)][string]$StepName,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [Parameter(Mandatory = $false)][scriptblock]$FilterFailure
    )

    $logFile = Join-Path $LogDir "$StepId.log"
    Push-Location $WorkingDirectory
    try {
        # Execute action, capturing stdout and stderr
        $rawOutput = & $Action 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
    } catch {
        $rawOutput = $_.ToString()
        $exitCode = 1
    } finally {
        Pop-Location
    }

    # Always persist full raw output to disk
    $rawOutput | Set-Content -Path $logFile -Encoding utf8

    if ($exitCode -eq 0) {
        Write-Host "PASS $StepName" -ForegroundColor Green
    } else {
        Write-Host "FAIL $StepName" -ForegroundColor Red
        Write-Host "  Log: $logFile" -ForegroundColor DarkGray

        $compactLines = @()
        if ($FilterFailure) {
            try {
                $compactLines = & $FilterFailure $rawOutput
            } catch {
                $compactLines = @()
            }
        }

        # Fallback if specific filter yields no lines
        if (-not $compactLines -or $compactLines.Count -eq 0) {
            $compactLines = ($rawOutput -split "`r?`n") | Where-Object { $_.Trim() -ne "" } | Select-Object -First 5
        }

        foreach ($line in $compactLines) {
            Write-Host "  $line" -ForegroundColor Yellow
        }

        $FailedSteps.Add([PSCustomObject]@{
            Id = $StepId
            Name = $StepName
            LogFile = $logFile
            Lines = $compactLines
        })
    }
}

# 1. Backend Linting (ruff check --output-format=concise)
Run-CompactStep -StepId "ruff-check" -StepName "ruff check" -WorkingDirectory "$RepoRoot\apps\api" -Action {
    uv run ruff check . --output-format=concise
} -FilterFailure {
    param($text)
    ($text -split "`r?`n") | Where-Object { $_ -match "^.+:\d+:\d+:\s" -or $_ -match "error:" }
}

# 2. Backend Format Check (ruff format --check)
Run-CompactStep -StepId "ruff-format" -StepName "ruff format" -WorkingDirectory "$RepoRoot\apps\api" -Action {
    uv run ruff format --check .
} -FilterFailure {
    param($text)
    ($text -split "`r?`n") | Where-Object { $_ -match "would be reformatted" }
}

# 3. Backend Typechecking (mypy strict)
Run-CompactStep -StepId "mypy" -StepName "mypy strict" -WorkingDirectory "$RepoRoot\apps\api" -Action {
    uv run mypy --strict src/modelfit tests
} -FilterFailure {
    param($text)
    ($text -split "`r?`n") | Where-Object { $_ -match ":\s*error:" -or $_ -match "Found \d+ errors?" }
}

# 4. Architecture Import Boundaries (lint-imports)
Run-CompactStep -StepId "lint-imports" -StepName "lint-imports" -WorkingDirectory "$RepoRoot\apps\api" -Action {
    uv run lint-imports
} -FilterFailure {
    param($text)
    ($text -split "`r?`n") | Where-Object { $_ -match "BROKEN" -or $_ -match "broken\." }
}

# 5. Backend Tests (pytest compact)
Run-CompactStep -StepId "pytest" -StepName "pytest" -WorkingDirectory "$RepoRoot\apps\api" -Action {
    uv run pytest -q --tb=line -rf --no-header -p no:warnings
} -FilterFailure {
    param($text)
    ($text -split "`r?`n") | Where-Object { $_ -match "^FAILED\s+" -or $_ -match "^ERROR\s+" -or $_ -match "===.*failed.*===" }
}

# 6. Frontend Linting (eslint / npm run lint)
Run-CompactStep -StepId "eslint" -StepName "eslint" -WorkingDirectory "$RepoRoot\apps\web" -Action {
    npm run lint
} -FilterFailure {
    param($text)
    ($text -split "`r?`n") | Where-Object { $_ -match "\berror\b" -or $_ -match "^\s*\d+:\d+\s+error" }
}

# 7. Frontend Typechecking (tsc)
Run-CompactStep -StepId "tsc" -StepName "tsc" -WorkingDirectory "$RepoRoot\apps\web" -Action {
    npx tsc --noEmit
} -FilterFailure {
    param($text)
    ($text -split "`r?`n") | Where-Object { $_ -match "error TS\d+:" }
}

# 8. Frontend Unit/Component Tests (vitest compact dot reporter)
Run-CompactStep -StepId "vitest" -StepName "vitest" -WorkingDirectory "$RepoRoot\apps\web" -Action {
    npx vitest run --reporter=dot
} -FilterFailure {
    param($text)
    ($text -split "`r?`n") | Where-Object { $_ -match "FAIL\s+" -or $_ -match "AssertionError" -or $_ -match "Error:" -or $_ -match "Tests\s+.*failed" }
}

# Summary Block
if ($FailedSteps.Count -gt 0) {
    Write-Host "`n=== FAILED SUMMARY ===" -ForegroundColor Red
    foreach ($failed in $FailedSteps) {
        Write-Host "[$($failed.Name)]" -ForegroundColor Red
        Write-Host "Log: $($failed.LogFile)" -ForegroundColor DarkGray
        foreach ($line in $failed.Lines) {
            Write-Host "  $line" -ForegroundColor Yellow
        }
    }
    exit 1
} else {
    Write-Host "`nALL CHECKS PASSED" -ForegroundColor Green
    exit 0
}
