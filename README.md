# Mongo-Alias
A lightweight aliasing layer on top of mongodb node driver.

## Rationale

As most developers do, I've started this project after becoming really frustrated with an existing solution: mongoose. Mongoose repo is now at over 300 issues reported, many of them go stale and unresolved. That aside, here are the main reasons I wanted to get away from Mongoose:

- breaking changes are not always documented, I had to find on my own, for example, that aliases don't work automatically anymore, after upgrading from v5 to v6.
- it has become incredibly easy to corrupt my data using mongoose; things like `deleteMany(filter)` actually deleting all data; things like `update(filter, cmd)` updating all documents, not just the ones in the filter, because the contributors have decided to go against MongoDB and apply commands to ALL documents when a field does not exist in the schema (mongo will apply to NONE).
- it has become quite difficult to debug a mongoose project, mainly due to its model of overwriting every single mongo native command
- you cannot make anything serious using mongoose without eventually calling native driver functions, which then makes me wonder why do we even want to use mongoose?
- mongoose is a huge project, an empty project with `npm i mongoose` quickly arrives at 14 MB (out of which mongoDB is 9.5MB)
- I am a strong believer in the "single responsibility" paradigm, "do one thing and do it well". You need data validation? Install a data validation library. You need aliased fields? Install an alias translator (this package). You need virtual fields? Install a virtual field provider. And so on.
- And finally, and perhaps most importantly, MongoDB driver commands should have never been overridden in this way. It makes it a lot harder to keep mongoose in sync with MongoDB evolution, prevents the devs from using mongoDB as intended by 10gen, and creates a lot of confusion and mistrust towards this wonderful database system. (have you heard people complaining that mongoDB corrupted their data? It's most likely not MongoDB).

## Features

- direct logging of native mongo driver commands being sent to your database
- full use of the native mongoClient and its native DB object, to use as you see fit
- aliased fields (more about this below)
- automatic handling of `createdAt` and `updatedAt` timestamp fields

Note: this package adds 42kb to your project. Consequently, it does NOT provide any of the following features provided by mongoose:

  - schema validation
  - discriminators
  - middleware and plugins
  - population of linked documents (DBRef)
  - transactions
  - virtual fields
  - command buffering (this is actually a benefit not to have)

However, you are now if full control over your database queries and commands, and free to upgrade your mongoDB version anytime.

## Why aliases

This one is quite simple: data size.

When we code, we'd like to work with nice long field names, but those get stored in the JSON structures as is, and when you run billions of records, your data size becomes larger and larger. For some simple documents, the choice of the schema keys can result in having more data storage allocated to these keys than to actual data. This is one of the shortcommings of working with NoSQL, but it's one that we can hammer down to a single letter using aliases.

Saving short keys in the database has been a good way to improve database metrics, even though 10gen explains [here](https://www.mongodb.com/docs/manual/core/data-model-operations/#storage-optimization-for-small-documents) that this optimization is really beneficial only for small documents.

## Why NOT schema validation

Much like express and other web servers don't come up request/response validation out of the box, I think we should be free to choose different validation engines as we see fit, and just plug them in. Or perhaps, we'd like to let mongoDB validate our schema, instead of us doing it in the code.

## Installation

`npm i mongo-alias`

## Test

Make sure you install mongoDB server and have it run locally. Change the `tests/.env` file to suit your needs, then run:

`npm run test:watch`

Note: currently there are some listeners (most likely the mongoDB `client.on(...)`) that need to be cleaned up after running the tests.

## Use in your project

```
import type { TMongoAlias } from 'mongo-alias'
import { initMongo } from 'mongo-alias'

const data: TMongoAlias = await initMongo(config.mongo.url, config.mongo.db, options)

// now you have data.mongoClient and data.db to work with
const col = data.db.collection('users')
const doc = await col.findOne(/* query, projection, options */)
```

### Schema definition

Very few rules:

- option 1: name your fields anything you want, if you don't use aliases, and give them a javascript type
    ```
    const simpleModel = {
      name: String,
      email: String,
    }
    ```

- option 2: name your fields something short, and add aliases to each, or only to some:

    ```
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
          }
        }]
      }
    }
    ```

- make sure you add all sub-documents as `_children`; unlike mongoose schemas, we need to declare all object-like sub-documents as children, instead of declaring them with `type: { ... }`.
- if you have dynamic keys, i.e. sub-document keys created at run time, you can use two `_children` nested under each other. In the following example, the model can store any number of changes in a hash map format, e.g. `changes.q91 = { value: 1, date: '2023-01-01' }`. To access has map keys that start with a number, you need to use brackets in Javascript code and dot notation in the mongoDB queries, for example `changes.12monkeys = { value: 1, date: 2023-01-01 }` and in JS `const nr = changes['12monkeys'].value`.

    ```
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
    ```
- mongo-alias package automatically creates two timestamp fields for you: `createdAt` and `updatedAt` and maintains them through a little hook on native mongoDB create and update/delete commands.


#### Concrete examples of schema and their usage

```
const userModel = {
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
      }
    }]
  }
}

const userModel = await Model(userModel, 'users')
const user = await userModel.findOne({ name: 'Mark' })

// OR
const user2 = await userModel.findOne({ 'repos.auth.user': 'Mark' })

// OR
const user2 = await userModel.updateOne({ 'repos.auth.user': 'Mark' }, { $push: { 'repos.$.auth': { u: 'Brandon', d: new Date() } } })

// OR matching entire objects
const user3 = await userModel.findOne({ 'repos.auth': { user: 'Mark', date: new Date('2023-01-01') } })

// OR (returning aliased results)
const users = await userModel.find({ 'repos.auth.user': 'Mark' }).toArray()

// OR (returning raw results)
const users = await userModel.find({ 'repos.auth.user': 'Mark' }, {}, true).toArray()
```

Note: advanced MongoDB functionality, such as aggregation pipelines won't work with aliases. For now.

#### Retrieving raw mongoDB documents

- to retrieve raw documents, not translated back into aliased fields, add a third parameter to the `findOne` or `find` query:

```
  const doc = await userModel.findOne({ _id: insertedId }, {}, true)
```

## Express

```
import { initMongo } from 'mongo-alias'

let server, mongo

async function run() {
  const options = { monitorCommands:true }
  const mongoServer = await initMongo(config.mongo.url, config.mongo.db, options)
  mongo = mongoServer.mongoClient
}

run()
  .then(() => {
    logger.info('Connected to MongoDB')
    server = app.listen(config.port, () => {
      logger.info(`Listening to port ${config.port}`)
    })
  })
  .catch(console.error)

const exitHandler = () => {
  if (server) {
    mongo.close()
    server.close(() => {
      logger.info('Server closed')
      process.exit(1)
    })
  } else {
    process.exit(1)
  }
}
```

## Roadmap

Coming soon:

- plugin system

## Suggestions

I recommend using `mongo-sanitize` package to avoid some MongoDB hacking (this package eliminates '$' from all relevant fields in your express `req`).
