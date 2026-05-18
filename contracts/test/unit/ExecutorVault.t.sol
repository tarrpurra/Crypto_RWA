// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TradeApprovalManager} from "src/core/TradeApprovalManager.sol";
import {IAgniSwapRouter} from "src/interfaces/IAgniSwapRouter.sol";
import {Errors} from "src/libraries/Errors.sol";
import {ExecutionTypes} from "src/libraries/ExecutionTypes.sol";
import {MockRouter} from "src/mocks/MockRouter.sol";
import {MockSetup} from "test/mocks/MockSetup.sol";

contract ExecutorVaultTest is MockSetup {
    function setUp() public {
        _deploySystem();
        _allowSelector(IAgniSwapRouter.exactInputSingle.selector);
        _allowSelector(MOCK_SWAP_SELECTOR);
    }

    function testExecuteApprovedTradeHappyPath() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 90 ether;
        uint256 realizedAmountOut = 125 ether;

        _fundVault(amountIn);
        router.setNextAmountOut(realizedAmountOut);

        bytes memory routerCalldata = _encodeAgniExactInputSingle(amountIn, minAmountOut);
        ExecutionTypes.ExecutionPayload memory payload = _payload(
            bytes32("EXEC-1"),
            IAgniSwapRouter.exactInputSingle.selector,
            keccak256(routerCalldata),
            amountIn,
            minAmountOut
        );

        _approvePayload(payload);

        vm.prank(executor);
        vault.executeApprovedTrade(payload, routerCalldata, amountIn);

        assertEq(tokenIn.balanceOf(address(vault)), 0);
        assertEq(tokenOut.balanceOf(address(vault)), realizedAmountOut);
        assertEq(tokenIn.allowance(address(vault), address(router)), 0);

        TradeApprovalManager.ProposalRecord memory proposal = approvalManager.getProposal(payload.proposalId);
        assertEq(uint256(proposal.status), uint256(ExecutionTypes.ProposalStatus.EXECUTED));
    }

    function testExecuteRevertsWhenPaused() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 90 ether;

        _fundVault(amountIn);

        bytes memory routerCalldata = _encodeAgniExactInputSingle(amountIn, minAmountOut);
        ExecutionTypes.ExecutionPayload memory payload = _payload(
            bytes32("EXEC-PAUSE"),
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
    }

    function testExecuteRevertsOnUnwhitelistedRouter() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 90 ether;

        MockRouter rogueRouter = new MockRouter();
        _fundVault(amountIn);

        bytes memory routerCalldata = _encodeAgniExactInputSingle(amountIn, minAmountOut);
        ExecutionTypes.ExecutionPayload memory payload = _payload(
            bytes32("EXEC-ROUTER"),
            IAgniSwapRouter.exactInputSingle.selector,
            keccak256(routerCalldata),
            amountIn,
            minAmountOut
        );
        payload.router = address(rogueRouter);

        _approvePayload(payload);

        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(Errors.RouterNotWhitelisted.selector, address(rogueRouter)));
        vault.executeApprovedTrade(payload, routerCalldata, amountIn);
    }

    function testExecuteRevertsOnSelectorMismatch() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 90 ether;

        _fundVault(amountIn);

        bytes memory routerCalldata = _encodeMockSwap(amountIn, minAmountOut);
        ExecutionTypes.ExecutionPayload memory payload = _payload(
            bytes32("EXEC-SELECTOR"),
            IAgniSwapRouter.exactInputSingle.selector,
            keccak256(routerCalldata),
            amountIn,
            minAmountOut
        );

        _approvePayload(payload);

        vm.prank(executor);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.InvalidCalldataSelector.selector,
                IAgniSwapRouter.exactInputSingle.selector,
                MOCK_SWAP_SELECTOR
            )
        );
        vault.executeApprovedTrade(payload, routerCalldata, amountIn);
    }

    function testExecuteRevertsOnCalldataHashMismatch() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 90 ether;

        _fundVault(amountIn);

        bytes memory routerCalldata = _encodeAgniExactInputSingle(amountIn, minAmountOut);
        ExecutionTypes.ExecutionPayload memory payload = _payload(
            bytes32("EXEC-CALLDATA"),
            IAgniSwapRouter.exactInputSingle.selector,
            keccak256("different-calldata"),
            amountIn,
            minAmountOut
        );

        _approvePayload(payload);

        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(Errors.ProposalHashMismatch.selector, payload.proposalId));
        vault.executeApprovedTrade(payload, routerCalldata, amountIn);
    }

    function testExecuteRevertsOnRecipientMismatchInCalldata() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 90 ether;

        _fundVault(amountIn);

        IAgniSwapRouter.ExactInputSingleParams memory params = IAgniSwapRouter.ExactInputSingleParams({
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            fee: 3000,
            recipient: outsider,
            deadline: block.timestamp + 1 days,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });
        bytes memory routerCalldata = abi.encodeWithSelector(IAgniSwapRouter.exactInputSingle.selector, params);

        ExecutionTypes.ExecutionPayload memory payload = _payload(
            bytes32("EXEC-RECIPIENT"),
            IAgniSwapRouter.exactInputSingle.selector,
            keccak256(routerCalldata),
            amountIn,
            minAmountOut
        );

        _approvePayload(payload);

        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(Errors.RecipientMismatch.selector, address(vault), outsider));
        vault.executeApprovedTrade(payload, routerCalldata, amountIn);
    }

    function testExecuteRevertsOnInsufficientOutput() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 90 ether;
        uint256 realizedAmountOut = 80 ether;

        _fundVault(amountIn);
        router.setNextAmountOut(realizedAmountOut);

        bytes memory routerCalldata = _encodeAgniExactInputSingle(amountIn, minAmountOut);
        ExecutionTypes.ExecutionPayload memory payload = _payload(
            bytes32("EXEC-SLIPPAGE"),
            IAgniSwapRouter.exactInputSingle.selector,
            keccak256(routerCalldata),
            amountIn,
            minAmountOut
        );

        _approvePayload(payload);

        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(Errors.InsufficientOutput.selector, minAmountOut, realizedAmountOut));
        vault.executeApprovedTrade(payload, routerCalldata, amountIn);
    }

    function testEmergencyWithdrawRoleRestriction() public {
        tokenOut.mint(address(vault), 10 ether);

        vm.prank(executor);
        vm.expectRevert(Errors.Unauthorized.selector);
        vault.emergencyWithdrawToken(address(tokenOut), outsider, 10 ether);
    }

    function testEmergencyWithdrawTokenAndNative() public {
        tokenOut.mint(address(vault), 10 ether);
        vm.deal(address(vault), 1 ether);

        vm.prank(recovery);
        vault.emergencyWithdrawToken(address(tokenOut), outsider, 10 ether);

        vm.prank(recovery);
        vault.emergencyWithdrawNative(payable(outsider), 1 ether);

        assertEq(tokenOut.balanceOf(outsider), 10 ether);
        assertEq(outsider.balance, 1 ether);
    }
}
