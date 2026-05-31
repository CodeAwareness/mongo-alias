import { ObjectId } from 'mongodb'
import { Model, unalias } from '@/mongo.service'

import setupTestDB from './utils/setupTestDB'

setupTestDB({ debug: false })

const model = {
  n: { _alias: 'name' },
  e: { _alias: 'email' },
  u: { _alias: 'user' },
}

describe('Tier 2 correctness', () => {
  // -------------------------------------------------------------------------
  // #1 — unalias must NOT mutate the caller's query/update object
  // -------------------------------------------------------------------------
  describe('#1 clone, do not mutate', () => {
    test('string _id is coerced in the output but left untouched on the input', () => {
      const q: any = { _id: '507f1f77bcf86cd799439011', name: 'Mark' }
      const out: any = unalias(q, model)

      // input untouched
      expect(typeof q._id).toBe('string')
      expect(q.name).toBe('Mark')
      expect('n' in q).toBe(false)

      // output translated + coerced
      expect(out._id).toBeInstanceOf(ObjectId)
      expect(out._id.toString()).toBe('507f1f77bcf86cd799439011')
      expect(out.n).toBe('Mark')
    })

    test('$in ObjectId coercion does not mutate the caller array', () => {
      const ids = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
      const q: any = { _id: { $in: ids } }
      const out: any = unalias(q, model)

      // input strings untouched
      expect(typeof q._id.$in[0]).toBe('string')
      expect(q._id.$in[0]).toBe('507f1f77bcf86cd799439011')

      // output coerced to ObjectId
      expect(out._id.$in[0]).toBeInstanceOf(ObjectId)
      expect(out._id.$in[1]).toBeInstanceOf(ObjectId)
    })

    test('$gt/$lt single-op ObjectId coercion does not mutate the input', () => {
      const q: any = { _id: { $gt: '507f1f77bcf86cd799439011' } }
      const out: any = unalias(q, model)
      expect(typeof q._id.$gt).toBe('string')
      expect(out._id.$gt).toBeInstanceOf(ObjectId)
    })

    test('RegExp / Date / ObjectId survive cloning as opaque leaves (same ref)', () => {
      const rx = /foo/i
      const dt = new Date()
      const oid = new ObjectId()
      const out: any = unalias({ name: rx, email: dt, user: oid }, model)

      expect(out.n).toBe(rx)               // not collapsed to {}
      expect(out.n instanceof RegExp).toBe(true)
      expect(out.e).toBe(dt)
      expect(out.u).toBe(oid)
    })
  })

  // -------------------------------------------------------------------------
  // #5 — array-index detection (was isNaN, which mis-classifies '' and '1.5')
  // -------------------------------------------------------------------------
  describe('#5 array-index detection', () => {
    test('purely numeric keys produce an array', () => {
      const out = unalias({ 0: 'a', 1: 'b' }, [{}])
      expect(Array.isArray(out)).toBe(true)
      expect(out).toEqual(['a', 'b'])
    })

    test('empty-string key is NOT treated as an array index', () => {
      // isNaN('') === false would have wrongly made this an array
      const out = unalias({ '': 'x' }, model)
      expect(Array.isArray(out)).toBe(false)
    })

    test('decimal key is NOT treated as an array index', () => {
      // isNaN('1.5') === false would have wrongly made this an array
      const out = unalias({ '1.5': 'x' }, model)
      expect(Array.isArray(out)).toBe(false)
    })

    test('whitespace key is NOT treated as an array index', () => {
      const out = unalias({ ' ': 'x' }, model)
      expect(Array.isArray(out)).toBe(false)
    })

    test('positional nested array path still translates ($set repos.0.origin)', () => {
      const repoModel = {
        r: { _alias: 'repos', _children: [{ o: { _alias: 'origin' } }] },
      }
      const out: any = unalias({ 'repos.0.origin': 'github.com/x' }, repoModel)
      expect(out['r.0.o']).toBe('github.com/x')
    })
  })

  // -------------------------------------------------------------------------
  // #2 — alias restoration on EVERY cursor consumption path
  // -------------------------------------------------------------------------
  describe('#2 cursor alias restoration', () => {
    beforeEach(async () => {
      const m: any = await Model(model, 'cursordocs')
      await m.insertOne({ name: 'A', email: 'a@x.com' })
      await m.insertOne({ name: 'B', email: 'b@x.com' })
    })

    const deAliased = (d: any) => d && 'name' in d && 'email' in d && !('n' in d) && !('e' in d)

    test('.toArray() de-aliases', async () => {
      const m: any = await Model(model, 'cursordocs')
      const docs = await m.find({}).toArray()
      expect(docs).toHaveLength(2)
      expect(docs.every(deAliased)).toBe(true)
    })

    test('.next() de-aliases (and null at end is preserved)', async () => {
      const m: any = await Model(model, 'cursordocs')
      const cursor = m.find({})
      const first = await cursor.next()
      expect(deAliased(first)).toBe(true)
      await cursor.next() // second
      const end = await cursor.next()
      expect(end).toBeNull()
    })

    test('.forEach() de-aliases', async () => {
      const m: any = await Model(model, 'cursordocs')
      const seen: any[] = []
      await m.find({}).forEach((d: any) => seen.push(d))
      expect(seen).toHaveLength(2)
      expect(seen.every(deAliased)).toBe(true)
    })

    test('async iteration (for await) de-aliases', async () => {
      const m: any = await Model(model, 'cursordocs')
      const seen: any[] = []
      for await (const d of m.find({})) seen.push(d)
      expect(seen).toHaveLength(2)
      expect(seen.every(deAliased)).toBe(true)
    })

    test('raw=true returns the un-wrapped (short-key) cursor', async () => {
      const m: any = await Model(model, 'cursordocs')
      const docs = await m.find({}, undefined, true).toArray()
      expect(docs).toHaveLength(2)
      expect(docs.every((d: any) => 'n' in d)).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // #4 — re-registering a Model for the same collection is idempotent
  // -------------------------------------------------------------------------
  describe('#4 listener dedup', () => {
    test('two Models on the same collection both stay functional', async () => {
      const a: any = await Model(model, 'dups')
      const b: any = await Model(model, 'dups')
      await a.insertOne({ name: 'X', email: 'x@x.com' })

      const viaB = await b.findOne({ name: 'X' })
      expect(viaB.email).toBe('x@x.com')
      const viaA = await a.findOne({ name: 'X' })
      expect(viaA.name).toBe('X')
    })
  })
})
