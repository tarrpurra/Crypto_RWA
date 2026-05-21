// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IAgniFactory} from "src/interfaces/IAgniFactory.sol";

contract CheckAgniPool is Script {
    function run() external view {
        address factory = vm.envAddress("FACTORY_ADDRESS");
        address tokenA = vm.envAddress("TOKEN_A_ADDRESS");
        address tokenB = vm.envAddress("TOKEN_B_ADDRESS");
        uint24 fee = uint24(vm.envUint("POOL_FEE"));

        address pool = IAgniFactory(factory).getPool(tokenA, tokenB, fee);

        console2.log("Factory:", factory);
        console2.log("TokenA:", tokenA);
        console2.log("TokenB:", tokenB);
        console2.log("Fee:", uint256(fee));
        console2.log("Pool:", pool);
        require(pool != address(0), "STOP: pool does not exist");
    }
}
