# AIxRWA: AI-Assisted RWA Portfolio & Risk Terminal

AIxRWA is a hybrid portfolio operations console on the **Mantle Network** designed to manage tokenized Real World Assets (RWAs) like USDY and mETH. The platform leverages an off-chain AI allocation engine, a deterministic policy-based risk guardian, and a secure, guarded on-chain execution contract.

---

## Repository Structure

```text
/
|-- Makefile               # Dev workflow automation (macOS/Linux/Make)
|-- setup.ps1              # Dev workflow automation (Windows PowerShell & Make installer)
|-- .env.example           # Consolidated environment config template
|-- Dockerfile             # Foundry environment image definition
|-- docker-compose.yml     # Local services container orchestration
|-- contracts/             # Smart contract codebase (Foundry)
|   |-- src/               # Solidity source files (Vault, Approval, Pause)
|   |-- script/            # Sepolia deployment & config scripts
|   |-- test/              # Unit & Integration test suites
|   `-- foundry.toml       # Foundry framework config
`-- docs/                  # System design plans & research
```

---

## Developer Quickstart (Docker-First)

The local development environment runs fully containerized to avoid dependency drift and keep execution deterministic.

### Prerequisites

Ensure the following tools are installed on your host system:
* **Docker Desktop** (or Docker Engine with compose)
* **Git**
* **Python 3.x** (only needed if using the `Makefile` for file propagation helpers)

### One-Command Setup

Run the setup command matching your shell from the root of the repository:

**For macOS/Linux (or Windows with Make installed):**
```bash
make setup-dev
```

**For Windows (PowerShell):**
```powershell
./setup.ps1
```

Either command automates the entire local setup workflow:
1. **Initializes Git submodules** (`contracts/lib/*` dependencies like OpenZeppelin).
2. **Generates the root environment file** `.env` from [.env.example](.env.example).
3. **Propagates configurations** to [contracts/.env](contracts/.env) for local Foundry compatibility.
4. **Starts containerized development services** (Foundry) in the background.
5. **Compiles Solidity contracts** inside the container.
6. **Executes the test suite** inside the container to verify setup correctness.
7. **Creates a Python virtual environment** (`.venv`) on the host and upgrades `pip` for local scripting support.

---

## Makefile Command Reference

Use these commands from your host terminal to manage the workspace:

| Command | Action |
| :--- | :--- |
| `make setup-dev` | Run full checkout, env sync, container initialization, compile, and test. |
| `make up` | Start the development containers in the background. |
| `make down` | Stop the development containers. |
| `make build` | Compile the Solidity contracts inside the running container. |
| `make test` | Execute the unit and integration test suite inside the container. |
| `make status` | Check the running status of containerized services. |

---

## Configuration

Environment variables are centralized at the root of the repository in the `.env` file (copied from [.env.example](.env.example)). 

> [!IMPORTANT]
> The setup commands (`make setup-dev` or `./setup.ps1`) automatically copy the root `.env` to `contracts/.env`. If you make changes to the root `.env` file and want to synchronize them to the smart contracts workspace, you can re-run the setup commands or manually copy the files. Do not commit `.env` files containing sensitive private keys.
