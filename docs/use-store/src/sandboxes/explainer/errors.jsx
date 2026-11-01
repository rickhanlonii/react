import {use, Component, unstable_createStore as createStore} from 'react';

function reducer(state, action) {
  if (action === 'explode') {
    throw new Error('The reducer threw');
  }
  return state + action;
}
const count = createStore(0, reducer);
const unread = createStore(0, reducer);

class Boundary extends Component {
  state = {error: null};
  static getDerivedStateFromError(error) {
    return {error};
  }
  render() {
    if (this.state.error) {
      return (
        <button className="retry" onClick={() => this.setState({error: null})}>
          Caught "{this.state.error.message}". Try again
        </button>
      );
    }
    return this.props.children;
  }
}

function Count() {
  return <p className="count">Count: {use(count)}</p>;
}

export default function App() {
  return (
    <>
      <button className="add" onClick={() => count.update(1)}>
        Add one
      </button>
      <button className="explode" onClick={() => count.update('explode')}>
        Throw in the reducer
      </button>
      <button
        className="unread"
        onClick={() => {
          try {
            unread.update('explode');
          } catch (error) {
            log('store.update threw: ' + error.message);
          }
        }}>
        Throw in a store nothing reads
      </button>
      <Boundary>
        <Count />
      </Boundary>
    </>
  );
}
