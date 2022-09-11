import { ObjectId } from 'mongodb'
import { Model } from '@/mongo.service'

import setupTestDB, { getDb } from './utils/setupTestDB'

setupTestDB({ debug: false })

const dateObj = new Date()

const userRecord = {
  n: 'Mark',
  e: 'mark@codeawareness.com',
  r: [
    {
      n: 'codeAwareness API',
      o: 'codeawareness.com/api',
      a: [
        { u: 'qwe123', d: dateObj },
        { u: 'asd098' },
      ],
    },
    {
      n: 'codeAwareness LS',
      o: 'codeawareness.com/localservice',
      a: [
        { u: 'random' },
      ],
    },
  ]
}

const simpleRecordWithId = {
  _id: new ObjectId(),
  n: 'simple user',
  e: 'simple@codeawareness.com',
}

const simpleModel = {
  n: String,
  e: String,
}

const nestedModel = {
  n: String,
  e: String,
  r: {
    _children: [{
      n: String,
      o: String,
      a: {
        _children: [{
          u: String,
          d: Date,
        }]
      }
    }]
  }
}

const classRecord = {
  n: 'Haskell',
  u: [userRecord],
  d: {
    u: 'https://codeawareness.com/doc',
    t: 'Code Awareness: mongodb light',
    d: new Date(),
  },
}

const docModel = {
  u: String,
  t: String,
  d: Date,
}

const simpleClassModel = {
  n: String,
  u: { _children: [nestedModel] },
  d: { _children: docModel }
}

let col

describe('MongoDB service', () => {
  describe('Non Aliased models', () => {
    beforeEach(async () => {
      col = getDb().collection('users')
      return col.insertOne(userRecord)
    })

    afterEach(async () => {
      await col.drop()
    })

    test('should correctly format a simple model without alias', async () => {
      const userModel = await Model(simpleModel, 'users')
      const user = await userModel.findOne({ n: 'Mark' })
      // Test
      await expect(user).toEqual(
        expect.objectContaining({ n: 'Mark', e: 'mark@codeawareness.com' })
      )
    })

    test('should correctly insert an object with specified _id', async () => {
      const userModel = await Model(simpleModel, 'users')
      const { insertedId } = await userModel.insertOne(simpleRecordWithId)
      const user = await userModel.findOne({ n: simpleRecordWithId.n })
      // Test
      await expect(user._id).toEqual(simpleRecordWithId._id)
    })

    test('should correctly format objectId', async () => {
      const userModel = await Model(simpleModel, 'users')
      const data = await userModel.insertOne({ n: 'Test', e: 'none' })
      const user = await userModel.findOne({ _id: data.insertedId })
      // Test
      await expect(user).toEqual(
        expect.objectContaining({ n: 'Test', e: 'none' })
      )
    })

    test('should correctly format _id string fields into ObjectId', async () => {
      // TODO: think about it, should we even do this?
      const userModel = await Model(simpleModel, 'users')
      const data = await userModel.insertOne({ n: 'Test', e: 'none' })
      const user = await userModel.findOne({ _id: data.insertedId.toString() })
      // Test
      await expect(user).toEqual(
        expect.objectContaining({ n: 'Test', e: 'none' })
      )
    })
  })

  describe('Non Aliased models: subdocuments', () => {
    beforeEach(async () => {
      col = getDb().collection('classes')
      return col.insertOne(classRecord)
    })

    afterEach(async () => {
      await col.drop()
    })

    test('should correctly format a query for a model with embedded doc', async () => {
      const classModel = await Model(simpleClassModel, 'classes')
      const c = await classModel.findOne({ n: 'Haskell' })
      // Test
      await expect(c).toEqual(
        expect.objectContaining({ n: 'Haskell' })
      )
    })

    test('should correctly query an embedded doc', async () => {
      const classModel = await Model(simpleClassModel, 'classes')
      const c = await classModel.findOne({ 'u.n': 'Mark' })
      // Test
      await expect(c).toEqual(
        expect.objectContaining({ n: 'Haskell' })
      )
    })

    test('should correctly query an embedded doc (even deeper)', async () => {
      const classModel = await Model(simpleClassModel, 'classes')
      const c = await classModel.findOne({ 'u.r.o': 'codeawareness.com/api' })
      // Test
      await expect(c).toEqual(
        expect.objectContaining({ n: 'Haskell' })
      )
    })

    test('should correctly update an embedded document', async () => {
      const classModel = await Model(simpleClassModel, 'classes')
      const cl = await classModel.findOne({ n: 'Haskell' })
      // Test
      await expect(cl.d.t).toEqual('Code Awareness: mongodb light')
    })
  })
})
