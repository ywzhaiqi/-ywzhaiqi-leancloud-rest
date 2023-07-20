import isEqual from 'lodash.isequal'
import { isObject, isDate, uniq, sign, queryToStr } from './utils'
import type { BatchCreateItem, BatchItem, BatchResultItem, BatchUpdateItem, CreatedResult, ErrorResult, IDBConfig, IQuery, LC, UpdatedResult } from './leanCloud';

interface mRequestInit extends RequestInit {
  body?: any
}

type IHeaders = {
  'X-LC-Id': string;
  'X-LC-Sign': string;
  'Content-Type': string;
}

type FetchJsonFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<any>


const DEFAULT_QUERY: IQuery = {
  // where: {},
  limit: 100,
  skip: 0,
};


function fixResults<T>(results: T[]) {
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

function filterSaveKeys(obj: any, undefinedDelete=false) {
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


type InitOptions = {
  log?: boolean
  fetchJson?: FetchJsonFn
}

export default class Collection<T extends LC.Class> {
  db: IDBConfig
  tableName: string
  headers: IHeaders
  log: boolean;
  fetchJson?: FetchJsonFn;

  constructor(dbConfig: IDBConfig, tableName: string, { log=false, fetchJson }: InitOptions={}) {
    this.db = dbConfig
    this.tableName = tableName
    this.headers = this._genHeaders()
    this.log = log
    this.fetchJson = fetchJson
  }

  async count(query: IQuery = {}) {
    let newQuery = Object.assign({}, query, { count: 1, limit: 0 })
    const { count } = await this.findAndCount(newQuery)
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
  async findAll(query: IQuery = {}): Promise<T[]> {
    if (query.limit && query.limit <= 1000) {
      return this.find(query)
    }

    const limit = 1000
    query.limit = limit

    const allData: T[] = []
    let skip = 0
    while(true) {
      if (this.log) console.log(`${this.tableName} find skip=${skip}, limit=${limit}`, query)
      query.skip = skip
      const results = await this.find(query)
      if (!results.length) break

      allData.push(...results)

      if (results.length < limit) break
      skip += limit
    }

    return allData
  }

  /**
   * limit 默认 100
   * 
   * 批量操作还有一个冷门用途，代替 URL 过长的 GET（比如使用 containedIn 等方法构造查询）和 DELETE （比如批量删除）请求，以绕过服务端和某些客户端对 URL 长度的限制。
   */
  async find(query: IQuery = {}): Promise<T[]> {
    const json = await this._find(query)
    return fixResults(json.results)
  }

  async findAndCount(query: IQuery = {}) {
    query.count = 1
    const json = await this._find(query)
    return {
      results: fixResults(json.results),
      count: json.count,
    }
  }

  async _find(query: IQuery = {}): Promise<{ results: T[], count?: number }> {
    const newQuery = Object.assign({}, DEFAULT_QUERY, query)

    const queryStr = Object.keys(newQuery)
      .map(key => `${key}=${queryToStr(newQuery[key])}`)
      .join('&')
    
    if (queryStr.length > 2000) {
      const requests = [
        {
          method : 'GET',
          path: `/1.1/classes/${this.tableName}`,
          params: newQuery
        },
      ]
      const response: BatchItem[] = await this._post('batch', { requests })
      const result = response[0];
      if (result.success) {
        return result.success;
      }
      const error = {
        code: result.error.code,
        message: result.error.error || 'Unknown batch error'
      }
      console.error('_findByPost', result.error)
      throw new Error(error.message);
    }

    const urlLast = `classes/${this.tableName}?${queryStr}`
    return this._get(urlLast)
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
   * 例如：findInKeys(books, 'isbn')  根据 books 中 isbn 找到数据库中对应的 book。 
   */
  async findInKeys(newObjs: Partial<T>[], key: string) {
    const values = uniq(newObjs.map(i => i[key]))
    if (!values.length) {
      if (this.log) console.error('no key found in objects', key, newObjs)
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
   */
  async createOrUpdate(newObj: Partial<T>) {
    if (newObj.objectId) {
      return this.update(newObj, newObj.objectId)
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
  async batchCreateOrUpdate(newObjs: T[], primaryKey='objectId', checkKeys: string[]=[]) {
    if (!newObjs.length) return

    const remoteObjs = await this.findInKeys(newObjs, primaryKey)
    return this.batchCompareAndUpload({ newObjs, remoteObjs, primaryKey, checkKeys })
  }

  /**
   * 根据 primaryKey 找到2个对象数组 newObjs, remoteObjs 中相同的，再根据 checkKeys 判断对象是否有变化，如果有就更新，否则创建
   * 
   */
  async batchCompareAndUpload({ newObjs, remoteObjs, primaryKey='objectId', checkKeys=[] }: {
    newObjs: T[]
    remoteObjs: T[]
    primaryKey: string
    checkKeys: string[]
  }) {

    const updates: T[] = []
    const creates: T[] = []
    for(let nobj of newObjs) {
      let keys = checkKeys
      const remotObj = remoteObjs.find(i => i[primaryKey] == nobj[primaryKey])
      if (remotObj) {
        if (!keys.length) {
          keys = Object.keys(nobj).filter(k => ['objectId', 'createdAt', 'updatedAt'].indexOf(k) < 0)
        }

        if (keys.length) {
          const isChanged = keys.some(k => !isEqual(nobj[k], remotObj[k]))
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

  async create(newObj: Partial<T>, { fetchWhenSave=false }={}): Promise<CreatedResult> {
    const url = `${this.db.serverURLs}/1.1/classes/${this.tableName}${fetchWhenSave ? '?fetchWhenSave=true' : ''}`
    return this._fetch(url, {
      method: 'POST',
      body: filterSaveKeys(newObj),
    }).then(res => {
      if (res.error) throw new Error(res.error)
      return res
    })
  }
  
  async update(newObj: Partial<T>, objectId: string): Promise<UpdatedResult> {
    const url = `${this.db.serverURLs}/1.1/classes/${this.tableName}/${objectId}`
    return await this._fetch(url, {
      method: 'PUT',
      body: filterSaveKeys(newObj),
    }).then(res => {
      if (res.error) throw new Error(res.error)
      return res
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
  async batch(objs: Partial<T>[], { undefineDelete=false, fetchWhenSave=false }={}): Promise<BatchResultItem[]> {
    if (!objs.length) return []

    const requests = objs.map(obj => {
      let path = obj.objectId ? `/1.1/classes/${this.tableName}/${obj.objectId}` : `/1.1/classes/${this.tableName}`
      if (fetchWhenSave) {
        path += '?fetchWhenSave=true'
      }
      return {
        method: obj.objectId ? 'PUT' : 'POST',
        path,
        body: filterSaveKeys(obj, undefineDelete)
      }
    });

    if (this.log) console.debug('batch', { requests })
    return this._post('batch', { requests })
  }

  async batchCreate(neObjs: Partial<T>[]): Promise<BatchCreateItem[]> {
    if (!neObjs.length) return []

    const requests = neObjs.map(newObj => ({
      method: 'POST',
      path: `/1.1/classes/${this.tableName}`,
      body: filterSaveKeys(newObj)
    }));

    if (this.log) console.debug('batchCreate', { requests })
    return this._post('batch', { requests })
  }

  async batchUpdate(objs: Partial<T>[], { undefineDelete=false }={}): Promise<BatchUpdateItem[]> {
    if (!objs.length) return []

    // 确保必须要有 objectId
    const hasIdObjs = objs.filter(o => o.objectId)
    if (!hasIdObjs.length) {
      if (this.log) console.error('batchUpdate has no objectId')
      return
    }

    const requests = hasIdObjs.map(obj => ({
      method: 'PUT',
      path: `/1.1/classes/${this.tableName}/${obj.objectId}`,
      body: filterSaveKeys(obj, undefineDelete)
    }));

    if (this.log) console.debug('batchUpdate', { requests })
    return this._post('batch', { requests })
  }

  async batchDestory(objs: Partial<T>[]) {
    if (!objs.length) return

    const requests = objs.map(itm => ({
      method: 'DELETE',
      path: `/1.1/classes/${this.tableName}/${itm.objectId}`,
    }));

    if (this.log) console.debug('batchDestory', { requests })
    const ret = await this._post('batch', { requests })

    // 结果是否有错误
    const errors = ret.filter(i => i.error)
    if (errors.length) {
      if (this.log) console.error('batchDestory Error', errors)
    }
  }

  async files() {
    return this._get('classes/files')
  }

  async get(objectId: string): Promise<T | ErrorResult> {
    return this._get(`classes/${this.tableName}/${objectId}`)
  }

  async search(query: string, skip=0, limit=20, sid?: string, order?: string) {
    const url = `search/select?q=${query}&limit=${limit}&skip=${skip}&clazz=ChatMsg&order=${order}`
    const data: LC.SearchData = await this._get(url)
    data.results = fixResults(data.results)
    return data
  }

  /**
   * https://API_BASE_URL/1.1/classes/files
   * 
   * @param urlLast url 1.1/ 之后的字符串，例如 classes/files
   * @returns 
   */
  async _get(urlLast: string) {
    const url = `${this.db.serverURLs}/1.1/${urlLast}`
    return this._fetch(url)
  }
  async _post(urlLast: string, body: any) {
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

    let json: any
    if (this.fetchJson) {
      json = await this.fetchJson(url, opt)
    } else {
      const mfetch = typeof global != 'undefined' ? global.fetch : fetch
      const res = await mfetch(url, opt);
      json = await res.json();
    }
    
    if (json.code && json.error) {
      throw new Error(json.error)
    }
    return json
  }

  _genHeaders() {
    return {
      'X-LC-Id': this.db.appId,
      'X-LC-Sign': sign(this.db.appKey),
      'Content-Type': 'application/json;charset=UTF-8',
      // 'X-LC-Session': session
    }
  }
}