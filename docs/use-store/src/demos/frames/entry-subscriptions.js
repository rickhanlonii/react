// Frame entry for the subscriptions explainer.

'use strict';

const {connect} = require('./glue');
const {createSubscriptionDemo} = require('./subscriptions');

connect('subscriptions', createSubscriptionDemo);
