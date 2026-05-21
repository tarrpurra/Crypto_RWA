// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";

contract DeploySepoliaMockTokens is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        uint256 tokenASupply = vm.envOr("MOCK_TOKEN_A_SUPPLY", uint256(1_000_000 ether));
        uint256 tokenBSupply = vm.envOr("MOCK_TOKEN_B_SUPPLY", uint256(1_000_000 ether));
        address deployer = vm.addr(deployerPk);

        vm.startBroadcast(deployerPk);

        MockERC20 tokenA = new MockERC20();
        MockERC20 tokenB = new MockERC20();
        tokenA.mint(deployer, tokenASupply);
        tokenB.mint(deployer, tokenBSupply);

        vm.stopBroadcast();

        console2.log("Deployer:", deployer);
        console2.log("MockTokenA:", address(tokenA));
        console2.log("MockTokenB:", address(tokenB));
        console2.log("MockTokenA supply minted:", tokenASupply);
        console2.log("MockTokenB supply minted:", tokenBSupply);
    }
}

