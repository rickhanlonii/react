// Frame entry for the queue explainer.

'use strict';

const {connect} = require('./glue');
const {createQueueDemo} = require('./queue');

connect('queue', createQueueDemo);
