// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Errors} from "../libraries/Errors.sol";
import {Events} from "../libraries/Events.sol";
import {ExecutionTypes} from "../libraries/ExecutionTypes.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {IAgniSwapRouter} from "../interfaces/IAgniSwapRouter.sol";
import {IMerchantMoeRouter} from "../interfaces/IMerchantMoeRouter.sol";
import {PauseGuardian} from "./PauseGuardian.sol";
import {TradeApprovalManager} from "./TradeApprovalManager.sol";
import {Roles} from "../libraries/Roles.sol";

contract ExecutorVault {
    bytes4 internal constant MOCK_SWAP_SELECTOR = bytes4(keccak256("swap(address,address,address,address,uint256,uint256)"));
    uint256 internal constant V3_PATH_TOKEN_SIZE = 20;
    uint256 internal constant V3_PATH_FEE_SIZE = 3;
    uint256 internal constant V3_PATH_HOP_SIZE = V3_PATH_TOKEN_SIZE + V3_PATH_FEE_SIZE;
    uint256 internal constant V3_MIN_PATH_LENGTH = V3_PATH_TOKEN_SIZE + V3_PATH_FEE_SIZE + V3_PATH_TOKEN_SIZE;

    PauseGuardian public immutable pauseGuardian;
    TradeApprovalManager public immutable tradeApprovalManager;

    mapping(bytes32 role => mapping(address account => bool allowed)) private _roles;

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Errors.Unauthorized();
        _;
    }

    constructor(address admin, address executor, address recovery, address pauseGuardian_, address tradeApprovalManager_) {
        if (admin == address(0) || executor == address(0) || recovery == address(0)) revert Errors.ZeroAddress();
        if (pauseGuardian_ == address(0) || tradeApprovalManager_ == address(0)) revert Errors.ZeroAddress();

        _roles[Roles.DEFAULT_ADMIN_ROLE][admin] = true;
        _roles[Roles.EXECUTOR_ROLE][executor] = true;
        _roles[Roles.RECOVERY_ROLE][recovery] = true;

        pauseGuardian = PauseGuardian(pauseGuardian_);
        tradeApprovalManager = TradeApprovalManager(tradeApprovalManager_);
    }

    receive() external payable {}

    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    function grantRole(bytes32 role, address account) external onlyRole(Roles.DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert Errors.ZeroAddress();
        _roles[role][account] = true;
        emit Events.RoleGranted(role, account, msg.sender);
    }

    function revokeRole(bytes32 role, address account) external onlyRole(Roles.DEFAULT_ADMIN_ROLE) {
        _roles[role][account] = false;
        emit Events.RoleRevoked(role, account, msg.sender);
    }

    function executeApprovedTrade(
        ExecutionTypes.ExecutionPayload calldata payload,
        bytes calldata routerCalldata,
        uint256 amountIn
    ) external payable onlyRole(Roles.EXECUTOR_ROLE) {
        _validateExecutionRequest(payload, routerCalldata, amountIn);

        if (!tradeApprovalManager.isApprovedAndLive(payload)) {
            revert Errors.ProposalNotApproved(payload.proposalId);
        }

        uint256 realized = _executeSwap(payload, routerCalldata, amountIn);
        tradeApprovalManager.markExecuted(payload);
        _emitTradeExecuted(payload, amountIn, realized);
    }

    function emergencyWithdrawToken(address token, address to, uint256 amount) external onlyRole(Roles.RECOVERY_ROLE) {
        if (to == address(0) || token == address(0)) revert Errors.ZeroAddress();
        bool ok = IERC20(token).transfer(to, amount);
        if (!ok) revert Errors.ExternalCallFailed();
        emit Events.EmergencyWithdrawal(token, to, amount, msg.sender);
    }

    function emergencyWithdrawNative(address payable to, uint256 amount) external onlyRole(Roles.RECOVERY_ROLE) {
        if (to == address(0)) revert Errors.ZeroAddress();
        (bool success,) = to.call{value: amount}("");
        if (!success) revert Errors.ExternalCallFailed();
        emit Events.EmergencyWithdrawal(address(0), to, amount, msg.sender);
    }

    function _validateExecutionRequest(
        ExecutionTypes.ExecutionPayload calldata payload,
        bytes calldata routerCalldata,
        uint256 amountIn
    ) internal view {
        pauseGuardian.enforceRoute(payload.router, payload.selector);

        if (payload.tokenOut == address(0)) revert Errors.ZeroAddress();
        // forge-lint: disable-next-line(block-timestamp)
        if (payload.deadline < block.timestamp) revert Errors.InvalidDeadline(payload.deadline);
        if (payload.recipient != address(this)) revert Errors.Unauthorized();
        if (msg.value != payload.nativeValue) revert Errors.NativeValueMismatch(payload.nativeValue, msg.value);
        if (amountIn > payload.maxAmountIn) revert Errors.SpendCapExceeded(payload.maxAmountIn, amountIn);
        if (keccak256(routerCalldata) != payload.calldataHash) revert Errors.ProposalHashMismatch(payload.proposalId);

        _validateRouterCalldata(payload, routerCalldata, amountIn);
    }

    function _executeSwap(
        ExecutionTypes.ExecutionPayload calldata payload,
        bytes calldata routerCalldata,
        uint256 amountIn
    ) internal returns (uint256 realized) {
        uint256 balanceBefore = IERC20(payload.tokenOut).balanceOf(address(this));

        if (payload.tokenIn != address(0)) {
            _safeApprove(payload.tokenIn, payload.router, 0);
            _safeApprove(payload.tokenIn, payload.router, amountIn);
        }

        (bool success,) = payload.router.call{value: payload.nativeValue}(routerCalldata);
        if (!success) revert Errors.ExternalCallFailed();

        uint256 balanceAfter = IERC20(payload.tokenOut).balanceOf(address(this));
        realized = balanceAfter - balanceBefore;
        if (realized < payload.minAmountOut) revert Errors.InsufficientOutput(payload.minAmountOut, realized);

        if (payload.tokenIn != address(0)) {
            _safeApprove(payload.tokenIn, payload.router, 0);
        }
    }

    function _emitTradeExecuted(
        ExecutionTypes.ExecutionPayload calldata payload,
        uint256 amountIn,
        uint256 realized
    ) internal {
        emit Events.TradeExecuted(
            payload.proposalId,
            payload.router,
            payload.tokenOut,
            amountIn,
            payload.minAmountOut,
            realized,
            payload.recipient,
            msg.sender
        );
    }

    function _safeApprove(address token, address spender, uint256 amount) internal {
        bool ok = IERC20(token).approve(spender, amount);
        if (!ok) revert Errors.TokenApproveFailed(token, spender);
    }

    function _validateRouterCalldata(
        ExecutionTypes.ExecutionPayload calldata payload,
        bytes calldata routerCalldata,
        uint256 amountIn
    ) internal view {
        bytes4 selector = _selectorFromCalldata(routerCalldata);
        if (selector != payload.selector) revert Errors.InvalidCalldataSelector(payload.selector, selector);

        if (selector == IAgniSwapRouter.exactInputSingle.selector) {
            _validateAgniExactInputSingle(payload, routerCalldata[4:], amountIn);
            return;
        }

        if (selector == IAgniSwapRouter.exactInput.selector) {
            _validateAgniExactInput(payload, routerCalldata[4:], amountIn);
            return;
        }

        if (selector == IMerchantMoeRouter.swapExactTokensForTokens.selector) {
            _validateMerchantMoeClassicSwap(payload, routerCalldata[4:], amountIn);
            return;
        }

        if (selector == MOCK_SWAP_SELECTOR) {
            _validateMockSwap(payload, routerCalldata[4:], amountIn);
            return;
        }

        revert Errors.UnsupportedSelector(selector);
    }

    function _validateAgniExactInputSingle(
        ExecutionTypes.ExecutionPayload calldata payload,
        bytes calldata encodedParams,
        uint256 amountIn
    ) internal pure {
        IAgniSwapRouter.ExactInputSingleParams memory params =
            abi.decode(encodedParams, (IAgniSwapRouter.ExactInputSingleParams));

        if (params.tokenIn != payload.tokenIn) revert Errors.TokenInMismatch(payload.tokenIn, params.tokenIn);
        if (params.tokenOut != payload.tokenOut) revert Errors.TokenOutMismatch(payload.tokenOut, params.tokenOut);
        if (params.recipient != payload.recipient) revert Errors.RecipientMismatch(payload.recipient, params.recipient);
        if (params.deadline != payload.deadline) revert Errors.DeadlineMismatch(payload.deadline, params.deadline);
        if (params.amountIn != amountIn) revert Errors.AmountInMismatch(amountIn, params.amountIn);
        if (params.amountOutMinimum != payload.minAmountOut) {
            revert Errors.MinAmountOutMismatch(payload.minAmountOut, params.amountOutMinimum);
        }
    }

    function _validateAgniExactInput(
        ExecutionTypes.ExecutionPayload calldata payload,
        bytes calldata encodedParams,
        uint256 amountIn
    ) internal pure {
        IAgniSwapRouter.ExactInputParams memory params = abi.decode(encodedParams, (IAgniSwapRouter.ExactInputParams));
        if (params.recipient != payload.recipient) revert Errors.RecipientMismatch(payload.recipient, params.recipient);
        if (params.deadline != payload.deadline) revert Errors.DeadlineMismatch(payload.deadline, params.deadline);
        if (params.amountIn != amountIn) revert Errors.AmountInMismatch(amountIn, params.amountIn);
        if (params.amountOutMinimum != payload.minAmountOut) {
            revert Errors.MinAmountOutMismatch(payload.minAmountOut, params.amountOutMinimum);
        }

        (address tokenIn, address tokenOut) = _decodeV3PathEndpoints(params.path);
        if (tokenIn != payload.tokenIn) revert Errors.TokenInMismatch(payload.tokenIn, tokenIn);
        if (tokenOut != payload.tokenOut) revert Errors.TokenOutMismatch(payload.tokenOut, tokenOut);
    }

    function _validateMerchantMoeClassicSwap(
        ExecutionTypes.ExecutionPayload calldata payload,
        bytes calldata encodedParams,
        uint256 amountIn
    ) internal pure {
        (
            uint256 encodedAmountIn,
            uint256 encodedAmountOutMin,
            address[] memory path,
            address recipient,
            uint256 deadline
        ) = abi.decode(encodedParams, (uint256, uint256, address[], address, uint256));

        if (path.length < 2) revert Errors.InvalidPath();
        if (path[0] != payload.tokenIn) revert Errors.TokenInMismatch(payload.tokenIn, path[0]);
        if (path[path.length - 1] != payload.tokenOut) {
            revert Errors.TokenOutMismatch(payload.tokenOut, path[path.length - 1]);
        }
        if (recipient != payload.recipient) revert Errors.RecipientMismatch(payload.recipient, recipient);
        if (deadline != payload.deadline) revert Errors.DeadlineMismatch(payload.deadline, deadline);
        if (encodedAmountIn != amountIn) revert Errors.AmountInMismatch(amountIn, encodedAmountIn);
        if (encodedAmountOutMin != payload.minAmountOut) {
            revert Errors.MinAmountOutMismatch(payload.minAmountOut, encodedAmountOutMin);
        }
    }

    function _validateMockSwap(
        ExecutionTypes.ExecutionPayload calldata payload,
        bytes calldata encodedParams,
        uint256 amountIn
    ) internal view {
        (
            address tokenIn,
            address tokenOut,
            address from,
            address recipient,
            uint256 encodedAmountIn,
            uint256 encodedAmountOut
        ) = abi.decode(encodedParams, (address, address, address, address, uint256, uint256));

        if (tokenIn != payload.tokenIn) revert Errors.TokenInMismatch(payload.tokenIn, tokenIn);
        if (tokenOut != payload.tokenOut) revert Errors.TokenOutMismatch(payload.tokenOut, tokenOut);
        if (from != address(this)) revert Errors.CalldataSenderMismatch(address(this), from);
        if (recipient != payload.recipient) revert Errors.RecipientMismatch(payload.recipient, recipient);
        if (encodedAmountIn != amountIn) revert Errors.AmountInMismatch(amountIn, encodedAmountIn);
        if (encodedAmountOut < payload.minAmountOut) {
            revert Errors.MinAmountOutMismatch(payload.minAmountOut, encodedAmountOut);
        }
    }

    function _decodeV3PathEndpoints(bytes memory path) internal pure returns (address tokenIn, address tokenOut) {
        uint256 length = path.length;
        if (length < V3_MIN_PATH_LENGTH) revert Errors.InvalidPath();
        if ((length - V3_PATH_TOKEN_SIZE) % V3_PATH_HOP_SIZE != 0) revert Errors.InvalidPath();

        tokenIn = _addressFromBytes(path, 0);
        tokenOut = _addressFromBytes(path, length - V3_PATH_TOKEN_SIZE);
    }

    function _addressFromBytes(bytes memory data, uint256 start) internal pure returns (address token) {
        if (data.length < start + V3_PATH_TOKEN_SIZE) revert Errors.InvalidPath();
        assembly {
            token := shr(96, mload(add(add(data, 0x20), start)))
        }
    }

    function _selectorFromCalldata(bytes calldata data) internal pure returns (bytes4 selector) {
        if (data.length < 4) revert Errors.InvalidCalldata();

        assembly {
            selector := calldataload(data.offset)
        }
    }
}


