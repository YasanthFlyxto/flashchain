'use strict';

const { Contract } = require('fabric-contract-api');

class SupplyChainContract extends Contract {
    
    async initLedger(ctx) {
        console.info('============= START : Initialize Ledger ===========');
        const shipments = [
            {
                shipmentId: 'SHIP001',
                product: 'Fresh Tuna',
                origin: 'Negombo Port',
                destination: 'Colombo Market',
                temperature: -18.0,
                status: 'in_transit',
                timestamp: new Date().toISOString()
            }
        ];

        for (let i = 0; i < shipments.length; i++) {
            shipments[i].docType = 'shipment';
            await ctx.stub.putState('SHIP' + i, Buffer.from(JSON.stringify(shipments[i])));
            console.info('Added shipment: ', shipments[i]);
        }
        console.info('============= END : Initialize Ledger ===========');
    }

    async createShipment(ctx, shipmentId, product, origin, destination, temperature) {
        console.info('============= START : Create Shipment ===========');
        
        const shipment = {
            docType: 'shipment',
            shipmentId,
            product,
            origin,
            destination,
            temperature: parseFloat(temperature),
            status: 'in_transit',
            timestamp: new Date().toISOString()
        };

        await ctx.stub.putState(shipmentId, Buffer.from(JSON.stringify(shipment)));
        console.info('============= END : Create Shipment ===========');
        return JSON.stringify(shipment);
    }

    async queryShipment(ctx, shipmentId) {
        const shipmentBytes = await ctx.stub.getState(shipmentId);
        
        if (!shipmentBytes || shipmentBytes.length === 0) {
            throw new Error(`Shipment ${shipmentId} does not exist`);
        }
        
        console.info('Query Result:', shipmentBytes.toString());
        return shipmentBytes.toString();
    }

    async updateTemperature(ctx, shipmentId, newTemperature) {
        const shipmentBytes = await ctx.stub.getState(shipmentId);
        
        if (!shipmentBytes || shipmentBytes.length === 0) {
            throw new Error(`Shipment ${shipmentId} does not exist`);
        }
        
        const shipment = JSON.parse(shipmentBytes.toString());
        shipment.temperature = parseFloat(newTemperature);
        shipment.lastUpdated = new Date().toISOString();
        
        await ctx.stub.putState(shipmentId, Buffer.from(JSON.stringify(shipment)));
        console.info('Temperature updated for', shipmentId);
        return JSON.stringify(shipment);
    }

    async getAllShipments(ctx) {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();
        
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }
            allResults.push(record);
            result = await iterator.next();
        }
        
        return JSON.stringify(allResults);
    }
}

module.exports = SupplyChainContract;
