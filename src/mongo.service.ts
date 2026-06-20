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
// Keyed by collection name so re-registering a Model for the same collection
// replaces its listener instead of appending — bounds the map and keeps
// Model() idempotent. (Map.forEach passes the value first, so the existing
// `listeners.forEach(l => l(db))` rebind calls work unchanged.)
const listeners = new Map<string, (db: any) => void>()
const MAX_DEBUG_LEN = 2048

/**
 * Utility function used only in logging (when monitorCommands is true)
 */
const convertObjectIds = (obj) => {
  if (obj instanceof ObjectId) {
    return obj.toString()
  }
  if (obj instanceof Date || obj === null || obj === undefined) {
    return obj
  }
  // Check for serialized ObjectId format {buffer: [...]} or BSON ObjectId
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    // Check if it's a serialized ObjectId (has buffer property with Uint8Array or array)
    if (obj.buffer && (obj.buffer instanceof Uint8Array || Array.isArray(obj.buffer))) {
      // Convert buffer to hex string
      const buffer = Array.isArray(obj.buffer) ? obj.buffer : Array.from(obj.buffer)
      return buffer.map(b => b.toString(16).padStart(2, '0')).join('')
    }
    // Check if it has toHexString method (BSON ObjectId)
    if (typeof obj.toHexString === 'function') {
      return obj.toHexString()
    }
  }
  if (Array.isArray(obj)) {
    return obj.map(convertObjectIds)
  }
  if (typeof obj === 'object') {
    const converted = {}
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertObjectIds(value)
    }
    return converted
  }
  return obj
}

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

  // Idempotent: if a client already exists, reuse it instead of creating a second
  // one (which would orphan the previous client's connection pool and monitoring
  // sockets without closing them). Re-resolve `db` for the requested name and
  // re-fire listeners so models rebind. To connect to a different server, call
  // closeMongo() first.
  if (mongoClient) {
    db = mongoClient.db(dbName)
    listeners.forEach(l => l(db))
    return { mongoClient, db }
  }

  mongoClient = new MongoClient(uri, options)
  if (options?.monitorCommands) startLogger(mongoClient)
  // Explicitly connect so failures surface here (fail-fast) rather than on the
  // first query, and so the log below is truthful. `.db()` is synchronous and
  // does NOT connect on its own.
  await mongoClient.connect()
  db = mongoClient.db(dbName)
  logger.log('\x1b[36m MongoDB connected: \x1b[0m')
  listeners.forEach(l => l(db))
  return { mongoClient, db }
}

export async function closeMongo() {
  listeners.clear()
  mongoClient?.removeAllListeners()
  await mongoClient?.close()
  // Reset the client singleton so a subsequent initMongo() opens a fresh client
  // rather than reusing the just-closed one via the idempotency guard. (`db` is
  // left as-is; nothing reads it after close, and it is reassigned on re-init.)
  mongoClient = undefined
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
/* Deep-clone a query/update so unalias never mutates the caller's object.
 * ObjectId / Date / RegExp (and primitives, incl. bigint) are opaque leaves —
 * returned as-is — so they survive cloning intact. structuredClone() would
 * mangle ObjectId, so we hand-roll it. */
const cloneQuery = (v) => {
  if (v === null || typeof v !== 'object') return v
  if (v instanceof ObjectId || v instanceof Date || v instanceof RegExp) return v
  if (Array.isArray(v)) return v.map(cloneQuery)
  const out = {}
  for (const k of Object.keys(v)) out[k] = cloneQuery(v[k])
  return out
}

/* A valid array index is a non-negative integer string ('0', '1', ...).
 * isNaN() was wrong here: isNaN('') === false and isNaN('1.5') === false, so
 * empty / decimal / whitespace keys were misread as array indexes. */
const isArrayIndex = (key) => /^\d+$/.test(key)

/* Only coerce a string to ObjectId when it's a 24-char hex string. We do NOT
 * use ObjectId.isValid here: it also accepts 12-char strings (treated as raw
 * bytes) and numbers, which would wrongly convert literal string _id values.
 * Anything else is left as-is so it simply doesn't match (instead of throwing a
 * raw BSONError). */
const isObjectIdHex = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v)

