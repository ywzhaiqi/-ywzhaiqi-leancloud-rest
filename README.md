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

import 或 deno 导入
```ts
import { Collection } from 'https://cdn.skypack.dev/@ywzhaiqi/leancloud-rest-api';
// 或
// @deno-types="https://esm.sh/@ywzhaiqi/leancloud-rest-api@1.1.1/dist/index.d.ts" />
import { Collection } from 'https://esm.run/@ywzhaiqi/leancloud-rest-api@1.1.1';
```

浏览器使用 `dist/index.global.js`， `const { Collection } = leanCloud`

更多见 [example](doc/example.ts)