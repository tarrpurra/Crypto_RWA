# ==============================================================================
# AIxRWA Local Development Makefile
# ==============================================================================

.PHONY: setup-dev up down build test status

# Main setup rule for local development
setup-dev:
	@echo "=== [1/6] Initializing Git submodules ==="
	git submodule update --init --recursive
	
	@echo "=== [2/6] Creating root .env file ==="
	@python -c "import os, shutil; shutil.copyfile('.env.example', '.env') if not os.path.exists('.env') else print('Root .env already exists.')"
	
	@echo "=== [3/6] Propagating environment configuration to contracts/ ==="
	@python -c "import os, shutil; shutil.copyfile('.env', 'contracts/.env') if not os.path.exists('contracts/.env') else print('contracts/.env already exists.')"
	
	@echo "=== [4/6] Spinning up Docker containers ==="
	docker compose up -d --build
	
	@echo "=== [5/6] Compiling contracts and running tests inside the container ==="
	docker compose exec foundry forge build
	docker compose exec foundry forge test -vv
	
	@echo "=== [6/6] Setting up Python virtual environment ==="
	@python -c "import os, subprocess; subprocess.run(['python', '-m', 'venv', '.venv']) if not os.path.exists('.venv') else print('Python virtual environment already exists.')"
	@python -c "import os, subprocess; bin_dir = 'Scripts' if os.name == 'nt' else 'bin'; python_exe = os.path.join('.venv', bin_dir, 'python'); subprocess.run([python_exe, '-m', 'pip', 'install', '--upgrade', 'pip'])"
	@echo ""
	@echo "To activate the virtual environment, run:"
	@echo "  On Windows (PowerShell):  .venv\\Scripts\\Activate.ps1"
	@echo "  On macOS/Linux:           source .venv/bin/activate"


# Start the development containers
up:
	docker compose up -d

# Stop the development containers
down:
	docker compose down

# Compile the smart contracts inside the container
build:
	docker compose exec foundry forge build

# Run the test suite inside the container
test:
	docker compose exec foundry forge test -vv

# Check the status of the containerized services
status:
	docker compose ps
