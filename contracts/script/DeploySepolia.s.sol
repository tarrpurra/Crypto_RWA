// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {PauseGuardian} from "src/core/PauseGuardian.sol";
import {TradeApprovalManager} from "src/core/TradeApprovalManager.sol";
import {ExecutorVault} from "src/core/ExecutorVault.sol";

contract DeploySepolia is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");
        address approver = vm.envAddress("APPROVER_ADDRESS");
        address executor = vm.envAddress("EXECUTOR_ADDRESS");
        address recovery = vm.envAddress("RECOVERY_ADDRESS");

        vm.startBroadcast(deployerPk);

        PauseGuardian pauseGuardian = new PauseGuardian(admin, guardian);
        TradeApprovalManager approvalManager = new TradeApprovalManager(admin, approver);
        ExecutorVault vault = new ExecutorVault(admin, executor, recovery, address(pauseGuardian), address(approvalManager));

        approvalManager.grantRole(keccak256("EXECUTOR_ROLE"), address(vault));

        vm.stopBroadcast();

        console2.log("PauseGuardian:", address(pauseGuardian));
        console2.log("TradeApprovalManager:", address(approvalManager));
        console2.log("ExecutorVault:", address(vault));
    }
}
