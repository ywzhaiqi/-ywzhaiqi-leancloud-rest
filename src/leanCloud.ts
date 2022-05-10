
export type IDBConfig = {
  appId: string
  appKey: string
  serverURLs: string
}

export type IQuery = {
  where?: IWhere
  order?: string
  limit?: number
  skip?: number
  keys?: string
  count?: number
  include?: string
}

export type IWhere = {
  [key: string]: string | number | IWhereOpt | IWhere[]
  $and?: IWhere[]
  $or?: IWhere[]
}
export type IWhereOpt = {
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
  __op?: any
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

export type IGeoPoint = {
  __type: 'GeoPoint',
  latitude: number,
  longitude: number
}


export type CreatedResult = {
  createdAt: string,
  objectId: string,
}
// 一个请求是否成功是由 HTTP 状态码标明的。一个 2XX 的状态码表示成功，而一个 4XX 表示请求失败。当一个请求失败时响应的主体仍然是一个 JSON 对象，但是总是会包含 code 和 error 这两个字段，你可以用它们来进行调试。
export type ErrorResult = {
  code: number
  error: string
}
// fetchWhenSave 选项对更新对象也同样有效。 但和创建对象不同，用于更新对象时仅返回更新的字段，而非全部字段。
export type UpdatedResult = {
  updatedAt: string
  [updatedKey: string]: any
}
export type BatchResultItem = {
  error?: ErrorResult
  success?: {
    // create
    createdAt?: string,
    objectId?: string,
    // update
    updatedAt?: string
    [updatedKey: string]: any
  }
}
export type BatchCreateItem = {
  error?: ErrorResult
  success?: {
    createdAt: string,
    objectId: string,
  }
}
export type BatchUpdateItem = {
  error?: ErrorResult
  success?: {
    updatedAt?: string
    [updatedKey: string]: any
  }
}