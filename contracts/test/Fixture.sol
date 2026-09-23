// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CapsuleRegistry} from "../src/CapsuleRegistry.sol";

/// @dev Shared setup: a registry, three key-registered relayers, a creator and named members.
abstract contract Fixture is Test {
    CapsuleRegistry internal reg;

    address internal creator;
    address internal alice;
    address internal bob;
    address internal carol;
    address[] internal relayers;

    uint256 internal constant T0 = 1_800_000_000;
    bytes32 internal constant META = keccak256("encrypted-metadata");
    bytes32 internal constant FP = keccak256("member-encryption-key");

    function setUp() public virtual {
        vm.warp(T0);
        reg = new CapsuleRegistry();
        creator = makeAddr("creator");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");
        for (uint256 i; i < 3; ++i) {
            address r = makeAddr(string.concat("relayer", vm.toString(i)));
            vm.prank(r);
            reg.registerRelayerKey(keccak256(abi.encode("relayer-key", i)));
            relayers.push(r);
        }
    }

    // ---------------------------------------------------------------- builders

    function _policy() internal view returns (CapsuleRegistry.Policy memory p) {
        p.sealAt = uint64(block.timestamp + 1 days);
        p.releaseAt = uint64(block.timestamp + 2 days);
        p.expiresAt = 0;
        p.capacity = 4;
        p.minContributions = 2;
        p.unanimousConsent = false;
        p.receiptThreshold = 2;
        p.relayers = relayers;
    }

    function _create(CapsuleRegistry.Policy memory p) internal returns (uint256 id) {
        vm.prank(creator);
        id = reg.createCircle(p, META);
    }

    function _createOpen(CapsuleRegistry.Policy memory p) internal returns (uint256 id) {
        id = _create(p);
        vm.prank(creator);
        reg.openCircle(id);
    }

    function _issueInvite(uint256 id, string memory label) internal returns (address key, uint256 pk) {
        (key, pk) = makeAddrAndKey(string.concat("invite-", label, vm.toString(id)));
        address[] memory keys = new address[](1);
        keys[0] = key;
        vm.prank(creator);
        reg.issueInvitations(id, keys);
    }

    function _inviteSig(uint256 id, address member, uint256 invitePk) internal view returns (bytes memory) {
        bytes32 digest = reg.inviteDigest(id, member);
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(invitePk, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _join(uint256 id, address member) internal {
        (address key, uint256 pk) = _issueInvite(id, vm.toString(member));
        bytes memory sig = _inviteSig(id, member, pk);
        vm.prank(member);
        reg.acceptInvitation(id, key, sig);
    }

    function _consent(uint256 id, address member) internal {
        bytes32 h = reg.getCircle(id).policyHash;
        vm.prank(member);
        reg.recordConsent(id, h, FP);
    }

    function _contribute(uint256 id, address member) internal {
        vm.prank(member);
        reg.commitContribution(id, keccak256(abi.encode("manifest", id, member)));
    }

    /// @dev creator + alice joined, both consented and contributed; returns the circle id.
    function _collectedCircle(CapsuleRegistry.Policy memory p) internal returns (uint256 id) {
        id = _createOpen(p);
        _join(id, alice);
        _consent(id, creator);
        _consent(id, alice);
        _contribute(id, creator);
        _contribute(id, alice);
    }

    function _eligibleCircle() internal returns (uint256 id) {
        CapsuleRegistry.Policy memory p = _policy();
        id = _collectedCircle(p);
        vm.warp(p.releaseAt);
        reg.requestRelease(id);
    }

    function _state(uint256 id) internal view returns (CapsuleRegistry.Lifecycle) {
        return reg.lifecycleOf(id);
    }

    function _wrong(CapsuleRegistry.Lifecycle s) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(CapsuleRegistry.WrongLifecycle.selector, s);
    }
}
