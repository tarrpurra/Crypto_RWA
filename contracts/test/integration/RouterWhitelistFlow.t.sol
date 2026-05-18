// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgniSwapRouter} from "src/interfaces/IAgniSwapRouter.sol";
import {Errors} from "src/libraries/Errors.sol";
import {ExecutionTypes} from "src/libraries/ExecutionTypes.sol";
import {MockRouter} from "src/mocks/MockRouter.sol";
import {MockSetup} from "test/mocks/MockSetup.sol";

contract RouterWhitelistFlowTest is MockSetup {
    function setUp() public {
        _deploySystem();
    }

    function testUnwhitelistedRouterReverts() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 90 ether;

        MockRouter rogueRouter = new MockRouter();
        bytes memory routerCalldata = _encodeAgniExactInputSingle(amountIn, minAmountOut);

        ExecutionTypes.ExecutionPayload memory payload = _payload(
            bytes32("ROUTER-1"),
            IAgniSwapRouter.exactInputSingle.selector,
            keccak256(routerCalldata),
            amountIn,
            minAmountOut
        );
        payload.router = address(rogueRouter);

        _approvePayload(payload);
        _fundVault(amountIn);

        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(Errors.RouterNotWhitelisted.selector, address(rogueRouter)));
        vault.executeApprovedTrade(payload, routerCalldata, amountIn);
    }

    function testWhitelistedRouterWithDisallowedSelectorReverts() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 90 ether;

        vm.prank(admin);
        pauseGuardian.setRouterWhitelist(address(router), true);

        bytes memory routerCalldata = _encodeAgniExactInputSingle(amountIn, minAmountOut);
        ExecutionTypes.ExecutionPayload memory payload = _payload(
            bytes32("ROUTER-2"),
            IAgniSwapRouter.exactInputSingle.selector,
            keccak256(routerCalldata),
            amountIn,
            minAmountOut
        );

        _approvePayload(payload);
        _fundVault(amountIn);

        vm.prank(executor);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.SelectorNotAllowed.selector,
                address(router),
                IAgniSwapRouter.exactInputSingle.selector
            )
        );
        vault.executeApprovedTrade(payload, routerCalldata, amountIn);
    }
}
