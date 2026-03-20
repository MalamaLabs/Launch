import { expect } from "chai";
import { ethers } from "hardhat";
import { type HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { SensorDIDRegistry } from "../typechain-types";

describe("SensorDIDRegistry", function () {
  let registry: SensorDIDRegistry;
  let admin: HardhatEthersSigner;
  let aiValidator: HardhatEthersSigner;
  let randomUser: HardhatEthersSigner;

  const did = ethers.id("test-did-123");
  const pubKey = ethers.hexlify(ethers.randomBytes(33)); // mock compressed pubkey
  const sensorType = ethers.id("BME680");
  const locationHash = ethers.id("h3-index-xyz");
  const ipfsCID = "ipfs://QmTest123";

  beforeEach(async function () {
    [admin, aiValidator, randomUser] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SensorDIDRegistry");
    registry = await Factory.deploy(admin.address, aiValidator.address);
    await registry.waitForDeployment();
  });

  it("1. deploys with correct admin", async function () {
    const adminRole = await registry.DEFAULT_ADMIN_ROLE();
    expect(await registry.hasRole(adminRole, admin.address)).to.be.true;
    
    const aiRole = await registry.AI_VALIDATOR_ROLE();
    expect(await registry.hasRole(aiRole, aiValidator.address)).to.be.true;
  });

  it("2. registers sensor correctly", async function () {
    await expect(
      registry.connect(admin).registerSensor(did, pubKey, sensorType, locationHash, ipfsCID)
    )
      .to.emit(registry, "SensorRegistered")
      .withArgs(did, pubKey, sensorType, locationHash);

    expect(await registry.isRegistered(did)).to.be.true;

    const sensor = await registry.getSensor(did);
    expect(sensor.reputation).to.equal(100n);
    expect(sensor.active).to.be.true;
  });

  it("3. reverts on duplicate registration", async function () {
    await registry.connect(admin).registerSensor(did, pubKey, sensorType, locationHash, ipfsCID);
    
    await expect(
      registry.connect(admin).registerSensor(did, pubKey, sensorType, locationHash, "newCID")
    ).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
  });

  it("4. ai validator can update reputation", async function () {
    await registry.connect(admin).registerSensor(did, pubKey, sensorType, locationHash, ipfsCID);
    
    await expect(registry.connect(aiValidator).updateReputation(did, 90n))
      .to.emit(registry, "ReputationUpdated")
      .withArgs(did, 100n, 90n);

    const sensor = await registry.getSensor(did);
    expect(sensor.reputation).to.equal(90n);
  });

  it("5. random address cannot update reputation", async function () {
    await registry.connect(admin).registerSensor(did, pubKey, sensorType, locationHash, ipfsCID);

    await expect(
      registry.connect(randomUser).updateReputation(did, 90n)
    ).to.be.revertedWithCustomError(registry, "Unauthorized");
  });

  it("6. reputation 101 reverts with InvalidReputation", async function () {
    await registry.connect(admin).registerSensor(did, pubKey, sensorType, locationHash, ipfsCID);

    await expect(
      registry.connect(admin).updateReputation(did, 101n)
    ).to.be.revertedWithCustomError(registry, "InvalidReputation");
  });

  it("7. quarantine sets active=false", async function () {
    await registry.connect(admin).registerSensor(did, pubKey, sensorType, locationHash, ipfsCID);

    await expect(registry.connect(aiValidator).updateReputation(did, 40n))
      .to.emit(registry, "SensorQuarantined")
      .withArgs(did);

    const sensor = await registry.getSensor(did);
    expect(sensor.active).to.be.false;
  });

  it("8. isValidForSettlement returns false for quarantined", async function () {
    await registry.connect(admin).registerSensor(did, pubKey, sensorType, locationHash, ipfsCID);
    await registry.connect(admin).updateReputation(did, 40n);

    expect(await registry.isValidForSettlement(did)).to.be.false;
  });

  it("9. isValidForSettlement returns false for reputation < 80", async function () {
    await registry.connect(admin).registerSensor(did, pubKey, sensorType, locationHash, ipfsCID);
    await registry.connect(admin).updateReputation(did, 79n);

    expect(await registry.isValidForSettlement(did)).to.be.false;
  });

  it("10. recalibrate updates calibrationTs and ipfsCID", async function () {
    await registry.connect(admin).registerSensor(did, pubKey, sensorType, locationHash, ipfsCID);
    const oldSensor = await registry.getSensor(did);

    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);

    const newCID = "ipfs://QmRecalibrated456";
    await expect(registry.connect(admin).recalibrate(did, newCID))
      .to.emit(registry, "SensorRecalibrated");

    const newSensor = await registry.getSensor(did);
    expect(newSensor.calibrationTs).to.be.greaterThan(oldSensor.calibrationTs);
    expect(newSensor.ipfsCID).to.equal(newCID);
  });
});
