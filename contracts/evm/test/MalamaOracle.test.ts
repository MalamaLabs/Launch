import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { MalamaOracle } from "../typechain-types";

describe("MalamaOracle", function () {
  let oracle: MalamaOracle;
  let admin: HardhatEthersSigner;
  let aiValidator: HardhatEthersSigner;
  let user: HardhatEthersSigner;

  let sensorRegistryMock: any;
  let oftMock: any;

  const hexId = ethers.id("hex-123");
  const date = 20260320n;
  const sensorDid = ethers.id("did-456");
  const value = ethers.parseEther("100");
  const merkleRoot = ethers.id("merkle-789");
  const ipfsCID = "ipfs://Qm123";

  beforeEach(async function () {
    [admin, aiValidator, user] = await ethers.getSigners();

    const SensorRegistryMockFactory = await ethers.getContractFactory("SensorDIDRegistry");
    sensorRegistryMock = await SensorRegistryMockFactory.deploy(admin.address, aiValidator.address);
    await sensorRegistryMock.waitForDeployment();

    const LZEndpointMockFactory = await ethers.getContractFactory("LZEndpointMock");
    const lzMock = await LZEndpointMockFactory.deploy();
    
    const OFTMockFactory = await ethers.getContractFactory("MalamaOFT");
    oftMock = await OFTMockFactory.deploy(await lzMock.getAddress(), admin.address);
    await oftMock.waitForDeployment();

    const OracleFactory = await ethers.getContractFactory("MalamaOracle");
    oracle = await OracleFactory.deploy(
      await sensorRegistryMock.getAddress(),
      aiValidator.address,
      await oftMock.getAddress()
    );
    await oracle.waitForDeployment();

    await oftMock.setBMEOracle(await oracle.getAddress());
    
    const pubKey = ethers.hexlify(ethers.randomBytes(33));
    const sensorType = ethers.id("BME680");
    const locationHash = ethers.id("loc");
    await sensorRegistryMock.connect(admin).registerSensor(sensorDid, pubKey, sensorType, locationHash, ipfsCID);
  });

  it("1. submitData from ai validator", async function () {
    const tx = await oracle.connect(aiValidator).submitData(
      hexId, date, sensorDid, value, 9500n, merkleRoot, ipfsCID
    );
    await expect(tx).to.emit(oracle, "DataSubmitted").withArgs(hexId, date, sensorDid, value);

    const dp = await oracle.getLatestHexData(hexId, date);
    expect(dp.value).to.equal(value);
  });

  it("2. submitData reverts for invalid sensor", async function () {
    const badDid = ethers.id("bad-did");
    await expect(
      oracle.connect(aiValidator).submitData(hexId, date, badDid, value, 9500n, merkleRoot, ipfsCID)
    ).to.be.revertedWithCustomError(oracle, "InvalidSensor");
  });

  it("3. submitData reverts for non-aiValidator", async function () {
    await expect(
      oracle.connect(user).submitData(hexId, date, sensorDid, value, 9500n, merkleRoot, ipfsCID)
    ).to.be.revertedWithCustomError(oracle, "Unauthorized");
  });

  it("4. resolveMarket after challenge window", async function () {
    await oracle.connect(aiValidator).submitData(
      hexId, date, sensorDid, value, 9500n, merkleRoot, ipfsCID
    );

    const burnAmount = (value * 100n) / 10000n; 
    await oftMock.connect(admin).transfer(await oracle.getAddress(), burnAmount);

    await time.increase(7201); // 2 hours + 1s

    const marketId = ethers.id("market-1");
    const tx = await oracle.resolveMarket(marketId, hexId, date);

    await expect(tx).to.emit(oracle, "MarketResolved").withArgs(marketId, value);
    
    const [resValue, resolved] = await oracle.getResolution(marketId);
    expect(resValue).to.equal(value);
    expect(resolved).to.be.true;
  });

  it("5. resolveMarket reverts before challenge window", async function () {
    await oracle.connect(aiValidator).submitData(
      hexId, date, sensorDid, value, 9500n, merkleRoot, ipfsCID
    );

    const marketId = ethers.id("market-1");
    await expect(oracle.resolveMarket(marketId, hexId, date))
      .to.be.revertedWithCustomError(oracle, "ChallengeWindowActive");
  });

  it("6. resolveMarket reverts low confidence", async function () {
    await oracle.connect(aiValidator).submitData(
      hexId, date, sensorDid, value, 8500n, merkleRoot, ipfsCID
    );

    await time.increase(7201);

    const marketId = ethers.id("market-1");
    await expect(oracle.resolveMarket(marketId, hexId, date))
      .to.be.revertedWithCustomError(oracle, "LowConfidence");
  });

  it("7. resolveMarket reverts if already resolved", async function () {
    await oracle.connect(aiValidator).submitData(
      hexId, date, sensorDid, value, 9500n, merkleRoot, ipfsCID
    );

    const burnAmount = (value * 100n) / 10000n; 
    await oftMock.connect(admin).transfer(await oracle.getAddress(), burnAmount * 2n);

    await time.increase(7201);

    const marketId = ethers.id("market-1");
    await oracle.resolveMarket(marketId, hexId, date);

    await expect(oracle.resolveMarket(marketId, hexId, date))
      .to.be.revertedWithCustomError(oracle, "AlreadyResolved");
  });

  it("8. BME burn called on resolution", async function () {
    await oracle.connect(aiValidator).submitData(
      hexId, date, sensorDid, value, 9500n, merkleRoot, ipfsCID
    );

    const burnAmount = (value * 100n) / 10000n; 
    await oftMock.connect(admin).transfer(await oracle.getAddress(), burnAmount);

    await time.increase(7201);
    const marketId = ethers.id("market-1");

    await expect(oracle.resolveMarket(marketId, hexId, date))
      .to.emit(oftMock, "BMEBurn")
      .withArgs(await oracle.getAddress(), burnAmount);
  });

  it("9. challengeData during window pauses resolution", async function () {
    await oracle.connect(aiValidator).submitData(
      hexId, date, sensorDid, value, 9500n, merkleRoot, ipfsCID
    );

    await expect(oracle.challengeData(hexId, date, "Disputed reading"))
      .to.emit(oracle, "DataChallenged")
      .withArgs(hexId, date, "Disputed reading");

    await time.increase(7201);
    const marketId = ethers.id("market-1");

    await expect(oracle.resolveMarket(marketId, hexId, date))
      .to.be.revertedWithCustomError(oracle, "DataChallengedError");
  });

  it("10. getResolution returns correct values", async function () {
    const marketId = ethers.id("market-unresolved");
    const [val, res] = await oracle.getResolution(marketId);
    expect(res).to.be.false;
    expect(val).to.equal(0n);
  });
});
