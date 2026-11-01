// Frame entry for the "stores" panel of the "who re-renders" demo.

import * as variant from './stores.jsx';
import {createRerenderDemo} from './demo';
import {connect} from '../frames/glue';

connect('rerenders', env => createRerenderDemo(variant, env));
