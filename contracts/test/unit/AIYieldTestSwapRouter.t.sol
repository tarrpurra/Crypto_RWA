// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {AIYieldTestSwapRouter} from "src/mocks/AIYieldTestSwapRouter.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";

contract AIYieldTestSwapRouterTest is Test {
    AIYieldTestSwapRouter internal router;
    MockERC20 internal wmnt;
    MockERC20 internal usdy;
    MockERC20 internal meth;

    address internal owner = address(0xA11CE);
    address internal trader = address(0xBEEF);
    address internal recipient = address(0xCAFE);

    function setUp() public {
        vm.startPrank(owner);
        router = new AIYieldTestSwapRouter(owner);
        wmnt = new MockERC20();
        usdy = new MockERC20();
        meth = new MockERC20();

        wmnt.mint(owner, 1_000 ether);
        usdy.mint(owner, 1_000 ether);
        meth.mint(owner, 10 ether);

        wmnt.approve(address(router), type(uint256).max);
        usdy.approve(address(router), type(uint256).max);
        meth.approve(address(router), type(uint256).max);

        router.configurePair(address(wmnt), address(usdy), 4_510, true);
        router.configurePair(address(usdy), address(wmnt), 22_173, true);
        router.configurePair(address(wmnt), address(meth), 30, true);
        router.configurePair(address(meth), address(wmnt), 3_322_266, true);

        router.addLiquidity(address(wmnt), 500 ether);
        router.addLiquidity(address(usdy), 250 ether);
        router.addLiquidity(address(meth), 2 ether);

        vm.stopPrank();
    }

    function testGetQuoteReturnsConfiguredAmount() public {
        uint256 quote = router.getQuote(address(wmnt), address(usdy), 100 ether);
        assertEq(quote, (100 ether * 4_510) / 10_000);
    }

    function testCheckRouteReturnsActiveAndLiquid() public {
        (bool active, bool hasLiquidity) = router.checkRoute(address(wmnt), address(usdy), 10 ether);
        assertTrue(active);
        assertTrue(hasLiquidity);
    }

    function testSwapTransfersTokenOutAndConsumesTokenIn() public {
        uint256 amountIn = 100 ether;
        uint256 minOut = 40 ether;

        vm.startPrank(owner);
        wmnt.transfer(trader, amountIn);
        vm.stopPrank();

        vm.startPrank(trader);
        wmnt.approve(address(router), amountIn);
        uint256 amountOut = router.swap(address(wmnt), address(usdy), trader, recipient, amountIn, minOut);
        vm.stopPrank();

        assertEq(amountOut, (amountIn * 4_510) / 10_000);
        assertEq(wmnt.balanceOf(trader), 0);
        assertEq(usdy.balanceOf(recipient), (amountIn * 4_510) / 10_000);
    }

    function testSwapRevertsWhenLiquidityIsMissing() public {
        vm.startPrank(owner);
        AIYieldTestSwapRouter emptyRouter = new AIYieldTestSwapRouter(owner);
        emptyRouter.configurePair(address(wmnt), address(usdy), 4_510, true);
        wmnt.transfer(trader, 10 ether);
        vm.stopPrank();

        vm.startPrank(trader);
        wmnt.approve(address(emptyRouter), 10 ether);
        vm.expectRevert(bytes("liquidity"));
        emptyRouter.swap(address(wmnt), address(usdy), trader, recipient, 10 ether, 1 ether);
        vm.stopPrank();
    }

    function testSwapRevertsBelowMinOut() public {
        vm.startPrank(owner);
        wmnt.transfer(trader, 10 ether);
        vm.stopPrank();

        vm.startPrank(trader);
        wmnt.approve(address(router), 10 ether);
        vm.expectRevert(bytes("slippage"));
        router.swap(address(wmnt), address(usdy), trader, recipient, 10 ether, 100 ether);
        vm.stopPrank();
    }

    function testInactiveRouteIsRejected() public {
        vm.startPrank(owner);
        router.configurePair(address(wmnt), address(usdy), 4_510, false);
        wmnt.transfer(trader, 10 ether);
        vm.stopPrank();

        vm.startPrank(trader);
        wmnt.approve(address(router), 10 ether);
        vm.expectRevert(bytes("route inactive"));
        router.swap(address(wmnt), address(usdy), trader, recipient, 10 ether, 1 ether);
        vm.stopPrank();
    }
}
