// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title  Malama Labs Early Investor Plot
/// @notice ERC-721 NFT for bespoke early-investor land plots on the Malama DePIN
///         network. Distinct from the Genesis 200 hex sale: plots are arbitrary
///         geographic locations (not the H3 hex pool), the supply cap is
///         adjustable, and the category is meant to grow over time.
///
/// @dev    Mirrors GenesisValidator's URI handling (per-token IPFS URI with a
///         baseURI fallback) but differs in two deliberate ways:
///           1. Supply cap is a settable `maxSupply` (DEFAULT_ADMIN_ROLE), not a
///              compile-time constant — the Early Investor category is open-ended.
///           2. Access is role-based (AccessControl) to match the live operational
///              model: an operator hot wallet holds MINTER_ROLE to relay mints,
///              while a Safe/multisig holds DEFAULT_ADMIN_ROLE for config + grants.
///
///         "plotId" is an arbitrary unique string the backend assigns per plot
///         (e.g. a slug or geohash) — it is NOT validated against the hex pool.
contract EarlyInvestorValidator is ERC721URIStorage, AccessControl {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    // --- Roles ---------------------------------------------------------------
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // --- State ---------------------------------------------------------------
    IERC20  public immutable paymentToken;
    address public treasury;
    uint256 public mintPrice;
    uint256 public maxSupply;       // adjustable cap (0 is allowed = paused)
    string  private _baseTokenURI;

    uint256 private _currentSupply;

    // Geographic plot storage
    mapping(uint256 => string)  private _tokenPlot;
    mapping(string  => bool)    private _plotClaimed;
    mapping(string  => uint256) private _plotToTokenId;

    // --- Events --------------------------------------------------------------
    event PlotSecured(address indexed operator, uint256 indexed tokenId, string plotId);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event MaxSupplyUpdated(uint256 oldMax, uint256 newMax);
    event BaseURIUpdated(string newBaseURI);

    // --- Constructor ---------------------------------------------------------
    /// @param _admin   address that receives DEFAULT_ADMIN_ROLE + MINTER_ROLE
    ///                  (transfer/grant to a Safe + operator after deploy)
    constructor(
        address _paymentToken,
        address _treasury,
        uint256 _initialPrice,
        uint256 _initialMaxSupply,
        string memory baseURI_,
        address _admin
    ) ERC721("Malama Early Investor Plot", "MEIP") {
        require(_paymentToken != address(0), "Invalid payment token");
        require(_treasury     != address(0), "Invalid treasury");
        require(_admin        != address(0), "Invalid admin");

        paymentToken  = IERC20(_paymentToken);
        treasury      = _treasury;
        mintPrice     = _initialPrice;
        maxSupply     = _initialMaxSupply;
        _baseTokenURI = baseURI_;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(MINTER_ROLE, _admin);
    }

    // --- Public: Purchase ----------------------------------------------------
    function secureNode(string calldata plotId) external {
        paymentToken.safeTransferFrom(msg.sender, treasury, mintPrice);
        _mintPlot(msg.sender, plotId, "");
    }

    // --- Operator: Mint on behalf (MINTER_ROLE) ------------------------------
    function adminSecureNode(address to, string calldata plotId) external onlyRole(MINTER_ROLE) {
        _mintPlot(to, plotId, "");
    }

    function adminSecureNodeWithURI(
        address to,
        string calldata plotId,
        string calldata ipfsURI
    ) external onlyRole(MINTER_ROLE) {
        _mintPlot(to, plotId, ipfsURI);
    }

    function _mintPlot(
        address to,
        string calldata plotId,
        string memory ipfsURI
    ) internal {
        require(_currentSupply < maxSupply, "Early Investor: sold out / cap reached");
        require(bytes(plotId).length > 0,   "Empty plot ID");
        require(!_plotClaimed[plotId],      "Plot already claimed");
        require(to != address(0),           "Invalid recipient");

        uint256 tokenId = _currentSupply + 1;
        _currentSupply  = tokenId;

        _tokenPlot[tokenId]      = plotId;
        _plotClaimed[plotId]     = true;
        _plotToTokenId[plotId]   = tokenId;

        _safeMint(to, tokenId);

        if (bytes(ipfsURI).length > 0) {
            _setTokenURI(tokenId, ipfsURI);
        }

        emit PlotSecured(to, tokenId, plotId);
    }

    // --- View ----------------------------------------------------------------
    function getPlotByToken(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _tokenPlot[tokenId];
    }

    function getTokenByPlot(string calldata plotId) external view returns (uint256) {
        require(_plotClaimed[plotId], "Plot not claimed");
        return _plotToTokenId[plotId];
    }

    function isPlotClaimed(string calldata plotId) external view returns (bool) {
        return _plotClaimed[plotId];
    }

    function totalSupply() external view returns (uint256) {
        return _currentSupply;
    }

    function remaining() external view returns (uint256) {
        return maxSupply > _currentSupply ? maxSupply - _currentSupply : 0;
    }

    // --- ERC-721 Metadata ----------------------------------------------------
    function _baseURI() internal pure override returns (string memory) {
        return "";
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        _requireOwned(tokenId);
        string memory ipfsURI = ERC721URIStorage.tokenURI(tokenId);
        if (bytes(ipfsURI).length > 0) {
            return ipfsURI;
        }
        return string(abi.encodePacked(_baseTokenURI, tokenId.toString()));
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // --- Operator: IPFS URI management (MINTER_ROLE) -------------------------
    function setTokenURI(uint256 tokenId, string calldata ipfsURI) external onlyRole(MINTER_ROLE) {
        _requireOwned(tokenId);
        require(bytes(ipfsURI).length > 0, "Empty URI");
        _setTokenURI(tokenId, ipfsURI);
    }

    function setTokenURIBatch(
        uint256[] calldata tokenIds,
        string[]  calldata ipfsURIs
    ) external onlyRole(MINTER_ROLE) {
        require(tokenIds.length == ipfsURIs.length, "Length mismatch");
        for (uint256 i = 0; i < tokenIds.length; ) {
            _requireOwned(tokenIds[i]);
            require(bytes(ipfsURIs[i]).length > 0, "Empty URI");
            _setTokenURI(tokenIds[i], ipfsURIs[i]);
            unchecked { ++i; }
        }
    }

    function setBaseURI(string calldata newBaseURI) external onlyRole(MINTER_ROLE) {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    // --- Admin Config (DEFAULT_ADMIN_ROLE / Safe) ----------------------------
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid treasury");
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setMintPrice(uint256 newPrice) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit PriceUpdated(mintPrice, newPrice);
        mintPrice = newPrice;
    }

    /// @notice Raise or lower the supply cap. Cannot drop below what's minted.
    function setMaxSupply(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newMax >= _currentSupply, "Below minted supply");
        emit MaxSupplyUpdated(maxSupply, newMax);
        maxSupply = newMax;
    }

    function emergencyExtract(address _token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20 t = IERC20(_token);
        t.safeTransfer(treasury, t.balanceOf(address(this)));
    }
}
