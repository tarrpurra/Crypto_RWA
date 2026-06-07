// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {AIYieldTestSwapRouter} from "src/mocks/AIYieldTestSwapRouter.sol";

contract ConfigureAIYieldTestSwapRouter is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address routerAddr = vm.envAddress("ROUTER_ADDRESS");
        address wmnt = vm.envAddress("SEPOLIA_WMNT_ADDRESS");
        address usdy = vm.envAddress("SEPOLIA_USDY_ADDRESS");
        address meth = vm.envAddress("SEPOLIA_METH_ADDRESS");

        uint256 wmntUsdyRate = vm.envOr("ROUTER_RATE_WMNT_USDY", uint256(4510));
        uint256 usdyWmntRate = vm.envOr("ROUTER_RATE_USDY_WMNT", uint256(22168));
        uint256 wmntMethRate = vm.envOr("ROUTER_RATE_WMNT_METH", uint256(30));
        uint256 methWmntRate = vm.envOr("ROUTER_RATE_METH_WMNT", uint256(3322266));
        uint256 usdyMethRate = vm.envOr("ROUTER_RATE_USDY_METH", uint256(66));
        uint256 methUsdyRate = vm.envOr("ROUTER_RATE_METH_USDY", uint256(1498238));

        vm.startBroadcast(deployerPk);

        AIYieldTestSwapRouter router = AIYieldTestSwapRouter(routerAddr);
        router.configurePair(wmnt, usdy, wmntUsdyRate, true);
        router.configurePair(usdy, wmnt, usdyWmntRate, true);
        router.configurePair(wmnt, meth, wmntMethRate, true);
        router.configurePair(meth, wmnt, methWmntRate, true);
        router.configurePair(usdy, meth, usdyMethRate, true);
        router.configurePair(meth, usdy, methUsdyRate, true);

        vm.stopBroadcast();

        console2.log("Router:", routerAddr);
        console2.log("WMNT:", wmnt);
        console2.log("USDY:", usdy);
        console2.log("mETH:", meth);
        console2.log("Configured all six routes.");
    }
}
