# leancloud-rest-api

使用 [leanCloud rest api](https://leancloud.cn/docs/rest_api.html) 搭建的简易库。

不是很完善，目前还不支持 node 等


## 使用

```ts
import { Collection, IDBConfig } from '@ywzhaiqi/leancloud-rest-api'

const dbConfig: IDBConfig = {
  appId: '',
  appKey: '',
  serverURLs: ''
}

const bookApi = new Collection(dbConfig, 'Book')

```

更多见 [example](doc/example.ts)