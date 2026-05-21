from pathlib import Path
import unittest

from services.agent.modules.contracts.foundry_artifacts import load_artifact
from services.agent.modules.contracts.reader import describe_contract, get_contract_abi
from services.agent.modules.contracts.project_contracts import PROJECT_CONTRACTS


REPO_ROOT = Path(__file__).resolve().parents[4]
FOUNDRY_OUT_DIR = REPO_ROOT / "contracts" / "out"


class FoundryArtifactTests(unittest.TestCase):
    def test_all_project_artifacts_load_from_foundry_output(self) -> None:
        for contract in PROJECT_CONTRACTS.values():
            with self.subTest(contract=contract.key):
                artifact = load_artifact(
                    foundry_out_dir=FOUNDRY_OUT_DIR,
                    source_dir=contract.source_dir,
                    contract_name=contract.contract_name,
                )

                self.assertEqual(artifact.contract_name, contract.contract_name)
                self.assertGreater(len(artifact.abi), 0)

    def test_contract_abi_helper_returns_pause_guardian_function(self) -> None:
        abi = get_contract_abi(
            foundry_out_dir=FOUNDRY_OUT_DIR,
            contract_key="pause_guardian",
        )

        self.assertTrue(any(item["type"] == "function" and item["name"] == "paused" for item in abi))

    def test_describe_contract_includes_metadata_and_abi(self) -> None:
        contract = describe_contract(
            foundry_out_dir=FOUNDRY_OUT_DIR,
            contract_key="executor_vault",
            address="0x0000000000000000000000000000000000000001",
        )

        self.assertEqual(contract["key"], "executor_vault")
        self.assertEqual(contract["contract_name"], "ExecutorVault")
        self.assertEqual(contract["address"], "0x0000000000000000000000000000000000000001")
        self.assertTrue(any(item["type"] == "function" and item["name"] == "pauseGuardian" for item in contract["abi"]))


if __name__ == "__main__":
    unittest.main()
