// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title CapsuleRegistry — Relay protocol v1
/// @notice Records a Circle's release rule, member consent, contribution commitments,
///         release eligibility and relayer receipts. It is the only authority that decides
///         whether a capsule may be released.
/// @dev    Stores no plaintext, no storage locations and no keys: only 32-byte commitments
///         and public-key fingerprints. There is no owner, no pause and no upgrade path.
///         Every loop is bounded by MAX_RELAYERS or MAX_INVITES_PER_CALL.
contract CapsuleRegistry {
    // ------------------------------------------------------------------ constants

    uint8 public constant PROTOCOL_VERSION = 1;
    uint16 public constant MAX_MEMBERS = 64;
    uint8 public constant MAX_RELAYERS = 7;
    uint16 public constant MAX_INVITES_PER_CALL = 32;
    uint16 public constant MAX_INVITES_PER_CIRCLE = 128;

    bytes32 public constant POLICY_TYPEHASH = keccak256(
        "RelayPolicy(uint8 version,uint64 sealAt,uint64 releaseAt,uint64 expiresAt,uint16 capacity,uint16 minContributions,bool unanimousConsent,uint8 receiptThreshold,address[] relayers)"
    );
    bytes32 public constant INVITE_TYPEHASH =
        keccak256("RelayInvite(uint256 chainId,address registry,uint256 circleId,address member)");

    /// @dev secp256k1n / 2, the upper bound for a non-malleable `s`.
    uint256 private constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    // ------------------------------------------------------------------ types

    /// @notice Lifecycle values. Numeric order is part of the ABI; clients must reject any other value.
    enum Lifecycle {
        DRAFT,
        AWAITING_CONSENT,
        COLLECTING,
        SEALED,
        RELEASE_ELIGIBLE,
        RELEASED,
        CANCELLED,
        EXPIRED
    }

    /// @notice The release rule members consent to.
    /// @param sealAt           contributions, joins and consents close at this timestamp
    /// @param releaseAt        earliest timestamp at which release may be requested (>= sealAt)
    /// @param expiresAt        0 for no expiry; otherwise release must be recorded before this
    /// @param capacity         maximum members including the creator
    /// @param minContributions distinct contributions required for release
    /// @param unanimousConsent if true, every joined member must have consented for release
    /// @param receiptThreshold relayer receipts required before the capsule counts as released
    /// @param relayers         the release quorum; share index i+1 belongs to relayers[i]
    struct Policy {
        uint64 sealAt;
        uint64 releaseAt;
        uint64 expiresAt;
        uint16 capacity;
        uint16 minContributions;
        bool unanimousConsent;
        uint8 receiptThreshold;
        address[] relayers;
    }

    struct Circle {
        address creator;
        uint64 createdAt;
        uint64 eligibleAt; // 0 until ReleaseEligibilityReached
        bool opened;
        bool cancelled;
        bool expiredRecorded;
        bool ruleLocked; // a non-creator member has consented
        bool nonCreatorContributed;
        uint16 memberCount;
        uint16 consentCount;
        uint16 contributionCount;
        uint16 invitesIssued;
        uint8 receiptCount;
        bytes32 policyHash;
        bytes32 metadataCommitment; // sha256 of encrypted, off-chain Circle metadata
    }

    struct Member {
        bool joined;
        bool consented;
        bool contributed;
        bytes32 encryptionKeyFingerprint; // sha256 of the member's public encryption key
        bytes32 commitment; // sha256 of the member's contribution manifest
    }

    // ------------------------------------------------------------------ events

    event RelayerKeyRegistered(address indexed relayer, bytes32 encryptionKeyFingerprint);
    event CircleCreated(
        uint256 indexed circleId,
        address indexed creator,
        bytes32 policyHash,
        bytes32 metadataCommitment,
        Policy policy
    );
    event PolicyUpdated(uint256 indexed circleId, bytes32 policyHash, Policy policy, bool creatorConsentCleared);
    event InvitationIssued(uint256 indexed circleId, address indexed inviteKey);
    event CircleOpened(uint256 indexed circleId, bytes32 policyHash);
    event InvitationAccepted(uint256 indexed circleId, address indexed member, address inviteKey, uint16 memberCount);
    event ConsentRecorded(
        uint256 indexed circleId,
        address indexed member,
        bytes32 policyHash,
        bytes32 encryptionKeyFingerprint,
        uint16 consentCount
    );
    event ContributionCommitted(
        uint256 indexed circleId, address indexed member, bytes32 commitment, uint16 contributionCount
    );
    event ReleaseEligibilityReached(
        uint256 indexed circleId, uint64 eligibleAt, uint16 contributionCount, uint16 consentCount, uint16 memberCount
    );
    event ReleaseReceiptRecorded(
        uint256 indexed circleId, address indexed relayer, bytes32 deliveryDigest, uint8 receiptCount
    );
    event CapsuleCancelled(uint256 indexed circleId);
    event CapsuleExpired(uint256 indexed circleId);

    // ------------------------------------------------------------------ errors

    /// @dev Codes: 1 sealAt not in future, 2 releaseAt < sealAt, 3 expiresAt <= releaseAt,
    ///      4 capacity out of range (or below the members already joined), 5 minContributions out of range, 6 relayer count out of range,
    ///      7 receiptThreshold out of range, 8 zero or duplicate relayer.
    error InvalidPolicy(uint8 code);
    error RelayerKeyMissing(address relayer);
    error UnknownCircle();
    error NotCreator();
    error NotMember();
    error WrongLifecycle(Lifecycle actual);
    error RuleLocked();
    error ContributionsExist();
    error PolicyHashMismatch();
    error AlreadyMember();
    error AlreadyConsented();
    error ConsentRequired();
    error AlreadyContributed();
    error ZeroValue();
    error InvitationInvalid();
    error TooManyInvites();
    error CircleFull();
    /// @dev Codes: 1 before releaseAt, 2 contributions below minimum, 3 unanimous consent missing.
    error RuleNotSatisfied(uint8 code);
    error EligibilityNotRecorded();
    error NotRelayer();
    error ReceiptAlreadyRecorded();
    error RelayerKeyAlreadyRegistered();

    // ------------------------------------------------------------------ storage

    uint256 public circleCount;
    mapping(address => bytes32) public relayerKeyOf;

    mapping(uint256 => Circle) private _circles;
    mapping(uint256 => Policy) private _policies;
    mapping(uint256 => mapping(address => Member)) private _members;
    /// @dev 0 = unknown, 1 = issued, 2 = redeemed
    mapping(uint256 => mapping(address => uint8)) private _inviteState;
    mapping(uint256 => mapping(address => bytes32)) private _receipts;
    mapping(address => uint256[]) private _circlesOf;

    // ------------------------------------------------------------------ relayers

    /// @notice A relayer publishes the fingerprint of its encryption key once. Rotation means a new address.
    function registerRelayerKey(bytes32 encryptionKeyFingerprint) external {
        if (encryptionKeyFingerprint == bytes32(0)) revert ZeroValue();
        if (relayerKeyOf[msg.sender] != bytes32(0)) revert RelayerKeyAlreadyRegistered();
        relayerKeyOf[msg.sender] = encryptionKeyFingerprint;
        emit RelayerKeyRegistered(msg.sender, encryptionKeyFingerprint);
    }

    // ------------------------------------------------------------------ creator actions

    /// @notice Create a Circle in DRAFT with its release rule. The creator is its first member.
    function createCircle(Policy calldata policy, bytes32 metadataCommitment) external returns (uint256 circleId) {
        _validatePolicy(policy);
        circleId = ++circleCount;

        Circle storage c = _circles[circleId];
        c.creator = msg.sender;
        c.createdAt = uint64(block.timestamp);
        c.memberCount = 1;
        c.policyHash = hashPolicy(policy);
        c.metadataCommitment = metadataCommitment;
        _policies[circleId] = policy;
        _members[circleId][msg.sender].joined = true;
        _circlesOf[msg.sender].push(circleId);

        emit CircleCreated(circleId, msg.sender, c.policyHash, metadataCommitment, policy);
    }

    /// @notice Replace the rule. Only possible before any non-creator consent and before any contribution.
    ///         A creator consent given to the previous rule is cleared.
    function updatePolicy(uint256 circleId, Policy calldata policy) external {
        Circle storage c = _creatorCircle(circleId);
        if (c.ruleLocked) revert RuleLocked();
        Lifecycle state = _lifecycle(c, _policies[circleId]);
        if (state != Lifecycle.DRAFT && state != Lifecycle.AWAITING_CONSENT) revert WrongLifecycle(state);
        if (c.contributionCount != 0) revert ContributionsExist();
        _validatePolicy(policy);
        if (policy.capacity < c.memberCount) revert InvalidPolicy(4);

        bool cleared;
        Member storage creator = _members[circleId][msg.sender];
        if (creator.consented) {
            creator.consented = false;
            c.consentCount -= 1;
            cleared = true;
        }
        c.policyHash = hashPolicy(policy);
        _policies[circleId] = policy;
        emit PolicyUpdated(circleId, c.policyHash, policy, cleared);
    }

    /// @notice Register single-use invitation keys. The matching private keys travel off-chain in invite links.
    function issueInvitations(uint256 circleId, address[] calldata inviteKeys) external {
        Circle storage c = _creatorCircle(circleId);
        Lifecycle state = _lifecycle(c, _policies[circleId]);
        if (state != Lifecycle.DRAFT && state != Lifecycle.AWAITING_CONSENT && state != Lifecycle.COLLECTING) {
            revert WrongLifecycle(state);
        }
        uint256 n = inviteKeys.length;
        if (n == 0 || n > MAX_INVITES_PER_CALL || c.invitesIssued + n > MAX_INVITES_PER_CIRCLE) {
            revert TooManyInvites();
        }
        for (uint256 i; i < n; ++i) {
            address key = inviteKeys[i];
            if (key == address(0) || _inviteState[circleId][key] != 0) revert InvitationInvalid();
            _inviteState[circleId][key] = 1;
            emit InvitationIssued(circleId, key);
        }
        c.invitesIssued += uint16(n);
    }

    /// @notice Publish the rule: DRAFT -> AWAITING_CONSENT. Invitations become redeemable.
    function openCircle(uint256 circleId) external {
        Circle storage c = _creatorCircle(circleId);
        Lifecycle state = _lifecycle(c, _policies[circleId]);
        if (state != Lifecycle.DRAFT) revert WrongLifecycle(state);
        if (block.timestamp >= _policies[circleId].sealAt) revert InvalidPolicy(1);
        c.opened = true;
        emit CircleOpened(circleId, c.policyHash);
    }

    /// @notice Cancel. Only from DRAFT or AWAITING_CONSENT, and never after a non-creator contribution.
    function cancel(uint256 circleId) external {
        Circle storage c = _creatorCircle(circleId);
        Lifecycle state = _lifecycle(c, _policies[circleId]);
        if (state != Lifecycle.DRAFT && state != Lifecycle.AWAITING_CONSENT) revert WrongLifecycle(state);
        if (c.nonCreatorContributed) revert ContributionsExist();
        c.cancelled = true;
        emit CapsuleCancelled(circleId);
    }

    // ------------------------------------------------------------------ member actions

    /// @notice Redeem an invitation. `signature` is the invite key's EIP-191 signature over
    ///         inviteDigest(circleId, msg.sender), so a copied signature cannot seat anyone else.
    function acceptInvitation(uint256 circleId, address inviteKey, bytes calldata signature) external {
        Circle storage c = _existing(circleId);
        Policy storage p = _policies[circleId];
        Lifecycle state = _lifecycle(c, p);
        if (state != Lifecycle.AWAITING_CONSENT && state != Lifecycle.COLLECTING) revert WrongLifecycle(state);
        if (_inviteState[circleId][inviteKey] != 1) revert InvitationInvalid();
        Member storage m = _members[circleId][msg.sender];
        if (m.joined) revert AlreadyMember();
        if (c.memberCount >= p.capacity) revert CircleFull();
        if (_recover(_toEthSignedMessageHash(inviteDigest(circleId, msg.sender)), signature) != inviteKey) {
            revert InvitationInvalid();
        }

        _inviteState[circleId][inviteKey] = 2;
        m.joined = true;
        c.memberCount += 1;
        _circlesOf[msg.sender].push(circleId);
        emit InvitationAccepted(circleId, msg.sender, inviteKey, c.memberCount);
    }

    /// @notice Consent to the exact rule identified by `policyHash`.
    function recordConsent(uint256 circleId, bytes32 policyHash, bytes32 encryptionKeyFingerprint) external {
        Circle storage c = _existing(circleId);
        Lifecycle state = _lifecycle(c, _policies[circleId]);
        if (state != Lifecycle.AWAITING_CONSENT && state != Lifecycle.COLLECTING) revert WrongLifecycle(state);
        Member storage m = _members[circleId][msg.sender];
        if (!m.joined) revert NotMember();
        if (m.consented) revert AlreadyConsented();
        if (policyHash != c.policyHash) revert PolicyHashMismatch();
        if (encryptionKeyFingerprint == bytes32(0)) revert ZeroValue();

        m.consented = true;
        m.encryptionKeyFingerprint = encryptionKeyFingerprint;
        c.consentCount += 1;
        if (msg.sender != c.creator) c.ruleLocked = true;
        emit ConsentRecorded(circleId, msg.sender, policyHash, encryptionKeyFingerprint, c.consentCount);
    }

    /// @notice Commit the sha256 of an encrypted contribution manifest. Once per member.
    function commitContribution(uint256 circleId, bytes32 commitment) external {
        Circle storage c = _existing(circleId);
        Lifecycle state = _lifecycle(c, _policies[circleId]);
        if (state != Lifecycle.AWAITING_CONSENT && state != Lifecycle.COLLECTING) revert WrongLifecycle(state);
        Member storage m = _members[circleId][msg.sender];
        if (!m.joined) revert NotMember();
        if (!m.consented) revert ConsentRequired();
        if (m.contributed) revert AlreadyContributed();
        if (commitment == bytes32(0)) revert ZeroValue();

        m.contributed = true;
        m.commitment = commitment;
        c.contributionCount += 1;
        if (msg.sender != c.creator) c.nonCreatorContributed = true;
        emit ContributionCommitted(circleId, msg.sender, commitment, c.contributionCount);
    }

    // ------------------------------------------------------------------ release

    /// @notice Anyone may record release eligibility once the stored rule evaluates true.
    function requestRelease(uint256 circleId) external {
        Circle storage c = _existing(circleId);
        Policy storage p = _policies[circleId];
        Lifecycle state = _lifecycle(c, p);
        if (state != Lifecycle.SEALED) revert WrongLifecycle(state);
        uint8 code = _unmetCondition(c, p);
        if (code != 0) revert RuleNotSatisfied(code);

        c.eligibleAt = uint64(block.timestamp);
        emit ReleaseEligibilityReached(
            circleId, c.eligibleAt, c.contributionCount, c.consentCount, c.memberCount
        );
    }

    /// @notice A quorum relayer records that it delivered its key shares. Only after eligibility exists.
    function recordReleaseReceipt(uint256 circleId, bytes32 deliveryDigest) external {
        Circle storage c = _existing(circleId);
        if (c.eligibleAt == 0) revert EligibilityNotRecorded();
        if (!_isRelayer(_policies[circleId], msg.sender)) revert NotRelayer();
        if (_receipts[circleId][msg.sender] != bytes32(0)) revert ReceiptAlreadyRecorded();
        if (deliveryDigest == bytes32(0)) revert ZeroValue();

        _receipts[circleId][msg.sender] = deliveryDigest;
        c.receiptCount += 1;
        emit ReleaseReceiptRecorded(circleId, msg.sender, deliveryDigest, c.receiptCount);
    }

    /// @notice Anyone may record that a capsule with an expiry passed it without release.
    function markExpired(uint256 circleId) external {
        Circle storage c = _existing(circleId);
        Lifecycle state = _lifecycle(c, _policies[circleId]);
        if (state != Lifecycle.EXPIRED || c.expiredRecorded) revert WrongLifecycle(state);
        c.expiredRecorded = true;
        emit CapsuleExpired(circleId);
    }

    // ------------------------------------------------------------------ views

    function lifecycleOf(uint256 circleId) external view returns (Lifecycle) {
        return _lifecycle(_existing(circleId), _policies[circleId]);
    }

    /// @notice 0 if the rule evaluates true right now, otherwise the RuleNotSatisfied code (or 255 if not SEALED).
    function releaseRuleStatus(uint256 circleId) external view returns (uint8) {
        Circle storage c = _existing(circleId);
        Policy storage p = _policies[circleId];
        if (_lifecycle(c, p) != Lifecycle.SEALED) return 255;
        return _unmetCondition(c, p);
    }

    function getCircle(uint256 circleId) external view returns (Circle memory) {
        return _existing(circleId);
    }

    function getPolicy(uint256 circleId) external view returns (Policy memory) {
        _existing(circleId);
        return _policies[circleId];
    }

    function getMember(uint256 circleId, address member) external view returns (Member memory) {
        _existing(circleId);
        return _members[circleId][member];
    }

    function inviteStateOf(uint256 circleId, address inviteKey) external view returns (uint8) {
        return _inviteState[circleId][inviteKey];
    }

    function receiptOf(uint256 circleId, address relayer) external view returns (bytes32) {
        return _receipts[circleId][relayer];
    }

    function circlesOf(address account) external view returns (uint256[] memory) {
        return _circlesOf[account];
    }

    function hashPolicy(Policy memory policy) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                POLICY_TYPEHASH,
                PROTOCOL_VERSION,
                policy.sealAt,
                policy.releaseAt,
                policy.expiresAt,
                policy.capacity,
                policy.minContributions,
                policy.unanimousConsent,
                policy.receiptThreshold,
                keccak256(abi.encodePacked(policy.relayers))
            )
        );
    }

    /// @notice The digest an invite key signs (EIP-191 personal_sign) to seat `member`.
    function inviteDigest(uint256 circleId, address member) public view returns (bytes32) {
        return keccak256(abi.encode(INVITE_TYPEHASH, block.chainid, address(this), circleId, member));
    }

    // ------------------------------------------------------------------ internal

    function _lifecycle(Circle storage c, Policy storage p) internal view returns (Lifecycle) {
        if (c.cancelled) return Lifecycle.CANCELLED;
        if (c.eligibleAt != 0) {
            return c.receiptCount >= p.receiptThreshold ? Lifecycle.RELEASED : Lifecycle.RELEASE_ELIGIBLE;
        }
        if (!c.opened) return Lifecycle.DRAFT;
        if (block.timestamp >= p.sealAt) {
            if (p.expiresAt != 0 && block.timestamp >= p.expiresAt) return Lifecycle.EXPIRED;
            return Lifecycle.SEALED;
        }
        return c.ruleLocked ? Lifecycle.COLLECTING : Lifecycle.AWAITING_CONSENT;
    }

    function _unmetCondition(Circle storage c, Policy storage p) internal view returns (uint8) {
        if (block.timestamp < p.releaseAt) return 1;
        if (c.contributionCount < p.minContributions) return 2;
        if (p.unanimousConsent && c.consentCount != c.memberCount) return 3;
        return 0;
    }

    function _validatePolicy(Policy calldata p) internal view {
        if (p.sealAt <= block.timestamp) revert InvalidPolicy(1);
        if (p.releaseAt < p.sealAt) revert InvalidPolicy(2);
        if (p.expiresAt != 0 && p.expiresAt <= p.releaseAt) revert InvalidPolicy(3);
        if (p.capacity < 2 || p.capacity > MAX_MEMBERS) revert InvalidPolicy(4);
        if (p.minContributions == 0 || p.minContributions > p.capacity) revert InvalidPolicy(5);
        uint256 n = p.relayers.length;
        if (n == 0 || n > MAX_RELAYERS) revert InvalidPolicy(6);
        if (p.receiptThreshold == 0 || p.receiptThreshold > n) revert InvalidPolicy(7);
        for (uint256 i; i < n; ++i) {
            address r = p.relayers[i];
            if (r == address(0)) revert InvalidPolicy(8);
            for (uint256 j; j < i; ++j) {
                if (p.relayers[j] == r) revert InvalidPolicy(8);
            }
            if (relayerKeyOf[r] == bytes32(0)) revert RelayerKeyMissing(r);
        }
    }

    function _isRelayer(Policy storage p, address account) internal view returns (bool) {
        uint256 n = p.relayers.length;
        for (uint256 i; i < n; ++i) {
            if (p.relayers[i] == account) return true;
        }
        return false;
    }

    function _existing(uint256 circleId) internal view returns (Circle storage c) {
        c = _circles[circleId];
        if (c.creator == address(0)) revert UnknownCircle();
    }

    function _creatorCircle(uint256 circleId) internal view returns (Circle storage c) {
        c = _existing(circleId);
        if (c.creator != msg.sender) revert NotCreator();
    }

    function _toEthSignedMessageHash(bytes32 digest) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
    }

    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > HALF_N) return address(0);
        if (v != 27 && v != 28) return address(0);
        return ecrecover(hash, v, r, s);
    }
}
