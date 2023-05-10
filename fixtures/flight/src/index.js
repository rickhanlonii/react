import {use, Suspense, useState, useLayoutEffect, startTransition} from 'react';
import ReactDOM from 'react-dom/client';
import {createFromFetch, encodeReply} from 'react-server-dom-webpack/client';

// TODO: This should be a dependency of the App but we haven't implemented CSS in Node yet.
import './style.css';

let updateRoot;
async function callServer(id, args) {
  const response = fetch(location.href, {
    method: 'POST',
    headers: {
      Accept: 'text/x-component',
      'rsc-action': id,
    },
    body: await encodeReply(args),
  });
  const {returnValue, root} = await createFromFetch(response, {callServer});
  // Refresh the tree with the new RSC payload.
  startTransition(() => {
    updateRoot(root);
  });
  return returnValue;
}

let data = createFromFetch(
  fetch(location.href, {
    headers: {
      Accept: 'text/x-component',
    },
  }),
  {
    callServer,
  }
);

function Shell({data}) {
  const [root, setRoot] = useState(use(data));
  updateRoot = setRoot;
  return root;
}

ReactDOM.hydrateRoot(document, <Shell data={data} />);

// ------ mini-framework ------

window.addEventListener('popstate', function() {
  softNavigate(location.href, false, true);
});

document.addEventListener('click', function() {
  if (event.target.tagName === 'A') {
    softNavigate(event.target.href, true);
    event.preventDefault();
  }
});

document.addEventListener('submit', function onFormSubmit(event) {
  var form = event.target;
  if (form) {
    if (form.method.toUpperCase() === 'GET') {
      if (form.action && form.action.indexOf('javascript:') !== -1) {
        return;
      }
      var url = (form.action || currentUrl).split('?')[0] + '?' + serializeForm(form);
      softNavigate(url);
      if (event.preventDefault) {
        event.preventDefault();
      }
    } 
  }
});

let needsScrollTop = false;

async function softNavigate(url, scrollToTop, isInstant) {
  var baseUrl = 'http://' + location.host;
  if (url.indexOf('/') === 0) {
    url = baseUrl + url;
  }
  const newData = createFromFetch(
    fetch(url, {
      headers: {
        Accept: 'text/x-component',
      },
    }),
    {
      callServer,
    }
  );
  if (isInstant) {
    updateRoot(newData);
  } else {
    startTransition(() => {
      updateRoot(newData);
    });
  }
  // if (scrollToTop) {
  //   await newData;
  //   window.scrollTo(0, 0);      
  // }
  if (window.history.pushState) {
    window.history.pushState(null, null, url)
  }
}

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