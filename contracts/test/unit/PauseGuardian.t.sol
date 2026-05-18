// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PauseGuardian} from "src/core/PauseGuardian.sol";
import {Errors} from "src/libraries/Errors.sol";

contract PauseGuardianTest is Test {
    PauseGuardian internal guardianContract;

    address internal admin = address(0xA11CE);
    address internal guardian = address(0xB0B);
    address internal router = address(0x1111);
    bytes4 internal selector = bytes4(keccak256("swap(address,address,address,address,uint256,uint256)"));

    function setUp() public {
        vm.prank(admin);
        guardianContract = new PauseGuardian(admin, guardian);
    }

    function testOnlyAdminCanWhitelistRouter() public {
        vm.prank(guardian);
        vm.expectRevert(Errors.Unauthorized.selector);
        guardianContract.setRouterWhitelist(router, true);
    }

    function testPauseBlocksRouteEnforcement() public {
        vm.startPrank(admin);
        guardianContract.setRouterWhitelist(router, true);
        guardianContract.setSelectorAllowed(router, selector, true);
        vm.stopPrank();

        vm.prank(guardian);
        guardianContract.setPaused(true);

        vm.expectRevert(Errors.Paused.selector);
        guardianContract.enforceRoute(router, selector);
    }

    function testDisallowedSelectorReverts() public {
        vm.prank(admin);
        guardianContract.setRouterWhitelist(router, true);

        vm.expectRevert(abi.encodeWithSelector(Errors.SelectorNotAllowed.selector, router, selector));
        guardianContract.enforceRoute(router, selector);
    }
}
