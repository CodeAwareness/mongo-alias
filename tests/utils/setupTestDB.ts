import { initMongo } from '@/mongo.service'
import config from '../config'
import { setDebug as logDebug } from './logger'

let mongoClient, db

export function getDb() {
  return db
}

function checkOps() {
  return new Promise(
    (resolve, reject) => {
      mongoClient.db('admin').command({ currentOp: 1, active: true }, (err, result) => {
        if (err) reject(err)
        const ops = result.inprog.filter(r => r.ns && !r.ns.includes('admin')).map(r => r.command)
        resolve(ops.length)
      })
    })
    .then(len => len ? new Promise((resolve, reject) => setTimeout(() => checkOps().then(resolve), 500)) : true)
}

function setDebug(val) {
  logDebug(val)
  const options = { monitorCommands: val }
  return options
}

const setupTestDB = ({ debug }) => {
  beforeAll(async () => {
    const options = setDebug(debug)

    const data = await initMongo(config.mongo.url, config.mongo.db, options)
    mongoClient = data.mongoClient
    db = data.db
  })

  beforeEach(async () => {
    const collections = await db.listCollections().toArray()
    await checkOps()
    await Promise
      .all(collections.map((collection) => db.dropCollection(collection.name)))
      .then(() => { /* TODO: why we need this? */ })
  })

  afterAll(async () => {
    const collections = await db.listCollections().toArray()
    await checkOps()
    await Promise
      .all(collections.map((collection) => db.dropCollection(collection.name)))
      .then(() => { /* TODO: why we need this? */ })
  })
}

export default setupTestDB