const unaliasInner = (query, schema) => {
  let parsed = {}
  if (!query || !schema) return query
  if ((query instanceof Date) || (query instanceof BigInt) || (query instanceof ObjectId) || (query instanceof RegExp)) {
    return query
  }
  if (!(query instanceof Object)) return query

  /* Convenience transformer of string into ObjectId for _id (24-hex only) */
  if (query?._id && isObjectIdHex(query._id)) query._id = new ObjectId(query._id)
  
  /* Handle MongoDB operators with _id - ensure ObjectIds are preserved */
  if (query?._id && typeof query._id === 'object') {
    // Array operators: $in, $nin, $all
    const arrayOps = ['$in', '$nin', '$all']
    arrayOps.forEach(op => {
      if (query._id[op] && Array.isArray(query._id[op])) {
        query._id[op] = query._id[op].map(id => {
          if (id instanceof ObjectId) return id
          if (isObjectIdHex(id)) return new ObjectId(id)
          return id
        })
      }
    })
    
    // Single value operators: $ne, $gt, $gte, $lt, $lte
    const singleOps = ['$ne', '$gt', '$gte', '$lt', '$lte']
    singleOps.forEach(op => {
      if (query._id[op] !== undefined) {
        const val = query._id[op]
        if (isObjectIdHex(val)) {
          query._id[op] = new ObjectId(val)
        }
        // Non-24-hex strings and ObjectIds are kept as-is
      }
    })
  }

	// Skip non-query
	if (query instanceof ObjectId) return query

  /*
   * Going over all key:value pairs of the query, we could get shapes like { repos: [{ name: 'test' }] } and { `repos.name`: 'test' }
   * In the first example, the key would be `repos` and value is the array [{ name: 'test' }];
   * then we recurse on this to get:
   * key='0' and value={ name: 'test' }
   * key='name' and value='test'
   */
  Object.entries(query).forEach(kvpair => {
    const parts = kvpair[0].split('.') // handle dot notation in the query, such as `repo.auth.user`
    let item = kvpair[1] // query value associated to our key (in the example above `repo.auth.user`)

    // Convert ObjectId operators for this field
    if (item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date) && !(item instanceof ObjectId)) {
      query[kvpair[0]] = item  // Update the query with converted values
    }
    
    const pack = parts.reduce(replace, { schema, query: [] })
    const newQuery = pack.query.join('.')

    /* if the translated query has a $ operator as its last element, we advance deeper into the schema */
    if (/\$[^.]*$/.test(newQuery)) {
      parsed[newQuery] = unaliasInner(item, pack.schema)
      return
    }

    /* if the translated query is a number, it means we're looking at an array */
		if (isArrayIndex(newQuery) && !Object.keys(parsed).length) parsed = []
		parsed[newQuery] = !isArrayIndex(newQuery) ? item : unaliasInner(item, schema[0])

    /* skip standard JS objects, but for user defined objects we advance deeper.
     * RegExp is a leaf value (like Date/ObjectId): recursing into it would
     * iterate its (empty) own-property list and collapse it to {}. */
    if (item instanceof Object && !(item instanceof Date) && !(item instanceof BigInt) && !(item instanceof ObjectId) && !(item instanceof RegExp) && !((item instanceof Array) && (item.length === 0))) {
      parsed[newQuery] = unaliasInner(item, pack.schema)
      return
    }

    /* TODO: somewhere we're getting an empty item in the array, which gets translated into a null */
    if (parsed instanceof Array) parsed = parsed.filter(a => a !== undefined)
  })

  return parsed
}

/* Public entry: clone first so the caller's query/update object is never mutated,
 * then delegate to the recursive worker (which only ever touches the clone). */
export const unalias = (query, schema) => unaliasInner(cloneQuery(query), schema)

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
    if (res instanceof ObjectId) return res
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

