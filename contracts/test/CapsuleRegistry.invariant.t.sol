// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {CapsuleRegistry} from "../src/CapsuleRegistry.sol";

/// @dev Drives random participant sequences against the registry while keeping an
///      independent shadow model. Every call's accept/revert outcome must match the model,
///      and every recorded release is checked against the rule at the moment it happened.
contract Handler is Test {
    CapsuleRegistry public reg;
    address public creator;
    address[5] public members;
    address[3] public relayers;

    struct Shadow {
        bool exists;
        bool opened;
        bool cancelled;
        bool locked;
        bool nonCreatorContributed;
        uint64 eligibleAt;
        uint16 memberCount;
        uint16 consentCount;
        uint16 contributionCount;
        uint8 receiptCount;
        bytes32 policyHash;
        bytes32 lockedPolicyHash;
        uint64 sealAt;
        uint64 releaseAt;
        uint64 expiresAt;
        uint16 capacity;
        uint16 minContributions;
        bool unanimous;
        uint8 threshold;
    }

    uint256 public circleId;
    Shadow internal s;
    mapping(address => bool) public joined;
    mapping(address => bool) public consented;
    mapping(address => bool) public contributed;
    mapping(address => bool) public receipted;

    // Ghosts checked by invariants.
    uint256 public mismatches;
    uint256 public illegalReleases;
    uint256 public releasesRecorded;
    uint256 public cancelAfterForeignContribution;
    uint256 public calls;

    constructor(CapsuleRegistry reg_) {
        reg = reg_;
        creator = makeAddr("h-creator");
        for (uint256 i; i < 5; ++i) members[i] = makeAddr(string.concat("h-member", vm.toString(i)));
        for (uint256 i; i < 3; ++i) {
            relayers[i] = makeAddr(string.concat("h-relayer", vm.toString(i)));
            vm.prank(relayers[i]);
            reg.registerRelayerKey(bytes32(i + 1));
        }
    }

    function shadow() external view returns (Shadow memory) {
        return s;
    }

    // ---------------------------------------------------------------- helpers

    function _lifecycle() internal view returns (CapsuleRegistry.Lifecycle) {
        if (s.cancelled) return CapsuleRegistry.Lifecycle.CANCELLED;
        if (s.eligibleAt != 0) {
            return s.receiptCount >= s.threshold
                ? CapsuleRegistry.Lifecycle.RELEASED
                : CapsuleRegistry.Lifecycle.RELEASE_ELIGIBLE;
        }
        if (!s.opened) return CapsuleRegistry.Lifecycle.DRAFT;
        if (block.timestamp >= s.sealAt) {
            if (s.expiresAt != 0 && block.timestamp >= s.expiresAt) return CapsuleRegistry.Lifecycle.EXPIRED;
            return CapsuleRegistry.Lifecycle.SEALED;
        }
        return s.locked ? CapsuleRegistry.Lifecycle.COLLECTING : CapsuleRegistry.Lifecycle.AWAITING_CONSENT;
    }

    function shadowLifecycle() external view returns (CapsuleRegistry.Lifecycle) {
        return _lifecycle();
    }

    function _collecting() internal view returns (bool) {
        CapsuleRegistry.Lifecycle l = _lifecycle();
        return l == CapsuleRegistry.Lifecycle.AWAITING_CONSENT || l == CapsuleRegistry.Lifecycle.COLLECTING;
    }

    function _check(bool expectOk, bool ok) internal {
        calls++;
        if (expectOk != ok) mismatches++;
    }

    function _actor(uint256 seed) internal view returns (address) {
        uint256 i = seed % 6;
        return i == 5 ? creator : members[i];
    }

    function _buildPolicy(uint256 seed) internal view returns (CapsuleRegistry.Policy memory p) {
        p.sealAt = uint64(block.timestamp + 1 + (seed % 3 days));
        p.releaseAt = p.sealAt + uint64((seed >> 16) % 3 days);
        p.expiresAt = ((seed >> 32) % 3 == 0) ? 0 : p.releaseAt + 1 + uint64((seed >> 40) % 2 days);
        p.capacity = uint16(2 + ((seed >> 48) % 5));
        p.minContributions = uint16(1 + ((seed >> 56) % p.capacity));
        p.unanimousConsent = ((seed >> 64) % 2) == 0;
        uint256 nRelayers = 1 + ((seed >> 72) % 3);
        p.receiptThreshold = uint8(1 + ((seed >> 80) % nRelayers));
        p.relayers = new address[](nRelayers);
        for (uint256 i; i < nRelayers; ++i) p.relayers[i] = relayers[i];
    }

    function _adopt(CapsuleRegistry.Policy memory p) internal {
        s.policyHash = reg.hashPolicy(p);
        s.sealAt = p.sealAt;
        s.releaseAt = p.releaseAt;
        s.expiresAt = p.expiresAt;
        s.capacity = p.capacity;
        s.minContributions = p.minContributions;
        s.unanimous = p.unanimousConsent;
        s.threshold = p.receiptThreshold;
    }

    // ---------------------------------------------------------------- actions

    function create(uint256 seed) external {
        if (s.exists) return;
        CapsuleRegistry.Policy memory p = _buildPolicy(seed);
        vm.prank(creator);
        circleId = reg.createCircle(p, bytes32(seed));
        s.exists = true;
        s.memberCount = 1;
        joined[creator] = true;
        _adopt(p);
    }

    function update(uint256 seed) external {
        if (!s.exists) return;
        CapsuleRegistry.Policy memory p = _buildPolicy(seed);
        CapsuleRegistry.Lifecycle l = _lifecycle();
        bool expect = !s.locked && s.contributionCount == 0 && p.capacity >= s.memberCount
            && (l == CapsuleRegistry.Lifecycle.DRAFT || l == CapsuleRegistry.Lifecycle.AWAITING_CONSENT);
        vm.prank(creator);
        try reg.updatePolicy(circleId, p) {
            _check(expect, true);
            if (consented[creator]) {
                consented[creator] = false;
                s.consentCount--;
            }
            _adopt(p);
        } catch {
            _check(expect, false);
        }
    }

    function open() external {
        if (!s.exists) return;
        bool expect = _lifecycle() == CapsuleRegistry.Lifecycle.DRAFT && block.timestamp < s.sealAt;
        vm.prank(creator);
        try reg.openCircle(circleId) {
            _check(expect, true);
            s.opened = true;
        } catch {
            _check(expect, false);
        }
    }

    function join(uint256 who) external {
        if (!s.exists) return;
        address m = members[who % 5];
        CapsuleRegistry.Lifecycle l = _lifecycle();
        bool canIssue = l == CapsuleRegistry.Lifecycle.DRAFT || _collecting();
        (address key, uint256 pk) = makeAddrAndKey(string.concat("inv", vm.toString(calls), vm.toString(who)));
        if (canIssue && reg.inviteStateOf(circleId, key) == 0) {
            address[] memory keys = new address[](1);
            keys[0] = key;
            vm.prank(creator);
            try reg.issueInvitations(circleId, keys) {} catch { return; }
        } else {
            return;
        }
        bytes32 digest = reg.inviteDigest(circleId, m);
        (uint8 v, bytes32 r, bytes32 sg) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)));
        bool expect = _collecting() && !joined[m] && s.memberCount < s.capacity;
        vm.prank(m);
        try reg.acceptInvitation(circleId, key, abi.encodePacked(r, sg, v)) {
            _check(expect, true);
            joined[m] = true;
            s.memberCount++;
        } catch {
            _check(expect, false);
        }
    }

    function consent(uint256 who, bool wrongHash) external {
        if (!s.exists) return;
        address m = _actor(who);
        bytes32 h = wrongHash ? keccak256("stale") : s.policyHash;
        bool expect = _collecting() && joined[m] && !consented[m] && !wrongHash;
        vm.prank(m);
        try reg.recordConsent(circleId, h, bytes32(uint256(1))) {
            _check(expect, true);
            consented[m] = true;
            s.consentCount++;
            if (m != creator && !s.locked) {
                s.locked = true;
                s.lockedPolicyHash = s.policyHash;
            }
        } catch {
            _check(expect, false);
        }
    }

    function contribute(uint256 who) external {
        if (!s.exists) return;
        address m = _actor(who);
        bool expect = _collecting() && joined[m] && consented[m] && !contributed[m];
        vm.prank(m);
        try reg.commitContribution(circleId, keccak256(abi.encode(m, who))) {
            _check(expect, true);
            contributed[m] = true;
            s.contributionCount++;
            if (m != creator) s.nonCreatorContributed = true;
        } catch {
            _check(expect, false);
        }
    }

    function requestRelease() external {
        if (!s.exists) return;
        bool ruleTrue = block.timestamp >= s.releaseAt && s.contributionCount >= s.minContributions
            && (!s.unanimous || s.consentCount == s.memberCount);
        bool expect = _lifecycle() == CapsuleRegistry.Lifecycle.SEALED && ruleTrue;
        try reg.requestRelease(circleId) {
            _check(expect, true);
            releasesRecorded++;
            // Independent re-check of the rule at the moment release was recorded.
            if (!ruleTrue || s.cancelled || !s.opened) illegalReleases++;
            if (s.contributionCount > s.consentCount) illegalReleases++;
            s.eligibleAt = uint64(block.timestamp);
        } catch {
            _check(expect, false);
        }
    }

    function receipt(uint256 which) external {
        if (!s.exists) return;
        uint256 nRelayers = reg.getPolicy(circleId).relayers.length;
        address r = relayers[which % 3];
        bool inQuorum = (which % 3) < nRelayers;
        bool expect = s.eligibleAt != 0 && inQuorum && !receipted[r];
        vm.prank(r);
        try reg.recordReleaseReceipt(circleId, keccak256(abi.encode(r, which))) {
            _check(expect, true);
            receipted[r] = true;
            s.receiptCount++;
        } catch {
            _check(expect, false);
        }
    }

    function cancel() external {
        if (!s.exists) return;
        CapsuleRegistry.Lifecycle l = _lifecycle();
        bool expect = l == CapsuleRegistry.Lifecycle.DRAFT || l == CapsuleRegistry.Lifecycle.AWAITING_CONSENT;
        vm.prank(creator);
        try reg.cancel(circleId) {
            _check(expect, true);
            if (s.nonCreatorContributed) cancelAfterForeignContribution++;
            s.cancelled = true;
        } catch {
            _check(expect, false);
        }
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + (secs % 2 days));
    }
}

