import { Model } from '@/mongo.service'

import setupTestDB from './utils/setupTestDB'

setupTestDB({ debug: false })

const aliasModel = {
  n: { _alias: 'name' },
  e: { _alias: 'email' },
}

// createdAt (_c) / updatedAt (_u) are injected by Model and read back aliased
// via findOne. These tests exercise the upsert timestamp behavior for each
// write instruction: a fresh insert must stamp BOTH createdAt and updatedAt,
// while an upsert that matches an existing doc must leave createdAt untouched.
describe('upsert timestamps', () => {
  describe('updateOne', () => {
    test('upsert-insert stamps both createdAt and updatedAt', async () => {
      const m = await Model(aliasModel, 'upserts')
      const res: any = await m.updateOne({ name: 'u1' }, { $set: { email: 'u1@x.com' } }, { upsert: true })
      expect(res.upsertedCount).toBe(1)

      const doc = await m.findOne({ name: 'u1' })
      expect(doc.email).toEqual('u1@x.com')
      expect(doc.createdAt).toBeInstanceOf(Date)
      expect(doc.updatedAt).toBeInstanceOf(Date)
    })

    test('upsert that matches an existing doc preserves createdAt', async () => {
      const m = await Model(aliasModel, 'upserts')
      await m.insertOne({ name: 'u2', email: 'a@x.com' })
      const before = await m.findOne({ name: 'u2' })

      const res: any = await m.updateOne({ name: 'u2' }, { $set: { email: 'b@x.com' } }, { upsert: true })
      expect(res.upsertedCount).toBe(0)
      expect(res.matchedCount).toBe(1)

      const after = await m.findOne({ name: 'u2' })
      expect(after.email).toEqual('b@x.com')
      expect(after.createdAt.getTime()).toBe(before.createdAt.getTime())
      expect(after.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('updateMany', () => {
    test('upsert-insert stamps both createdAt and updatedAt', async () => {
      const m = await Model(aliasModel, 'upserts')
      const res: any = await m.updateMany({ name: 'm1' }, { $set: { email: 'm1@x.com' } }, { upsert: true })
      expect(res.upsertedCount).toBe(1)

      const doc = await m.findOne({ name: 'm1' })
      expect(doc.email).toEqual('m1@x.com')
      expect(doc.createdAt).toBeInstanceOf(Date)
      expect(doc.updatedAt).toBeInstanceOf(Date)
    })

    test('upsert that matches an existing doc preserves createdAt', async () => {
      const m = await Model(aliasModel, 'upserts')
      await m.insertOne({ name: 'm2', email: 'a@x.com' })
      const before = await m.findOne({ name: 'm2' })

      const res: any = await m.updateMany({ name: 'm2' }, { $set: { email: 'b@x.com' } }, { upsert: true })
      expect(res.upsertedCount).toBe(0)
      expect(res.matchedCount).toBe(1)

      const after = await m.findOne({ name: 'm2' })
      expect(after.email).toEqual('b@x.com')
      expect(after.createdAt.getTime()).toBe(before.createdAt.getTime())
      expect(after.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('replaceOne', () => {
    test('upsert-insert stamps both createdAt and updatedAt', async () => {
      const m = await Model(aliasModel, 'upserts')
      const res: any = await m.replaceOne({ name: 'r1' }, { name: 'r1', email: 'r1@x.com' }, { upsert: true })
      expect(res.upsertedCount).toBe(1)

      const doc = await m.findOne({ name: 'r1' })
      expect(doc.email).toEqual('r1@x.com')
      expect(doc.createdAt).toBeInstanceOf(Date)
      expect(doc.updatedAt).toBeInstanceOf(Date)
    })

    // A plain replaceOne overwrites the whole doc and would drop createdAt; the
    // aggregation-pipeline upsert path must carry the original value forward.
    test('upsert that matches an existing doc preserves createdAt', async () => {
      const m = await Model(aliasModel, 'upserts')
      await m.insertOne({ name: 'r2', email: 'a@x.com' })
      const before = await m.findOne({ name: 'r2' })

      const res: any = await m.replaceOne({ name: 'r2' }, { name: 'r2', email: 'b@x.com' }, { upsert: true })
      expect(res.upsertedCount).toBe(0)
      expect(res.matchedCount).toBe(1)

      const after = await m.findOne({ name: 'r2' })
      expect(after.email).toEqual('b@x.com')
      expect(after.createdAt.getTime()).toBe(before.createdAt.getTime())
      expect(after.updatedAt).toBeInstanceOf(Date)
    })
  })
})
