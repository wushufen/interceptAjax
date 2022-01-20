const hookList = []

const old = {
  XMLHttpRequest: XMLHttpRequest,
  prototype: XMLHttpRequest.prototype,
  open: XMLHttpRequest.prototype.open,
  setRequestHeader: XMLHttpRequest.prototype.setRequestHeader,
  send: XMLHttpRequest.prototype.send,
  fetch: window.fetch,
}

function interceptAjax(before = Function(), after = Function()) {
  if (typeof before === 'object') {
    after = before.after || Function()
    before = before.before || Function()
  }
  const hook = { before, after }
  hookList.push(hook)

  injectXHR(hookList)
  injectFetch(hookList)

  return function off() {
    hookList.splice(hookList.indexOf(hook), 1)
  }
}

function initOptions() {
  return {
    request: {
      method: '',
      url: '',
      headers: {},
      body: '',
    },
    response: {
      status: 0,
      statusText: '',
      headers: {},
      body: '',
      fake: false,
    },
  }
}

function fakeNetLog(type, request) {
  const fakeURL = `data:FAKE/${type},${request.url}`

  const xhr = new old.XMLHttpRequest
  old.open.call(xhr, request.method, fakeURL)
  old.setRequestHeader.call(xhr, 'fakeNetLog', true)
  old.send.call(xhr, request.body || null)
}

function injectXHR(hookList) {
  if (injectXHR.yes) return
  injectXHR.yes = true

  function getOptions(xhr) {
    const _OPTIONS_KEY = '_OPTIONS_'
    xhr[_OPTIONS_KEY] = xhr[_OPTIONS_KEY] || initOptions()

    return xhr[_OPTIONS_KEY]
  }

  function setFakeRes(xhr, fakeRes) {
    Object.defineProperties(xhr, {
      readyState: {
        value: 4,
        configurable: true,
      },
      response: {
        value: fakeRes,
        configurable: true,
      },
      responseText: {
        value: fakeRes,
        configurable: true,
      },
    })
  }

  function getResponseHeaders(xhr) {
    const map = {}
    xhr
      .getAllResponseHeaders()
      .split(/[\r\n]+/g)
      .filter(Boolean)
      .forEach((kv) => {
        kv = kv.split(/:\s*/)
        map[kv[0]] = kv[1]
      })
    return map
  }

  // method url
  old.prototype.open = function(method, url) {
    const request = getOptions(this).request
    request.method = method
    request.url = url

    return old.open.apply(this, arguments)
  }

  // headers
  old.prototype.setRequestHeader = function(k, v) {
    const request = getOptions(this).request
    const headers = request.headers
    headers[k] = v

    return old.setRequestHeader.apply(this, arguments)
  }

  // send
  old.prototype.send = function(data) {
    const xhr = this
    const options = getOptions(this)
    const request = options.request
    const response = options.response

    // request
    request.body = data
    request.xhr = xhr
    response.xhr = xhr

    // before
    const beforeReturnList = hookList.map(hook => hook.before(request))
    const fakeRes = beforeReturnList.find(e => e)
    if (fakeRes) {
      fakeNetLog('xhr', request)

      // fakeRes
      response.fake = true
      setFakeRes(xhr, fakeRes)

      // after hook
      hookList.map(hook => hook.after(request, response))

      // fake event
      const progressEvent = new Event('progress')
      progressEvent.loaded = 404
      progressEvent.total = 0
      xhr.dispatchEvent(progressEvent)
      xhr.dispatchEvent(new Event('readystatechange'))
      xhr.dispatchEvent(new Event('load'))
      xhr.dispatchEvent(new Event('loadend'))
      return
    }

    // loadend
    old.onreadystatechange = xhr.onreadystatechange
    xhr.onreadystatechange = function(e) {
      if (xhr.readyState !== 4) return

      // response
      response.status = xhr.status
      response.statusText = xhr.statusText
      response.headers = getResponseHeaders(xhr)
      response.body = xhr.response || xhr.responseText

      // after => fakeRes
      const afterReturnList = hookList.map(hook => hook.after(request, response))
      const fakeRes = afterReturnList.find(e => e)
      if (fakeRes && xhr.responseURL) {
        // fakeRes
        response.fake = true
        setFakeRes(xhr, fakeRes)
      }

      if (old.onreadystatechange) {
        return old.onreadystatechange.apply(xhr, arguments)
      }
    }

    return old.send.apply(this, [options.data])
  }
}

function injectFetch(hookList) {
  if (injectFetch.yes) return
  injectFetch.yes = true

  // !pollyfill
  if (!old.fetch || /XMLHttpRequest/.test(old.fetch)) return

  function setFakeRes(response, fakeRes) {
    response.text = function() {
      return Promise.resolve(String(fakeRes))
    }
    response.json = function() {
      try {
        return Promise.resolve(JSON.parse(fakeRes))
      } catch (error) {
        return Promise.resolve(fakeRes)
      }
    }
  }

  function getHeaders(headers) {
    if (!headers) {
      return {}
    }
    const keys = headers.keys()
    const obj = {}
    let next
    while (((next = keys.next()), !next.done)) {
      obj[next.value] = headers.get(next.value)
    }
    return obj
  }

  window.fetch = function(input, init = {}) {
    const options = initOptions()
    const request = options.request
    const response = options.response

    // request
    request.arguments = arguments
    request.method = input.method || init.method || 'get'
    request.url = input.url || init.url || input
    request.headers = input.headers || init.headers || {}
    request.body = input.body || init.body

    // fake promise
    let _resolve, _reject
    const _promise = new Promise((rs, rj) => (_resolve = rs, _reject = rj))

    // before
    const beforeReturnList = hookList.map(hook => hook.before(request))
    const fakeRes = beforeReturnList.find(e => e)
    if (fakeRes) {
      fakeNetLog('fetch', request)

      response.fake = true
      const $response = new Response
      setFakeRes($response, fakeRes)

      // after hook
      hookList.map(hook => hook.after(request, response))

      _resolve($response)
      return _promise
    }

    // fetch
    const promise = old.fetch.apply(window, arguments)
    let $response
    let $error
    promise.then(function(e) {
      $response = e
    }).catch(e => {})

    promise.catch(e => {
      $error = e
    })

    promise.finally(async () => {
      if ($response) {
        response.status = $response.status
        response.statusText = $response.statusText
        response.headers = getHeaders($response.headers)
        response.body = await $response.clone().text()
        response.response = $response
      }

      // after => fakeRes
      const afterReturn = hookList.map(hook => hook.after(request, response))
      const fakeRes = afterReturn.find(e => e)
      if (fakeRes && $response) {
        response.fake = true
        setFakeRes($response, fakeRes)
      }

      if ($response) {
        _resolve($response)
      } else {
        _reject($error)
      }
    })
    .catch(e=>{})

    return _promise
  }
}

if (typeof module === 'object') {
  module.exports = interceptAjax
}
