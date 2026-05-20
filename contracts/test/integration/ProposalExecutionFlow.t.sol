// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TradeApprovalManager} from "src/core/TradeApprovalManager.sol";
import {IAgniSwapRouter} from "src/interfaces/IAgniSwapRouter.sol";
import {ExecutionTypes} from "src/libraries/ExecutionTypes.sol";
import {MockSetup} from "test/mocks/MockSetup.sol";

contract ProposalExecutionFlowTest is MockSetup {
    function setUp() public {
        _deploySystem();
        _allowSelector(IAgniSwapRouter.exactInputSingle.selector);
    }

    function testProposalApprovalExecutionFlow() public {
        uint256 amountIn = 100 ether;
        uint256 minAmountOut = 95 ether;
        uint256 realizedAmountOut = 110 ether;

        _fundVault(amountIn);
        router.setNextAmountOut(realizedAmountOut);

        bytes memory routerCalldata = _encodeAgniExactInputSingle(amountIn, minAmountOut);
        ExecutionTypes.ExecutionPayload memory payload = _payload(
            keccak256("FLOW-1"),
            IAgniSwapRouter.exactInputSingle.selector,
            keccak256(routerCalldata),
            amountIn,
            minAmountOut
        );

        _approvePayload(payload);

        vm.prank(executor);
        vault.executeApprovedTrade(payload, routerCalldata, amountIn);

        TradeApprovalManager.ProposalRecord memory proposal = approvalManager.getProposal(payload.proposalId);
        assertEq(uint256(proposal.status), uint256(ExecutionTypes.ProposalStatus.EXECUTED));
        assertEq(tokenOut.balanceOf(address(vault)), realizedAmountOut);
    }
}

