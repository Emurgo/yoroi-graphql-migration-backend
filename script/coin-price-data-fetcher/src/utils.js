// @flow
const config = require('config');

exports.PromiseAll = async <T>(delayPromises: Array<() => Promise<T>>): Array<T> => {
  if (config.noParallel) {
    const result = new Array(delayPromises.length);
    for (let i = 0; i < delayPromises.length; i += 1) {
      result[i] = await delayPromises[i]();
    }
    return result;
  } else {
    return Promise.all(delayPromises.map(p => p()));
  }
}
