// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IERC20} from "src/interfaces/IERC20.sol";
import {AIYieldTestSwapRouter} from "src/mocks/AIYieldTestSwapRouter.sol";

contract FundAIYieldTestSwapRouter is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address routerAddr = vm.envAddress("ROUTER_ADDRESS");
        address wmnt = vm.envAddress("SEPOLIA_WMNT_ADDRESS");
        address usdy = vm.envAddress("SEPOLIA_USDY_ADDRESS");
        address meth = vm.envAddress("SEPOLIA_METH_ADDRESS");

        uint256 wmntAmount = vm.envOr("ROUTER_LIQUIDITY_WMNT", uint256(1000 ether));
        uint256 usdyAmount = vm.envOr("ROUTER_LIQUIDITY_USDY", uint256(8000 ether));
        uint256 methAmount = vm.envOr("ROUTER_LIQUIDITY_METH", uint256(5 ether));

        vm.startBroadcast(deployerPk);

        AIYieldTestSwapRouter router = AIYieldTestSwapRouter(routerAddr);
        IERC20(wmnt).approve(routerAddr, wmntAmount);
        IERC20(usdy).approve(routerAddr, usdyAmount);
        IERC20(meth).approve(routerAddr, methAmount);

        router.addLiquidity(wmnt, wmntAmount);
        router.addLiquidity(usdy, usdyAmount);
        router.addLiquidity(meth, methAmount);

        vm.stopBroadcast();

        console2.log("Router:", routerAddr);
        console2.log("WMNT liquidity:", wmntAmount);
        console2.log("USDY liquidity:", usdyAmount);
        console2.log("mETH liquidity:", methAmount);
    }
}
