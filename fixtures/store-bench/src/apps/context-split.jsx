// Context split into one provider per slice of state, with memoized rows:
// what teams do to make context fast enough today.

import {
  createContext,
  use,
  useState,
  useLayoutEffect,
  memo,
  startTransition,
} from 'react';
import {startBench} from '../shared/harness';
import {
  RowView,
  DetailsView,
  FilterInput,
  CountView,
  countRender,
} from '../shared/views';
import {createEntity, matchesFilter} from '../shared/data';

const EntitiesContext = createContext(null);
const SelectedContext = createContext(null);
const FilterContext = createContext('');
const FilterInputContext = createContext('');
const ExpandedContext = createContext(null);
const DetailsContext = createContext(0);
const LabelsContext = createContext(null);

const box = {setters: null, initial: null, detailsMode: 'component'};

function Details() {
  return <DetailsView details={use(DetailsContext)} />;
}

const Row = memo(function Row({id}) {
  countRender('row');
  const entity = use(EntitiesContext)[id];
  const selected = use(SelectedContext) === id;
  const matches = matchesFilter(entity.label, use(FilterContext));
  const expanded = use(ExpandedContext)[id] === true;
  let details = null;
  let children = null;
  if (expanded) {
    if (box.detailsMode === 'component') {
      children = <Details />;
    } else {
      details = use(DetailsContext);
    }
  }
  return (
    <RowView
      label={entity.label}
      x={entity.x}
      y={entity.y}
      color={entity.color}
      selected={selected}
      matches={matches}
      details={details}>
      {children}
    </RowView>
  );
});

function Count() {
  const labels = use(LabelsContext);
  const filter = use(FilterContext);
  let count = 0;
  for (let i = 0; i < labels.length; i++) {
    if (matchesFilter(labels[i], filter)) {
      count++;
    }
  }
  return <CountView count={count} />;
}

function onFilterChange(value) {
  box.setters.setFilterInput(value);
  startTransition(() => {
    box.setters.setFilter(value);
  });
}

function Filter() {
  return (
    <FilterInput value={use(FilterInputContext)} onChange={onFilterChange} />
  );
}

function App() {
  const [entities, setEntities] = useState(box.initial.entities);
  const [ids, setIds] = useState(box.initial.ids);
  const [labels, setLabels] = useState(box.initial.labels);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('');
  const [filterInput, setFilterInput] = useState('');
  const [expanded, setExpanded] = useState({});
  const [details, setDetails] = useState(0);
  useLayoutEffect(() => {
    box.setters = {
      setEntities,
      setIds,
      setLabels,
      setSelected,
      setFilter,
      setFilterInput,
      setExpanded,
      setDetails,
    };
  }, []);
  return (
    <EntitiesContext value={entities}>
      <SelectedContext value={selected}>
        <FilterContext value={filter}>
          <FilterInputContext value={filterInput}>
            <ExpandedContext value={expanded}>
              <DetailsContext value={details}>
                <LabelsContext value={labels}>
                  <div>
                    <Filter />
                    <Count />
                    <ul>
                      {ids.map(id => (
                        <Row key={id} id={id} />
                      ))}
                    </ul>
                  </div>
                </LabelsContext>
              </DetailsContext>
            </ExpandedContext>
          </FilterInputContext>
        </FilterContext>
      </SelectedContext>
    </EntitiesContext>
  );
}

function createApp(initialEntities, options) {
  const entities = {};
  for (let i = 0; i < initialEntities.length; i++) {
    entities[initialEntities[i].id] = initialEntities[i];
  }
  box.initial = {
    entities,
    ids: initialEntities.map(e => e.id),
    labels: initialEntities.map(e => e.label),
  };
  box.detailsMode = options.details;
  let nextIndex = initialEntities.length;
  const added = [];
  const set = () => box.setters;

  const actions = {
    editEntity(index) {
      const id = 'e' + index;
      set().setEntities(prev => ({
        ...prev,
        [id]: {...prev[id], x: prev[id].x + 1},
      }));
    },
    select(index) {
      set().setSelected('e' + index);
    },
    setFilter(value) {
      set().setFilter(value);
      set().setFilterInput(value);
    },
    expandEvery(k, n) {
      const expanded = {};
      for (let i = 0; i < n; i += k) {
        expanded['e' + i] = true;
      }
      set().setExpanded(expanded);
    },
    tickDetails() {
      set().setDetails(d => d + 1);
    },
    add() {
      const entity = createEntity(nextIndex++);
      added.push(entity.id);
      set().setEntities(prev => ({...prev, [entity.id]: entity}));
      set().setIds(prev => [...prev, entity.id]);
      set().setLabels(prev => [...prev, entity.label]);
    },
    removeLast() {
      const id = added.pop();
      set().setEntities(prev => {
        const next = {...prev};
        delete next[id];
        return next;
      });
      set().setIds(prev => prev.filter(other => other !== id));
      set().setLabels(prev => prev.slice(0, -1));
    },
  };

  return {App, actions};
}

startBench('context-split', createApp);
