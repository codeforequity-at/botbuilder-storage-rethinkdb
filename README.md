# Bot Builder RethinkDB Storage

**Attention: [Bot Framework State Service will cease operating on March 31st 2018](https://blog.botframework.com/2017/12/19/bot-state-service-will-soon-retired-march-31st-2018/), so you should switch your bot to another storage adapter - like this one - soon!**

[![NPM](https://nodei.co/npm/botbuilder-storage-rethinkdb.png)](https://nodei.co/npm/botbuilder-storage-rethinkdb/)

[ ![Codeship Status for codeforequity-at/botbuilder-storage-rethinkdb](https://app.codeship.com/projects/906d2fd0-0a04-0136-0e62-26e427967e2e/status?branch=master)](https://app.codeship.com/projects/281600)
[![npm version](https://badge.fury.io/js/botbuilder-storage-rethinkdb.svg)](https://badge.fury.io/js/botbuilder-storage-rethinkdb) 
[![license](https://img.shields.io/github/license/mashape/apistatus.svg)]()

A module to use [RethinkDB](https://www.rethinkdb.com/) as storage adapter for [Microsoft Bot Builder SDK for Node.js](https://github.com/Microsoft/BotBuilder). Configure your bot to automatically save conversation state data in Rethinkdb.

## Installation

```
npm install --save botbuilder-storage-rethinkdb
```

## Usage

Instantiate a new storage, configure connection details to your RethinkDB and plug it into Bot Builder.

```
const RethinkDbStorage = require('botbuilder-storage-rethinkdb').RethinkDbStorage;

// BotBuilder setup code
const connector = new builder.ChatConnector({
   ...
});
const bot = new builder.UniversalBot(connector, {
   ...
});

const storage = new RethinkDbStorage({
  // add your settings here
  host: '127.0.0.1',
  tablePrefix: 'botstorage_' + process.env.NODE_ENV
});
bot.set('storage', storage);

```

## Configuration

The constructor take an "options" argument. All options for [connecting to RethinkDb](https://rethinkdb.com/api/javascript/connect/) are supported, and some additional ones.

### host
_Default: 'localhost'_
Well, the hostname of your RethinkDB instance ...

### port
_Default: 28015_
The port your RethinkDB instance is listening.

### db
_Default: 'botstorage'_
The name of the database to store the conversation state data. If this database doesn't exist, it will be created.

### tablePrefix
_Default: 'botstorage__'_
The table prefix for the conversation state tables, which are created automatically. In case you are sharing one RethinkDB instance among several environments or bots, you should change this table prefix.

There are 3 tables created automatically, one for each [storage container](https://docs.microsoft.com/en-us/bot-framework/nodejs/bot-builder-nodejs-state):
* botstorage_userData
* botstorage_conversationData
* botstorage_privateConversationData
(botstorage_ is the table prefix)

All 3 of these tables include:
* a secondary index for fast lookup
* a "created_at" column
* a "updated_at" column

## Data Migration

Here are some hints how I migrated existing conversation state data from the Bot Framework State Service to my local RethinkDB.

First, I enabled a special "migration" mode by setting an environment variable. In migration mode, the old storage adapter is used, but the RethinkDB storage adapter is initialized and connected:

```
const storage = new RethinkDbStorage({
  ...
});

if (process.env.MIGRATE_STORAGE) {
  require('./migrate')(bot, storage);
} else {
  bot.set('storage', storage);
}
...
```

The migrate.js file loads all existing user addresses from my Redis session store, starts an empty dialog of each of them, making the conversation state data available in the session, and finally stores the conversation state data in RethinkDB.

```
const async = require('async');
const Redis = require('ioredis');

module.exports = (bot, storage) => {

  var migratedCount = 0;
  var errorCount = 0;

  const redis = new Redis({
    host: ...,
    port: ...,
    showFriendlyErrorStack: true
  });

  bot.dialog('/migrate', (session) => {
    console.log('MIGRATING USER ' + session.message.address.user.name);
  
    const context = {
      persistUserData: true,
      userId: session.message.address.user.id,
      persistConversationData: true,
      conversationId: session.message.address.conversation.id
    };
    const data = {
      userData: session.userData,
      conversationData: session.conversationData,
      privateConversationData: session.privateConversationData
    }
    
    storage.saveData(context, data, (err) => {
      if (err) {
        console.log('SAVEDATA FAILED: ' + err)
        errorCount++;
      } else {
        migratedCount++;
      }
      console.log('CURRENTLY MIGRATED: ' + migratedCount + ', ERRORS: ' + errorCount);
    })
  })

  async.waterfall([

    (getKeysDone) => {
      redis.keys('bot:user:*', getKeysDone);
    },
    
    (keys, getValuesDone) => {
      redis.mget(keys, getValuesDone);
    },

    (values, done) => {
      console.log('MIGRATING ' + values.length + ' bot users');
      
      values.forEach((address) => {
        bot.beginDialog(JSON.parse(address), '/migrate');
      })
      done()
    }
  ], (err) => {
    if (err) {
      console.log('MIGRATE FAILED: ' + err);
    }
  });
};

```

## License
MIT



