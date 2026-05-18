// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PauseGuardian} from "src/core/PauseGuardian.sol";
import {TradeApprovalManager} from "src/core/TradeApprovalManager.sol";
import {ExecutorVault} from "src/core/ExecutorVault.sol";
import {IAgniSwapRouter} from "src/interfaces/IAgniSwapRouter.sol";
import {ExecutionTypes} from "src/libraries/ExecutionTypes.sol";
import {Roles} from "src/libraries/Roles.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {MockRouter} from "src/mocks/MockRouter.sol";

abstract contract MockSetup is Test {
    bytes4 internal constant MOCK_SWAP_SELECTOR = bytes4(keccak256("swap(address,address,address,address,uint256,uint256)"));

    address internal admin = address(0xA11CE);
    address internal guardian = address(0xB0B);
    address internal approver = address(0xCAFE);
    address internal executor = address(0xE0);
    address internal recovery = address(0xF0);
    address internal outsider = address(0xBAD);

    PauseGuardian internal pauseGuardian;
    TradeApprovalManager internal approvalManager;
    ExecutorVault internal vault;
    MockERC20 internal tokenIn;
    MockERC20 internal tokenOut;
    MockRouter internal router;

    function _deploySystem() internal {
        vm.prank(admin);
        pauseGuardian = new PauseGuardian(admin, guardian);

        vm.prank(admin);
        approvalManager = new TradeApprovalManager(admin, approver);

        vm.prank(admin);
        vault = new ExecutorVault(admin, executor, recovery, address(pauseGuardian), address(approvalManager));

        tokenIn = new MockERC20();
        tokenOut = new MockERC20();
        router = new MockRouter();

        vm.prank(admin);
        approvalManager.grantRole(Roles.EXECUTOR_ROLE, address(vault));
    }

    function _allowSelector(bytes4 selector) internal {
        vm.startPrank(admin);
        pauseGuardian.setRouterWhitelist(address(router), true);
        pauseGuardian.setSelectorAllowed(address(router), selector, true);
        vm.stopPrank();
    }

    function _fundVault(uint256 amount) internal {
        tokenIn.mint(address(vault), amount);
    }

    function _payload(
        bytes32 proposalId,
        bytes4 selector,
        bytes32 calldataHash,
        uint256 maxAmountIn,
        uint256 minAmountOut
    ) internal view returns (ExecutionTypes.ExecutionPayload memory payload) {
        payload.proposalId = proposalId;
        payload.planHash = keccak256(abi.encodePacked("plan", proposalId));
        payload.router = address(router);
        payload.selector = selector;
        payload.calldataHash = calldataHash;
        payload.tokenIn = address(tokenIn);
        payload.tokenOut = address(tokenOut);
        payload.recipient = address(vault);
        payload.maxAmountIn = maxAmountIn;
        payload.minAmountOut = minAmountOut;
        payload.nativeValue = 0;
        payload.deadline = block.timestamp + 1 days;
        payload.proposalExpiry = block.timestamp + 1 days;
        payload.nonce = 1;
    }

    function _approvePayload(ExecutionTypes.ExecutionPayload memory payload) internal {
        vm.startPrank(approver);
        approvalManager.createProposal(payload);
        approvalManager.approveProposal(payload.proposalId);
        vm.stopPrank();
    }

    function _encodeAgniExactInputSingle(uint256 amountIn, uint256 minAmountOut) internal view returns (bytes memory) {
        IAgniSwapRouter.ExactInputSingleParams memory params = IAgniSwapRouter.ExactInputSingleParams({
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            fee: 3000,
            recipient: address(vault),
            deadline: block.timestamp + 1 days,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });

        return abi.encodeWithSelector(IAgniSwapRouter.exactInputSingle.selector, params);
    }

    function _encodeMockSwap(uint256 amountIn, uint256 amountOut) internal view returns (bytes memory) {
        return abi.encodeWithSelector(
            MOCK_SWAP_SELECTOR,
            address(tokenIn),
            address(tokenOut),
            address(vault),
            address(vault),
            amountIn,
            amountOut
        );
    }
}
