// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";

contract AIYieldTestSwapRouter {
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    address public owner;

    struct PairConfig {
        bool active;
        uint256 rateBps;
    }

    mapping(bytes32 pairKey => PairConfig config) private _pairs;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PairConfigured(address indexed tokenIn, address indexed tokenOut, uint256 rateBps, bool active);
    event LiquidityAdded(address indexed token, address indexed provider, uint256 amount);
    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        address indexed from,
        address to,
        uint256 amountIn,
        uint256 amountOut
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address initialOwner) {
        require(initialOwner != address(0), "zero owner");
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function configurePair(address tokenIn, address tokenOut, uint256 rateBps, bool active) external onlyOwner {
        require(tokenIn != address(0) && tokenOut != address(0), "zero token");
        require(rateBps > 0, "rate zero");
        _pairs[_pairKey(tokenIn, tokenOut)] = PairConfig({active: active, rateBps: rateBps});
        emit PairConfigured(tokenIn, tokenOut, rateBps, active);
    }

    function addLiquidity(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "zero token");
        require(amount > 0, "amount zero");
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transfer failed");
        emit LiquidityAdded(token, msg.sender, amount);
    }

    function getQuote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256 amountOut) {
        PairConfig memory config = _pairs[_pairKey(tokenIn, tokenOut)];
        if (!config.active || amountIn == 0) {
            return 0;
        }
        return (amountIn * config.rateBps) / BPS_DENOMINATOR;
    }

    function checkRoute(address tokenIn, address tokenOut, uint256 amountIn) external view returns (bool active, bool hasLiquidity) {
        PairConfig memory config = _pairs[_pairKey(tokenIn, tokenOut)];
        if (!config.active) {
            return (false, false);
        }
        uint256 amountOut = getQuote(tokenIn, tokenOut, amountIn);
        return (true, amountOut > 0 && IERC20(tokenOut).balanceOf(address(this)) >= amountOut);
    }

    function swap(
        address tokenIn,
        address tokenOut,
        address from,
        address to,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut) {
        PairConfig memory config = _pairs[_pairKey(tokenIn, tokenOut)];
        require(config.active, "route inactive");
        require(amountIn > 0, "amount zero");

        amountOut = getQuote(tokenIn, tokenOut, amountIn);
        require(amountOut >= minAmountOut, "slippage");
        require(IERC20(tokenOut).balanceOf(address(this)) >= amountOut, "liquidity");
        require(IERC20(tokenIn).transferFrom(from, address(this), amountIn), "transfer-in failed");
        require(IERC20(tokenOut).transfer(to, amountOut), "transfer-out failed");

        emit SwapExecuted(tokenIn, tokenOut, from, to, amountIn, amountOut);
    }

    function _pairKey(address tokenIn, address tokenOut) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(tokenIn, tokenOut));
    }
}
