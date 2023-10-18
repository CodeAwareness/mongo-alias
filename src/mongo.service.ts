import { MongoClient, ObjectId } from 'mongodb'

/**
 * TODO: normally we could type all our Models, to enable fancy autocomplete
 */
export interface Database {
  [col: string]: (a: string) => any
}

let logger = console
let mongoClient
let db: Database
const listeners = []
const MAX_DEBUG_LEN = 2048

/**
 * Utility functions
 */
const stringify = (obj) => JSON.stringify(obj, null, '\t')
const sortReplacer = (key, value) => (value instanceof Map) ? [...value] : value

/**
 * Logger for real mongodb driver commands
 */
function startLogger(client) {
  client.on('commandStarted', event => {
    // TODO: allow developers to configure a list of ignored commands
    if (['createIndexes', 'listCollections', 'currentOp', 'drop'].includes(event.commandName)) return
    const cmd = event.command
    logger.debug(
      `\x1b[93m MongoDB (${event.connectionId}, ${event.requestId}): \t`
      + '\x1b[94m'
      + `${event.commandName} `
      + ' \x1b[93m '
      + (cmd.createIndexes && (stringify(cmd.createIndexes) + '   \t' + stringify(cmd.indexes)) || '')
      + (cmd.drop && stringify(cmd.drop) || '')
      + (cmd.find && `${cmd.find} ${stringify(cmd.filter)?.substr(0, MAX_DEBUG_LEN)} :: sort ${JSON.stringify(cmd.sort, sortReplacer)} :: skip ${cmd.skip} :: limit ${cmd.limit} ` || '')
      + (cmd.insert && `${cmd.insert} ${stringify(cmd.documents)?.substr(0, MAX_DEBUG_LEN)} ` || '')
      + (cmd.update && `${cmd.update} ${stringify(cmd.updates)?.substr(0, MAX_DEBUG_LEN)} ` || '')
      + (cmd.aggregate && (cmd.aggregate + ' :: ' + stringify(cmd.pipeline)) || '')
      + '\x1b[0m',
    )
  })
  // client.on('commandSucceeded', (event) => logger.debug(`\x1b[93m mongoDB (cid, rid): (${event.connectionId}, ${event.requestId}) \x1b[0m`));
  client.on('commandFailed', (event) => logger.debug(`\x1b[95m mongoDB failed (cid, rid): (${event.connectionId}, ${event.requestId}) ${event.codeName} \x1b[0m`))
}

export type TMongoAlias = {
  mongoClient: any // the native MongoDB client
  db: any // the native DB object
}

/**
 * initMongo connect to DB and configure the logger
 *
 * @param string URI to which we send the db connect command
 * @param string Database name
 * @param Object Options to be sent directly to the MongoDB node driver; We use `{ monitorCommands: true }` to enable logging (see setupTestDB.ts)
 */
export async function initMongo(uri, dbName, options?: any, customLogger?: any): Promise<TMongoAlias> {
  if (customLogger) logger = customLogger
  mongoClient = new MongoClient(uri, options)
  startLogger(mongoClient)
  db = await mongoClient.db(dbName)
  logger.log('\x1b[36m MongoDB connected: \x1b[0m', dbName, uri, options)
  listeners.forEach(l => l(db))
  return { mongoClient, db }
}

export async function closeMongo() {
  listeners.length = 0
  mongoClient?.removeAllListeners()
  await mongoClient?.close()
}

export type TMongoPack = {
  schema: any
  query: Array<string>
}

/**
 * replace Replace an alias with its real schema key
 *
 * @param TMongoPack Accumulator consisting of Schema and Query
 * @param string Alias to be translated
 *
 * This is a reducer function that we use below in the `unalias`, to parse each individual field in a key.
 * That means, the alias parameter here will be `repo`, `auth` and `user`, one at a time, for a query like `repo.auth.user: 'testUser'`.
 */
const replace = (mongoPack, alias) => {
  let schema = mongoPack.schema
  const pack = key => {
    const query = mongoPack.query.concat(key)
    if (schema?._children && schema._children?._children) {
      return { schema: schema._children, query }
    }
    return { schema, query } as TMongoPack
  }
  /* '$' and array indexes are returned as is */
  if (!schema || alias.includes('$') || !isNaN(alias as any)) {
    return pack(alias)
  }

  /* If Schema has children we recursively process it here. This is how `repo.auth.user` advances one at a time deeper into the schema. */
  if (schema._children) {
    return replace({ schema: schema._children, query: mongoPack.query }, alias)
  }

  /* A Schema definition of an array will always have a single element, just like Array<string> has only one type for its items */
  if (schema instanceof Array) schema = schema[0]

  /* We're now going to search for our alias inside all keys of our current schema. */
  const matching: Array<any> = Object.entries(schema).filter((kv: any) => kv[1]._alias === alias)
  if (!matching.length) return pack(alias)
  const [ newK, newV ] = matching[0]
  schema = newV

  return pack(newK)
}

