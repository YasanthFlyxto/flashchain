'use strict';

const stringify = require('json-stringify-deterministic');
const sortKeysRecursive = require('sort-keys-recursive');
const { Contract } = require('fabric-contract-api');

class AssetTransfer extends Contract {

    async RegisterShipment(ctx, id, cargoType, weightKg, custodian, valueUSD, status) {
        const exists = await this.ShipmentExists(ctx, id);
        if (exists) {
            throw new Error(`Shipment ${id} already exists`);
        }

        const shipment = {
            ID: id,
            CargoType: cargoType,
            WeightKg: Number(weightKg),
            Custodian: custodian,
            ValueUSD: Number(valueUSD),
            Status: status || 'Delivered',
            docType: 'shipment',
        };

        await ctx.stub.putState(id, Buffer.from(stringify(sortKeysRecursive(shipment))));
        return JSON.stringify(shipment);
    }

    async GetShipment(ctx, id) {
        const data = await ctx.stub.getState(id);
        if (!data || data.length === 0) {
            throw new Error(`Shipment ${id} does not exist`);
        }
        return data.toString();
    }

    async UpdateShipment(ctx, id, cargoType, weightKg, custodian, valueUSD) {
        const exists = await this.ShipmentExists(ctx, id);
        if (!exists) {
            throw new Error(`Shipment ${id} does not exist`);
        }

        const existing = JSON.parse((await ctx.stub.getState(id)).toString());
        const updated = {
            ...existing,
            CargoType: cargoType,
            WeightKg: Number(weightKg),
            Custodian: custodian,
            ValueUSD: Number(valueUSD),
        };

        await ctx.stub.putState(id, Buffer.from(stringify(sortKeysRecursive(updated))));
        return JSON.stringify(updated);
    }

    async TransferCustody(ctx, id, newCustodian) {
        const data = await ctx.stub.getState(id);
        if (!data || data.length === 0) {
            throw new Error(`Shipment ${id} does not exist`);
        }
        const shipment = JSON.parse(data.toString());
        const oldCustodian = shipment.Custodian;
        shipment.Custodian = newCustodian;

        let status = 'Delivered';
        const c = newCustodian.toLowerCase();
        if (c.includes('disputed')) status = 'DISPUTED';
        else if (c.includes('transit')) status = 'In-Transit';
        shipment.Status = status;

        await ctx.stub.putState(id, Buffer.from(stringify(sortKeysRecursive(shipment))));
        return oldCustodian;
    }

    async DeleteShipment(ctx, id) {
        const exists = await this.ShipmentExists(ctx, id);
        if (!exists) {
            throw new Error(`Shipment ${id} does not exist`);
        }
        return ctx.stub.deleteState(id);
    }

    async ShipmentExists(ctx, id) {
        const data = await ctx.stub.getState(id);
        return data && data.length > 0;
    }

    async GetAllShipments(ctx) {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                record = strValue;
            }
            allResults.push(record);
            result = await iterator.next();
        }
        return JSON.stringify(allResults);
    }
}

module.exports = AssetTransfer;
