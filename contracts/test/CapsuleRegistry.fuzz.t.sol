// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Fixture} from "./Fixture.sol";
import {CapsuleRegistry} from "../src/CapsuleRegistry.sol";

contract CapsuleRegistryFuzzTest is Fixture {
    /// @dev requestRelease succeeds exactly when block.timestamp >= releaseAt (and before any expiry).
    function testFuzz_releaseTimestampBoundary(uint32 sealDelta, uint32 gap, uint32 probe) public {
        CapsuleRegistry.Policy memory p = _policy();
        p.sealAt = uint64(block.timestamp) + 2 + uint64(sealDelta % 30 days);
        p.releaseAt = p.sealAt + uint64(gap % 30 days);
        uint256 id = _collectedCircle(p);

        uint256 t = uint256(p.sealAt) + (probe % (60 days));
        vm.warp(t);
        if (t < p.releaseAt) {
            vm.expectRevert(abi.encodeWithSelector(CapsuleRegistry.RuleNotSatisfied.selector, 1));
            reg.requestRelease(id);
        } else {
            reg.requestRelease(id);
            assertEq(reg.getCircle(id).eligibleAt, t);
        }
    }

    /// @dev The contribution window is exactly [open, sealAt).
    function testFuzz_contributionWindow(uint32 sealDelta, uint32 probe) public {
        CapsuleRegistry.Policy memory p = _policy();
        p.sealAt = uint64(block.timestamp) + 2 + uint64(sealDelta % 30 days);
        p.releaseAt = p.sealAt;
        uint256 id = _createOpen(p);
        _consent(id, creator);
        uint256 t = block.timestamp + (probe % (60 days));
        vm.warp(t);
        vm.prank(creator);
        if (t < p.sealAt) {
            reg.commitContribution(id, keccak256("c"));
            assertTrue(reg.getMember(id, creator).contributed);
        } else {
            vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.SEALED));
            reg.commitContribution(id, keccak256("c"));
        }
    }

    /// @dev createCircle accepts a policy iff the documented predicate holds.
    function testFuzz_policyValidationMatchesPredicate(
        uint32 sealDelta,
        int32 releaseGap,
        uint32 expiryGap,
        uint8 capacity,
        uint8 minContributions,
        uint8 threshold,
        uint8 nRelayers
    ) public {
        CapsuleRegistry.Policy memory p;
        p.sealAt = uint64(block.timestamp) + uint64(sealDelta % 10 days);
        int256 rel = int256(uint256(p.sealAt)) + int256(releaseGap % int32(10 days));
        p.releaseAt = rel < 0 ? 0 : uint64(uint256(rel));
        p.expiresAt = expiryGap % 3 == 0 ? 0 : p.releaseAt + uint64(expiryGap % 5 days);
        p.capacity = capacity;
        p.minContributions = minContributions;
        p.receiptThreshold = threshold;
        uint256 n = nRelayers % 5; // 0..4, only 3 registered
        p.relayers = new address[](n);
        for (uint256 i; i < n; ++i) p.relayers[i] = i < 3 ? relayers[i] : makeAddr("unregistered");

        bool ok = p.sealAt > block.timestamp && p.releaseAt >= p.sealAt
            && (p.expiresAt == 0 || p.expiresAt > p.releaseAt) && p.capacity >= 2 && p.capacity <= 64
            && p.minContributions >= 1 && p.minContributions <= p.capacity && n >= 1 && n <= 3
            && p.receiptThreshold >= 1 && p.receiptThreshold <= n;

        vm.prank(creator);
        if (ok) {
            uint256 id = reg.createCircle(p, META);
            assertEq(reg.getCircle(id).policyHash, reg.hashPolicy(p));
        } else {
            vm.expectRevert();
            reg.createCircle(p, META);
        }
    }

    /// @dev Only the exact consented rule hash is accepted.
    function testFuzz_consentRequiresExactHash(bytes32 h) public {
        uint256 id = _createOpen(_policy());
        _join(id, alice);
        bytes32 real = reg.getCircle(id).policyHash;
        vm.prank(alice);
        if (h == real) {
            reg.recordConsent(id, h, FP);
        } else {
            vm.expectRevert(CapsuleRegistry.PolicyHashMismatch.selector);
            reg.recordConsent(id, h, FP);
        }
    }
}
