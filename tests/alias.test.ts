import { ObjectId } from 'mongodb'
import { Model, unalias } from '@/mongo.service'

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

  describe('ObjectId operators', () => {
    // Model with aliased fields that contain ObjectIds
    const repoWithObjectIdModel = {
      n: { _alias: 'name' },
      o: { _alias: 'origin' },
      a: {
        _alias: 'auth',
        _children: [{
          u: { _alias: 'user' }, // ObjectId field (aliased)
          r: { _alias: 'role' },
        }]
      },
      c: { // common SHA
        _alias: 'cSHA',
        _children: [{
          c: { _alias: 'cluster', _children: [ObjectId] },
          h: { _alias: 'sha' }
        }]
      },
    }

    beforeEach(async () => {
      col = getDb().collection('repos')
    })

    afterEach(async () => {
      await col.drop()
    })

    test('should handle ObjectId as value in unalias function', async () => {
      const rid = new ObjectId('68f6f013057c81362c9fe4ba')
      const uid = new ObjectId('67bc32edcf9b5efe459008ca')
      const cSHA = [{ sha: '123', cluster: [uid, rid] }]

			const repoSchema = {
				o: { _alias: 'origin' },
				pp: { _alias: 'platform' },
				ip: { _alias: 'isPublic' },
				c: { // common SHA
					_alias: 'cSHA',
					_children: [{
						c: { _alias: 'cluster', _children: [ObjectId] },
						hds: {
							_alias: 'heads',
							_children: [{
								n: { _alias: 'name' },
								h: { _alias: 'sha' },
								u: { _alias: 'user' },
							}],
						},
						h: { _alias: 'sha' },
						sd: { _alias: 'shaDate' },
						cd: { _alias: 'clusterDate' }, // this is the date at which the common SHA was calculated, NOT the date of the commit itself
					}],
				},
				s: { // this is the sha value used in swarm authentication
					_alias: 'swarm',
					_children: [{ // we need several values here to prevent race conditions when one user updates swarm while another validates their own SHA value
						h: { _alias: 'sha' }, // latest SHA in the remote
						b: { _alias: 'branch' }, // corresponding branch in the remote for that SHA
						d: { _alias: 'shaDate' }, // commit date for that SHA
						u: { _alias: 'uploaded' }, // upload date (when the SHA got published to Code Awareness)
					}],
				},
				a: {
					// authorized user list
					_alias: 'auth',
					_children: [{
						d: { _alias: 'lastAuthorized' }, // date last authorized
						u: { _alias: 'user' }, // user id
						e: { _alias: 'expiration' }, // TODO: expiration date, after which the user will be removed from this repo (we should be using this to have different expiration policies, per client)
						r: { _alias: 'refresh' }, // user is asked to perform a diff refresh
						h: {
							_alias: 'head',
							_children: {
								h: { _alias: 'sha' },
								b: { _alias: 'branch' },
							}
						}, // the current HEAD this user is working on
					}],
				},
				ls: { _alias: 'lastSync' },
				se: { _alias: 'syncEnabled' },
				ru: { _alias: 'remoteUpdatedAt' },
			}
      const repoModel = await Model(repoSchema, 'repos')
			await repoModel.insertOne({ _id: rid, o: 'react' })
			await repoModel.updateOne({ _id: rid  }, { $set: { cSHA } })

      const repoAfter = await repoModel.findOne()

      expect(repoAfter.cSHA).toEqual(cSHA)
    })

    test('should handle $in operator with ObjectIds on aliased field', async () => {
      const repoModel = await Model(repoWithObjectIdModel, 'repos')
      const userId1 = new ObjectId()
      const userId2 = new ObjectId()
      const userId3 = new ObjectId()

      await repoModel.insertOne({ 
        name: 'Repo 1', 
        origin: 'github.com/test/repo1',
        auth: [{ user: userId1, role: 'admin' }]
      })
      await repoModel.insertOne({ 
        name: 'Repo 2', 
        origin: 'github.com/test/repo2',
        auth: [{ user: userId2, role: 'admin' }]
      })
      await repoModel.insertOne({ 
        name: 'Repo 3', 
        origin: 'github.com/test/repo3',
        auth: [{ user: userId3, role: 'viewer' }]
      })

      const repos = await repoModel.find({ 'auth.user': { $in: [userId1, userId2] } }).toArray()
      // Test
      expect(repos.length).toBe(2)
      expect(repos.map(r => r.name).sort()).toEqual(['Repo 1', 'Repo 2'])
    })

    test('should handle $nin operator with ObjectIds on aliased field', async () => {
      const repoModel = await Model(repoWithObjectIdModel, 'repos')
      const userId1 = new ObjectId()
      const userId2 = new ObjectId()
      const userId3 = new ObjectId()

      await repoModel.insertOne({ 
        name: 'Repo 1', 
        origin: 'github.com/test/repo1',
        auth: [{ user: userId1, role: 'admin' }]
      })
      await repoModel.insertOne({ 
        name: 'Repo 2', 
        origin: 'github.com/test/repo2',
        auth: [{ user: userId2, role: 'admin' }]
      })
      await repoModel.insertOne({ 
        name: 'Repo 3', 
        origin: 'github.com/test/repo3',
        auth: [{ user: userId3, role: 'viewer' }]
      })

      const repos = await repoModel.find({ 'auth.user': { $nin: [userId1] } }).toArray()
      // Test
      expect(repos.length).toBe(2)
      expect(repos.map(r => r.name).sort()).toEqual(['Repo 2', 'Repo 3'])
    })

    test('should handle $ne operator with ObjectId on aliased field', async () => {
      const repoModel = await Model(repoWithObjectIdModel, 'repos')
      const userId1 = new ObjectId()
      const userId2 = new ObjectId()

      await repoModel.insertOne({ 
        name: 'Repo 1', 
        origin: 'github.com/test/repo1',
        auth: [{ user: userId1, role: 'admin' }]
      })
      await repoModel.insertOne({ 
        name: 'Repo 2', 
        origin: 'github.com/test/repo2',
        auth: [{ user: userId2, role: 'viewer' }]
      })

      const repos = await repoModel.find({ 'auth.user': { $ne: userId1 } }).toArray()
      // Test
      expect(repos.length).toBe(1)
      expect(repos[0].name).toEqual('Repo 2')
    })

    test('should NOT auto-convert string IDs in $in operator on aliased field', async () => {
      const repoModel = await Model(repoWithObjectIdModel, 'repos')
      const userId1 = new ObjectId()
      const userId2 = new ObjectId()

      await repoModel.insertOne({ 
        name: 'Repo 1', 
        origin: 'github.com/test/repo1',
        auth: [{ user: userId1, role: 'admin' }]
      })
      await repoModel.insertOne({ 
        name: 'Repo 2', 
        origin: 'github.com/test/repo2',
        auth: [{ user: userId2, role: 'admin' }]
      })

      let repos = await repoModel.find({
        'auth.user': { $in: [userId1.toString(), userId2.toString()] } 
      }).toArray()
      expect(repos.length).toBe(0)

      repos = await repoModel.find({
        'auth.user': { $in: [userId1, userId2] }
      }).toArray()
      expect(repos.length).toBe(2)
    })

    test('should handle $pullAll with ObjectIds on aliased array field', async () => {
      const modelWithArray = {
        n: { _alias: 'name' },
        c: { _alias: 'collaborators' }, // array of ObjectIds (aliased)
      }
      const Model1 = await Model(modelWithArray, 'repos')
      const userId1 = new ObjectId()
      const userId2 = new ObjectId()
      const userId3 = new ObjectId()

      await Model1.insertOne({ 
        name: 'Project 1', 
        collaborators: [userId1, userId2, userId3] 
      })

      await Model1.updateOne(
        { name: 'Project 1' },
        { $pullAll: { collaborators: [userId1, userId2] } }
      )

      const project = await Model1.findOne({ name: 'Project 1' })
      // Test
      expect(project.collaborators.length).toBe(1)
      expect(project.collaborators[0].toString()).toBe(userId3.toString())
    })

    test('should handle $pull with ObjectId on aliased field', async () => {
      const modelWithArray = {
        n: { _alias: 'name' },
        c: { _alias: 'collaborators' },
      }
      const Model1 = await Model(modelWithArray, 'repos')
      const userId1 = new ObjectId()
      const userId2 = new ObjectId()

      await Model1.insertOne({ 
        name: 'Project 1', 
        collaborators: [userId1, userId2] 
      })

      await Model1.updateOne(
        { name: 'Project 1' },
        { $pull: { collaborators: userId1 } }
      )

      const project = await Model1.findOne({ name: 'Project 1' })
      // Test
      expect(project.collaborators.length).toBe(1)
      expect(project.collaborators[0].toString()).toBe(userId2.toString())
    })

    test('should handle $pull with nested $in on aliased field', async () => {
      const modelWithArray = {
        n: { _alias: 'name' },
        c: { _alias: 'collaborators' },
      }
      const Model1 = await Model(modelWithArray, 'repos')
      const userId1 = new ObjectId()
      const userId2 = new ObjectId()

      await Model1.insertOne({ 
        name: 'Project 1', 
        collaborators: [userId1, userId2] 
      })

      await Model1.updateOne(
        { name: 'Project 1' },
        { $pull: { collaborators: { $in: [userId1, userId2] } } }
      )

      const project = await Model1.findOne({ name: 'Project 1' })
      // Test
      expect(project.collaborators.length).toBe(0)
    })

    test('should handle $push with ObjectId on aliased field', async () => {
      const modelWithArray = {
        n: { _alias: 'name' },
        c: { _alias: 'collaborators' },
      }
      const Model1 = await Model(modelWithArray, 'repos')
      const userId1 = new ObjectId()

      await Model1.insertOne({ 
        name: 'Project 1', 
        collaborators: [] 
      })

      await Model1.updateOne(
        { name: 'Project 1' },
        { $push: { collaborators: userId1 } }
      )

      const project = await Model1.findOne({ name: 'Project 1' })
      // Test
      expect(project.collaborators.length).toBe(1)
      expect(project.collaborators[0].toString()).toBe(userId1.toString())
    })

    test('should handle $addToSet with ObjectId on aliased field', async () => {
      const modelWithArray = {
        n: { _alias: 'name' },
        c: { _alias: 'collaborators' },
      }
      const Model1 = await Model(modelWithArray, 'repos')
      const userId1 = new ObjectId()
      const userId2 = new ObjectId()

      await Model1.insertOne({ 
        name: 'Project 1', 
        collaborators: [userId1] 
      })

      await Model1.updateOne(
        { name: 'Project 1' },
        { $addToSet: { collaborators: userId2 } }
      )

      const project = await Model1.findOne({ name: 'Project 1' })
      // Test
      expect(project.collaborators.length).toBe(2)
    })

    test('should handle $push with $each modifier on aliased field', async () => {
      const modelWithArray = {
        n: { _alias: 'name' },
        c: { _alias: 'collaborators' },
      }
      const Model1 = await Model(modelWithArray, 'repos')
      const userId1 = new ObjectId()
      const userId2 = new ObjectId()

      await Model1.insertOne({ 
        name: 'Project 1', 
        collaborators: [] 
      })

      await Model1.updateOne(
        { name: 'Project 1' },
        { $push: { collaborators: { $each: [userId1, userId2] } } }
      )

      const project = await Model1.findOne({ name: 'Project 1' })
      // Test
      expect(project.collaborators.length).toBe(2)
    })

    test('should handle $gt/$lt with ObjectIds on aliased field (timestamp comparison)', async () => {
      const repoModel = await Model(repoWithObjectIdModel, 'repos')
      const oldUserId = new ObjectId('507f1f77bcf86cd799439011')
      const newUserId = new ObjectId()

      await repoModel.insertOne({ 
        name: 'Old Repo',
        origin: 'github.com/test/old',
        auth: [{ user: oldUserId, role: 'admin' }]
      })
      await repoModel.insertOne({ 
        name: 'New Repo',
        origin: 'github.com/test/new',
        auth: [{ user: newUserId, role: 'admin' }]
      })

      const newerRepos = await repoModel.find({ 'auth.user': { $gt: oldUserId } }).toArray()
      // Test
      expect(newerRepos.length).toBe(1)
      expect(newerRepos[0].name).toBe('New Repo')
    })

    test('should handle $set with array of nested ObjectIds on aliased field', async () => {
      const repoModel = await Model(repoWithObjectIdModel, 'repos')
      const objIdA = new ObjectId()
      const objIdB = new ObjectId()
      const userId1 = new ObjectId()

      await repoModel.insertOne({ 
        name: 'Repo 1',
        origin: 'github.com/test/repo1',
        auth: [{ user: userId1, role: 'admin' }],
        cSHA: []
      })

      await repoModel.updateOne(
        { name: 'Repo 1' },
        { $set: { cSHA: [{ cluster: [objIdA, objIdB], sha: 'abc123' }] } }
      )

      const repo = await repoModel.findOne({ name: 'Repo 1' })
      // Test that the field was updated
      expect(repo.cSHA).toBeDefined()
      expect(repo.cSHA.length).toBe(1)
      expect(repo.cSHA[0].cluster.length).toBe(2)
      // Verify that the values are ObjectIds
      expect(repo.cSHA[0].cluster[0]).toBeInstanceOf(ObjectId)
      expect(repo.cSHA[0].cluster[1]).toBeInstanceOf(ObjectId)
      expect(repo.cSHA[0].cluster[0].toString()).toBe(objIdA.toString())
      expect(repo.cSHA[0].cluster[1].toString()).toBe(objIdB.toString())
      expect(repo.cSHA[0].sha).toBe('abc123')

      // Verify in raw database that the actual stored values are ObjectIds
      const rawRepo = await col.findOne({ n: 'Repo 1' })
      expect(rawRepo.c[0].c[0]).toBeInstanceOf(ObjectId)
      expect(rawRepo.c[0].c[1]).toBeInstanceOf(ObjectId)
      expect(rawRepo.c[0].c[0].toString()).toBe(objIdA.toString())
      expect(rawRepo.c[0].c[1].toString()).toBe(objIdB.toString())
    })
  })
})
