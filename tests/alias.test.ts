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
        { u: 'asd098', d: dateObj },
      ],
      f: [],
    },
    {
      n: 'codeAwareness LS',
      o: 'codeawareness.com/localservice',
      a: [
        { u: 'random', d: dateObj },
      ],
      f: ['README.md'],
    },
  ]
}

const userRecordAliased = {
  name: 'Mark',
  email: 'mark@codeawareness.com',
  repos: [
    {
      name: 'codeAwareness API',
      origin: 'codeawareness.com/api',
      auth: [
        { user: 'qwe123', d: dateObj },
        { user: 'asd098', d: dateObj },
      ],
      files: [],
    },
    {
      name: 'codeAwareness LS',
      origin: 'codeawareness.com/localservice',
      auth: [
        { user: 'random', d: dateObj },
      ],
      files: ['README.md'],
    },
  ]
}

const simpleAliasModel = {
  n: { _alias: 'name' },
  e: { _alias: 'email' },
  d: { _alias: 'lastLogin' },
  u: { _alias: 'user' },
  r: [{ a: {}, n: '', o: '', f: [] }],
}

const hashMapModel = {
  n: { _alias: 'name' },
  c: {
    _alias: 'changes',
    _children: {
      _children: {
        h: { _alias: 'value' },
        d: { _alias: 'date' },
      },
    },
  },
}

const singleAliasModel = {
  n: { _alias: 'name' },
  s: {
    _alias: 'sha',
    _children: {
      h: { _alias: 'value' },
      d: { _alias: 'date' },
    },
  },
}

const nestedAliasModel = {
  n: { _alias: 'name' },
  e: { _alias: 'email' },
  r: {
    _alias: 'repos',
    _children: [{
      n: { _alias: 'name' },
      o: { _alias: 'origin' },
      a: {
        _alias: 'auth',
        _children: [{
          u: { _alias: 'user' },
          d: { _alias: 'date' },
        }]
      },
      f: { _alias: 'files' },
    }]
  }
}

const docModel = {
  u: { _alias: 'url' },
  t: { _alias: 'title' },
  d: { _alias: 'date' },
}

