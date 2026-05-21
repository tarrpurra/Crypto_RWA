// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgniSwapRouter} from "src/interfaces/IAgniSwapRouter.sol";
import {Errors} from "src/libraries/Errors.sol";
import {ExecutionTypes} from "src/libraries/ExecutionTypes.sol";
import {MockSetup} from "test/mocks/MockSetup.sol";

contract PauseAndRecoveryFlowTest is MockSetup {
    function setUp() public {
        _deploySystem();
        _allowSelector(IAgniSwapRouter.exactInputSingle.selector);
    }

    function testPauseThenRecoveryFlow() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 95 ether;

        _fundVault(amountIn);
        tokenOut.mint(address(vault), 50 ether);
        vm.deal(address(vault), 1 ether);

        bytes memory routerCalldata = _encodeAgniExactInputSingle(amountIn, minAmountOut);
        ExecutionTypes.ExecutionPayload memory payload = _payload(
            keccak256("PAUSE-1"),
            IAgniSwapRouter.exactInputSingle.selector,
            keccak256(routerCalldata),
            amountIn,
            minAmountOut
        );

        _approvePayload(payload);

        vm.prank(guardian);
        pauseGuardian.setPaused(true);

        vm.prank(executor);
        vm.expectRevert(Errors.Paused.selector);
        vault.executeApprovedTrade(payload, routerCalldata, amountIn);

        vm.prank(recovery);
        vault.emergencyWithdrawToken(address(tokenOut), outsider, 50 ether);

        vm.prank(recovery);
        vault.emergencyWithdrawNative(payable(outsider), 1 ether);

        assertEq(tokenOut.balanceOf(outsider), 50 ether);
        assertEq(outsider.balance, 1 ether);
    }
}

