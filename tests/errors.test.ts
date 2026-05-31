import { ObjectId } from 'mongodb'
import { Model, unalias } from '@/mongo.service'

// NOTE: this file intentionally does NOT call setupTestDB / initMongo, so the
// module-level `db` is undefined and a Model's `col` stays unset — which is the
// "used before connected" condition we want to assert. unalias() is pure and
// needs no connection.

const model = {
  n: { _alias: 'name' },
  e: { _alias: 'email' },
}

describe('Error handling & ObjectId coercion', () => {
  describe('used-before-connected guard', () => {
    test('a model method called before initMongo throws a clear, actionable error', () => {
      const m: any = Model(model, 'neverconnected')
      expect(() => m.find({ name: 'x' })).toThrow(/used before a DB connection/)
      expect(() => m.find({ name: 'x' })).toThrow(/initMongo/)
      expect(() => m.insertOne({ name: 'x' })).toThrow(/collection "neverconnected"/)
    })
  })

  describe('strict 24-hex ObjectId coercion', () => {
    test('a 24-hex string _id IS coerced to ObjectId', () => {
      const out: any = unalias({ _id: '507f1f77bcf86cd799439011' }, model)
      expect(out._id).toBeInstanceOf(ObjectId)
      expect(out._id.toString()).toBe('507f1f77bcf86cd799439011')
    })

    test('a non-hex string _id is left as a string — no coercion, no throw', () => {
      expect(() => unalias({ _id: 'not-an-objectid' }, model)).not.toThrow()
      const out: any = unalias({ _id: 'not-an-objectid' }, model)
      expect(typeof out._id).toBe('string')
      expect(out._id).toBe('not-an-objectid')
    })

    test('a 12-char hex string is NOT coerced (avoids the ObjectId.isValid 12-byte trap)', () => {
      // ObjectId.isValid('abcdef123456') === true, but it's a literal string id
      const out: any = unalias({ _id: 'abcdef123456' }, model)
      expect(typeof out._id).toBe('string')
    })

    test('$in coerces only the 24-hex members, passes the rest through unchanged', () => {
      const out: any = unalias(
        { _id: { $in: ['507f1f77bcf86cd799439011', 'plain-id'] } },
        model,
      )
      expect(out._id.$in[0]).toBeInstanceOf(ObjectId)
      expect(out._id.$in[1]).toBe('plain-id')
    })

    test('$gt coerces a 24-hex string but leaves a non-hex string alone', () => {
      const hex: any = unalias({ _id: { $gt: '507f1f77bcf86cd799439011' } }, model)
      expect(hex._id.$gt).toBeInstanceOf(ObjectId)

      const plain: any = unalias({ _id: { $gt: 'abc' } }, model)
      expect(typeof plain._id.$gt).toBe('string')
    })
  })
})