/* Collect the native method names to passthrough-bind onto a Model.
 *
 * Scoped deliberately: we walk the instance and its prototype chain but STOP at
 * Object.prototype, so we never bind hasOwnProperty/toString/valueOf/constructor/
 * the legacy __define*__ accessors onto the model (which would clobber normal
 * object semantics). We also read each property's DESCRIPTOR value rather than
 * `obj[name]`, so accessor getters (namespace, collectionName, readConcern, ...)
 * are never invoked during discovery. */
const getMethods = (obj) => {
  const methods = new Set<string>()
  let current = obj
  while (current && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === 'constructor' || methods.has(name)) continue
      const desc = Object.getOwnPropertyDescriptor(current, name)
      if (desc && typeof desc.value === 'function') methods.add(name)
    }
    current = Object.getPrototypeOf(current)
  }
  return [...methods]
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

  // Models are often created at import time, before initMongo() has connected
  // (col stays undefined until the connect listener fires). Calling a method in
  // that window would otherwise throw a cryptic "Cannot read properties of
  // undefined (reading 'find')"; this surfaces the real cause instead.
  const requireCol = () => {
    if (!col) throw new Error(`mongo-alias: collection "${collection}" used before a DB connection was established — call (and await) initMongo() before using models.`)
    return col
  };

  // @eslint-disable-next-line
  (schema as any)._c = { _alias: 'createdAt' };
  // @eslint-disable-next-line
  (schema as any)._u = { _alias: 'updatedAt' }

  listeners.set(collection, db => {
    col = db.collection(collection)
    const na = []
    getMethods(col)
      .forEach((k: string) => {
        if (!mAliased[k]) {
          na.push(k)
          mAliased[k] = col[k].bind(col)
        }
      })
    // console.log(`Model: ${collection} - adding non-aliased methods: `, na.join(', '))
    delayed.forEach(l => l(col))
  })

  // Restore aliases on EVERY cursor consumption path, not just toArray().
  // Previously forEach/next/async-iteration returned raw (short-key) docs.
  // `.map()`/`.stream()` are intentionally left raw — they are explicit
  // transforms where the caller opts into the native shape.
  const wrapCursor = cursor => {
    const fmt = formatResult(schema)
    const { toArray, next, forEach } = cursor
    cursor.toArray = async () => (await toArray.call(cursor)).map(fmt)
    cursor.next = async () => {
      const doc = await next.call(cursor)
      return doc == null ? doc : fmt(doc)
    }
    if (typeof forEach === 'function') {
      cursor.forEach = (cb: (doc: any) => void) => forEach.call(cursor, (doc: any) => cb(fmt(doc)))
    }
    const asyncIterator = cursor[Symbol.asyncIterator]
    if (typeof asyncIterator === 'function') {
      cursor[Symbol.asyncIterator] = async function* () {
        for await (const doc of asyncIterator.call(cursor)) yield fmt(doc)
      }
    }
    return cursor
  }

  /* TODO: add more native mongoDB functions here */
  const mAliased = {
    countDocuments: function(filter?: any, options?: any) {
      const mongoFilter = unalias(filter, schema)
      if (debug) logger.log('COUNT', '\x1b[33m', mongoFilter, '\x1b[0m')
      return requireCol().countDocuments(mongoFilter, options)
    },

    deleteOne: function(filter, options?: any) {
      const mongoFilter = unalias(filter, schema)
      if (debug) logger.log('DELETE ONE', '\x1b[33m', mongoFilter, '\x1b[0m')
      return requireCol().deleteOne(mongoFilter, options)
    },

    deleteMany: function(filter, options?: any) {
      const mongoFilter = unalias(filter, schema)
      if (debug) logger.log('DELETE MANY', '\x1b[33m', mongoFilter, '\x1b[0m')
      return requireCol().deleteMany(mongoFilter, options)
    },

    find: function(filter?: any, options?: any, raw?: boolean) {
      const mongoFilter = unalias(filter, schema)
      if (debug) logger.log('FIND', '\x1b[33m', mongoFilter, '\x1b[0m')
      const cPromise = requireCol().find(mongoFilter, options)
      return raw ? cPromise : wrapCursor(cPromise)
    },

    findOne: function(filter?: any, options?: any, raw?: boolean) {
      const mongoFilter = unalias(filter, schema)
      if (debug) logger.log('FIND ONE', debug, '\x1b[33m', mongoFilter, '\x1b[0m')
      const docPromise = requireCol().findOne(mongoFilter, options)
      return raw ? docPromise : docPromise.then(formatResult(schema))
    },

    index: function(obj: any, options?: any) {
      delayed.push(col => col.createIndex(obj, options))
    },

    insertOne: function(obj, options?: any) {
      const mongoFilter = unalias(obj, schema)
      mongoFilter._c = new Date()
      if (debug) logger.log('INSERT ONE', obj, '\x1b[33m', mongoFilter, '\x1b[0m')
      return requireCol().insertOne(mongoFilter, options)
    },

    insertMany: function(objArray, options?: any) {
      const mongoFilter = objArray.map(obj => unalias(obj, schema))
      mongoFilter.map(obj => (obj._c = new Date()))
      if (debug) logger.log('INSERT MANY', '\x1b[33m')
      if (debug) logger.dir(mongoFilter, { depth: null })
      if (debug) logger.log('\x1b[0m')
      return requireCol().insertMany(mongoFilter, options)
    },

    replaceOne: function(filter: any, update: any, options?: any) {
      const mongoFilter = unalias(filter, schema)
      const mongoUpdate = unalias(update, schema)
      mongoUpdate._u = new Date()
      if (options?.upsert) {
        // replaceOne can't carry $setOnInsert, so emulate the replace with an
        // aggregation-pipeline update: $_c is missing on a fresh insert (-> now)
        // and is the existing value on a real replace (-> preserved).
        const pipeline = [
          { $replaceWith: { $mergeObjects: [mongoUpdate, { _c: { $ifNull: ['$_c', new Date()] } }] } },
        ]
        if (debug) logger.log('REPLACE ONE (upsert)', '\x1b[33m', mongoFilter, '\x1b[0m\n', '\x1b[33m', pipeline, options || '', '\x1b[0m')
        return requireCol().updateOne(mongoFilter, pipeline, options)
      }
      if (debug) logger.log('REPLACE ONE', '\x1b[33m', mongoFilter, '\x1b[0m\n', '\x1b[33m', mongoUpdate, options || '', '\x1b[0m')
      return requireCol().replaceOne(mongoFilter, mongoUpdate, options)
    },

    updateOne: function(filter: any, update: any, options?: any) {
      const mongoFilter = unalias(filter, schema)
      const mongoUpdate = unalias(update, schema)
      if (mongoUpdate.$set) mongoUpdate.$set._u = new Date()
      else mongoUpdate.$set = { _u: new Date() }
      if (options?.upsert) {
        if (mongoUpdate.$setOnInsert) mongoUpdate.$setOnInsert._c = new Date()
        else mongoUpdate.$setOnInsert = { _c: new Date() }
      }
      if (debug) logger.log('UPDATE ONE', '\x1b[33m', mongoFilter, '\x1b[0m\n', '\x1b[33m', mongoUpdate, options || '', '\x1b[0m')
      return requireCol().updateOne(mongoFilter, mongoUpdate, options)
    },

    updateMany: function(filter: any, update: any, options?: any) {
      const mongoFilter = unalias(filter, schema)
      const mongoUpdate = unalias(update, schema)
      if (mongoUpdate.$set) mongoUpdate.$set._u = new Date()
      else mongoUpdate.$set = { _u: new Date() }
      if (options?.upsert) {
        if (mongoUpdate.$setOnInsert) mongoUpdate.$setOnInsert._c = new Date()
        else mongoUpdate.$setOnInsert = { _c: new Date() }
      }
      if (debug) logger.log('UPDATE MANY', '\x1b[33m', mongoFilter, '\x1b[0m\n', '\x1b[33m', mongoUpdate, options || '', '\x1b[0m')
      return requireCol().updateMany(mongoFilter, mongoUpdate, options)
    },
  }

  return mAliased
}

export type ICollection = ReturnType<typeof Model>
