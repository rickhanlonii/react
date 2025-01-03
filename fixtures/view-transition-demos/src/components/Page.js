import React, {
  unstable_ViewTransition as ViewTransition,
  startTransition,
} from 'react';

import './Page.css';

const initalCards = {
  1: {name: 'card-1', bg: 'tan'},
  2: {name: 'card-2', bg: 'khaki'},
  3: {name: 'card-3', bg: 'thistle'},
  4: {name: 'card-4', bg: 'wheat'},
};

// React impl of https://view-transitions.chrome.dev/cards/spa/

export default function Page() {
  const [cards, setCards] = React.useState(initalCards);

  function handleAdd() {
    const count = Object.keys(cards).length;
    const newCard = {
      name: `card-${count + 1}`,
      bg: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
    };
    startTransition(() => {
      setCards({
        ...cards,
        [count + 1]: newCard,
      });
    });
  }

  function handleDelete(id) {
    startTransition(() => {
      const newCards = {...cards};
      delete newCards[id];
      setCards(newCards);
    });
  }
  return (
    <React.Fragment>
      <button className="add-btn" onClick={handleAdd}>
        <span className="sr-only">Add</span>
      </button>
      <ul className="cards">
        {Object.keys(cards).map(key => {
          {
            const card = cards[key];
            return (
              <ViewTransition>
                <li
                  className="card"
                  style={{
                    'view-transition-name': card.name,
                    'background-color': card.bg,
                  }}>
                  <button
                    className="delete-btn"
                    onClick={() => {
                      handleDelete(key);
                    }}>
                    <span className="sr-only">Delete</span>
                  </button>
                </li>
              </ViewTransition>
            );
          }
        })}
      </ul>

      <footer>
        <p>
          Icons from{' '}
          <a href="https://www.iconfinder.com/iconsets/ionicons-outline-vol-1">
            Ionicons Outline Vol.1
          </a>
          , licensed under the{' '}
          <a href="https://opensource.org/license/MIT">MIT license</a>.
        </p>
      </footer>
    </React.Fragment>
  );
}
