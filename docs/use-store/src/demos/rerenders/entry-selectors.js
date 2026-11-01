// Frame entry for the "selectors" panel of the "who re-renders" demo.

import * as variant from './selectors.jsx';
import {createRerenderDemo} from './demo';
import {connect} from '../frames/glue';

connect('rerenders', env => createRerenderDemo(variant, env));
