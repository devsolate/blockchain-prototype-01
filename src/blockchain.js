'use strict'

const Block = require('./Block')
const Transaction = require('./transaction')
const Wallet = require('./wallet')
const blockchainFilePath = 'blockchain.db'
const latestHashFilePath = 'latestHash.db'
const Datastore = require('nedb');

class Blockchain {
    constructor() {

        this.db = {}
        this.latestHash = ''
        this.tempTransactions = []

        this.connectDB()
    }

    connectDB() {
        const db = {}
        db.blockchain = new Datastore({
            filename: blockchainFilePath,
            autoload: true
        })
        db.latestHash = new Datastore({
            filename: latestHashFilePath,
            autoload: true
        })
        this.db = db
    }

    getLatestHash() {
        return new Promise((resolve, reject) => {
            this.db.latestHash.findOne({}).exec((err, latest) => {
                if (err) {
                    return reject(err)
                }

                return resolve(latest.latestHash)
            })
        })
    }

    getIterator() {
        return new BlockchainIterator(this, this.latestHash)
    }

    async mine() {
        const data = this.tempTransactions
        const block = Block.create(data, this.latestHash)
        block.setHash()

        try {
            await this.saveBlock(block.toJSON())
            await this.saveLatestHash(block.hash)
            this.latestHash = block.hash
            this.tempTransactions = []

            return Promise.resolve(block)
        } catch (error) {
            return Promise.reject(error)
        }
    }

    find(hash) {
        return new Promise((resolve, reject) => {
            this.db.blockchain.findOne({ hash: hash }, (err, block) => {
                if (block) {
                    return resolve(block)
                } else {
                    return resolve(null)
                }
            })
        })
    }

    saveBlock(block) {
        return new Promise((resolve, reject) => {
            this.db.blockchain.insert(block, (err, newBlock) => {
                if (!err) {
                    resolve()
                } else {
                    reject(err)
                }
            })
        })
    }
    
    saveLatestHash(latestHash) {
        return new Promise((resolve, reject) => {
            this.db.latestHash.findOne({}, (err, hash) => {
                if (err) {
                    return reject(err)
                }

                if (!hash) {
                    this.db.latestHash.insert({
                        latestHash: latestHash
                    }, (err, newHash) => {
                        if (!err) {
                            resolve()
                        } else {
                            reject(err)
                        }
                    })
                } else {
                    this.db.latestHash.update({
                        _id: hash._id
                    }, {
                        latestHash: latestHash
                    }, (err, newHash) => {
                        if (!err) {
                            resolve()
                        } else {
                            reject(err)
                        }
                    })
                }
            })
        })
    }

    isEmpty() {
        return new Promise((resolve, reject) => {
            this.db.blockchain.find({}, (err, blocks) => {
                if (blocks.length == 0) {
                    resolve(true)
                } else {
                    resolve(false)
                }
            })
        })
    }

    async createTrxn(key, password, to, amount = 0) {
        try {
            const wallet = await Wallet.load(key, password)
            const trxn = await Transaction.create(this, wallet, to, amount)
            this.tempTransactions = [
                ...this.tempTransactions,
                trxn
            ]
            return Promise.resolve(trxn)
        } catch(error) {
            return Promise.reject(error)
        }
    }

    async findBalance(address) {
        const unused = await Transaction.findUnusedTransactions(this, address)
        return Promise.resolve(unused.sum)
    }
}

class BlockchainIterator {
    constructor(blockchain, currentHash) {
        this.blockchain = blockchain
        this.currentHash = currentHash
    }

    async next() {
        try {
            // Get a next block from chain
            const nextBlock = await this.blockchain.find(this.currentHash)
            if (nextBlock) {
                this.currentHash = nextBlock.prevBlockHash
                return Promise.resolve(nextBlock)
            } else {
                return Promise.resolve(null)
            }
        } catch (error) {
            return Promise.reject(error)
        }
    }
}

const init = async (address) => {
    try {
        const blockchain = new Blockchain()
        const isEmpty = await blockchain.isEmpty()
        if (isEmpty) {

            // Create Genesis Block and Target Address an Initial Coin
            const block = Block.createGenesisBlock(address)
            block.setHash()

            // Save to DB
            await blockchain.saveBlock(block.toJSON())
            await blockchain.saveLatestHash(block.hash)

            return Promise.resolve(block)
        } else {
            return Promise.reject("Blockchain is already initialized")
        }
    } catch (err) {
        return Promise.reject(err)
    }
}

const get = async () => {
    try {
        const blockchain = new Blockchain()
        const isEmpty = await blockchain.isEmpty()
        if (isEmpty) {
            return Promise.reject("Blockchain is not initialized")
        }
        // Get blockchain latest hash from DB
        blockchain.latestHash = await blockchain.getLatestHash()
        return Promise.resolve(blockchain)
    } catch (error) {
        return Promise.reject(error)
    }
}

module.exports = {
    init,
    get
}