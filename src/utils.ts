import md5 from 'md5'

// 计算 X-LC-Sign 的签名方法
export function sign(key: string) {
  const now = new Date().getTime();
  const signature = md5(now + key);
  return `${signature},${now}`;
}


export function isString(val: any) {
  return typeof val == 'string'
}

export function isDate(val: any) {
  return typeof val === 'object' && Object.prototype.toString.call(val) === '[object Date]';
}

export function isObject(val: any) {
  return val !== null && typeof val === 'object';
}

export function uniq(...arrays: string[][]) {
  if (!arrays.length) return []

  const newArr: string[] = []
  
  for(let arr of arrays) {
    newArr.push(...arr)
  }

  return [...new Set(newArr)]
}