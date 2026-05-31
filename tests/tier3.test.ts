import { Model, initMongo } from '@/mongo.service'

import config from './config'
import setupTestDB from './utils/setupTestDB'

setupTestDB({ debug: false })

const model = {
  n: { _alias: 'name' },
  e: { _alias: 'email' },
}

// Dynamically-bound passthrough methods attach when the connect listener fires.
// A Model created after the initial connect registers its listener but does not
// fire it; re-running the (idempotent) initMongo re-fires listeners and binds.
const fireListeners = () => initMongo(config.mongo.url, config.mongo.db)

describe('Tier 3 #6 — scoped getMethods', () => {
  beforeEach(async () => {
    const m: any = await Model(model, 'passthru')
    await m.insertOne({ name: 'A', email: 'a@x.com' })
    await m.insertOne({ name: 'B', email: 'b@x.com' })
  })

  // Regression guard: the descriptor-based, Collection.prototype-scoped discovery
  // must still bind the native methods mongo-alias does NOT explicitly wrap.
  test('native passthrough methods (not explicitly wrapped) are bound and work', async () => {
    const m: any = await Model(model, 'passthru')
    await fireListeners()

    expect(typeof m.aggregate).toBe('function')
    expect(typeof m.distinct).toBe('function')
    expect(typeof m.estimatedDocumentCount).toBe('function')

    expect(await m.estimatedDocumentCount()).toBe(2)

    const agg = await m.aggregate([{ $count: 'total' }]).toArray()
    expect(agg[0].total).toBe(2)

    // passthroughs are un-aliased, so query the raw stored field 'n'
    expect((await m.distinct('n')).sort()).toEqual(['A', 'B'])

    // scoping is invisible to the bound-method set, but the model must still
    // behave as a plain object — Object.prototype members untouched.
    expect(m.hasOwnProperty('find')).toBe(true)
    expect(m.constructor).toBe(Object)
  })
})
