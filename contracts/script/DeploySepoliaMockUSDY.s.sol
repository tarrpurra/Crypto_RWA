// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MockUSDY} from "src/mocks/MockUSDY.sol";

contract DeploySepoliaMockUSDY is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address finalOwner = vm.envOr("MOCK_USDY_OWNER", deployer);
        address initialMintRecipient = vm.envOr("MOCK_USDY_INITIAL_MINT_RECIPIENT", deployer);
        uint256 initialMintAmount = vm.envOr("MOCK_USDY_INITIAL_MINT_AMOUNT", uint256(10_000 ether));

        vm.startBroadcast(deployerPk);

        MockUSDY token = new MockUSDY(deployer);
        if (initialMintAmount > 0) {
            token.mint(initialMintRecipient, initialMintAmount);
        }
        if (finalOwner != deployer) {
            token.transferOwnership(finalOwner);
        }

        vm.stopBroadcast();

        console2.log("Deployer:", deployer);
        console2.log("MockUSDY:", address(token));
        console2.log("Owner:", finalOwner);
        console2.log("Initial mint recipient:", initialMintRecipient);
        console2.log("Initial mint amount:", initialMintAmount);
    }
}
