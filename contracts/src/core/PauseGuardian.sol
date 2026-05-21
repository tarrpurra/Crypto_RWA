// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Errors} from "../libraries/Errors.sol";
import {Events} from "../libraries/Events.sol";
import {Roles} from "../libraries/Roles.sol";

contract PauseGuardian {
    // Known Merchant Moe router addresses that remain intentionally out of the on-chain MVP surface.
    address public constant MERCHANT_MOE_LB_ROUTER = 0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a;
    address public constant MERCHANT_MOE_AGGREGATOR_ROUTER = 0x45A62B090DF48243F12A21897e7ed91863E2c86b;

    bool public paused;
    mapping(bytes32 role => mapping(address account => bool allowed)) private _roles;
    mapping(address router => bool allowed) public routerWhitelist;
    mapping(address router => mapping(bytes4 selector => bool allowed)) public selectorAllowlist;

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Errors.Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Errors.Paused();
        _;
    }

    constructor(address admin, address guardian) {
        if (admin == address(0) || guardian == address(0)) revert Errors.ZeroAddress();
        _roles[Roles.DEFAULT_ADMIN_ROLE][admin] = true;
        _roles[Roles.GUARDIAN_ROLE][guardian] = true;
    }

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

    function setPaused(bool value) external onlyRole(Roles.GUARDIAN_ROLE) {
        paused = value;
        emit Events.PauseStateSet(value, msg.sender);
    }

    function setRouterWhitelist(address router, bool allowed) external onlyRole(Roles.DEFAULT_ADMIN_ROLE) {
        if (router == address(0)) revert Errors.ZeroAddress();
        routerWhitelist[router] = allowed;
        emit Events.RouterWhitelistSet(router, allowed, msg.sender);
    }

    function setSelectorAllowed(address router, bytes4 selector, bool allowed) external onlyRole(Roles.DEFAULT_ADMIN_ROLE) {
        if (!routerWhitelist[router]) revert Errors.RouterNotWhitelisted(router);
        selectorAllowlist[router][selector] = allowed;
        emit Events.RouterSelectorSet(router, selector, allowed, msg.sender);
    }

    function enforceRoute(address router, bytes4 selector) external view whenNotPaused {
        if (!routerWhitelist[router]) revert Errors.RouterNotWhitelisted(router);
        if (!selectorAllowlist[router][selector]) revert Errors.SelectorNotAllowed(router, selector);
    }
}
