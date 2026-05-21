// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

import {IERC20} from "../src/interfaces/IERC20.sol";

contract FundExecutorVaultMockToken is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address token = vm.envAddress("TOKEN_IN_ADDRESS");
        address vault = vm.envAddress("EXECUTOR_VAULT_ADDRESS");
        uint256 amount = vm.envUint("FUND_AMOUNT");
        address deployer = vm.addr(deployerPk);

        uint256 deployerBalanceBefore = IERC20(token).balanceOf(deployer);
        uint256 vaultBalanceBefore = IERC20(token).balanceOf(vault);
        require(deployerBalanceBefore >= amount, "insufficient deployer balance");

        vm.startBroadcast(deployerPk);
        bool ok = IERC20(token).transfer(vault, amount);
        require(ok, "transfer failed");
        vm.stopBroadcast();

        uint256 deployerBalanceAfter = IERC20(token).balanceOf(deployer);
        uint256 vaultBalanceAfter = IERC20(token).balanceOf(vault);

        console2.log("Token:", token);
        console2.log("Vault:", vault);
        console2.log("Fund amount:", amount);
        console2.log("Deployer balance before:", deployerBalanceBefore);
        console2.log("Deployer balance after:", deployerBalanceAfter);
        console2.log("Vault balance before:", vaultBalanceBefore);
        console2.log("Vault balance after:", vaultBalanceAfter);
    }
}
