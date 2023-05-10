
if (!Array.prototype.flat) {
  Array.prototype.flat = function(depth) {

    'use strict';

    // If no depth is specified, default to 1
    if (depth === undefined) {
      depth = 1;
    }

    // Recursively reduce sub-arrays to the specified depth
    var flatten = function (arr, depth) {

      // If depth is 0, return the array as-is
      if (depth < 1) {
        return arr.slice();
      }

      // Otherwise, concatenate into the parent array
      return arr.reduce(function (acc, val) {
        return acc.concat(Array.isArray(val) ? flatten(val, depth - 1) : val);
      }, []);

    };

    return flatten(this, depth);

  };
}

if (!Array.prototype.filter) {
  Array.prototype.filter = function(func, thisArg) {
    'use strict';
    if (!((typeof func === 'Function' || typeof func === 'function') && this))
      throw new TypeError();
    
    var len = this.length >>> 0,
        res = new Array(len), // preallocate array
        t = this, c = 0, i = -1;
    if (thisArg === undefined) {
      while (++i !== len)
        // checks to see if the key was set
        if (i in this) {
          if (func(t[i], i, t))
            res[c++] = t[i];
        }
    } else {
      while (++i !== len)
        // checks to see if the key was set
        if (i in this) {
          if (func.call(thisArg, t[i], i, t))
            res[c++] = t[i];
        }
    }
    
    res.length = c; // shrink down array to proper size
    return res;
  };
}

if (!Array.isArray) {
  Array.isArray = function(arg) {
    return Object.prototype.toString.call(arg) === '[object Array]';
  };
}

if (!Array.prototype.map) {
  Array.prototype.map = function(callback, thisArg) {
    if (this == null) {
      throw new TypeError('Array.prototype.map called on null or undefined');
    }
    if (typeof callback !== 'function') {
      throw new TypeError(callback + ' is not a function');
    }
    var sourceArray = Object(this);
    var len = sourceArray.length >>> 0;
    var resultArray = new Array(len);
    var k = 0;
    while (k < len) {
      if (k in sourceArray) {
        var kValue = sourceArray[k];
        resultArray[k] = callback.call(thisArg, kValue, k, sourceArray);
      }
      k++;
    }
    return resultArray;
  };
}

if (!Array.prototype.reduce) {
  Array.prototype.reduce = function(callback, initialValue) {
    if (this === null) {
      throw new TypeError('Array.prototype.reduce called on null or undefined');
    }
    if (typeof callback !== 'function') {
      throw new TypeError(callback + ' is not a function');
    }

    var sourceArray = Object(this);
    var len = sourceArray.length >>> 0;
    var k = 0;
    var accumulator;

    if (initialValue !== undefined) {
      accumulator = initialValue;
    } else {
      while (k < len && !(k in sourceArray)) {
        k++;
      }
      if (k >= len) {
        throw new TypeError('Reduce of empty array with no initial value');
      }
      accumulator = sourceArray[k++];
    }

    while (k < len) {
      if (k in sourceArray) {
        accumulator = callback(accumulator, sourceArray[k], k, sourceArray);
      }
      k++;
    }
    return accumulator;
  };
}

function createTree(reactNode) {
  if (typeof reactNode === 'string') {
    return document.createTextNode(reactNode);
  } else if (typeof reactNode === 'object') {
    var node = document.createElement(reactNode.type);
    updateTree(node, reactNode);
    return node;
  } else {
    throw Error('idk')
  }
}

function canReuseNode(node, reactNode) {
  if (node.nodeType === 1 && typeof reactNode === 'object' && reactNode != null) {
    return node.tagName.toLowerCase() === reactNode.type;
  } else if (node.nodeType === 3 && typeof reactNode === 'string') {
    return true;
  } else {
    return false;
  }
}

if (!window.console) {
  var logs = [];
  window.console = {
    log: function(msg) {
      logs.push(msg);
      // debounceAlert();
    }
  }

  var alertId
  function debounceAlert() {
    clearTimeout(alertId)
    alertId = setTimeout(function() {
      alert(logs.join('\n'));
      logs = [];
    })
  }
}

function updateTree(node, reactNode) {
  if (typeof reactNode === 'string') {
    if (node.nodeType !== 3) {
      throw Error('Cannot do that');
    }
    node.nodeValue = reactNode;
    return;
  }

  var props = reactNode.props;
  if (props) {
    for (var key in props) {
      if (props.hasOwnProperty(key)) {
        if (key === 'children') continue;
        var value = reactNode.props[key];
        if (node[key] !== value) {
          if (key === 'style') {
            for (var styleKey in value) {
              if (value.hasOwnProperty(styleKey)) {
                node.style[styleKey] = value[styleKey];
              }
            }
          } else {
            if (key in node) {
              if (typeof node[key] === 'string' && value == null) {
                node[key] = ''
              } else {
                node[key] = value;
              }
            }
          }
        }
      }
    }
  }

  var children = (props && props.children) ? props.children : [];
  if (!Array.isArray(children)) {
    children = [children];
  }

  children = children.flat();

  console.log('start reconciling ' + node.tagName)
  if (node.childNodes) {
    var savedChildNodes = [];
    for (var j = 0; j < node.childNodes.length; j++) {
      savedChildNodes.push(node.childNodes[j]);
    }

    console.log('react children: ' + children.length)
    console.log('dom children: ' + savedChildNodes.length)

    for (var i = 0; i < children.length; i++) {
      if (savedChildNodes[i]) {
        if (canReuseNode(savedChildNodes[i], children[i])) {
          console.log('reusing node for child ' + i)
          updateTree(savedChildNodes[i], children[i]);
        } else {
          console.log('replacing node for child ' + i)
          newChild = createTree(children[i]);
          node.insertBefore(newChild, savedChildNodes[i]);
          node.removeChild(savedChildNodes[i]);
        }
      } else {
        console.log('appending node for child ' + i)
        newChild = createTree(children[i]);
        node.appendChild(newChild);
      }
    }
    while (node.childNodes.length > children.length) {
      console.log('removing extra dom nodes')
      node.removeChild(node.lastChild);
    } 
  } else {
    throw Error('Cannot have children');
  }
  console.log('end reconciling ' + node.tagName)
}

