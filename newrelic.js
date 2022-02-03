'use strict'
/**
 * New Relic agent configuration.
 *
 * See lib/config/default.js in the agent distribution for a more complete
 * description of configuration variables and their potential values.
 */
exports.config = {
  /**
   * Array of application names.
   */
  app_name: ['Yoroi-Backend'],
  /**
   * Your New Relic license key.
   */
  license_key: process.env.NEWRELIC_LICENSE,

  transaction_tracer: {
    /**
     * Whether to collect & submit slow transaction traces to New Relic. The
     * instrumentation is loaded regardless of this setting, as it's necessary
     * to gather metrics. Disable the agent to prevent the instrumentation from
     * loading.
     *
     * @env NEW_RELIC_TRACER_ENABLED
     */
    enabled: true,
    /**
     * The duration at below which the slow transaction tracer should collect a
     * transaction trace. If set to 'apdex_f', the threshold will be set to
     * 4 * apdex_t, which with a default apdex_t value of 500 milliseconds will
     * be 2 seconds.
     *
     * If a time is provided, it is set in seconds.
     *
     * @env NEW_RELIC_TRACER_THRESHOLD
     */
    transaction_threshold: 'apdex_f',
    /**
     * Increase this parameter to increase the diversity of the slow
     * transaction traces recorded by your application over time. Confused?
     * Read on.
     *
     * Transactions are named based on the request (see the README for the
     * details of how requests are mapped to transactions), and top_n refers to
     * the "top n slowest transactions" grouped by these names. The module will
     * only replace a recorded trace with a new trace if the new trace is
     * slower than the previous slowest trace of that name. The default value
     * for this setting is 20, as the transaction trace view page also defaults
     * to showing the 20 slowest transactions.
     *
     * If you want to record the absolute slowest transaction over the last
     * minute, set top_n to 0 or 1. This used to be the default, and has a
     * problem in that it will allow one very slow route to dominate your slow
     * transaction traces.
     *
     * The module will always record at least 5 different slow transactions in
     * the reporting periods after it starts up, and will reset its internal
     * slow trace aggregator if no slow transactions have been recorded for the
     * last 5 harvest cycles, restarting the aggregation process.
     *
     * @env NEW_RELIC_TRACER_TOP_N
     */
    top_n: 20,
 
    /**
     * This option affects both slow-queries and record_sql for transaction
     * traces.  It can have one of 3 values: 'off', 'obfuscated' or 'raw'
     * When it is 'off' no slow queries will be captured, and backtraces
     * and sql will not be included in transaction traces.  If it is 'raw'
     * or 'obfuscated' and other criteria (slow_sql.enabled etc) are met
     * for a query. The raw or obfuscated sql will be included in the
     * transaction trace and a slow query sample will be collected.
     */
    record_sql: 'raw',
 
    /**
     * This option affects both slow-queries and record_sql for transaction
     * traces.  This is the minimum duration a query must take (in ms) for it
     * to be considered for for slow query and inclusion in transaction traces.
     */
    explain_threshold: 10
  },
  slow_sql : { enabled: true }, 
  /**
   * This setting controls distributed tracing.
   * Distributed tracing lets you see the path that a request takes through your
   * distributed system. Enabling distributed tracing changes the behavior of some
   * New Relic features, so carefully consult the transition guide before you enable
   * this feature: https://docs.newrelic.com/docs/transition-guide-distributed-tracing
   * Default is true.
   */
  distributed_tracing: {
    /**
     * Enables/disables distributed tracing.
     *
     * @env NEW_RELIC_DISTRIBUTED_TRACING_ENABLED
     */
    enabled: true
  },
  logging: {
    /**
     * Level at which to log. 'trace' is most useful to New Relic when diagnosing
     * issues with the agent, 'info' and higher will impose the least overhead on
     * production applications.
     */
    level: 'info'
  },
  /**
   * When true, all request headers except for those listed in attributes.exclude
   * will be captured for all traces, unless otherwise specified in a destination's
   * attributes include/exclude lists.
   */
  allow_all_headers: true,
  attributes: {
    /**
     * Prefix of attributes to exclude from all destinations. Allows * as wildcard
     * at end.
     *
     * NOTE: If excluding headers, they must be in camelCase form to be filtered.
     *
     * @env NEW_RELIC_ATTRIBUTES_EXCLUDE
     */
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*',
      'response.headers.x*'
    ]
  }
}
