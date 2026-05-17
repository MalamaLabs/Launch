// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title  Malama Labs Hex Node License - Genesis 200
/// @notice ERC-721 NFT representing exclusive geographic hex territory rights
///         on the Malama DePIN network. 200 total supply, one per hex cell.
///
/// @dev    Inherits ERC721URIStorage (OZ v5) so every token can carry a per-token
///         IPFS URI pinned at mint-time or assigned later by the owner.
///
///         URI resolution priority:
///           1. Per-token IPFS URI  -- set via setTokenURI / adminSecureNodeWithURI
///           2. Base-URI fallback   -- _baseTokenURI + tokenId  (existing behaviour)
///
///         OZ v5 note: ERC721URIStorage concatenates base+perToken when both are set,
///         which would corrupt an absolute ipfs:// URI. We sidestep this by keeping
///         _baseURI() returning "" so OZ stores per-token URIs raw, then handle the
///         fallback to _baseTokenURI ourselves inside tokenURI().
contract GenesisValidator is ERC721URIStorage, Ownable {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    // --- Constants -----------------------------------------------------------
    uint256 public constant MAX_GENESIS_SUPPLY = 200;

    // --- State ---------------------------------------------------------------
    IERC20  public immutable paymentToken;
    address public treasury;
    uint256 public mintPrice;
    string  private _baseTokenURI;

    uint256 private _currentSupply;

    // Geographic Spatial Storage
    mapping(uint256 => string)  private _tokenHexBoundaries;
    mapping(string  => bool)    private _hexClaimed;
    mapping(string  => uint256) private _hexToTokenId;

    // --- Events --------------------------------------------------------------
    event NodeSecured(address indexed operator, uint256 indexed tokenId, string hexId);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event BaseURIUpdated(string newBaseURI);
    // Note: per-token URI changes also emit ERC-4906 MetadataUpdate(tokenId)
    // fired automatically by ERC721URIStorage._setTokenURI

    // --- Constructor ---------------------------------------------------------
    constructor(
        address _paymentToken,
        address _treasury,
        uint256 _initialPrice,
        string memory baseURI_
    ) ERC721("Malama Hex Node License", "MHNL") Ownable(msg.sender) {
        require(_paymentToken != address(0), "Invalid payment token");
        require(_treasury     != address(0), "Invalid treasury");

        paymentToken  = IERC20(_paymentToken);
        treasury      = _treasury;
        mintPrice     = _initialPrice;
        _baseTokenURI = baseURI_;
    }

    // --- Public: Purchase ----------------------------------------------------
    function secureNode(string calldata hexId) external {
        paymentToken.safeTransferFrom(msg.sender, treasury, mintPrice);
        _mintHex(msg.sender, hexId, "");
    }

    // --- Admin: Mint on behalf -----------------------------------------------
    function adminSecureNode(address to, string calldata hexId) external onlyOwner {
        _mintHex(to, hexId, "");
    }

    function adminSecureNodeWithURI(
        address to,
        string calldata hexId,
        string calldata ipfsURI
    ) external onlyOwner {
        _mintHex(to, hexId, ipfsURI);
    }

    function _mintHex(
        address to,
        string calldata hexId,
        string memory ipfsURI
    ) internal {
        require(_currentSupply < MAX_GENESIS_SUPPLY, "Genesis 200: All nodes sold");
        require(bytes(hexId).length > 0,             "Empty hex ID");
        require(!_hexClaimed[hexId],                 "Hex already claimed");
        require(to != address(0),                    "Invalid recipient");

        uint256 tokenId = _currentSupply + 1;
        _currentSupply  = tokenId;

        _tokenHexBoundaries[tokenId] = hexId;
        _hexClaimed[hexId]           = true;
        _hexToTokenId[hexId]         = tokenId;

        _safeMint(to, tokenId);

        if (bytes(ipfsURI).length > 0) {
            _setTokenURI(tokenId, ipfsURI);
        }

        emit NodeSecured(to, tokenId, hexId);
    }

    // --- View ----------------------------------------------------------------
    function getHexByToken(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _tokenHexBoundaries[tokenId];
    }

    function getTokenByHex(string calldata hexId) external view returns (uint256) {
        require(_hexClaimed[hexId], "Hex not claimed");
        return _hexToTokenId[hexId];
    }

    function isHexClaimed(string calldata hexId) external view returns (bool) {
        return _hexClaimed[hexId];
    }

    function totalSupply() external view returns (uint256) {
        return _currentSupply;
    }

    function remaining() external view returns (uint256) {
        return MAX_GENESIS_SUPPLY - _currentSupply;
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
        override(ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // --- Admin: IPFS URI management ------------------------------------------

    function setTokenURI(uint256 tokenId, string calldata ipfsURI) external onlyOwner {
        _requireOwned(tokenId);
        require(bytes(ipfsURI).length > 0, "Empty URI");
        _setTokenURI(tokenId, ipfsURI);
    }

    function setTokenURIBatch(
        uint256[] calldata tokenIds,
        string[]  calldata ipfsURIs
    ) external onlyOwner {
        require(tokenIds.length == ipfsURIs.length, "Length mismatch");
        for (uint256 i = 0; i < tokenIds.length; ) {
            _requireOwned(tokenIds[i]);
            require(bytes(ipfsURIs[i]).length > 0, "Empty URI");
            _setTokenURI(tokenIds[i], ipfsURIs[i]);
            unchecked { ++i; }
        }
    }

    // --- Admin Config --------------------------------------------------------
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setMintPrice(uint256 newPrice) external onlyOwner {
        emit PriceUpdated(mintPrice, newPrice);
        mintPrice = newPrice;
    }

    function emergencyExtract(address _token) external onlyOwner {
        IERC20 t = IERC20(_token);
        t.safeTransfer(treasury, t.balanceOf(address(this)));
    }
}