document.body.onclick = function() {
  if (event.srcElement.tagName === 'A') {
    softNavigate(event.srcElement.href);
    return false;
  }
};

function serializeForm(form) {
  var queryString = [];
  for (var i = 0; i < form.elements.length; i++) {
    var element = form.elements[i];
    if (element.type !== 'submit' && element.name) {
      queryString.push(encodeURIComponent(element.name) + '=' + encodeURIComponent(element.value));
    }
  }
  return queryString.join('&');
}

function onFormSubmit(event) {
  var form = event.target || event.srcElement;
  if (form) {
    if (form.method.toUpperCase() === 'GET') {
      var url = (form.action || currentUrl).split('?')[0] + '?' + serializeForm(form);
      softNavigate(url);
      if (event.preventDefault) {
        event.preventDefault();
      }
      return false;
    } else if (form.method.toUpperCase() === 'POST') {
      var formData = serializeForm(form);
      var actionUrl = form.action || currentUrl;
      form.reset();
      sendPostRequest(actionUrl, formData, handleResponseOutput);
      if (event.preventDefault) {
        event.preventDefault();
      }
      return false;
    }
  }
}

if (window.history.pushState) {
  window.addEventListener('popstate', function() {
    softNavigate(location.href);
  })
}

var currentUrl = location.href;

function softNavigate(url) {
  var baseUrl = currentUrl.split('?')[0];
  if (url.indexOf('/') === 0) {
    url = baseUrl + url.slice(1);
  }
  currentUrl = url;
  sendGetRequest(url, handleResponseOutput);
  if (window.history.pushState) {
    window.history.pushState(null, null, url)
  }
}

function sendGetRequest(url, callback) {
  url = url.replace('3000', '3001');
  if (window.fetch) {
    fetch(url).then(function(response) { return response.text(); }).then(callback);
  } else {
    var xhr = new ActiveXObject('Microsoft.XMLHTTP');
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        callback(xhr.responseText);
      }
    };
    if (url.indexOf('?') !== -1) {
      url += '&';
    } else {
      url += '?'
    }
    xhr.open('GET', url + 'rnd=' + Math.random(), true);
    xhr.send();
  }
}

function sendPostRequest(url, data, callback) {
  var baseUrl = currentUrl.split('?')[0];
  if (url.indexOf('/') === 0) {
    url = baseUrl + url.slice(1);
  }
  url = url.replace('3000', '3001');
  if (window.fetch) {
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: data
    }).then(function(response) { return response.text(); }).then(callback);
  } else {
    var xhr = new ActiveXObject('Microsoft.XMLHTTP');
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        callback(xhr.responseText);
      }
    };
    if (url.indexOf('/') === 0) {
      var baseUrl = currentUrl.split('?')[0];
      url = baseUrl + url.slice(1);
    }
    url = url.replace('3000', '3001');
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
    xhr.send(data);
  }
}

function handleResponseOutput(response) {
  var json = eval('({' + response.split('\n').filter(Boolean).join(',') + '})');
  var reactTree = reviveValue(json[0]);
  updateTree(document.body, reactTree.props.children);

  function reviveValue(val) {
    if (Array.isArray(val)) {
      if (val[0] === '$') {
        var el = reviveValue({type: val[1], key: val[2], props: val[3]});
        if (el.type === 'form' && val[3] && typeof val[3].action === 'string' && val[3].action.indexOf('$F') === 0) {
          var slotIndex2 = val[3].action.slice(2);
          el.props.action = '';
          el.props.encType = 'multipart/form-data';
          el.props.method = 'POST';
          el.props.children.splice(0, 0, {
            type: 'input',
            props: {
              type: 'hidden',
              name: '$ACTION_ID_' + json[slotIndex2].id
            }
          });
        }
        return el;
      } else {
        return val.map(reviveValue);
      }
    } else if (typeof val === 'object' && val != null) {
      var obj = {};
      for (var key in val) {
        if (val.hasOwnProperty(key)) {
          obj[key] = reviveValue(val[key]);
        }
      }
      return obj;
    } else if (typeof val === 'string' && val.indexOf('$L') === 0) {
      var slotIndex = parseInt(val.slice(2), 10);
      return reviveValue(json[slotIndex]);
    } else if (typeof val === 'string' && val.indexOf('$F') === 0) {
      return "";
    } else if (val === '$undefined') {
      return undefined;
    } else {
      return val;
    }
  }
}

function attachSubmitHandlerToForms() {
  var forms = document.getElementsByTagName('form');
  for (var i = 0; i < forms.length; i++) {
    if (!forms[i].submitHandlerAttached) {
      if (forms[i].attachEvent) {
        forms[i].attachEvent('onsubmit', onFormSubmit);
      } else {
        forms[i].addEventListener('submit', onFormSubmit, false);
      }
      forms[i].submitHandlerAttached = true;
    }
  }
}

// Initial attachment of event listeners
attachSubmitHandlerToForms();

// Periodically check for new forms and attach the event listener
setInterval(attachSubmitHandlerToForms, 1000);

