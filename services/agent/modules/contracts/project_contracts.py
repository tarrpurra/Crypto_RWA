from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProjectContract:
    key: str
    source_dir: str
    contract_name: str
    settings_field: str


PROJECT_CONTRACTS: dict[str, ProjectContract] = {
    "pause_guardian": ProjectContract(
        key="pause_guardian",
        source_dir="PauseGuardian.sol",
        contract_name="PauseGuardian",
        settings_field="pause_guardian_address",
    ),
    "trade_approval_manager": ProjectContract(
        key="trade_approval_manager",
        source_dir="TradeApprovalManager.sol",
        contract_name="TradeApprovalManager",
        settings_field="trade_approval_manager_address",
    ),
    "executor_vault": ProjectContract(
        key="executor_vault",
        source_dir="ExecutorVault.sol",
        contract_name="ExecutorVault",
        settings_field="executor_vault_address",
    ),
}
