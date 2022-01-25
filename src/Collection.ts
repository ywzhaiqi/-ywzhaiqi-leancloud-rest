import { isObject, isDate, uniq, sign } from './utils'

let mfetch = fetch
// if (typeof mfetch == 'undefined') {
//   mfetch = require('node-fetch')
// }

export interface IDBConfig {
  appId: string
  appKey: string
  serverURLs: string
}

export interface IQuery {
  where?: IWhere
  order?: string
  limit?: number
  skip?: number
  keys?: string
  count?: number
  include?: string
}

export interface IWhere {
  [key: string]: string | number | IWhereOpt | IWhere[]
  $and?: IWhere[]
  $or?: IWhere[]
}
interface IWhereOpt {
  $ne?: any
  $lt?: any  // 小于
  $lte?: any  // 小于等于
  $gt?: any
  $gte?: any
  $regex?: string
    $options?: string // imxs
  $in?: string[] | number[]
  $nin?: string[] | number[]
  $all?: string[] | number[]
    $size?: number
  $exists?: boolean
  $select?: any
  $dontSelect?: any
  [key: string]: any

  __type?: "Pointer"
  className?: string
  objectId?: string

  $inQuery?: {
    where: IWhere
    className: string
  }

  // location
  $nearSphere?: IGeoPoint,
  $maxDistanceInMiles?: number
  $maxDistanceInKilometers?: number
  $maxDistanceInRadians?: number
  $within?: {
    $box: IGeoPoint[]
  }
}

interface IGeoPoint {
  __type: 'GeoPoint',
  latitude: number,
  longitude: number
}


interface mRequestInit extends RequestInit {
  body?: any
}

interface IHeaders {
  'X-LC-Id': string;
  'X-LC-Sign': string;
  'Content-Type': string;
}

const DEFAULT_QUERY: IQuery = {
  // where: {},
  limit: 100,
  skip: 0,
};


function fixResults(results: any[]) {
  results.forEach(item => {
    Object.keys(item).forEach(key => {
      const value = item[key]
      if (!isObject(value)) return

      switch(value.__type) {
        case 'Date':
          item[key] = value.iso
          break
        case 'Bytes':
          break
        case 'Pointer':
          break
        case 'File':
          break
        case 'GeoPoint':
          break
      }
    })
  })

  return results
}

function filteSaveKeys(obj: any, undefinedDelete=false) {
  // 这几个无法保存
  let { objectId, createdAt, updatedAt, ...rest } = obj

  // date 转换
  Object.keys(rest).forEach(key => {
    let value = rest[key]
    if (isDate(value)) {
      rest[key] = {
        __type: 'Date',
        iso: value.toJSON()
      }
    } else if (undefinedDelete && value == undefined) {  // undefined => 删除
      rest[key] = {"__op":"Delete"}
    }
  })
  return rest
}

function queryToStr(value: any) {
  if (isObject(value)) {
    return encodeURIComponent(JSON.stringify(value))
  }
  return value
}

export default class Collection {
  db: IDBConfig
  tableName: string
  headers: IHeaders

  constructor(dbConfig: IDBConfig, tableName: string) {
    this.db = dbConfig
    this.tableName = tableName
    this.headers = this._genHeaders()
  }

  async count(query: IQuery = {}) {
    let newQuery = Object.assign({}, query, { count: 1, limit: 0 })
    const count = await this.find(newQuery, true)
    return count
  }

  /**
   * `where`: 查询条件。

     $ne, $lt, $lte, $gt, $gte, $regex, $in, $nin, $all, $exists, $select, $dontSelect. 更详细见：https://leancloud.cn/docs/rest_api.html#hash827796182

     ```
     {
      $and: [
        { 'title': 'XXX' }, 
        { 'id': { 'in': [1,2,3] } }
      ]
    }
     ```

     `limit`: 最大 1000

     `keys`: 限定返回的字段。例如 'title,-date'
   */
  async findAll(query: IQuery = {}) {
    if (query.limit) {
      return this.find(query)
    }

    const limit = 1000
    query.limit = limit

    const allData: any[] = []
    let skip = 0
    while(true) {
      console.log(`${this.tableName} find skip=${skip}, limit=${limit}`, query)
      query.skip = skip
      const ret = await this.find(query)
      if (!ret.length) break

      allData.push(...ret)

      if (ret.length < limit) break
      skip += limit
    }

    return allData
  }

