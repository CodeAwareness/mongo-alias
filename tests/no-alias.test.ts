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

  describe('ObjectId operators (no aliases)', () => {
    const friendsModel = {
      n: String,
      f: Array, // array of ObjectIds
    }

    beforeEach(async () => {
      col = getDb().collection('friends')
    })

    afterEach(async () => {
      await col.drop()
    })

    test('should handle $in operator with ObjectIds', async () => {
      const friendModel = Model(friendsModel, 'friends')
      const id1 = new ObjectId()
      const id2 = new ObjectId()
      const id3 = new ObjectId()

      await friendModel.insertOne({ _id: id1, n: 'User 1' })
      await friendModel.insertOne({ _id: id2, n: 'User 2' })
      await friendModel.insertOne({ _id: id3, n: 'User 3' })

      const users = await friendModel.find({ _id: { $in: [id1, id2] } }).toArray()
      // Test
      expect(users.length).toBe(2)
      expect(users.map(u => u.n).sort()).toEqual(['User 1', 'User 2'])
    })

    test('should handle $nin operator with ObjectIds', async () => {
      const friendModel = Model(friendsModel, 'friends')
      const id1 = new ObjectId()
      const id2 = new ObjectId()
      const id3 = new ObjectId()

      await friendModel.insertOne({ _id: id1, n: 'User 1' })
      await friendModel.insertOne({ _id: id2, n: 'User 2' })
      await friendModel.insertOne({ _id: id3, n: 'User 3' })

      const users = await friendModel.find({ _id: { $nin: [id1] } }).toArray()
      // Test
      expect(users.length).toBe(2)
      expect(users.map(u => u.n).sort()).toEqual(['User 2', 'User 3'])
    })

    test('should handle $ne operator with ObjectId', async () => {
      const friendModel = Model(friendsModel, 'friends')
      const id1 = new ObjectId()
      const id2 = new ObjectId()

      await friendModel.insertOne({ _id: id1, n: 'User 1' })
      await friendModel.insertOne({ _id: id2, n: 'User 2' })

      const users = await friendModel.find({ _id: { $ne: id1 } }).toArray()
      // Test
      expect(users.length).toBe(1)
      expect(users[0].n).toEqual('User 2')
    })

    test('should auto-convert string IDs in $in operator', async () => {
      const friendModel = Model(friendsModel, 'friends')
      const id1 = new ObjectId()
      const id2 = new ObjectId()

      await friendModel.insertOne({ _id: id1, n: 'User 1' })
      await friendModel.insertOne({ _id: id2, n: 'User 2' })

      const users = await friendModel.find({ 
        _id: { $in: [id1.toString(), id2.toString()] } 
      }).toArray()
      // Test
      expect(users.length).toBe(2)
    })

    test('should handle $pullAll with ObjectIds', async () => {
      const friendModel = Model(friendsModel, 'friends')
      const id1 = new ObjectId()
      const id2 = new ObjectId()
      const id3 = new ObjectId()

      await friendModel.insertOne({ 
        _id: id1, 
        n: 'User 1', 
        f: [id2, id3] 
      })

      await friendModel.updateOne(
        { _id: id1 },
        { $pullAll: { f: [id2] } }
      )

      const user = await friendModel.findOne({ _id: id1 })
      // Test
      expect(user.f.length).toBe(1)
      expect(user.f[0].toString()).toBe(id3.toString())
    })

    test('should handle $pull with ObjectId', async () => {
      const friendModel = Model(friendsModel, 'friends')
      const id1 = new ObjectId()
      const id2 = new ObjectId()
      const id3 = new ObjectId()

      await friendModel.insertOne({ 
        _id: id1, 
        n: 'User 1', 
        f: [id2, id3] 
      })

      await friendModel.updateOne(
        { _id: id1 },
        { $pull: { f: id2 } }
      )

      const user = await friendModel.findOne({ _id: id1 })
      // Test
      expect(user.f.length).toBe(1)
      expect(user.f[0].toString()).toBe(id3.toString())
    })

    test('should handle $pull with nested $in', async () => {
      const friendModel = Model(friendsModel, 'friends')
      const id1 = new ObjectId()
      const id2 = new ObjectId()
      const id3 = new ObjectId()

      await friendModel.insertOne({ 
        _id: id1, 
        n: 'User 1', 
        f: [id2, id3] 
      })

      await friendModel.updateOne(
        { _id: id1 },
        { $pull: { f: { $in: [id2, id3] } } }
      )

      const user = await friendModel.findOne({ _id: id1 })
      // Test
      expect(user.f.length).toBe(0)
    })

    test('should handle $push with ObjectId', async () => {
      const friendModel = Model(friendsModel, 'friends')
      const id1 = new ObjectId()
      const id2 = new ObjectId()

      await friendModel.insertOne({ 
        _id: id1, 
        n: 'User 1', 
        f: [] 
      })

      await friendModel.updateOne(
        { _id: id1 },
        { $push: { f: id2 } }
      )

      const user = await friendModel.findOne({ _id: id1 })
      // Test
      expect(user.f.length).toBe(1)
      expect(user.f[0].toString()).toBe(id2.toString())
    })

    test('should handle $addToSet with ObjectId', async () => {
      const friendModel = Model(friendsModel, 'friends')
      const id1 = new ObjectId()
      const id2 = new ObjectId()
      const id3 = new ObjectId()

      await friendModel.insertOne({ 
        _id: id1, 
        n: 'User 1', 
        f: [id2] 
      })

      await friendModel.updateOne(
        { _id: id1 },
        { $addToSet: { f: id3 } }
      )

      const user = await friendModel.findOne({ _id: id1 })
      // Test
      expect(user.f.length).toBe(2)
    })

    test('should handle $push with $each modifier', async () => {
      const friendModel = Model(friendsModel, 'friends')
      const id1 = new ObjectId()
      const id2 = new ObjectId()
      const id3 = new ObjectId()

      await friendModel.insertOne({ 
        _id: id1, 
        n: 'User 1', 
        f: [] 
      })

      await friendModel.updateOne(
        { _id: id1 },
        { $push: { f: { $each: [id2, id3] } } }
      )

      const user = await friendModel.findOne({ _id: id1 })
      // Test
      expect(user.f.length).toBe(2)
    })

    test('should handle $gt/$lt with ObjectIds (timestamp comparison)', async () => {
      const friendModel = Model(friendsModel, 'friends')
      const oldId = new ObjectId('507f1f77bcf86cd799439011')
      const newId = new ObjectId()

      await friendModel.insertOne({ _id: oldId, n: 'Old User' })
      await friendModel.insertOne({ _id: newId, n: 'New User' })

      const newerUsers = await friendModel.find({ _id: { $gt: oldId } }).toArray()
      // Test
      expect(newerUsers.length).toBe(1)
      expect(newerUsers[0].n).toBe('New User')
    })
  })
})
