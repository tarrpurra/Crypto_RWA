// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {AIYieldTestSwapRouter} from "src/mocks/AIYieldTestSwapRouter.sol";

contract DeployAIYieldTestSwapRouter is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address owner = vm.envOr("SWAP_ROUTER_OWNER", vm.addr(deployerPk));

        vm.startBroadcast(deployerPk);
        AIYieldTestSwapRouter router = new AIYieldTestSwapRouter(owner);
        vm.stopBroadcast();

        console2.log("Deployer:", vm.addr(deployerPk));
        console2.log("Owner:", owner);
        console2.log("Router:", address(router));
    }
}
