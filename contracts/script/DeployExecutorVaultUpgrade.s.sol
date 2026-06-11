// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ExecutorVault} from "src/core/ExecutorVault.sol";

contract DeployExecutorVaultUpgrade is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address executor = vm.envAddress("EXECUTOR_ADDRESS");
        address recovery = vm.envAddress("RECOVERY_ADDRESS");
        address pauseGuardian = vm.envAddress("PAUSE_GUARDIAN_ADDRESS");
        address approvalManager = vm.envAddress("TRADE_APPROVAL_MANAGER_ADDRESS");

        require(admin != address(0), "MISSING_ADMIN");
        require(executor != address(0), "MISSING_EXECUTOR");
        require(recovery != address(0), "MISSING_RECOVERY");
        require(pauseGuardian != address(0), "MISSING_PAUSE_GUARDIAN");
        require(approvalManager != address(0), "MISSING_TRADE_APPROVAL_MANAGER");

        vm.startBroadcast(deployerPk);

        ExecutorVault vault = new ExecutorVault(admin, executor, recovery, pauseGuardian, approvalManager);

        bytes32 executorRole = keccak256("EXECUTOR_ROLE");

        vm.stopBroadcast();

        console2.log("ExecutorVault deployed at:", address(vault));
        console2.log("");
        console2.log("IMPORTANT: Grant EXECUTOR_ROLE on TradeApprovalManager to the new vault:");
        console2.log("  tradeApprovalManager.grantRole(executorRole, address(vault))");
        console2.log("  executorRole:", vm.toString(executorRole));
        console2.log("  vault:", vm.toString(address(vault)));
        console2.log("  approvalManager:", vm.toString(approvalManager));
    }
}