const simpleClassModel = {
  n: { _alias: 'name' },
  u: { _alias: 'users', _children: [nestedAliasModel] },
  d: { _alias: 'doc', _children: docModel }
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

const classRecordAliased = {
  name: 'Category Theory',
  users: [userRecordAliased],
  doc: {
    url: 'https://codeawareness.com/doc/categ',
    title: 'Code Awareness: Category Theory',
    date: new Date(),
  },
}

let col

describe('MongoDB service', () => {
  describe('Aliased models', () => {
    beforeEach(async () => {
      col = getDb().collection('users')
      return col.insertOne(userRecord)
    })

    afterEach(async () => {
      await col.drop()
    })

    test('should correctly format a simple alias', async () => {
      const userModel = await Model(simpleAliasModel, 'users')
      const user = await userModel.findOne({ name: 'Mark' })
      // Test
      await expect(user).toEqual(
        expect.objectContaining({ name: 'Mark', email: 'mark@codeawareness.com' })
      )
    })

    test('should correctly format a simple alias query for model with array', async () => {
      const userModel = await Model(simpleAliasModel, 'users')
      const user = await userModel.findOne({ 'r.a.u': 'qwe123' })
      // Test
      await expect(user).toEqual(
        expect.objectContaining({ name: 'Mark', email: 'mark@codeawareness.com' })
      )
    })

    test('should correctly format a simple alias query for model with a nested Date object', async () => {
      const userModel = await Model(nestedAliasModel, 'users')
      const user = await userModel.findOne({ 'r.a.d': dateObj })
      // Test
      await expect(user).toEqual(
        expect.objectContaining({ name: 'Mark', email: 'mark@codeawareness.com' })
      )
    })

    test('should correctly format a simple alias query for model with a root Date object', async () => {
      const tempDate = new Date()
      const userModel = await Model(simpleAliasModel, 'users')
      await userModel.insertOne({ name: 'test-date', lastLogin: tempDate })
      const user = await userModel.findOne({ lastLogin: tempDate })
      // Test
      await expect(user).toEqual(
        expect.objectContaining({ name: 'test-date' })
      )
    })

    test('should correctly format a simple alias query for model with a root ObjectId field', async () => {
      const tempDate = new Date()
      const uid = new ObjectId()
      const userModel = await Model(simpleAliasModel, 'users')
      await userModel.insertOne({ name: 'test-date', lastLogin: tempDate, user: uid })
      const user = await userModel.findOne({ user: uid })
      // Test
      await expect(user).toEqual(
        expect.objectContaining({ name: 'test-date' })
      )
    })

    test('should correctly insert an object with specified _id', async () => {
      const userModel = await Model(simpleAliasModel, 'users')
      const _id = new ObjectId()
      const { insertedId } = await userModel.insertMany([{ name: 'test', email: '.com', _id }])
      const user = await userModel.findOne({ name: 'test' })
      // Test
      await expect(user._id).toEqual(_id)
    })

    // TODO: split this into clearer scopes
    test('should correctly insert complex aliased model', async () => {
      const userModel = await Model(nestedAliasModel, 'users')
      const userId1 = new ObjectId()
      const userId2 = new ObjectId()
      const user = {
        name: 'test',
        email: 'test@codeawareness.com',
        repos: [
          { origin: 'github.com/codeawareness', auth: [ { user: userId1 }, { user: userId2 } ] },
          { origin: 'gitlab.com/codeawareness', auth: [ { user: userId1 } ] },
        ],
      }
      const { insertedId } = await userModel.insertOne(user)

      // Action
      const rec = await userModel.findOne({ _id: insertedId }, {}, true)

      // Test
      await expect(rec.r[0].o).toEqual('github.com/codeawareness')
      await expect(rec.r[1].o).toEqual('gitlab.com/codeawareness')
      await expect(rec.r[0].a[0].u).toEqual(userId1)
      await expect(rec.r[0].a[1].u).toEqual(userId2)
      await expect(rec.r[1].a[0].u).toEqual(userId1)
    })

    test('should correctly insert a model with an array field', async () => {
      const userModel = await Model(nestedAliasModel, 'users')
      const userId1 = new ObjectId()
      const userId2 = new ObjectId()
      const user = {
        name: 'test',
        email: 'test@codeawareness.com',
        repos: [
          { origin: 'github.com/codeawareness', auth: [ { user: userId1 }, { user: userId2 } ] },
          { origin: 'gitlab.com/codeawareness', auth: [ { user: userId1 } ] },
        ],
      }
      await userModel.insertOne(user)
      const recUser = await userModel.findOne({ name: 'test' })

      // Test
      await expect(recUser).toEqual(
        expect.objectContaining({ name: 'test', email: 'test@codeawareness.com' })
      )
      await expect(recUser.repos[0].origin).toEqual('github.com/codeawareness')
      await expect(recUser.repos[0].auth[1].user).toEqual(userId2)
      await expect(recUser.repos instanceof Array).toBe(true)
    })

    test('should correctly format a query for a nested alias model', async () => {
      const userModel = await Model(nestedAliasModel, 'users')
      const user = await userModel.findOne({ 'repos.origin': 'codeawareness.com/api' })
      // Test
      await expect(user).toEqual(
        expect.objectContaining({ name: 'Mark', email: 'mark@codeawareness.com' })
      )
      await expect(user.repos[0].origin).toEqual('codeawareness.com/api')
    })

    test('should correctly format a query for deeply nested alias model', async () => {
      const userModel = await Model(nestedAliasModel, 'users')
      const user = await userModel.findOne({ 'repos.auth.user': 'qwe123' })
      // Test
      await expect(user).toEqual(
        expect.objectContaining({ name: 'Mark', email: 'mark@codeawareness.com' })
      )
    })

    test('should correctly format a query for an alias model with an embedded object', async () => {
      const repoModel = await Model(singleAliasModel, 'repos')
      const dateObj = new Date()
      await repoModel.insertOne({ name: 'Mark', sha: { value: '123', date: dateObj } })
      const repo = await repoModel.findOne({ name: 'Mark' })
      // Test
      expect(repo.sha.value).toEqual('123')
      expect(repo.sha.date).toEqual(dateObj)
    })

    test('should correctly format a query for an alias model with multiple embedded objects inside a hash map', async () => {
      const repoModel = await Model(hashMapModel, 'repos')
      const dateObj = new Date()
      await repoModel.insertOne({
        name: 'Test HashMap',
        changes: {
          '123qwe': { value: 12, date: dateObj },
          '124asd': { value: 13, date: dateObj },
        }
      })
      const repo = await repoModel.findOne({ name: 'Test HashMap' })
      // Test
      expect(repo.changes['123qwe'].value).toEqual(12)
      expect(repo.changes['123qwe'].date).toEqual(dateObj)
      expect(repo.changes['124asd'].value).toEqual(13)
      expect(repo.changes['124asd'].date).toEqual(dateObj)
    })

    test('should correctly format an update for an alias model with multiple embedded objects inside a hash map', async () => {
      const repoModel = await Model(hashMapModel, 'repos')
      const dateObj = new Date()
      await repoModel.insertOne({
        name: 'Test HashMap',
        changes: {
          '123qwe': { value: 12, date: dateObj },
          '124asd': { value: 13, date: dateObj },
        }
      })
      const newDate = new Date('2023-01-01')
      await repoModel.updateOne({ name: 'Test HashMap' }, { $set: { 'changes.123qwe.value': 0, 'changes.124asd.date': newDate } })
      const repo = await repoModel.findOne({ name: 'Test HashMap' })
      // Test
      expect(repo.changes['123qwe'].value).toEqual(0)
      expect(repo.changes['123qwe'].date).toEqual(dateObj)
      expect(repo.changes['124asd'].value).toEqual(13)
      expect(repo.changes['124asd'].date).toEqual(newDate)
    })

    test('should correctly format an update for an alias model where we replace an entire object inside a hash map', async () => {
      const repoModel = await Model(hashMapModel, 'repos')
      const dateObj = new Date()
      await repoModel.insertOne({
        name: 'Test HashMap',
        changes: {
          '123qwe': { value: 12, date: dateObj },
          '124asd': { value: 13, date: dateObj },
        }
      })
      const newDate = new Date('2023-01-01')
      await repoModel.updateOne({ name: 'Test HashMap' }, { $set: { 'changes.123qwe': { value: 0, date: newDate } } })
      const raw = await repoModel.findOne({ name: 'Test HashMap' }, {}, true)

      // Test
      expect(raw.c['123qwe'].h).toEqual(0)
      expect(raw.c['123qwe'].d).toEqual(newDate)

      const repo = await repoModel.findOne({ name: 'Test HashMap' })
      expect(repo.changes['123qwe'].value).toEqual(0)
      expect(repo.changes['123qwe'].date).toEqual(newDate)
      expect(repo.changes['124asd'].value).toEqual(13)
      expect(repo.changes['124asd'].date).toEqual(dateObj)
    })

    test('should correctly format a query that targets an entire subdocument definition', async () => {
      const userModel = await Model(nestedAliasModel, 'users')
      const user = await userModel.findOne({ 'repos.auth': { user: 'qwe123', date: userRecord.r[0].a[0].d } })

      // Test
      await expect(user).toEqual(
        expect.objectContaining({ name: 'Mark', email: 'mark@codeawareness.com' })
      )
    })

    test('should correctly format a query for a model with multiple deeply nested aliases', async () => {
      const userModel = await Model(nestedAliasModel, 'users')
      const user = await userModel.findOne({ 'repos.auth.user': 'qwe123', 'repos.origin': 'codeawareness.com/api' })

      // Test
      await expect(user).toEqual(
        expect.objectContaining({ name: 'Mark', email: 'mark@codeawareness.com' })
      )
    })

    test('should correctly format a query for a model with array positional notation and $lt conditions and unaliased fields', async () => {
      const userModel = await Model(nestedAliasModel, 'users')
      // Test Positive scenario
      const res = await userModel.findOne({ 'repos.1.auth.0.date': { $lt: new Date() } })
      await expect(res).toEqual(
        expect.objectContaining({ email: userRecordAliased.email })
      )

      // Test Negative scenario
      const res2 = await userModel.findOne({ 'repos.1.auth.0.date': { $lt: new Date('2020-01-01') } })
      await expect(res2).toEqual(null)
    })

    test('should correctly format a query for a model with multiple deeply nested alias model, containing positional $ element and unaliased fields', async () => {
      const userModel = await Model(nestedAliasModel, 'users')
      const res = await userModel.updateOne({}, { $set: { 'repos.$[].auth.$[].marker': 'NEO' } })
      // Test
      await expect(res).toEqual(
        expect.objectContaining({ matchedCount: 1, modifiedCount: 1 })
      )
      const user = await userModel.findOne()
      await expect(user).toEqual(
        expect.objectContaining({ name: 'Mark', email: 'mark@codeawareness.com' })
      )
      await expect(user.repos[0].auth[0].marker).toEqual('NEO')
    })

    test('should correctly format a direct acess to array elements', async () => {
      const userModel = await Model(nestedAliasModel, 'users')
      const user = await userModel.findOne({ 'repos.0.auth.0.user': 'qwe123' })
      // Test
      await expect(user.repos[0].origin).toEqual('codeawareness.com/api')
    })

    test('should correctly format a direct update of array elements', async () => {
      const userModel = await Model(nestedAliasModel, 'users')
      await userModel.updateOne({ 'repos.origin': 'codeawareness.com/localservice' }, { $set: { 'repos.0.auth.1.user': 'test' } })
      const user = await userModel.findOne({ 'repos.origin': 'codeawareness.com/localservice' })
      // Test
      await expect(user.repos[0].auth[1].user).toEqual('test')
    })

    test('should correctly add a created date upon insert', async () => {
      const userModel = await Model(simpleAliasModel, 'users')
      await userModel.insertOne({ name: 'test-date', email: 'mark@codeawareness.com' })
      const user = await userModel.findOne({ name: 'test-date' })
      // Test
      await expect(user.createdAt).toBeInstanceOf(Date)
    })

    test('should correctly add an updated date upon update', async () => {
      const userModel = await Model(simpleAliasModel, 'users')
      await userModel.insertOne({ name: 'test-date', email: 'mark@codeawareness.com' })
      await userModel.updateOne({ name: 'test-date' }, { $set: { email: 'info@codeawareness.com' } })
      const user = await userModel.findOne({ name: 'test-date' })
      // Test
      await expect(user.createdAt).toBeInstanceOf(Date)
      await expect(user.updatedAt).toBeInstanceOf(Date)
      await expect(user.email).toEqual('info@codeawareness.com')
    })
  })

  describe('Aliased models: subdocuments', () => {
    beforeEach(async () => {
      col = getDb().collection('classes')
      return col.insertOne(classRecord)
    })

    afterEach(async () => {
      await col.drop()
    })

    test('should correctly format a query for a model with embedded doc', async () => {
      const classModel = await Model(simpleClassModel, 'classes')
      const c = await classModel.findOne({ name: 'Haskell' })
      // Test
      await expect(c).toEqual(
        expect.objectContaining({ name: 'Haskell' })
      )
    })

    test('should correctly query an embedded doc', async () => {
      const classModel = await Model(simpleClassModel, 'classes')
      const c = await classModel.findOne({ 'users.name': 'Mark' })
      // Test
      await expect(c).toEqual(
        expect.objectContaining({ name: 'Haskell' })
      )
    })

    test('should correctly query an embedded doc (even deeper)', async () => {
      const classModel = await Model(simpleClassModel, 'classes')
      const c = await classModel.findOne({ 'users.repos.origin': 'codeawareness.com/api' })
      // Test
      await expect(c).toEqual(
        expect.objectContaining({ name: 'Haskell' })
      )
    })

    test('should correctly update an embedded document', async () => {
      const classModel = await Model(simpleClassModel, 'classes')
      await classModel.insertOne(classRecordAliased)
      const cl = await classModel.findOne({ name: 'Category Theory' })
      // Test
      await expect(cl.doc.title).toEqual('Code Awareness: Category Theory')
    })

    test('should correctly update an empty array', async () => {
      const classModel = await Model(simpleClassModel, 'classes')
      await classModel.insertOne(classRecordAliased)
      const cl = await classModel.findOne({ name: 'Category Theory' })
      // Test
      await expect(cl.users[0].repos[0].files).toEqual([])
    })

  })
})
