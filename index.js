var Q = require('q')
var through = require('through')

function Query(db, collection) {
  if (!(this instanceof Query)) {
    return new Query(db, collection)
  }

  this._ = {
    db: db,
    collection: collection,
    query: {},
    projection: null,
    options: {
      safe: true
    }
  }
}

Query.prototype = {
  // query
  collection: collection,
  where: where,
  // options
  select: select,
  sort: sort,
  limit: limit,
  skip: skip,
  //finalizers
  toArray: toArray,
  one: one,
  stream: stream,
  count: count,
  // mutators
  insert: insert,
  update: update,
  upsert: upsert,
  remove: remove,
  removeAll: removeAll
}

// query
//

// @param collection String
function collection(collection) {
  return new Query(this._.db, collection)
}

// @param query Object
function where(query) {
  this._.query = query
  return this
}

// options
//

// @param projection Object
function select(projection) {
  this._.projection = projection
  return this
}

// @param sort Object
function sort(sort) {
  this._.options.sort = sort
  return this
}

// @param limit Number
function limit(limit) {
  this._.options.limit = limit
  return this
}

// @param skip Number
function skip(skip) {
  this._.options.skip = skip
  return this
}

// finalizers
//

// @return Promise<Array>
function toArray() {
  var dfd = Q.defer()
  var self = this

  getCursor(self, function (err, cursor) {
    if (err) { return dfd.reject(err) }
    cursor.toArray(function (err, array) {
      if (err) { return dfd.reject(err) }
        dfd.resolve(array || [])
    })
  })

  return dfd.promise
}

// @return Promise<Object>
function one() {
  var dfd = Q.defer()
  var self = this

  self._.options.limit = 1

  getCursor(self, function (err, cursor) {
    if (err) { return dfd.reject(err) }
    cursor.nextObject(function (err, doc) {
      if (err) { return dfd.reject(err) }
        dfd.resolve(doc || null)
    })
  })

  return dfd.promise
}

// @return Stream
function stream() {
  var stream = through(function (data) { this.queue(data) })
  var self = this

  getCursor(self, function (err, cursor) {
    if (err) {
      stream.emit('error', err)
      stream.emit('end')
      return;
    }
    cursor.stream().pipe(stream)
  })

  return stream
}

// @return Promise<Number>
function count() {
  var dfd = Q.defer()
  var self = this

  getCursor(self, function (err, cursor) {
    if (err) { return dfd.reject(err) }
    cursor.count(function (err, count) {
      if (err) { return dfd.reject(err) }
      dfd.resolve(count)
    })
  })

  return dfd.promise
}

// mutators
//

// @param doc Object|Array<Object>
// @return Promise<Object>|Promise<Array<Object>>
function insert (doc) {
  var dfd = Q.defer()
  var self = this

  getCollection(self, function (err, collection) {
    if (err) { return dfd.reject(err) }
    collection.insert(doc, self._.options, function (err, result) {
      if (err) { return dfd.reject(err) }
      dfd.resolve(result)
    })
  })

  return dfd.promise
}

// @param changes Object - a mongodb setter/unsetter
// @return Promise<Number> - count of updated documents
function update(changes) {
  var dfd = Q.defer()
  var self = this
  var restoreId = false

  self._.options.upsert = false
  self._.options['new'] = true

  if ('_id' in setter) {
    self._.query._id = restoreId = setter._id
    delete setter._id
  }

  getCollection(self, function (err, collection) {
    if (err) { return dfd.reject(err) }

    collection.update(self._.query, changes, self._.options, function (err, result) {
      if (err) { dfd.reject(err) }
      if (restoreId) { setter._id = restoreId }
      dfd.resolve(result)
    })
  })

  return dfd.promise
}

// @param changes Object - a mongodb setter/unsetter
// @return Promise<Number> - count of updated documents
function upsert(setter) {
  var dfd = Q.defer()
  var self = this
  var restoreId = false

  self._.options.upsert = true

  if ('_id' in setter) {
    self._.query._id = restoreId = setter._id
    delete setter._id
  }

  getCollection(self, function (err, collection) {
    if (err) { return dfd.reject(err) }

    collection.update(self._.query, '_id', changes, self._.options, function (err, result) {
      if (err) { dfd.reject(err) }
      if (restoreId) { setter._id = restoreId }
      dfd.resolve(result)
    })
  })

  return dfd.promise
}

// Removes documents matching the `where` query from a collection
// @return Promise<Number> - count of removed documents
function remove() {
  if (Object.keys(this._.query).length === 0) {
    return Q.reject('No `where` query specified. Use minq.removeAll to remove all documents.')
  }
  var dfd = Q.defer()
  var self = this

  getCollection(self, function (err, collection) {
    collection.remove(self._.query, self._.options, function (err, count) {
      if (err) { return dfd.reject(err) }
      dfd.resolve(count)
    })
  })

  return dfd.promise
}

// Removes all documents from a collection
// @return Promise<Number> - count of removed documents
function removeAll() {
  var dfd = Q.defer()
  var self = this

  getCollection(self, function (err, collection) {
    collection.remove(self._.options, function (err, count) {
      if (err) { return dfd.reject(err) }
      dfd.resolve(count)
    })
  })

  return dfd.promise
}

// helpers

function getCollection(self, cb) {
  try {
    self._.db.collection(self._.collection, function (err, collection) {
      if (err) { return cb(err) }
      return cb(null, collection)
    })
  } catch (e) {
    cb(e)
  }
}

function getCursor(self, cb) {
  try{
    self._.db.collection(self._.collection, function (err, collection) {
      if (err) { return cb(err) }

      var q = [self._.query]
      if (self._.projection) { q.push(self._.projection) }
      q.push(self._.options)

      cb(null, collection.find.apply(collection, q))
    })
  } catch (e) {
    cb(e)
  }
}

module.exports = Query