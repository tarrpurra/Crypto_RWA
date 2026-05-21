# ==============================================================================
# AIxRWA Local Development Setup Script (Windows PowerShell)
# ==============================================================================

Write-Host "=== [1/7] Initializing Git submodules ===" -ForegroundColor Cyan
git submodule update --init --recursive

Write-Host "`n=== [2/7] Creating root .env file ===" -ForegroundColor Cyan
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created root .env file."
} else {
    Write-Host "Root .env already exists."
}

Write-Host "`n=== [3/7] Propagating environment configuration to contracts/ ===" -ForegroundColor Cyan
if (-not (Test-Path "contracts/.env")) {
    Copy-Item ".env" "contracts/.env"
    Write-Host "Created contracts/.env file."
} else {
    Write-Host "contracts/.env already exists."
}

Write-Host "`n=== [4/7] Spinning up Docker containers ===" -ForegroundColor Cyan
docker compose up -d --build

Write-Host "`n=== [5/7] Compiling contracts and running tests inside the container ===" -ForegroundColor Cyan
docker compose exec foundry forge build
docker compose exec foundry forge test -vv

Write-Host "`n=== [6/7] Installing GNU Make (if missing) ===" -ForegroundColor Cyan
if (-not (Get-Command "make" -ErrorAction SilentlyContinue)) {
    Write-Host "GNU Make was not found. Attempting to install via winget..." -ForegroundColor Yellow
    if (Get-Command "winget" -ErrorAction SilentlyContinue) {
        try {
            winget install --id ezwinports.make --silent --accept-source-agreements --accept-package-agreements
            Write-Host "GNU Make installed successfully! Note: You must restart your terminal after this script finishes for the 'make' command to be available." -ForegroundColor Green
        } catch {
            Write-Warning "Failed to install GNU Make via winget. Please install it manually if you wish to run make commands."
        }
    } else {
        Write-Warning "winget (Windows Package Manager) is not available. Please install GNU Make manually."
    }
} else {
    Write-Host "GNU Make is already installed on this host." -ForegroundColor Green
}

Write-Host "`n=== [7/7] Setting up Python virtual environment ===" -ForegroundColor Cyan
if (Get-Command "python" -ErrorAction SilentlyContinue) {
    if (-not (Test-Path ".venv")) {
        python -m venv .venv
        Write-Host "Created Python virtual environment in .venv."
    } else {
        Write-Host "Python virtual environment (.venv) already exists."
    }
    Write-Host "Upgrading pip inside .venv..."
    & .venv/Scripts/python.exe -m pip install --upgrade pip
    Write-Host "`nTo activate the virtual environment, run:" -ForegroundColor Green
    Write-Host "    .venv\Scripts\Activate.ps1" -ForegroundColor Yellow
} else {
    Write-Warning "Python is not installed or not in PATH. Skipping virtual environment creation."
}
