// Frame entry for the tearing explainer.

'use strict';

const {connect} = require('./glue');
const {createTearingDemo} = require('./tearing');

connect('tearing', createTearingDemo);
