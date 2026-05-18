// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgniSwapRouter} from "../interfaces/IAgniSwapRouter.sol";
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
        MockERC20(tokenIn).transferFrom(from, address(this), amountIn);
        MockERC20(tokenOut).mint(to, amountOut);
    }

    function exactInputSingle(IAgniSwapRouter.ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        if (forceRevert) revert("forced");

        MockERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);

        amountOut = nextAmountOut == 0 ? params.amountOutMinimum : nextAmountOut;
        MockERC20(params.tokenOut).mint(params.recipient, amountOut);
    }
}
