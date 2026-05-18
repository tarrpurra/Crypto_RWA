// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {PauseGuardian} from "src/core/PauseGuardian.sol";
import {TradeApprovalManager} from "src/core/TradeApprovalManager.sol";

contract PhaseGateMinimalCheck is Script {
    function run() external view {
        address pauseGuardianAddr = vm.envAddress("PAUSE_GUARDIAN_ADDRESS");
        address tradeApprovalManagerAddr = vm.envAddress("TRADE_APPROVAL_MANAGER_ADDRESS");
        address executorVaultAddr = vm.envAddress("EXECUTOR_VAULT_ADDRESS");
        address router = vm.envAddress("ROUTER_ADDRESS");
        bytes4 selector = bytes4(uint32(vm.envUint("ROUTER_SELECTOR")));

        PauseGuardian pg = PauseGuardian(pauseGuardianAddr);
        TradeApprovalManager tam = TradeApprovalManager(tradeApprovalManagerAddr);

        require(!pg.paused(), "STOP: pause guardian is paused");
        require(pg.routerWhitelist(router), "STOP: router not whitelisted");
        require(pg.selectorAllowlist(router, selector), "STOP: selector not allowed");
        require(tam.hasRole(keccak256("EXECUTOR_ROLE"), executorVaultAddr), "STOP: vault missing EXECUTOR_ROLE on approval manager");

        console2.log("PASS: Minimal phase gate checks passed.");
        console2.log("PauseGuardian:", pauseGuardianAddr);
        console2.log("TradeApprovalManager:", tradeApprovalManagerAddr);
        console2.log("ExecutorVault:", executorVaultAddr);
        console2.log("Router:", router);
        console2.logBytes4(selector);
    }
}