  /**
   * limit 默认 100
   */
  async find(query: IQuery = {}, count=false): Promise<any[]> {
    let newQuery = Object.assign({}, DEFAULT_QUERY, query)

    const queryStr = Object.keys(newQuery)
      .map(key => `${key}=${queryToStr(newQuery[key])}`)
      .join('&')

    const urlLast = `classes/${this.tableName}?${queryStr}`
    const json = await this.get(urlLast)
    if (count) {
      return json.count
    }
    return fixResults(json.results)
  }

  async findOne(query: IQuery = {}) {
    query.limit = 1
    let results = await this.find(query)
    if (!results.length) {
      return null
    }
    return results[0]
  }

  /**
   * findInKeys(books, 'isbn')  根据 books 中 isbn 找到数据库中对应的 book。 
   * 
   * @param newObjs 
   * @param key 
   */
  async findInKeys(newObjs: object[], key: string) {
    const values = uniq(newObjs.map(i => i[key]))
    if (!values.length) {
      console.error('no key found in objects', key, newObjs)
      throw new Error('no key found in objects')
    }

    const remoteObjs = await this.findAll({
      where: {
        [key]: { $in: values }, 
      },
    });
    return remoteObjs
  }

  /**
   * 根据 newObj 的 objectId 判断是 update 还是 create
   * 
   * @param newObj any[]
   * @returns 
   */
  async updateOrCreate(newObj: any) {
    if (newObj.objectId) {
      return this.update(newObj)
    } else {
      return this.create(newObj)
    }
  }

  /**
   * 根据 primaryKey 找到 newObjs 对应数据库 remoteObjs，再根据 checkKeys 比较判断是否有变化，如果有就更新，否则创建
   * 
   * @param newObjs 
   * @param primaryKey 
   * @param checkKeys 
   * @returns 
   */
  async createOrUpdate(newObjs: object[], primaryKey='objectId', checkKeys: string[]=[]) {
    if (!newObjs.length) return

    const remoteObjs = await this.findInKeys(newObjs, primaryKey)
    return this.compareAndUpload({ newObjs, remoteObjs, primaryKey, checkKeys })
  }

  /**
   * 根据 primaryKey 找到2个对象数组 newObjs, remoteObjs 中相同的，再根据 checkKeys 判断对象是否有变化，如果有就更新，否则创建
   * 
   */
  async compareAndUpload({ newObjs, remoteObjs, primaryKey='objectId', checkKeys=[] }: {
    newObjs: any[]
    remoteObjs: any[]
    primaryKey: string
    checkKeys: string[]
  }) {

    const updates: any[] = []
    const creates: any[] = []
    for(let nobj of newObjs) {
      let keys = checkKeys
      const remotObj = remoteObjs.find(i => i[primaryKey] == nobj[primaryKey])
      if (remotObj) {
        if (!keys.length) {
          keys = Object.keys(nobj)
        }

        if (keys.length) {
          const isChanged = keys.some(k => nobj[k] != remotObj[k])
          if (!isChanged) continue;
        }
  
        nobj.objectId = remotObj.objectId
        updates.push(nobj)
      } else {
        creates.push(nobj)
      }
    }

    if (updates.length) {
      await this.batchUpdate(updates)
    }
    if (creates.length) {
      await this.batchCreate(creates)
    }
  }

  async create(newObj: object, { fetchWhenSave=false }={}) {
    const url = `${this.db.serverURLs}/1.1/classes/${this.tableName}${fetchWhenSave ? '?fetchWhenSave=true' : ''}`
    return this._fetch(url, {
      method: 'POST',
      body: filteSaveKeys(newObj),
    })
  }
  
  async update(newObj: any, objectId=newObj.objectId) {
    const url = `${this.db.serverURLs}/1.1/classes/${this.tableName}/${objectId}`
    return await this._fetch(url, {
      method: 'PUT',
      body: filteSaveKeys(newObj),
    })
  }

