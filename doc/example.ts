import { Collection, IDBConfig } from '../src/index'

interface Book {
  title: string
  isbn?: string

  objectId?: string
  createdAt?: Date
  updatedAt?: Date
}

const dbConfig: IDBConfig = {
  appId: '',
  appKey: '',
  serverURLs: ''
}

const bookApi = new Collection<Book>(dbConfig, 'Book')

bookApi.findAll({
  where: {
    "createdAt":{"$gte":{"__type":"Date","iso":"2015-06-29T00:00:00.000Z"},"$lt":{"__type":"Date","iso":"2015-06-30T00:00:00.000Z"}},
    updatedAt: {
      $gte: { "__type": "Date", "iso": "2015-06-29T00:00:00.000Z"},
      $lt: {}
    },
    "upvotes":{"$in":[1,3,5,7,9]},
    "pubUser":{"$nin":["官方客服"]},
    "upvots":{"$exists":true},
    "user":{
      "__type": "Pointer",
      "className": "_User",
      "objectId": "55a39634e4b0ed48f0c1845c"
    },
    "title":{"$regex":"^WTO.*","$options":"i"},
    "arrayKey":{"$all":[2,3,4]},
    arrayKey2: { $size: 3 },
    post: { __type: 'Pointer', className: 'Post', objectId: '558e20cbe4b060308e3eb36c' },
    post2: { $inQuery: { where: { image: { $exists: true}}, className: 'Post' }},
    $or: [{"pubUserCertificate": {$gt: 2}}, {"pubUserCertificate": {$lt: 3}}],
  },
  order: '-createdAt',
  limit: 200,
  skip: 400,
  keys: '-author, name',
  count: 10,
  include: 'post.author',
}).then(books => {
  books
}).catch(reason => {
  console.error('bookApi.findAll Error', reason)
})

bookApi.findAndCount({}).then(({ results, count }) => {
  results
  count
})

bookApi.create({
  title: 'javascript'
}).then(res => {
  res.createdAt
  res.objectId
})

bookApi.update({
  objectId: '1',
  title: 'javascript-1'
}).then(res => {
  res.updatedAt
})

bookApi.batch([]).then(arr => {
  arr.map(i => {
    if (i.success) {
      i.success.aaa
      i.success.updatedAt
    }
  })
})

bookApi.batchCreate([
  { title: 'javascript-2' },
])