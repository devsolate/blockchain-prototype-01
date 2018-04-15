'use strict'

const {
    P2PNode
} = require('p2p-connect')
const host = 'http://localhost:9000'

const Blockchain = require('./blockchain')
const Command = require('./cmd')
const pull = require('pull-stream')

const channel = {
    SYNC_REQUEST: 'SYNC_REQUEST',
    SYNC_BLOCK: 'SYNC_BLOCK',
    SYNC_TRXN_REQUEST: 'SYNC_TRXN_REQUEST',
    SYNC_TRXN: 'SYNC_TRXN',
    CREATED_TRANSACTION: 'CREATED_TRANSACTION',
    CREATED_BLOCK: 'CREATED_BLOCK'
}

const start = async () => {
    const bc = await Blockchain.get()
    const node = new P2PNode(host)
    await node.start()
    
    const cmd = Command(node)

    // Subscribe data from other node
    node.subscribe(channel.SYNC_REQUEST, async (buffer) => {
        const data = JSON.parse(buffer.data.toString())
        const currentNodeId = node.node.peerInfo.id.toB58String()
        
        // Request Sync from Other Node
        if(data.nodeId != currentNodeId) {
            const block = await bc.findNext(data.latestHash)

            if(block) {
                node.publish(channel.SYNC_BLOCK, JSON.stringify({
                    nodeId: data.nodeId,
                    block: block.toJSON()
                }))
            }
        }
    })

    node.subscribe(channel.SYNC_BLOCK, async (buffer) => {
        const data = JSON.parse(buffer.data.toString())
        const currentNodeId = node.node.peerInfo.id.toB58String()
        if(data.nodeId == currentNodeId) {
            await bc.saveBlock(data.block)
            await bc.saveLatestHash(data.block.hash)

            setTimeout(() => {
                node.publish(channel.SYNC_REQUEST, JSON.stringify({
                    nodeId: currentNodeId,
                    latestHash: data.block.hash,
                }))
            }, 2000)
        }
    })

    node.subscribe(channel.SYNC_TRXN_REQUEST, async (buffer) => {
        const data = JSON.parse(buffer.data.toString())
        const currentNodeId = node.node.peerInfo.id.toB58String()
        
        // Request Sync from Other Node
        if(data.nodeId != currentNodeId) {
            const transactions = await bc.getTransactions()

            if(transactions.length > 0) {
                node.publish(channel.SYNC_TRXN, JSON.stringify({
                    nodeId: data.nodeId,
                    transactions: transactions
                }))
            }
        }
    })

    node.subscribe(channel.SYNC_TRXN, async (buffer) => {
        const data = JSON.parse(buffer.data.toString())
        const currentNodeId = node.node.peerInfo.id.toB58String()

        if(data.nodeId == currentNodeId) {
            data.transactions.map(async (item) => {
                try {
                    await bc.saveTransaction(item)
                } catch(error) {

                }
            })
        }
    })

    node.subscribe(channel.CREATED_TRANSACTION, async (buffer) => {
        const data = JSON.parse(buffer.data.toString())
        
        try {
            await bc.saveTransaction(data)
            console.log("Received broadcast transaction")
        } catch(error) {

        }
    })

    node.subscribe(channel.CREATED_BLOCK, (block) => {
        
    })

    // Call sync when connect other peer
    node.node.on('peer:connect', (peer) => {
        setTimeout(() => {
            sync(node, bc)
        }, 2000)
    })
}

const sync = async(node, bc) => {
    const latestHash = await bc.getLatestHash()
    const nodeId = node.node.peerInfo.id.toB58String()

    node.publish(channel.SYNC_REQUEST, JSON.stringify({
        nodeId: nodeId,
        latestHash: latestHash,
    }))

    node.publish(channel.SYNC_TRXN_REQUEST, JSON.stringify({
        nodeId: nodeId
    }))
}


const publishBlock = (block) => {

}

const publishTransaction = (trxn) => {
    const nodeId = node.node.peerInfo.id.toB58String()

    node.publish(channel.CREATED_BLOCK, JSON.stringify({
        nodeId: nodeId,
        transaction: trxn
    }))
}


module.exports = {
    start,
    publishBlock,
    publishTransaction
}