  async destory(objectId: string) {
    let url = `${this.db.serverURLs}/1.1/classes/${this.tableName}/${objectId}`
    return await this._fetch(url, {
      method: 'DELETE',
    })
  }

  /**
   * 根据 objectId 判断是 create 或 update
   */
  async batch(objs: any[], { undefineDelete=false, fetchWhenSave=false }={}) {
    if (!objs.length) return []

    const requests = objs.map(obj => {
      let path = obj.objectId ? `/1.1/classes/${this.tableName}/${obj.objectId}` : `/1.1/classes/${this.tableName}`
      if (fetchWhenSave) {
        path += '?fetchWhenSave=true'
      }
      return {
        method: obj.objectId ? 'PUT' : 'POST',
        path,
        body: filteSaveKeys(obj, undefineDelete)
      }
    });

    console.debug('batch', { requests })
    const ret = await this.post('batch', { requests })

    // 结果是否有错误
    const errors = ret.filter(i => i.error)
    if (errors.length) {
      console.error('batch Error', errors)
    }
    return errors
  }

  async batchCreate(neObjs: object[]) {
    if (!neObjs.length) return []

    const requests = neObjs.map(newObj => ({
      method: 'POST',
      path: `/1.1/classes/${this.tableName}`,
      body: filteSaveKeys(newObj)
    }));

    console.debug('batchCreate', { requests })
    const ret = await this.post('batch', { requests })

    // 结果是否有错误
    const errors = ret.filter(i => i.error)
    if (errors.length) {
      console.error('batchCreate Error', errors)
    }
    return errors
  }

  async batchUpdate(objs: any[], { undefineDelete=false }={}) {
    if (!objs.length) return []

    // 确保必须要有 objectId
    const hasIdObjs = objs.filter(o => o.objectId)
    if (!hasIdObjs.length) {
      console.error('batchUpdate has no objectId')
      return
    }

    const requests = hasIdObjs.map(obj => ({
      method: 'PUT',
      path: `/1.1/classes/${this.tableName}/${obj.objectId}`,
      body: filteSaveKeys(obj, undefineDelete)
    }));

    console.debug('batchUpdate', { requests })
    const ret = await this.post('batch', { requests })

    // 结果是否有错误
    const errors = ret.filter(i => i.error)
    if (errors.length) {
      console.error('batchUpdate Error', errors)
    }
    return errors
  }

  async batchDestory(objs: any[]) {
    if (!objs.length) return

    const requests = objs.map(itm => ({
      method: 'DELETE',
      path: `/1.1/classes/${this.tableName}/${itm.objectId}`,
    }));

    console.debug('batchDestory', { requests })
    const ret = await this.post('batch', { requests })

    // 结果是否有错误
    const errors = ret.filter(i => i.error)
    if (errors.length) {
      console.error('batchDestory Error', errors)
    }
  }

  async files() {
    return this.get('classes/files')
  }

  /**
   * https://API_BASE_URL/1.1/classes/files
   * 
   * @param urlLast url 1.1/ 之后的字符串，例如 classes/files
   * @returns 
   */
  async get(urlLast: string) {
    const url = `${this.db.serverURLs}/1.1/${urlLast}`
    return this._fetch(url)
  }
  async post(urlLast: string, body: any) {
    const url = `${this.db.serverURLs}/1.1/${urlLast}`
    return this._fetch(url, {
      method: 'POST',
      body
    })
  }
  async _fetch(url: string, init: mRequestInit={}) {
    const defaultOpt = {
      method: 'GET',
      headers: this.headers,
    };

    // body to string
    if (init.body && isObject(init.body)) {
      init.body = JSON.stringify(init.body)
    }

    const opt = Object.assign({}, defaultOpt, init)

    const res = await mfetch(url, opt);
    const json = await res.json();
    if (json.code && json.error) {
      throw new Error(json.error)
    }
    return json
  }

  private _genHeaders() {
    return {
        'X-LC-Id': this.db.appId,
        'X-LC-Sign': sign(this.db.appKey),
        'Content-Type': 'application/json;charset=UTF-8',
        // 'X-LC-Session': session
      }
  }
}