/**
 * unalias Replaces all the aliased fields with their shorter versions, as specified in the schema
 *
 * @param Object mongoDB query or update object
 * @param Object Schema definition
 *
 * filter examples:
 * findOne({ 'name': 'Mark' })
 * findOne({ 'name': 'Mark' })
 * findOne({ 'repos.auth.user': 'qwe123' })
 * findOne({ 'repos.auth[1].user': 'asd098' })
 *
 * updateOne({ 'repos.origin': 'github.com/codeawareness' }, {$set: { 'repos.0.auth.1.user': 'qwe123' }})
 * updateOne({ 'repos.origin': 'github.com/codeawareness' }, {$set: { 'repos.0.changes.123qwe.lines': 12 }})
 * updateOne({ 'repos.auth.user': 'asd098' }, {$set: { 'repos.$[].auth.$[].active': true }})
 * updateMany({ }, { $set: { 'grades.$[element]' : 100 } }, { arrayFilters: [ { 'element': { $gte: 100 } } ] })
 *
 * TODO: maybe also consider bracket notation, e.g. findOne({ "changes['123qwe']['8b7f']": 12 }) ?
 * TODO: more unit testing, consider schema where some fields are not aliased, but deeper fields are.
 */
const unalias = (query, schema) => {
  let parsed = {}
  if (!query || !schema) return query
  if ((query instanceof Date) || (query instanceof BigInt) || (query instanceof ObjectId)) {
    return query
  }
  if (!(query instanceof Object)) return query

  /* Convenience transformer of string into ObjectId for _id */
  if (query?._id && typeof query._id !== 'object') query._id = new ObjectId(query._id)

  /*
   * Going over all key:value pairs of the query, we could get shapes like { repos: [{ name: 'test' }] } and { `repos.name`: 'test' }
   * In the first example, the key would be `repos` and value is the array [{ name: 'test' }];
   * then we recurse on this to get:
   * key='0' and value={ name: 'test' }
   * key='name' and value='test'
   */
  Object.entries(query).forEach(kvpair => {
    const parts = kvpair[0].split('.') // handle dot notation in the query, such as `repo.auth.user`
    const item = kvpair[1] // query value associated to our key (in the example above `repo.auth.user`)
    const pack = parts.reduce(replace, { schema, query: [] })
    const newQuery = pack.query.join('.')

    /* if the translated query has a $ operator as its last element, we advance deeper into the schema */
    if (/\$[^.]*$/.test(newQuery)) {
      parsed[newQuery] = unalias(item, pack.schema)
      return
    }

    /* if the translated query is a number, it means we're looking at an array */
    if (!isNaN(newQuery) && !Object.keys(parsed).length) parsed = []
    parsed[newQuery] = isNaN(newQuery) ? item : unalias(item, schema[0])

    /* skip standard JS objects, but for user defined objects we advance deeper */
    if (item instanceof Object && !(item instanceof Date) && !(item instanceof BigInt) && !(item instanceof ObjectId)) {
      parsed[newQuery] = unalias(item, pack.schema)
      return
    }

    /* TODO: somewhere we're getting an empty item in the array, which gets translated into a null */
    if (parsed instanceof Array) parsed = parsed.filter(a => a !== undefined)
  })

  return parsed
}

/**
 * formatResult Restore aliases from a findOne query
 *
 * @param Object - schema to use when restoring aliases
 *
 * @return Function (result: Object) = the object retrieved by the mongoDB driver
 */
const formatResult = root => {
  const schema = root
  return res => {
    if (typeof res !== 'object') return res
    if (!res) return res
    if (!Object.keys(res).length) return res
    if (res instanceof Array) return res.map(formatResult(schema))
    const parsed = {}
    Object.entries(res).forEach(([key, item]) => {
      const recSchema = schema && schema[key]
      const longKey = recSchema?._alias || key
      const newSchema = (recSchema?._children instanceof Array) ? recSchema._children[0] : recSchema?._children || schema
      if (item instanceof Array) parsed[longKey] = item.map(formatResult(newSchema))
      else if (newSchema?._children) parsed[longKey] = formatResult(newSchema?._children)(item)
      else parsed[longKey] = formatResult(newSchema)(item)
    })
    return parsed
  }
}

type TOptions = {
  debug: boolean
}

const getMethods = obj => {
  let properties = new Set()
  let currentObj = obj
  do {
    Object
      .getOwnPropertyNames(currentObj)
      .map(item => properties.add(item))
  } while (
    (currentObj = Object.getPrototypeOf(currentObj))
  )

  return [...properties.keys()].filter((item: string) => typeof obj[item] === 'function')
}

/**
 * Model - create a lightweight layer on top of mongodb
 *
 * @param Object schema
 * @param string collection name in mongoDB
 * @param TOptions `{ debug: true }` if you need to see what mongodb driver sends out to the DB
 */