contract CapsuleRegistryInvariantTest is StdInvariant, Test {
    CapsuleRegistry internal reg;
    Handler internal handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        reg = new CapsuleRegistry();
        handler = new Handler(reg);
        handler.create(uint256(keccak256("seed")));
        targetContract(address(handler));
    }

    /// @dev The contract and the independent shadow model agree on every accept/revert decision.
    function invariant_contractMatchesShadowModel() public view {
        assertEq(handler.mismatches(), 0);
    }

    /// @dev Property (§13.2): no generated sequence records a release without consent, threshold and date.
    function invariant_noReleaseWithoutValidRule() public view {
        assertEq(handler.illegalReleases(), 0);
    }

    function invariant_lifecycleMatchesShadow() public view {
        if (handler.circleId() == 0) return;
        CapsuleRegistry.Circle memory c = reg.getCircle(handler.circleId());
        Handler.Shadow memory sh = handler.shadow();
        assertEq(c.eligibleAt, sh.eligibleAt);
        assertEq(c.memberCount, sh.memberCount);
        assertEq(c.consentCount, sh.consentCount);
        assertEq(c.contributionCount, sh.contributionCount);
        assertEq(c.receiptCount, sh.receiptCount);
        assertEq(uint8(reg.lifecycleOf(handler.circleId())), uint8(handler.shadowLifecycle()));
    }

    function invariant_countsAreOrdered() public view {
        if (handler.circleId() == 0) return;
        uint256 id = handler.circleId();
        CapsuleRegistry.Circle memory c = reg.getCircle(id);
        CapsuleRegistry.Policy memory p = reg.getPolicy(id);
        assertLe(c.contributionCount, c.consentCount, "contribution requires consent");
        assertLe(c.consentCount, c.memberCount);
        assertLe(c.memberCount, p.capacity);
        assertLe(c.receiptCount, p.relayers.length);
        if (c.receiptCount > 0) assertGt(c.eligibleAt, 0, "receipt requires eligibility");
    }

    /// @dev Invariant 1: once a non-creator consented, the stored rule never changes.
    function invariant_ruleImmutableAfterForeignConsent() public view {
        if (handler.circleId() == 0) return;
        CapsuleRegistry.Circle memory c = reg.getCircle(handler.circleId());
        Handler.Shadow memory sh = handler.shadow();
        if (sh.locked) {
            assertTrue(c.ruleLocked);
            assertEq(c.policyHash, sh.lockedPolicyHash);
        }
    }

    /// @dev Invariant 7: cancellation never follows a non-creator contribution.
    function invariant_noCancelAfterForeignContribution() public view {
        assertEq(handler.cancelAfterForeignContribution(), 0);
    }

    function invariant_releasedImpliesThreshold() public view {
        if (handler.circleId() == 0) return;
        uint256 id = handler.circleId();
        if (reg.lifecycleOf(id) == CapsuleRegistry.Lifecycle.RELEASED) {
            CapsuleRegistry.Circle memory c = reg.getCircle(id);
            CapsuleRegistry.Policy memory p = reg.getPolicy(id);
            assertGe(c.receiptCount, p.receiptThreshold);
            assertGe(c.contributionCount, p.minContributions);
            assertGe(c.eligibleAt, p.releaseAt);
        }
    }
}
