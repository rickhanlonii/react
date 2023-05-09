import * as React from 'react'
import AllPostsPage from './AllPostsPage.js';
import PostPage from './PostPage.js';

export default function App({ searchParams, pathname }) {
  let page;
  if (pathname === '/') {
    page = <AllPostsPage searchParams={searchParams} />
  } else if (pathname.startsWith('/post/')) {
    const slug = pathname.slice('/post/'.length)
    page = <PostPage slug={slug} />
  }
  return (
    <html>
      <body>
        {page}
        <div dangerouslySetInnerHTML={{
        __html: `
<script>

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

function createTree(reactNode) {
  if (typeof reactNode === 'string') {
    return document.createTextNode(reactNode);
  } else if (typeof reactNode === 'object') {
    const node = document.createElement(reactNode.type);
    updateTree(node, reactNode);
    return node;
  } else {
    console.log(reactNode);
    throw Error("Don't know what to do");
  }
}

function canReuseNode(node, reactNode) {
  if (node.childNodes && typeof reactNode === 'object' && reactNode != null) {
    return node.tagName.toLowerCase() === reactNode.type;
  } else if ('textContent' in node && typeof reactNode === 'string') {
    return true;
  } else {
    return false;
  }
}

function updateTree(node, reactNode) {
  var props = reactNode.props;
  if (props) {
    for (var key in props) {
      if (props.hasOwnProperty(key)) {
        var value = reactNode.props[key];
        if (node[key] !== value) {
          node[key] = value;
        }
      }
    }
  }

  var children = (props && props.children) ? props.children : [];
  if (typeof children === 'object' && !Array.isArray(children)) {
    children = [children];
  }

  var newChild;
  if (typeof children === 'string') {
    node.textContent = children;
  } else if (Array.isArray(children)) {
    children = children.flat();
    if (node.childNodes) {
      var savedChildNodes = Array.prototype.slice.call(node.childNodes);
      for (var i = 0; i < children.length; i++) {
        if (savedChildNodes[i]) {
          if (canReuseNode(savedChildNodes[i], children[i])) {
            updateTree(savedChildNodes[i], children[i]);
          } else {
            newChild = createTree(children[i]);
            node.insertBefore(newChild, savedChildNodes[i]);
            node.removeChild(savedChildNodes[i]);
          }
        } else {
          newChild = createTree(children[i]);
          node.appendChild(newNode);
        }
      }
      while (node.childNodes.length > children.length) {
        node.removeChild(node.lastChild);
      }
      while (children.length > node.childNodes.length) {
        node.appendChild(createTree(children[i]));
      }    
    } else {
      throw Error('Cannot have children');
    }
  }
}


document.body.onclick = function() {
  if (event.srcElement.tagName === 'A') {
    var url = event.srcElement.href.replace('3000', '3001');
    fetchIE6(url, function(response) {
      var json = eval('({' + response.split('\\n').join(',') + '})');
      var reactTree = reviveValue(json[0]);
      updateTree(document.body, reactTree.props.children);

      function reviveValue(val) {
        if (Array.isArray(val)) {
          if (val[0] === '$') {
            const [type, key, props] = val.slice(1);
            return reviveValue({type, key, props});
          } else {
            return val.map(v => reviveValue(v));
          }
        } else if (typeof val === 'object' && val != null) {
          let obj = {};
          for (let key in val) {
            if (val.hasOwnProperty(key)) {
              obj[key] = reviveValue(val[key]);
            }
          }
          return obj;
        } else if (typeof val === 'string' && val.startsWith('$L')) {
          const slotIndex = parseInt(val.slice(2), 10);
          return reviveValue(json[slotIndex]);
        } else {
          return val;
        }
      }

    });
    return false;
  }
};

function fetchIE6(url, callback) {
  fetch('http://localhost:3001/?query=hel').then(x => x.text()).then(callback);
  return;


  var xhr = new ActiveXObject('Microsoft.XMLHTTP');  
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4 && xhr.status === 200) {
      callback(xhr.responseText);
    }
  };
  xhr.open('GET', url, true);
  xhr.send();
}

</script>
        `
        }} />
      </body>
    </html>
  )
}