export function Model(schema: any, collection, options?: TOptions) {
  const debug = options?.debug
  let col = db?.collection(collection) // TODO: something like db.collection<TSchema>(collection) should work but ... typescript
  const delayed = [];

  // @eslint-disable-next-line
  (schema as any)._c = { _alias: 'createdAt' };
  // @eslint-disable-next-line
  (schema as any)._u = { _alias: 'updatedAt' }

  listeners.push(db => {
    col = db.collection(collection)
    const na = []
    getMethods(col)
      .map((k: string) => {
        if (!mAliased[k]) {
          na.push(k)
          mAliased[k] = col[k].bind(col)
        }
      })
    console.log(`Model: ${collection} - adding non-aliased methods: `, na.join(', '))
    delayed.forEach(l => l(col))
  })

  const wrapArray = cursor => {
    const { toArray } = cursor
    cursor.toArray = async () => {
      const items = await toArray.bind(cursor)()
      return items.map(formatResult(schema))
    }
    return cursor
  }

  /* TODO: add more native mongoDB functions here */
  const mAliased = {
    countDocuments: function(filter?: any, options?: any) {
      const mongoFilter = unalias(filter, schema)
      if (debug) logger.log('COUNT', '\x1b[33m', mongoFilter, '\x1b[0m')
      return col.countDocuments(mongoFilter, options)
    },

    deleteOne: function(filter, options?: any) {
      const mongoFilter = unalias(filter, schema)
      if (debug) logger.log('DELETE ONE', '\x1b[33m', mongoFilter, '\x1b[0m')
      return col.deleteOne(mongoFilter, options)
    },

    deleteMany: function(filter, options?: any) {
      const mongoFilter = unalias(filter, schema)
      if (debug) logger.log('DELETE MANY', '\x1b[33m', mongoFilter, '\x1b[0m')
      return col.deleteMany(mongoFilter, options)
    },

    find: function(filter?: any, options?: any, raw?: boolean) {
      const mongoFilter = unalias(filter, schema)
      if (debug) logger.log('FIND', '\x1b[33m', mongoFilter, '\x1b[0m')
      const cPromise = col.find(mongoFilter, options)
      return raw ? cPromise : wrapArray(cPromise)
    },

    findOne: function(filter?: any, options?: any, raw?: boolean) {
      const mongoFilter = unalias(filter, schema)
      if (debug) logger.log('FIND ONE', debug, '\x1b[33m', mongoFilter, '\x1b[0m')
      const docPromise = col.findOne(mongoFilter, options)
      return raw ? docPromise : docPromise.then(formatResult(schema))
    },

    index: function(obj: any, options?: any) {
      delayed.push(col => col.createIndex(obj, options))
    },

    insertOne: function(obj, options?: any) {
      const mongoFilter = unalias(obj, schema)
      mongoFilter._c = new Date()
      if (debug) logger.log('INSERT ONE', obj, '\x1b[33m', mongoFilter, '\x1b[0m')
      return col.insertOne(mongoFilter, options)
    },

    insertMany: function(objArray, options?: any) {
      const mongoFilter = objArray.map(obj => unalias(obj, schema))
      mongoFilter.map(obj => (obj._c = new Date()))
      if (debug) logger.log('INSERT MANY', '\x1b[33m')
      if (debug) logger.dir(mongoFilter, { depth: null })
      if (debug) logger.log('\x1b[0m')
      return col.insertMany(mongoFilter, options)
    },

    replaceOne: function(filter: any, update: any, options?: any) {
      const mongoFilter = unalias(filter, schema)
      const mongoUpdate = unalias(update, schema)
      mongoUpdate._u = new Date()
      if (debug) logger.log('REPLACE ONE', '\x1b[33m', mongoFilter, '\x1b[0m\n', '\x1b[33m', mongoUpdate, options || '', '\x1b[0m')
      return col.replaceOne(mongoFilter, mongoUpdate, options)
    },

    updateOne: function(filter: any, update: any, options?: any) {
      const mongoFilter = unalias(filter, schema)
      const mongoUpdate = unalias(update, schema)
      if (mongoUpdate.$set) mongoUpdate.$set._u = new Date()
      else mongoUpdate.$set = { _u: new Date() }
      if (debug) logger.log('UPDATE ONE', '\x1b[33m', mongoFilter, '\x1b[0m\n', '\x1b[33m', mongoUpdate, options || '', '\x1b[0m')
      return col.updateOne(mongoFilter, mongoUpdate, options)
    },

    updateMany: function(filter: any, update: any, options?: any) {
      const mongoFilter = unalias(filter, schema)
      const mongoUpdate = unalias(update, schema)
      if (mongoUpdate.$set) mongoUpdate.$set._u = new Date()
      else mongoUpdate.$set = { _u: new Date() }
      if (debug) logger.log('UPDATE MANY', '\x1b[33m', mongoFilter, '\x1b[0m\n', '\x1b[33m', mongoUpdate, options || '', '\x1b[0m')
      return col.updateMany(mongoFilter, mongoUpdate, options)
    },
  }

  return mAliased
}

export type ICollection = ReturnType<typeof Model>
