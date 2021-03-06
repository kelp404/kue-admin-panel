const v = require('../');

module.exports = v.compile({
  state: {
    type: 'enum',
    empty: false,
    values: ['inactive', 'active', 'complete', 'failed', 'delayed']
  },
  type: {
    type: 'string',
    optional: true
  },
  sort: {
    type: 'enum',
    optional: true,
    values: ['asc', 'desc']
  }
});
