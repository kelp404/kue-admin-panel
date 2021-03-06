const binarySearch = require('binary-search');
const classNames = require('classnames');
const React = require('react');
const OverlayTrigger = require('react-bootstrap/OverlayTrigger');
const Tooltip = require('react-bootstrap/Tooltip');
const PropTypes = require('prop-types');
const nprogress = require('nprogress');
const {AutoSizer, List, WindowScroller} = require('react-virtualized');
const TimeAgo = require('react-timeago').default;
const {RouterView, Link, getRouter} = require('capybara-router');
const {jobState} = require('../constants');
const utils = require('../utils');
const Base = require('./shared/base');
const api = require('../api');
const store = require('../store');

const ANIMATE_DURATION = 500; // CSS class: faster.

module.exports = class Jobs extends Base {
  static get propTypes() {
    return {
      jobs: PropTypes.array.isRequired,
      jobQuantity: PropTypes.object.isRequired
    };
  }

  constructor(props) {
    super(props);
    this.state.deleteQuantity = 1000;
    this.deleteTarget = {
      from: null, // Least job index
      to: null // Largest job index
    };
    this.state.jobs = props.jobs;
    this.state.scrollToIndex = -1;
    this.state.rowHeight = props.params.state === jobState.FAILED ? 106 : 81;
    this.listRef = null;
    this.rowRenderer = this.rowRenderer.bind(this);
    this.removeJob = this.removeJob.bind(this);
    this.generateDeleteJobHandler = this.generateDeleteJobHandler.bind(this);
    this.generateRestartJobHandler = this.generateRestartJobHandler.bind(this);
    this.onDeleteQuantityChange = this.onDeleteQuantityChange.bind(this);
    this.onClickCleanJobs = this.onClickCleanJobs.bind(this);
    store.set('$jobQuantity', props.jobQuantity);

    // Job notifications ----------------------------------
    const jobNotificationHandler = job => {
      /*
      @param job {JobModel}
       */
      if (job.state === (props.params.state || jobState.ACTIVE)) {
        if (props.params.type && props.params.type !== job.type) {
          // Different job type.
          return;
        }

        this.insertJob(job);
      } else {
        // The job maybe changes to the other state. We should remote it in the grid.
        this.removeJob(job);
      }
    };

    this.$listens.push(
      api.subscribe(api.eventTypes.JOB_ENQUEUE, job => {
        jobNotificationHandler(job);
      })
    );
    this.$listens.push(
      api.subscribe(api.eventTypes.JOB_START, job => {
        jobNotificationHandler(job);
      })
    );
    this.$listens.push(
      api.subscribe(api.eventTypes.JOB_COMPLETE, job => {
        jobNotificationHandler(job);
      })
    );
    this.$listens.push(
      api.subscribe(api.eventTypes.JOB_FAILED, job => {
        jobNotificationHandler(job);
      })
    );
    this.$listens.push(
      api.subscribe(api.eventTypes.JOB_REMOVE, job => {
        if (this.removeJob(job)) {
          // Decrease the job quantity at the navigation.
          const jobQuantity = store.get('$jobQuantity');
          jobQuantity[(props.params.state || jobState.ACTIVE)] -= 1;
          store.set('$jobQuantity', jobQuantity);
        }
      })
    );
    // ----------------------------------------------------
  }

  insertJob(job) {
    /*
    @param job {JobModel}
     */
    let jobIndex;

    if (this.props.params.sort === 'asc') {
      jobIndex = binarySearch(this.state.jobs, job, (a, b) => a.id - b.id);
    } else {
      jobIndex = binarySearch(this.state.jobs, job, (a, b) => b.id - a.id);
    }

    if (jobIndex >= 0) {
      // The job is already exists.
      return this.updateJob(jobIndex, job);
    }

    jobIndex = -jobIndex - 1;

    this.setState(prevState => {
      const nextState = Object.assign({}, prevState);
      job.animateInsert = true;
      nextState.jobs.splice(jobIndex, 0, job);
      return nextState;
    });
    this.listRef.forceUpdateGrid();
    setTimeout(() => {
      delete job.animateInsert;
      this.listRef.forceUpdateGrid();
    }, ANIMATE_DURATION);
  }

  updateJob(index, job) {
    /*
    Update the job in the grid.
    @param index {Number}
    @param job {JobModel}
     */
    this.setState(prevState => {
      const nextState = Object.assign({}, prevState);
      job.animateUpdate = true;
      nextState.jobs[index] = job;
      return nextState;
    });
    this.listRef.forceUpdateGrid();
    setTimeout(() => {
      delete job.animateUpdate;
      this.listRef.forceUpdateGrid();
    }, ANIMATE_DURATION);
  }

  removeJob(job) {
    /*
    Remove the job in the grid with the animation.
    @param job {JobModel}
     */
    let comparator;
    if (this.props.params.sort === 'asc') {
      comparator = (a, b) => a.id - b.id;
    } else {
      comparator = (a, b) => b.id - a.id;
    }

    const jobIndex = binarySearch(this.state.jobs, job, comparator);
    if (jobIndex < 0) {
      return false;
    }

    this.setState(prevState => {
      const nextState = Object.assign({}, prevState);
      job = nextState.jobs[jobIndex];
      job.animateDelete = true;
      return nextState;
    });
    this.listRef.forceUpdateGrid();
    setTimeout(() => {
      const jobIndex = this.state.jobs.findIndex(x => x.animateDelete);
      if (jobIndex < 0) {
        return;
      }

      this.setState(prevState => {
        const nextState = Object.assign({}, prevState);
        nextState.jobs.splice(jobIndex, 1);
        return nextState;
      });
    }, ANIMATE_DURATION);
    return true;
  }

  generateDeleteJobHandler(index) {
    /*
    Generate a handler for the delete job button.
    @param index {Number} The index of state.jobs.
    @returns {Function}
     */
    return () => {
      const job = this.state.jobs[index];

      nprogress.start();
      api.job.deleteJob(job.id)
        .catch(error => {
          getRouter().renderError(error);
        })
        .finally(nprogress.done);
    };
  }

  generateRestartJobHandler(index) {
    /*
    Generate a handler for the restart job button.
    @param index {Number} The index of state.jobs.
    @returns {Function}
     */
    return () => {
      const job = this.state.jobs[index];

      nprogress.start();
      api.job.restartJob(job.id)
        .then(() => {
          // Decrease the job quantity at the navigation.
          const jobQuantity = store.get('$jobQuantity');
          jobQuantity[job.state] -= 1;
          store.set('$jobQuantity', jobQuantity);
        })
        .catch(error => {
          getRouter().renderError(error);
        })
        .finally(nprogress.done);
    };
  }

  onDeleteQuantityChange(event) {
    /*
    The user change the delete quantity value.
     */
    if (/^\d+$/.test(event.target.value)) {
      let value = parseInt(event.target.value, 10);
      if (Number.isNaN(value)) {
        return;
      }

      this.setState({deleteQuantity: value});
    } else if (event.target.value === '') {
      this.setState({deleteQuantity: 0});
    }
  }

  onClickCleanJobs() {
    /*
    The user click the clean jobs button.
     */
    nprogress.start();
    const jobs = [];
    const step = this.deleteTarget.from < this.deleteTarget.to ? 1 : -1;
    for (
      let index = this.deleteTarget.from;
      step > 0 ? index <= this.deleteTarget.to : index >= this.deleteTarget.to;
      index += step
    ) {
      if (!this.state.jobs[index].animateDelete) {
        jobs.push(this.state.jobs[index]);
      }
    }

    Promise.all(jobs.map(job => api.job.deleteJob(job.id)))
      .catch(error => {
        getRouter().renderError(error);
      })
      .finally(nprogress.done);
  }

  rowRenderer({index, key, style}) {
    const job = this.state.jobs[index];
    const detailLinkParams = {...this.props.params, jobId: job.id};
    const className = classNames([
      'list-group-item',
      {
        'animated faster zoomOutDown': job.animateDelete,
        'animated faster fadeIn': job.animateUpdate,
        'animated faster zoomIn': job.animateInsert
      }
    ]);
    let shortErrorMessage;
    if (this.props.params.state === jobState.FAILED && job.error) {
      shortErrorMessage = `${job.error}`.match(/^(.*)\n?/)[1];
    }

    return (
      <div key={key} className={className} style={{
        ...style,
        height: index < this.state.jobs.length - 1 ? style.height + 1 : style.height
      }}
      >
        <div className="d-flex justify-content-between">
          <div className="text-truncate">
            <h5 className="mb-1 text-truncate">
              <Link to={{name: 'web.jobs.details', params: detailLinkParams}}>#{job.id}</Link> <small className="text-secondary">{job.type}</small>
            </h5>
            {
              shortErrorMessage && (
                <p className="mb-1 text-dark text-truncate">{shortErrorMessage}</p>
              )
            }
          </div>

          {/* Action buttons */}
          <div className="ml-auto text-right" style={{width: '120px', minWidth: '120px'}}>
            <OverlayTrigger placement="bottom" overlay={<Tooltip>Details</Tooltip>}>
              <Link to={{name: 'web.jobs.details', params: detailLinkParams}} className="btn btn-outline-secondary btn-sm"><i className="fas fa-fw fa-info-circle"/></Link>
            </OverlayTrigger>
            &nbsp;
            <OverlayTrigger placement="bottom" overlay={<Tooltip>Restart</Tooltip>}>
              <button className="btn btn-outline-primary btn-sm"
                type="button" style={{boxShadow: 'none'}}
                onClick={this.generateRestartJobHandler(index)}
              >
                <i className="fas fa-fw fa-redo"/>
              </button>
            </OverlayTrigger>
            &nbsp;
            <OverlayTrigger placement="bottom" overlay={<Tooltip>Delete</Tooltip>}>
              <button className="btn btn-outline-danger btn-sm"
                type="button" style={{boxShadow: 'none'}}
                onClick={this.generateDeleteJobHandler(index)}
              >
                <i className="far fa-fw fa-trash-alt"/>
              </button>
            </OverlayTrigger>
          </div>
        </div>
        <small className="text-secondary">
          <OverlayTrigger placement="right"
            overlay={<Tooltip>{utils.formatDate(job.updatedAt)}</Tooltip>}
          >
            <TimeAgo date={job.updatedAt} className="pr-1" title=""/>
          </OverlayTrigger>
        </small>
      </div>
    );
  }

  render() {
    const sort = this.props.params.sort || 'desc';
    const classTable = {
      ascLink: classNames([
        'btn btn-secondary',
        {active: sort === 'asc'}
      ]),
      descLink: classNames([
        'btn btn-secondary',
        {active: sort === 'desc'}
      ])
    };

    const disableCleanJobsButton =
      !this.state.jobs.length || !this.state.jobs.find(x => !x.animateDelete) ||
      this.state.deleteQuantity <= 0 || this.state.$isApiProcessing;
    let deleteJobsTooltip;
    if (this.state.deleteQuantity > 0 && this.state.jobs.length) {
      if (sort === 'asc') {
        this.deleteTarget.from = 0;
        this.deleteTarget.to = this.state.deleteQuantity >= this.state.jobs.length ?
          this.state.jobs.length - 1 :
          this.state.deleteQuantity - 1;
      } else {
        this.deleteTarget.from = this.state.jobs.length - 1;
        const lastIndex = this.state.jobs.length - this.state.deleteQuantity;
        this.deleteTarget.to = lastIndex < 0 ? 0 : lastIndex;
      }

      const firstJob = this.state.jobs[this.deleteTarget.from];
      const lastJob = this.state.jobs[this.deleteTarget.to];
      deleteJobsTooltip = `Delete jobs #${firstJob.id} ~ #${lastJob.id}.`;
    }

    return (
      <>
        <div className="d-flex justify-content-between mb-3">
          <div className="btn-group">
            <Link to={{
              name: 'web.jobs',
              params: {state: this.props.params.state, type: this.props.params.type, sort: 'asc'}
            }} className={classTable.ascLink}
            >ASC
            </Link>
            <Link to={{
              name: 'web.jobs',
              params: {state: this.props.params.state, type: this.props.params.type, sort: 'desc'}
            }} className={classTable.descLink}
            >DESC
            </Link>
          </div>
          <div className="ml-auto">
            <div className="input-group">
              <input type="text" className="form-control"
                value={this.state.deleteQuantity} onChange={this.onDeleteQuantityChange}/>
              <div className="input-group-append">
                {
                  deleteJobsTooltip && (
                    <OverlayTrigger placement="bottom" overlay={<Tooltip>{deleteJobsTooltip}</Tooltip>}>
                      <button className="btn btn-outline-danger" type="button"
                        disabled={disableCleanJobsButton}
                        onClick={this.onClickCleanJobs}
                      >
                        Clean jobs
                      </button>
                    </OverlayTrigger>
                  )
                }
                {
                  !deleteJobsTooltip && (
                    <button className="btn btn-outline-danger" type="button"
                      disabled={disableCleanJobsButton}
                      onClick={this.onClickCleanJobs}
                    >
                      Clean jobs
                    </button>
                  )
                }
              </div>
            </div>
          </div>
        </div>

        <WindowScroller scrollElement={window}>
          {({height, isScrolling, registerChild, onChildScroll, scrollTop}) => (
            <div>
              <AutoSizer disableHeight>
                {({width}) => (
                  <div ref={registerChild}>
                    <List
                      ref={el => {
                        this.listRef = el;
                      }}
                      autoHeight
                      height={height}
                      className="list-group"
                      isScrolling={isScrolling}
                      overscanRowCount={2}
                      rowCount={this.state.jobs.length}
                      tabIndex={null}
                      rowRenderer={this.rowRenderer}
                      scrollToIndex={this.state.scrollToIndex}
                      scrollTop={scrollTop}
                      width={width}
                      rowHeight={this.state.rowHeight}
                      onScroll={onChildScroll}
                    />
                  </div>
                )}
              </AutoSizer>
            </div>
          )}
        </WindowScroller>
        {
          !this.state.jobs.length && (<p className="text-center text-secondary p-5 h3">Empty</p>)
        }
        <RouterView/>
      </>
    );
  }
};
