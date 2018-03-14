const util = require('util')
const async = require('async')
const r = require('rethinkdb')
const debug = require('debug')('botbuilder-storage-rethinkdb')

require('rethinkdb-init')(r)

const optionsDefault = {
  host: 'localhost',
  port: 28015,
  db: 'botstorage',
  tablePrefix: 'botstorage_'
}

class RethinkDbStorage {
  constructor (options) {
    this.options = Object.assign(optionsDefault, options, {})
    this.initializeClientPromise = null

    this.tableUserData = this.options.tablePrefix + 'userData'
    this.tableConversationData = this.options.tablePrefix + 'conversationData'
    this.tablePrivateConversationData = this.options.tablePrefix + 'privateConversationData'

    this.indexUserData = this.options.tablePrefix + 'index_userData'
    this.indexConversationData = this.options.tablePrefix + 'index_conversationData'
    this.indexPrivateConversationData = this.options.tablePrefix + 'index_privateConversationData'
  }

  getData (context, callback) {
    debug(`getData (${util.inspect(context)}) called`)
    this.initializeStorageClient().then(() => {
      async.parallel({
        userData: (userDataReady) => {
          if (context.persistUserData && context.userId) {
            r.table(this.tableUserData)
              .getAll([ context.userId ], { index: this.indexUserData })
              .limit(1).nth(0).default(null)
              .run(this.connection, (err, item) => {
                userDataReady(err, item ? item.data : null)
              })
          } else {
            userDataReady()
          }
        },
        conversationData: (conversationDataReady) => {
          if (context.persistConversationData && context.conversationId) {
            r.table(this.tableConversationData)
              .getAll([ context.conversationId ], { index: this.indexConversationData })
              .limit(1).nth(0).default(null)
              .run(this.connection, (err, item) => {
                conversationDataReady(err, item ? item.data : null)
              })
          } else {
            conversationDataReady()
          }
        },
        privateConversationData: (privateConversationDataReady) => {
          if (context.userId && context.conversationId) {
            r.table(this.tablePrivateConversationData)
              .getAll([ context.userId, context.conversationId ], { index: this.indexPrivateConversationData })
              .limit(1).nth(0).default(null)
              .run(this.connection, (err, item) => {
                privateConversationDataReady(err, item ? item.data : null)
              })
          } else {
            privateConversationDataReady()
          }
        }
      }, (err, data) => {
        if (err) {
          debug(`getData (${util.inspect(context)}) failed: ${util.inspect(err)}`)
          this.connection = null
        } else {
          debug(`getData (${util.inspect(context)}) success: ${util.inspect(data)}`)
        }
        callback(err, data)
      })
    }).catch(callback)
  }

  saveData (context, data, callback) {
    debug(`asdf saveData (${util.inspect(context)},${JSON.stringify(data, null, 2)} ) called`)
    this.initializeStorageClient().then(() => {
      async.parallel({
        userData: (userDataReady) => {
          if (context.persistUserData && context.userId) {
            const cleanData = r.literal(JSON.parse(JSON.stringify(data.userData || {})))
            const t = r.table(this.tableUserData)
            t.getAll([ context.userId ], { index: this.indexUserData })
              .limit(1).nth(0).default(null)
              .run(this.connection, (err, doc) => {
                if (err) return userDataReady(err)
                if (doc) {
                  t.get(doc.id)
                    .update({ data: cleanData, updated_at: r.now() })
                    .run(this.connection, userDataReady)
                } else {
                  t.insert({ userId: context.userId, data: cleanData, created_at: r.now(), updated_at: r.now() })
                    .run(this.connection, userDataReady)
                }
              })
          } else {
            userDataReady()
          }
        },
        conversationData: (conversationDataReady) => {
          if (context.persistConversationData && context.conversationId) {
            const cleanData = r.literal(JSON.parse(JSON.stringify(data.conversationData || {})))
            const t = r.table(this.tableConversationData)
            t.getAll([ context.conversationId ], { index: this.indexConversationData })
              .limit(1).nth(0).default(null)
              .run(this.connection, (err, doc) => {
                if (err) return conversationDataReady(err)
                if (doc) {
                  t.get(doc.id)
                    .update({ data: cleanData, updated_at: r.now() })
                    .run(this.connection, conversationDataReady)
                } else {
                  t.insert({ conversationId: context.conversationId, data: cleanData, created_at: r.now(), updated_at: r.now() })
                    .run(this.connection, conversationDataReady)
                }
              })
          } else {
            conversationDataReady()
          }
        },
        privateConversationData: (privateConversationDataReady) => {
          if (context.userId && context.conversationId) {
            const cleanData = r.literal(JSON.parse(JSON.stringify(data.privateConversationData || {})))
            const t = r.table(this.tablePrivateConversationData)
            t.getAll([ context.userId, context.conversationId ], { index: this.indexPrivateConversationData })
              .limit(1).nth(0).default(null)
              .run(this.connection, (err, doc) => {
                if (err) return privateConversationDataReady(err)
                if (doc) {
                  t.get(doc.id)
                    .update({ data: cleanData, updated_at: r.now() })
                    .run(this.connection, privateConversationDataReady)
                } else {
                  t.insert({ userId: context.userId, conversationId: context.conversationId, data: cleanData, created_at: r.now(), updated_at: r.now() })
                    .run(this.connection, privateConversationDataReady)
                }
              })
          } else {
            privateConversationDataReady()
          }
        }
      }, (err, data) => {
        if (err) {
          debug(`saveData (${util.inspect(context)}) failed: ${util.inspect(err)}`)
          this.connection = null
        } else {
          debug(`saveData (${util.inspect(context)}) success`)
        }
        callback(err)
      })
    }).catch(callback)
  }

  initializeStorageClient () {
    if (!this.connection) {
      return new Promise((resolve, reject) => {
        debug(`Initializing Storage Client - ${util.inspect(this.options)}`)

        r.init(this.options,
          [
            {
              name: this.tableUserData,
              indexes: [{
                name: this.indexUserData,
                indexFunction: [ r.row('userId') ]
              }]
            },
            {
              name: this.tableConversationData,
              indexes: [{
                name: this.indexConversationData,
                indexFunction: [ r.row('conversationId') ]
              }]
            },
            {
              name: this.tablePrivateConversationData,
              indexes: [{
                name: this.indexPrivateConversationData,
                indexFunction: [ r.row('userId'), r.row('conversationId') ]
              }]
            }
          ]
        ).then((connection) => {
          debug('connected to rethinkdb and initialized')
          this.connection = connection
          resolve()
        }).catch((err) => {
          reject(new Error(`Failed to initialize: ${util.inspect(err)}`))
        })
      })
    }
    return Promise.resolve()
  }
}

module.exports = {
  RethinkDbStorage
}
