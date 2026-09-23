// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Fixture} from "./Fixture.sol";
import {CapsuleRegistry} from "../src/CapsuleRegistry.sol";

contract CapsuleRegistryTest is Fixture {
    // ================================================================ relayer keys

    function test_registerRelayerKey_rejectsZeroAndDuplicate() public {
        vm.expectRevert(CapsuleRegistry.ZeroValue.selector);
        reg.registerRelayerKey(bytes32(0));

        vm.prank(relayers[0]);
        vm.expectRevert(CapsuleRegistry.RelayerKeyAlreadyRegistered.selector);
        reg.registerRelayerKey(keccak256("rotate"));
    }

    function test_registerRelayerKey_emits() public {
        address r = makeAddr("fresh-relayer");
        vm.expectEmit(true, false, false, true);
        emit CapsuleRegistry.RelayerKeyRegistered(r, bytes32(uint256(7)));
        vm.prank(r);
        reg.registerRelayerKey(bytes32(uint256(7)));
        assertEq(reg.relayerKeyOf(r), bytes32(uint256(7)));
    }

    // ================================================================ creation and policy validation

    function test_create_startsInDraftWithCreatorAsMember() public {
        CapsuleRegistry.Policy memory p = _policy();
        bytes32 expected = reg.hashPolicy(p);
        vm.expectEmit(true, true, false, true);
        emit CapsuleRegistry.CircleCreated(1, creator, expected, META, p);
        uint256 id = _create(p);

        assertEq(id, 1);
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.DRAFT));
        CapsuleRegistry.Circle memory c = reg.getCircle(id);
        assertEq(c.creator, creator);
        assertEq(c.memberCount, 1);
        assertEq(c.policyHash, expected);
        assertEq(c.metadataCommitment, META);
        assertTrue(reg.getMember(id, creator).joined);
        assertEq(reg.circlesOf(creator).length, 1);
    }

    function test_create_rejectsEveryInvalidPolicyCode() public {
        CapsuleRegistry.Policy memory p;

        p = _policy();
        p.sealAt = uint64(block.timestamp);
        _expectInvalid(p, 1);

        p = _policy();
        p.releaseAt = p.sealAt - 1;
        _expectInvalid(p, 2);

        p = _policy();
        p.expiresAt = p.releaseAt;
        _expectInvalid(p, 3);

        p = _policy();
        p.capacity = 1;
        _expectInvalid(p, 4);
        p.capacity = 65;
        _expectInvalid(p, 4);

        p = _policy();
        p.minContributions = 0;
        _expectInvalid(p, 5);
        p.minContributions = p.capacity + 1;
        _expectInvalid(p, 5);

        p = _policy();
        p.relayers = new address[](0);
        _expectInvalid(p, 6);
        p.relayers = new address[](8);
        _expectInvalid(p, 6);

        p = _policy();
        p.receiptThreshold = 0;
        _expectInvalid(p, 7);
        p.receiptThreshold = 4;
        _expectInvalid(p, 7);

        p = _policy();
        p.relayers[1] = p.relayers[0];
        _expectInvalid(p, 8);
        p.relayers[1] = address(0);
        _expectInvalid(p, 8);
    }

    function test_create_requiresRegisteredRelayerKeys() public {
        CapsuleRegistry.Policy memory p = _policy();
        address unknown = makeAddr("unregistered");
        p.relayers[2] = unknown;
        vm.expectRevert(abi.encodeWithSelector(CapsuleRegistry.RelayerKeyMissing.selector, unknown));
        _create(p);
    }

    function test_releaseAtMayEqualSealAt_andExpiryMustFollowRelease() public {
        CapsuleRegistry.Policy memory p = _policy();
        p.releaseAt = p.sealAt;
        p.expiresAt = p.releaseAt + 1;
        _create(p); // does not revert
    }

    function _expectInvalid(CapsuleRegistry.Policy memory p, uint8 code) internal {
        vm.expectRevert(abi.encodeWithSelector(CapsuleRegistry.InvalidPolicy.selector, code));
        vm.prank(creator);
        reg.createCircle(p, META);
    }

    // ================================================================ rule immutability (C-01)

    function test_updatePolicy_allowedInDraftAndAwaitingConsent() public {
        uint256 id = _create(_policy());
        CapsuleRegistry.Policy memory p2 = _policy();
        p2.releaseAt += 1 days;
        vm.prank(creator);
        reg.updatePolicy(id, p2);
        assertEq(reg.getCircle(id).policyHash, reg.hashPolicy(p2));

        vm.prank(creator);
        reg.openCircle(id);
        p2.releaseAt += 1 days;
        vm.prank(creator);
        reg.updatePolicy(id, p2);
        assertEq(reg.getPolicy(id).releaseAt, p2.releaseAt);
    }

    function test_updatePolicy_clearsCreatorConsent() public {
        uint256 id = _createOpen(_policy());
        _consent(id, creator);
        assertEq(reg.getCircle(id).consentCount, 1);

        CapsuleRegistry.Policy memory p2 = _policy();
        p2.minContributions = 3;
        vm.expectEmit(true, false, false, true);
        emit CapsuleRegistry.PolicyUpdated(id, reg.hashPolicy(p2), p2, true);
        vm.prank(creator);
        reg.updatePolicy(id, p2);

        assertEq(reg.getCircle(id).consentCount, 0);
        assertFalse(reg.getMember(id, creator).consented);
        // A consent to the superseded rule cannot be replayed.
        bytes32 stale = reg.hashPolicy(_policy());
        vm.prank(creator);
        vm.expectRevert(CapsuleRegistry.PolicyHashMismatch.selector);
        reg.recordConsent(id, stale, FP);
    }

    /// @dev §14 "Change the date after member consent" -> revert.
    function test_updatePolicy_revertsAfterNonCreatorConsent() public {
        uint256 id = _createOpen(_policy());
        _join(id, alice);
        _consent(id, alice);
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.COLLECTING));

        CapsuleRegistry.Policy memory p2 = _policy();
        p2.releaseAt = p2.sealAt; // try to make it open sooner
        vm.prank(creator);
        vm.expectRevert(CapsuleRegistry.RuleLocked.selector);
        reg.updatePolicy(id, p2);
    }

    function test_updatePolicy_revertsAfterCreatorContribution() public {
        uint256 id = _createOpen(_policy());
        _consent(id, creator);
        _contribute(id, creator);
        vm.prank(creator);
        vm.expectRevert(CapsuleRegistry.ContributionsExist.selector);
        reg.updatePolicy(id, _policy());
    }

    /// @dev Found by the invariant suite: shrinking capacity below joined members must revert.
    function test_updatePolicy_cannotShrinkCapacityBelowMembers() public {
        uint256 id = _createOpen(_policy());
        _join(id, alice);
        _join(id, bob);
        CapsuleRegistry.Policy memory p2 = _policy();
        p2.capacity = 2;
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(CapsuleRegistry.InvalidPolicy.selector, 4));
        reg.updatePolicy(id, p2);
    }

    function test_updatePolicy_onlyCreator() public {
        uint256 id = _create(_policy());
        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.NotCreator.selector);
        reg.updatePolicy(id, _policy());
    }

    function test_creatorConsentAloneDoesNotLockRule() public {
        uint256 id = _createOpen(_policy());
        _consent(id, creator);
        assertFalse(reg.getCircle(id).ruleLocked);
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.AWAITING_CONSENT));
    }

    // ================================================================ open and invitations

    function test_open_movesDraftToAwaitingConsent_once() public {
        uint256 id = _create(_policy());
        vm.expectEmit(true, false, false, true);
        emit CapsuleRegistry.CircleOpened(id, reg.getCircle(id).policyHash);
        vm.prank(creator);
        reg.openCircle(id);
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.AWAITING_CONSENT));

        vm.prank(creator);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.AWAITING_CONSENT));
        reg.openCircle(id);
    }

    function test_open_revertsAfterSealDeadline() public {
        CapsuleRegistry.Policy memory p = _policy();
        uint256 id = _create(p);
        vm.warp(p.sealAt);
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(CapsuleRegistry.InvalidPolicy.selector, 1));
        reg.openCircle(id);
    }

    function test_invitation_cannotBeRedeemedInDraft() public {
        uint256 id = _create(_policy());
        (address key, uint256 pk) = _issueInvite(id, "draft");
        bytes memory sig = _inviteSig(id, alice, pk);
        vm.prank(alice);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.DRAFT));
        reg.acceptInvitation(id, key, sig);
    }

    function test_invitation_happyPathEmitsAndCounts() public {
        uint256 id = _createOpen(_policy());
        (address key, uint256 pk) = _issueInvite(id, "a");
        assertEq(reg.inviteStateOf(id, key), 1);
        bytes memory sig = _inviteSig(id, alice, pk);
        vm.expectEmit(true, true, false, true);
        emit CapsuleRegistry.InvitationAccepted(id, alice, key, 2);
        vm.prank(alice);
        reg.acceptInvitation(id, key, sig);
        assertEq(reg.inviteStateOf(id, key), 2);
        assertEq(reg.getCircle(id).memberCount, 2);
        assertEq(reg.circlesOf(alice)[0], id);
    }

    function test_invitation_signatureIsBoundToRedeemer() public {
        uint256 id = _createOpen(_policy());
        (address key, uint256 pk) = _issueInvite(id, "a");
        bytes memory sigForAlice = _inviteSig(id, alice, pk);
        // Bob copies Alice's signature from the mempool; it does not seat him.
        vm.prank(bob);
        vm.expectRevert(CapsuleRegistry.InvitationInvalid.selector);
        reg.acceptInvitation(id, key, sigForAlice);
    }

    function test_invitation_isSingleUse() public {
        uint256 id = _createOpen(_policy());
        (address key, uint256 pk) = _issueInvite(id, "a");
        bytes memory sigA = _inviteSig(id, alice, pk);
        vm.prank(alice);
        reg.acceptInvitation(id, key, sigA);
        bytes memory sigB = _inviteSig(id, bob, pk);
        vm.prank(bob);
        vm.expectRevert(CapsuleRegistry.InvitationInvalid.selector);
        reg.acceptInvitation(id, key, sigB);
    }

    function test_invitation_rejectsWrongSignerAndUnissuedKey() public {
        uint256 id = _createOpen(_policy());
        (address key,) = _issueInvite(id, "a");
        (, uint256 otherPk) = makeAddrAndKey("not-the-invite");
        bytes memory forged = _inviteSig(id, alice, otherPk);
        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.InvitationInvalid.selector);
        reg.acceptInvitation(id, key, forged);

        (address unissued, uint256 unissuedPk) = makeAddrAndKey("unissued");
        bytes memory sig = _inviteSig(id, alice, unissuedPk);
        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.InvitationInvalid.selector);
        reg.acceptInvitation(id, unissued, sig);
    }

    function test_invitation_rejectsMalleableAndMalformedSignatures() public {
        uint256 id = _createOpen(_policy());
        (address key, uint256 pk) = _issueInvite(id, "a");
        bytes32 digest = reg.inviteDigest(id, alice);
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethHash);
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory malleable = abi.encodePacked(r, bytes32(n - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.InvitationInvalid.selector);
        reg.acceptInvitation(id, key, malleable);

        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.InvitationInvalid.selector);
        reg.acceptInvitation(id, key, abi.encodePacked(r, s));
    }

    function test_invitation_respectsCapacity() public {
        CapsuleRegistry.Policy memory p = _policy();
        p.capacity = 2;
        uint256 id = _createOpen(p);
        _join(id, alice);
        (address key, uint256 pk) = _issueInvite(id, "b");
        bytes memory sig = _inviteSig(id, bob, pk);
        vm.prank(bob);
        vm.expectRevert(CapsuleRegistry.CircleFull.selector);
        reg.acceptInvitation(id, key, sig);
    }

    function test_invitation_memberCannotJoinTwice() public {
        uint256 id = _createOpen(_policy());
        _join(id, alice);
        (address key, uint256 pk) = _issueInvite(id, "again");
        bytes memory sig = _inviteSig(id, alice, pk);
        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.AlreadyMember.selector);
        reg.acceptInvitation(id, key, sig);
    }

    function test_issueInvitations_limitsAndAuth() public {
        uint256 id = _create(_policy());
        address[] memory none = new address[](0);
        vm.prank(creator);
        vm.expectRevert(CapsuleRegistry.TooManyInvites.selector);
        reg.issueInvitations(id, none);

        address[] memory tooMany = new address[](33);
        vm.prank(creator);
        vm.expectRevert(CapsuleRegistry.TooManyInvites.selector);
        reg.issueInvitations(id, tooMany);

        address[] memory zero = new address[](1);
        vm.prank(creator);
        vm.expectRevert(CapsuleRegistry.InvitationInvalid.selector);
        reg.issueInvitations(id, zero);

        address[] memory one = new address[](1);
        one[0] = makeAddr("k");
        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.NotCreator.selector);
        reg.issueInvitations(id, one);

        vm.prank(creator);
        reg.issueInvitations(id, one);
        vm.prank(creator);
        vm.expectRevert(CapsuleRegistry.InvitationInvalid.selector);
        reg.issueInvitations(id, one);
    }

    function test_issueInvitations_capPerCircle() public {
        uint256 id = _create(_policy());
        for (uint256 b; b < 4; ++b) {
            address[] memory keys = new address[](32);
            for (uint256 i; i < 32; ++i) keys[i] = address(uint160(0x1000 + b * 32 + i));
            vm.prank(creator);
            reg.issueInvitations(id, keys);
        }
        address[] memory extra = new address[](1);
        extra[0] = address(0xBEEF);
        vm.prank(creator);
        vm.expectRevert(CapsuleRegistry.TooManyInvites.selector);
        reg.issueInvitations(id, extra);
    }

    // ================================================================ consent

    function test_consent_requiresMembershipExactHashAndNonZeroKey() public {
        uint256 id = _createOpen(_policy());
        bytes32 h = reg.getCircle(id).policyHash;

        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.NotMember.selector);
        reg.recordConsent(id, h, FP);

        _join(id, alice);
        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.PolicyHashMismatch.selector);
        reg.recordConsent(id, keccak256("other rule"), FP);

        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.ZeroValue.selector);
        reg.recordConsent(id, h, bytes32(0));

        vm.expectEmit(true, true, false, true);
        emit CapsuleRegistry.ConsentRecorded(id, alice, h, FP, 1);
        vm.prank(alice);
        reg.recordConsent(id, h, FP);
        assertTrue(reg.getCircle(id).ruleLocked);

        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.AlreadyConsented.selector);
        reg.recordConsent(id, h, FP);
    }

    function test_consent_closesAtSealAt() public {
        CapsuleRegistry.Policy memory p = _policy();
        uint256 id = _createOpen(p);
        _join(id, alice);
        vm.warp(p.sealAt);
        bytes32 h = reg.getCircle(id).policyHash;
        vm.prank(alice);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.SEALED));
        reg.recordConsent(id, h, FP);
    }

    // ================================================================ contributions

    function test_contribution_requiresConsent() public {
        uint256 id = _createOpen(_policy());
        _join(id, alice);
        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.ConsentRequired.selector);
        reg.commitContribution(id, keccak256("m"));

        vm.prank(bob);
        vm.expectRevert(CapsuleRegistry.NotMember.selector);
        reg.commitContribution(id, keccak256("m"));
    }

    /// @dev §14 "Commit twice as one participant" -> revert.
    function test_contribution_atMostOncePerMember() public {
        uint256 id = _createOpen(_policy());
        _join(id, alice);
        _consent(id, alice);
        vm.expectEmit(true, true, false, true);
        emit CapsuleRegistry.ContributionCommitted(id, alice, keccak256("m1"), 1);
        vm.prank(alice);
        reg.commitContribution(id, keccak256("m1"));

        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.AlreadyContributed.selector);
        reg.commitContribution(id, keccak256("m2"));
        assertEq(reg.getMember(id, alice).commitment, keccak256("m1"));
    }

    function test_contribution_rejectsZeroCommitment() public {
        uint256 id = _createOpen(_policy());
        _consent(id, creator);
        vm.prank(creator);
        vm.expectRevert(CapsuleRegistry.ZeroValue.selector);
        reg.commitContribution(id, bytes32(0));
    }

    function test_contribution_windowBoundaryAtSealAt() public {
        CapsuleRegistry.Policy memory p = _policy();
        uint256 id = _createOpen(p);
        _join(id, alice);
        _join(id, bob);
        _consent(id, alice);
        _consent(id, bob);

        vm.warp(p.sealAt - 1);
        _contribute(id, alice); // last second of the window

        vm.warp(p.sealAt);
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.SEALED));
        vm.prank(bob);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.SEALED));
        reg.commitContribution(id, keccak256("late"));
    }

    // ================================================================ release eligibility (C-02)

    /// @dev §14 "Request release before the rule is true" -> revert, at every stage.
    function test_requestRelease_revertsUntilRuleIsTrue() public {
        CapsuleRegistry.Policy memory p = _policy();
        uint256 id = _createOpen(p);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.AWAITING_CONSENT));
        reg.requestRelease(id);

        _join(id, alice);
        _consent(id, creator);
        _consent(id, alice);
        _contribute(id, creator);
        _contribute(id, alice);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.COLLECTING));
        reg.requestRelease(id);

        vm.warp(p.sealAt);
        vm.expectRevert(abi.encodeWithSelector(CapsuleRegistry.RuleNotSatisfied.selector, 1));
        reg.requestRelease(id);
        assertEq(reg.releaseRuleStatus(id), 1);

        vm.warp(p.releaseAt - 1);
        vm.expectRevert(abi.encodeWithSelector(CapsuleRegistry.RuleNotSatisfied.selector, 1));
        reg.requestRelease(id);

        vm.warp(p.releaseAt);
        assertEq(reg.releaseRuleStatus(id), 0);
        vm.expectEmit(true, false, false, true);
        emit CapsuleRegistry.ReleaseEligibilityReached(id, p.releaseAt, 2, 2, 2);
        vm.prank(makeAddr("anyone"));
        reg.requestRelease(id);
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.RELEASE_ELIGIBLE));

        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.RELEASE_ELIGIBLE));
        reg.requestRelease(id);
    }

    function test_requestRelease_requiresContributionThreshold() public {
        CapsuleRegistry.Policy memory p = _policy();
        p.minContributions = 3;
        uint256 id = _collectedCircle(p);
        vm.warp(p.releaseAt);
        vm.expectRevert(abi.encodeWithSelector(CapsuleRegistry.RuleNotSatisfied.selector, 2));
        reg.requestRelease(id);
    }

    function test_requestRelease_unanimousNeedsEveryJoinedMember() public {
        CapsuleRegistry.Policy memory p = _policy();
        p.unanimousConsent = true;
        uint256 id = _collectedCircle(p);
        _join(id, bob); // joined, never consents
        vm.warp(p.releaseAt);
        vm.expectRevert(abi.encodeWithSelector(CapsuleRegistry.RuleNotSatisfied.selector, 3));
        reg.requestRelease(id);
    }

    function test_requestRelease_unanimousSatisfied() public {
        CapsuleRegistry.Policy memory p = _policy();
        p.unanimousConsent = true;
        uint256 id = _collectedCircle(p);
        vm.warp(p.releaseAt);
        reg.requestRelease(id);
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.RELEASE_ELIGIBLE));
    }

    function test_requestRelease_impossibleAfterExpiry() public {
        CapsuleRegistry.Policy memory p = _policy();
        p.expiresAt = p.releaseAt + 1 days;
        uint256 id = _collectedCircle(p);
        vm.warp(p.expiresAt - 1);
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.SEALED));
        vm.warp(p.expiresAt);
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.EXPIRED));
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.EXPIRED));
        reg.requestRelease(id);
    }

    // ================================================================ receipts

    /// @dev §14 "Submit a receipt before eligibility" -> revert.
    function test_receipt_revertsBeforeEligibility() public {
        CapsuleRegistry.Policy memory p = _policy();
        uint256 id = _collectedCircle(p);
        vm.warp(p.releaseAt); // rule is true, but eligibility was never recorded
        vm.prank(relayers[0]);
        vm.expectRevert(CapsuleRegistry.EligibilityNotRecorded.selector);
        reg.recordReleaseReceipt(id, keccak256("delivery"));
    }

    function test_receipt_onlyQuorumRelayers_once_nonZero() public {
        uint256 id = _eligibleCircle();
        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.NotRelayer.selector);
        reg.recordReleaseReceipt(id, keccak256("d"));

        vm.prank(relayers[0]);
        vm.expectRevert(CapsuleRegistry.ZeroValue.selector);
        reg.recordReleaseReceipt(id, bytes32(0));

        vm.prank(relayers[0]);
        reg.recordReleaseReceipt(id, keccak256("d0"));
        vm.prank(relayers[0]);
        vm.expectRevert(CapsuleRegistry.ReceiptAlreadyRecorded.selector);
        reg.recordReleaseReceipt(id, keccak256("d0b"));
    }

    /// @dev §14 "Withhold one relayer receipt" -> stays RELEASE_ELIGIBLE, never RELEASED.
    function test_receipt_thresholdGatesReleased() public {
        uint256 id = _eligibleCircle();
        vm.expectEmit(true, true, false, true);
        emit CapsuleRegistry.ReleaseReceiptRecorded(id, relayers[0], keccak256("d0"), 1);
        vm.prank(relayers[0]);
        reg.recordReleaseReceipt(id, keccak256("d0"));
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.RELEASE_ELIGIBLE));
        assertEq(reg.getCircle(id).receiptCount, 1);

        vm.prank(relayers[2]);
        reg.recordReleaseReceipt(id, keccak256("d2"));
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.RELEASED));

        // A late relayer may still add redundancy.
        vm.prank(relayers[1]);
        reg.recordReleaseReceipt(id, keccak256("d1"));
        assertEq(reg.getCircle(id).receiptCount, 3);
        assertEq(reg.receiptOf(id, relayers[1]), keccak256("d1"));
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.RELEASED));
    }

    function test_receipt_allowedAfterExpiryOnceEligible() public {
        CapsuleRegistry.Policy memory p = _policy();
        p.expiresAt = p.releaseAt + 10;
        uint256 id = _collectedCircle(p);
        vm.warp(p.releaseAt);
        reg.requestRelease(id);
        vm.warp(p.expiresAt + 100);
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.RELEASE_ELIGIBLE));
        vm.prank(relayers[0]);
        reg.recordReleaseReceipt(id, keccak256("late"));
    }

    // ================================================================ cancellation

    function test_cancel_fromDraftAndAwaitingConsent() public {
        uint256 a = _create(_policy());
        vm.expectEmit(true, false, false, false);
        emit CapsuleRegistry.CapsuleCancelled(a);
        vm.prank(creator);
        reg.cancel(a);
        assertEq(uint8(_state(a)), uint8(CapsuleRegistry.Lifecycle.CANCELLED));

        uint256 b = _createOpen(_policy());
        _consent(b, creator);
        _contribute(b, creator); // creator's own contribution does not block cancel
        vm.prank(creator);
        reg.cancel(b);
        assertEq(uint8(_state(b)), uint8(CapsuleRegistry.Lifecycle.CANCELLED));
    }

    function test_cancel_impossibleOnceAnotherMemberConsentedOrCommitted() public {
        uint256 id = _createOpen(_policy());
        _join(id, alice);
        _consent(id, alice);
        vm.prank(creator);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.COLLECTING));
        reg.cancel(id);

        _contribute(id, alice);
        vm.prank(creator);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.COLLECTING));
        reg.cancel(id);
    }

    function test_cancel_onlyCreator_andBlocksEverything() public {
        uint256 id = _createOpen(_policy());
        (address key, uint256 pk) = _issueInvite(id, "x");
        vm.prank(alice);
        vm.expectRevert(CapsuleRegistry.NotCreator.selector);
        reg.cancel(id);

        vm.prank(creator);
        reg.cancel(id);
        bytes memory sig = _inviteSig(id, alice, pk);
        vm.prank(alice);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.CANCELLED));
        reg.acceptInvitation(id, key, sig);
        bytes32 h = reg.getCircle(id).policyHash;
        vm.prank(creator);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.CANCELLED));
        reg.recordConsent(id, h, FP);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.CANCELLED));
        reg.requestRelease(id);
        vm.prank(creator);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.CANCELLED));
        reg.cancel(id);
    }

    // ================================================================ expiry

    function test_markExpired_onlyWhenExpired_once() public {
        CapsuleRegistry.Policy memory p = _policy();
        p.expiresAt = p.releaseAt + 1 days;
        uint256 id = _createOpen(p);
        vm.warp(p.releaseAt);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.SEALED));
        reg.markExpired(id);

        vm.warp(p.expiresAt);
        vm.expectEmit(true, false, false, false);
        emit CapsuleRegistry.CapsuleExpired(id);
        reg.markExpired(id);
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.EXPIRED));
        reg.markExpired(id);
    }

    function test_noExpiryMeansSealedForever() public {
        CapsuleRegistry.Policy memory p = _policy();
        p.minContributions = 3;
        uint256 id = _collectedCircle(p);
        vm.warp(uint256(p.releaseAt) + 3650 days);
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.SEALED));
        vm.expectRevert(_wrong(CapsuleRegistry.Lifecycle.SEALED));
        reg.markExpired(id);
    }

    // ================================================================ unknown ids and views

    function test_unknownCircleReverts() public {
        vm.expectRevert(CapsuleRegistry.UnknownCircle.selector);
        reg.lifecycleOf(99);
        vm.expectRevert(CapsuleRegistry.UnknownCircle.selector);
        reg.requestRelease(99);
        vm.expectRevert(CapsuleRegistry.UnknownCircle.selector);
        reg.recordReleaseReceipt(99, keccak256("x"));
    }

    function test_releaseRuleStatusIs255OutsideSealed() public {
        uint256 id = _createOpen(_policy());
        assertEq(reg.releaseRuleStatus(id), 255);
    }

    // ================================================================ denial-of-service bounds

    function test_dos_fullCircleAndQuorumStayCheap() public {
        address[] memory seven = new address[](7);
        for (uint256 i; i < 7; ++i) {
            seven[i] = makeAddr(string.concat("r7-", vm.toString(i)));
            vm.prank(seven[i]);
            reg.registerRelayerKey(bytes32(i + 1));
        }
        CapsuleRegistry.Policy memory p = _policy();
        p.capacity = 64;
        p.minContributions = 64;
        p.receiptThreshold = 7;
        p.relayers = seven;
        uint256 id = _createOpen(p);
        _consent(id, creator);
        _contribute(id, creator);
        for (uint256 i = 1; i < 64; ++i) {
            address m = address(uint160(0xA0000 + i));
            _join(id, m);
            _consent(id, m);
            _contribute(id, m);
        }
        assertEq(reg.getCircle(id).contributionCount, 64);

        vm.warp(p.releaseAt);
        uint256 g = gasleft();
        reg.requestRelease(id);
        assertLt(g - gasleft(), 60_000, "requestRelease must not scale with members");

        for (uint256 i; i < 7; ++i) {
            g = gasleft();
            vm.prank(seven[i]);
            reg.recordReleaseReceipt(id, bytes32(i + 100));
            assertLt(g - gasleft(), 80_000, "receipt cost bounded by MAX_RELAYERS");
        }
        assertEq(uint8(_state(id)), uint8(CapsuleRegistry.Lifecycle.RELEASED));
    }
}
