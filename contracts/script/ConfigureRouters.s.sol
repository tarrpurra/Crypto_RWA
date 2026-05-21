// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {PauseGuardian} from "src/core/PauseGuardian.sol";

contract ConfigureRouters is Script {
    error RouterOutOfMvpScope(address router);

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address pauseGuardianAddr = vm.envAddress("PAUSE_GUARDIAN_ADDRESS");
        address router = vm.envAddress("ROUTER_ADDRESS");
        bytes4 selector = bytes4(uint32(vm.envUint("ROUTER_SELECTOR")));

        vm.startBroadcast(deployerPk);

        PauseGuardian pg = PauseGuardian(pauseGuardianAddr);
        if (router == pg.MERCHANT_MOE_LB_ROUTER() || router == pg.MERCHANT_MOE_AGGREGATOR_ROUTER()) {
            revert RouterOutOfMvpScope(router);
        }

        pg.setRouterWhitelist(router, true);
        pg.setSelectorAllowed(router, selector, true);

        vm.stopBroadcast();
    }
}

