# interceptAjax

intercept xhr + fetch

## USAGE

```javascript
off = interceptAjax(before, after)
off = interceptAjax({ before, after })

function before(request) {
  // do something
  return 'FAKE_DATA?'
}
function after(request, response) {
  // do something
  return 'FAKE_DATA?'
}
```

## ARGUMENTS

```javascript
request = {
  method: '',
  url: '',
  headers: {},
  body: '',
  xhr, // xhr
  arguments, // fetch
}

response = {
  headers: {},
  body: '',
  status: 0,
  statusText: '',
  xhr, // xhr
  response, // fetch
}
```

## EXAMPLE

```javascript
// intercept
const off = interceptAjax(
  function before(request) {
    console.info('【request】', request.method, request.url)

    // fake data
    if (/fake/.test(request.url)) {
      return 'FAKE_DATA_BEFORE'
    }
  },
  function after(request, response) {
    console.info('【response】', response)

    // fake data
    if (response.status == 404) {
      return 'FAKE_DATA_AFTER'
    }
  }
)

// fetch
const res = await (await fetch('.?fake=true')).text()
console.log('res:', res) // => FAKE_DATA_BEFORE

// xhr
var xhr = new XMLHttpRequest()
xhr.open('get', '.?fake=true', true)
xhr.onload = (e) => {
  console.log('res:', xhr.response) // => FAKE_DATA_BEFORE
}
xhr.send('data')
```
