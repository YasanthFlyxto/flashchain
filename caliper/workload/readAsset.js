'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

// Asset IDs to query - same PHARMA assets used in the simulation
const ASSET_IDS = [
  'PHARMA_01', 'PHARMA_02', 'PHARMA_03',
  'PHARMA_04', 'PHARMA_05', 'PHARMA_06'
];

class ReadAssetWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
  }

  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
  }

  async submitTransaction() {
    // Round-robin through asset IDs
    const assetId = ASSET_IDS[this.txIndex % ASSET_IDS.length];
    this.txIndex++;

    const request = {
      contractId: 'basic',
      contractFunction: 'ReadAsset',
      contractArguments: [assetId],
      readOnly: true  // evaluateTransaction, not submitTransaction
    };

    await this.sutAdapter.sendRequests(request);
  }
}

function createWorkloadModule() {
  return new ReadAssetWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
