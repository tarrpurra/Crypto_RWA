// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgniSwapRouter} from "../interfaces/IAgniSwapRouter.sol";
import {IMerchantMoeRouter} from "../interfaces/IMerchantMoeRouter.sol";
import {MockERC20} from "./MockERC20.sol";

contract MockRouter {
    uint256 public nextAmountOut;
    bool public forceRevert;

    function setNextAmountOut(uint256 amount) external {
        nextAmountOut = amount;
    }

    function setForceRevert(bool value) external {
        forceRevert = value;
    }

    function swap(address tokenIn, address tokenOut, address from, address to, uint256 amountIn, uint256 amountOut) external {
        if (forceRevert) revert("forced");
        require(MockERC20(tokenIn).transferFrom(from, address(this), amountIn), "transfer-in-failed");
        MockERC20(tokenOut).mint(to, amountOut);
    }

    function exactInputSingle(IAgniSwapRouter.ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        if (forceRevert) revert("forced");

        require(MockERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn), "transfer-in-failed");

        amountOut = nextAmountOut == 0 ? params.amountOutMinimum : nextAmountOut;
        MockERC20(params.tokenOut).mint(params.recipient, amountOut);
    }

    function exactInput(IAgniSwapRouter.ExactInputParams calldata params) external payable returns (uint256 amountOut) {
        if (forceRevert) revert("forced");

        address tokenIn = _decodeFirstV3Token(params.path);
        address tokenOut = _decodeLastV3Token(params.path);

        require(MockERC20(tokenIn).transferFrom(msg.sender, address(this), params.amountIn), "transfer-in-failed");

        amountOut = nextAmountOut == 0 ? params.amountOutMinimum : nextAmountOut;
        MockERC20(tokenOut).mint(params.recipient, amountOut);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        if (forceRevert) revert("forced");
        require(MockERC20(path[0]).transferFrom(msg.sender, address(this), amountIn), "transfer-in-failed");

        uint256 amountOut = nextAmountOut == 0 ? amountOutMin : nextAmountOut;
        MockERC20(path[path.length - 1]).mint(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;
    }

    function _decodeFirstV3Token(bytes memory path) internal pure returns (address token) {
        assembly {
            token := shr(96, mload(add(path, 0x20)))
        }
    }

    function _decodeLastV3Token(bytes memory path) internal pure returns (address token) {
        uint256 start = path.length - 20;
        assembly {
            token := shr(96, mload(add(add(path, 0x20), start)))
        }
    }
}

