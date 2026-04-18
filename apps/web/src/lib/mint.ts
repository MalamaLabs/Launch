import {
  MeshWallet,
  BlockfrostProvider,
  MeshTxBuilder,
  AssetMetadata,
  resolveNativeScriptHash,
  resolveNativeScriptHex,
  resolvePaymentKeyHash,
  stringToHex,
} from '@meshsdk/core';

export async function forgeHexNFT(receiverCardanoAddress: string, hexId: string): Promise<string> {
  const blockfrostKey = process.env.BLOCKFROST_API_KEY;
  const mnemonic = process.env.TREASURY_MNEMONIC;

  // Graceful fallback for demo/development purposes if keys are missing
  if (!blockfrostKey || !mnemonic) {
    console.warn("⚠️ MINTING SIMULATED: Missing BLOCKFROST_API_KEY or TREASURY_MNEMONIC. Transaction simulated.");
    await new Promise(r => setTimeout(r, 2000));
    return `mock_tx_${hexId}_${Date.now()}`;
  }

  try {
    const blockchainProvider = new BlockfrostProvider(blockfrostKey);

    const wallet = new MeshWallet({
      networkId: 0, // 0 = testnet/preprod, 1 = mainnet
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
      key: {
        type: 'mnemonic',
        words: mnemonic.split(' '),
      },
    });

    const changeAddress = await wallet.getChangeAddress();
    console.log("💰 Treasury Wallet Authenticated. Address:", changeAddress);

    // Build NativeScript object directly — ForgeScript.withOneSignature returns a string
    // in MeshSDK v1.x but resolveNativeScriptHash/Hex require the NativeScript object.
    const keyHash = resolvePaymentKeyHash(changeAddress);
    const nativeScript = { type: 'sig' as const, keyHash };
    const policyId = resolveNativeScriptHash(nativeScript);
    const scriptCbor = resolveNativeScriptHex(nativeScript);

    const assetName = `Hex${hexId}`;
    const assetNameHex = stringToHex(assetName);

    // CIP-25 metadata structure
    const assetMetadata: AssetMetadata = {
      name: `Mālama Genesis Hex #${hexId.substring(hexId.length - 4)}`,
      image: "ipfs://QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR",
      mediaType: "image/png",
      description: "Cryptographic DePIN Environmental Data Territory",
      Hex_ID: hexId,
      Territory: "Target Region",
      Asset_Type: "Genesis Node Access",
      Base_Value: "1500 USDC",
    };

    const cip25Metadata = {
      [policyId]: {
        [assetName]: assetMetadata,
      },
    };

    // Fetch UTXOs directly — avoids Transaction class which calls the
    // removed fetchAddressUTxOs method on BlockfrostProvider in v1.9.x beta
    const utxos = await wallet.getUtxos();

    const txBuilder = new MeshTxBuilder({
      fetcher: blockchainProvider,
      submitter: blockchainProvider,
    });

    const unsignedTx = await txBuilder
      .mint('1', policyId, assetNameHex)
      .mintingScript(scriptCbor)
      .metadataValue(721, cip25Metadata)
      .txOut(receiverCardanoAddress, [{ unit: `${policyId}${assetNameHex}`, quantity: '1' }])
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    console.log("✅ NFT minted. Tx hash:", txHash);
    return txHash;

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to mint Cardano NFT:", message);
    throw new Error(`Blockchain ledger sync failed during asset minting: ${message}`);
  }
}
