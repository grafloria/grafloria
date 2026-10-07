// Workflow automation builder — what a step can be, and the sample workflow.
// (A TypeScript copy of demos/interaction/workflow-builder-catalog.js; the same
// file sits next to the demo in the React, Vue, Angular and Qwik apps.)
//
// Framework-free data + pure functions: the page paints steps from these
// definitions, the property panel builds its form from `fields`, the canvas
// label is `summary(props)`, and Test workflow asks `simulate()` what a step
// does with the sample commit and the simulated health result.

export type Props = Record<string, any>;
/** A Switch output's rule: `metric op value`; null on the "else" output. */
export interface Rule { metric: string; op: string; value: number }
export interface Output { id: string; label: string; rule?: Rule | null }
/** A step's data — what a node carries in `node.data`. */
export interface StepData { action: string; props: Props; outputs?: Output[] }
export interface Field {
  key: string; label: string; type: 'text' | 'select' | 'number' | 'textarea';
  required?: boolean; placeholder?: string; options?: string[]; optionLabels?: Record<string, string>;
}
/** What Test workflow simulates: the commit that set it off and the health result. */
export interface Sim { commit: { message: string; branch: string; author: string }; health: string }
export interface RunResult { msg?: string; out?: string }
export interface Action {
  cat: string; kind: 'trigger' | 'app' | 'condition' | 'switch'; app: string; label: string; icon: string;
  fields: Field[]; defaults: () => Props; outputs?: () => Output[];
  summary: (p: Props) => string; run: (p: Props, c: Sim, outputs: Output[]) => RunResult;
}
export interface DocStep { id: string; x: number; y: number; data: StepData }
export interface DocLink { id: string; s: string; t: string }
export interface DocNote { id: string; title: string; text: string; members: string[]; frame?: { x: number; y: number; width: number; height: number } }
/** The workflow as plain data: what an undo step holds and Load rebuilds. */
export interface WorkflowDoc { v: number; title: string; steps: DocStep[]; links: DocLink[]; notes: DocNote[] }

/** The menu's sections, in order. */
export const CATEGORIES = ['Triggers', 'Logic', 'Deploy', 'Monitoring', 'Incidents', 'Tickets', 'Messaging'];

const cap = (s: unknown): string => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
const repoName = (p: unknown): string => String(p || '').split('/').filter(Boolean).pop() || 'repository';

/** Switch rules read these metrics from the simulated health check. */
export const METRICS = [
  { key: 'error_rate', label: 'error rate', unit: '%' },
  { key: 'latency_p95', label: 'p95 latency', unit: 'ms' },
  { key: 'pods_ready', label: 'pods ready', unit: '%' },
];
export const RULE_OPS = ['<', '<=', '>', '>=', '='];

/** What the simulated post-deploy health check returns, per scenario. */
export const HEALTH: Record<string, { label: string; metrics: Record<string, number> }> = {
  healthy: { label: 'Healthy', metrics: { error_rate: 0.4, latency_p95: 210, pods_ready: 100 } },
  degraded: { label: 'Degraded', metrics: { error_rate: 3.2, latency_p95: 980, pods_ready: 100 } },
  failed: { label: 'Failed', metrics: { error_rate: 21.5, latency_p95: 4200, pods_ready: 33 } },
  nodata: { label: 'No data', metrics: {} },
};

export const ruleText = (r: Rule): string => {
  const m = METRICS.find((x) => x.key === r.metric);
  return m ? `${m.label} ${r.op} ${r.value}${m.unit}` : '';
};
export const ruleMatches = (r: Rule, metrics: Record<string, number>): boolean => {
  const v = metrics[r.metric], t = Number(r.value);
  if (typeof v !== 'number' || !Number.isFinite(t)) return false;
  switch (r.op) {
    case '<': return v < t;
    case '<=': return v <= t;
    case '>': return v > t;
    case '>=': return v >= t;
    case '=': return v === t;
    default: return false;
  }
};

const CONDITION_FIELDS: Record<string, string> = { message: 'Commit message', branch: 'Branch', author: 'Author' };
const CONDITION_OPS = ['contains', 'does not contain', 'equals', 'starts with'];
export const conditionHolds = (p: Props, commit: Record<string, string>): boolean => {
  const a = String(commit[p.field] ?? '').toLowerCase(), b = String(p.value ?? '').toLowerCase();
  switch (p.operator) {
    case 'contains': return a.includes(b);
    case 'does not contain': return !a.includes(b);
    case 'equals': return a === b;
    case 'starts with': return a.startsWith(b);
    default: return false;
  }
};

const ENVS = ['production', 'staging', 'development'];
const CLUSTERS = ['eks-prod-eu', 'eks-staging-eu', 'gke-dev-us'];

/**
 * The action catalog. `kind` decides the shape: 'trigger' and 'app' are round
 * icon tiles with one output, 'condition' and 'switch' are capsules with
 * labelled outputs. `fields` builds the panel form; `required` fields that are
 * empty make the step FAIL in a test run.
 */
export const ACTIONS: Record<string, Action> = {
  // ---- triggers ----------------------------------------------------------
  'gitlab.push': { cat: 'Triggers', kind: 'trigger', app: 'GitLab', label: 'Push to branch', icon: 'gitlab',
    fields: [
      { key: 'project', label: 'Project', type: 'text', required: true, placeholder: 'group/project' },
      { key: 'branch', label: 'Branch', type: 'text', required: true, placeholder: 'main' },
      { key: 'event', label: 'Event', type: 'select', options: ['Push', 'Tag push', 'Merge request merged'] },
    ],
    defaults: () => ({ project: 'storefront/checkout-api', branch: 'main', event: 'Push' }),
    summary: (p) => `${repoName(p.project)} / ${p.branch || '…'}`,
    run: (p, c) => ({ msg: `${p.event || 'Push'} to ${p.branch} by ${c.commit.author}: “${c.commit.message}”` }) },
  'gitlab.mr': { cat: 'Triggers', kind: 'trigger', app: 'GitLab', label: 'Merge request merged', icon: 'gitlab',
    fields: [
      { key: 'project', label: 'Project', type: 'text', required: true },
      { key: 'branch', label: 'Target branch', type: 'text', required: true },
    ],
    defaults: () => ({ project: 'storefront/checkout-api', branch: 'main' }),
    summary: (p) => `MR into ${p.branch || '…'}`,
    run: (p, c) => ({ msg: `Merge request merged into ${p.branch}: “${c.commit.message}”` }) },
  'github.push': { cat: 'Triggers', kind: 'trigger', app: 'GitHub', label: 'Push to branch', icon: 'github',
    fields: [
      { key: 'project', label: 'Repository', type: 'text', required: true, placeholder: 'owner/repo' },
      { key: 'branch', label: 'Branch', type: 'text', required: true },
    ],
    defaults: () => ({ project: 'storefront/web', branch: 'main' }),
    summary: (p) => `${repoName(p.project)} / ${p.branch || '…'}`,
    run: (p, c) => ({ msg: `Push to ${p.branch} by ${c.commit.author}: “${c.commit.message}”` }) },
  'schedule.cron': { cat: 'Triggers', kind: 'trigger', app: 'Schedule', label: 'On a schedule', icon: 'schedule',
    fields: [{ key: 'cron', label: 'Cron expression', type: 'text', required: true, placeholder: '0 6 * * 1-5' }],
    defaults: () => ({ cron: '0 6 * * 1-5' }),
    summary: (p) => `cron ${p.cron || '…'}`,
    run: (p) => ({ msg: `Fired on schedule (${p.cron})` }) },

  // ---- logic -------------------------------------------------------------
  'logic.condition': { cat: 'Logic', kind: 'condition', app: 'Condition', label: 'If / else', icon: 'condition',
    fields: [
      { key: 'field', label: 'Field', type: 'select', options: Object.keys(CONDITION_FIELDS), optionLabels: CONDITION_FIELDS },
      { key: 'operator', label: 'Operator', type: 'select', options: CONDITION_OPS },
      { key: 'value', label: 'Value', type: 'text', required: true },
    ],
    defaults: () => ({ field: 'message', operator: 'contains', value: 'release' }),
    summary: (p) => `${CONDITION_FIELDS[p.field] || 'Field'} ${p.operator} “${p.value ?? ''}”`,
    run: (p, c) => {
      const ok = conditionHolds(p, c.commit);
      return { out: ok ? 'true' : 'false', msg: `${CONDITION_FIELDS[p.field]} ${p.operator} “${p.value}” → ${ok}` };
    } },
  'logic.switch': { cat: 'Logic', kind: 'switch', app: 'Switch', label: 'Route by rule', icon: 'switch',
    fields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
    defaults: () => ({ name: 'Health check' }),
    outputs: () => [
      { id: 'healthy', label: 'healthy', rule: { metric: 'error_rate', op: '<', value: 1 } },
      { id: 'degraded', label: 'degraded', rule: { metric: 'error_rate', op: '<', value: 5 } },
      { id: 'failed', label: 'failed', rule: { metric: 'pods_ready', op: '<', value: 80 } },
      { id: 'else', label: 'else', rule: null },
    ],
    summary: (p) => p.name || 'Switch',
    run: (p, c, outputs) => {
      const m = HEALTH[c.health]?.metrics || {};
      const hit = outputs.find((o) => o.rule && ruleMatches(o.rule, m)) || outputs.find((o) => !o.rule);
      const seen = METRICS.filter((x) => typeof m[x.key] === 'number').map((x) => `${x.label} ${m[x.key]}${x.unit}`).join(', ');
      return { out: hit?.id, msg: `${seen || 'no metrics reported'} → “${hit?.label ?? '—'}”${hit?.rule ? ` (${ruleText(hit.rule)})` : ''}` };
    } },
  'logic.delay': { cat: 'Logic', kind: 'app', app: 'Wait', label: 'Pause the run', icon: 'delay',
    fields: [
      { key: 'amount', label: 'Wait for', type: 'number', required: true },
      { key: 'unit', label: 'Unit', type: 'select', options: ['minutes', 'hours'] },
    ],
    defaults: () => ({ amount: 10, unit: 'minutes' }),
    summary: (p) => `Wait ${p.amount} ${p.unit}`,
    run: (p) => ({ msg: `Waited ${p.amount} ${p.unit} (simulated)` }) },

  // ---- deploy ------------------------------------------------------------
  'k8s.deploy': { cat: 'Deploy', kind: 'app', app: 'Kubernetes', label: 'Deploy', icon: 'kubernetes',
    fields: [
      { key: 'cluster', label: 'Cluster', type: 'select', options: CLUSTERS },
      { key: 'namespace', label: 'Namespace', type: 'text', required: true },
      { key: 'environment', label: 'Environment', type: 'select', options: ENVS },
      { key: 'strategy', label: 'Strategy', type: 'select', options: ['Rolling update', 'Canary', 'Blue-green'] },
    ],
    defaults: () => ({ cluster: 'eks-staging-eu', namespace: 'checkout', environment: 'staging', strategy: 'Rolling update' }),
    summary: (p) => `Deploy to ${p.environment}`,
    run: (p) => ({ msg: `${p.strategy} of checkout-api to ${p.cluster}/${p.namespace}: 3/3 pods ready` }) },
  'k8s.rollback': { cat: 'Deploy', kind: 'app', app: 'Kubernetes', label: 'Roll back', icon: 'kubernetes',
    fields: [
      { key: 'cluster', label: 'Cluster', type: 'select', options: CLUSTERS },
      { key: 'namespace', label: 'Namespace', type: 'text', required: true },
      { key: 'revision', label: 'Revision', type: 'select', options: ['previous', 'last known good'] },
    ],
    defaults: () => ({ cluster: 'eks-staging-eu', namespace: 'checkout', revision: 'previous' }),
    summary: (p) => `Roll back ${p.cluster.split('-')[1] || p.cluster}`,
    run: (p) => ({ msg: `Rolled ${p.cluster}/${p.namespace} back to the ${p.revision} revision` }) },
  'argo.sync': { cat: 'Deploy', kind: 'app', app: 'Argo CD', label: 'Sync application', icon: 'argo',
    fields: [
      { key: 'application', label: 'Application', type: 'text', required: true },
      { key: 'revision', label: 'Revision', type: 'text' },
    ],
    defaults: () => ({ application: 'checkout-api', revision: 'HEAD' }),
    summary: (p) => `Sync ${p.application}`,
    run: (p) => ({ msg: `Synced ${p.application} to ${p.revision || 'HEAD'}` }) },
  'helm.upgrade': { cat: 'Deploy', kind: 'app', app: 'Helm', label: 'Upgrade release', icon: 'helm',
    fields: [
      { key: 'release', label: 'Release', type: 'text', required: true },
      { key: 'chart', label: 'Chart', type: 'text', required: true },
    ],
    defaults: () => ({ release: 'checkout', chart: 'charts/checkout-api' }),
    summary: (p) => `Upgrade ${p.release}`,
    run: (p) => ({ msg: `helm upgrade ${p.release} ${p.chart}: deployed` }) },
  'terraform.apply': { cat: 'Deploy', kind: 'app', app: 'Terraform', label: 'Apply plan', icon: 'terraform',
    fields: [{ key: 'workspace', label: 'Workspace', type: 'text', required: true }],
    defaults: () => ({ workspace: 'checkout-staging' }),
    summary: (p) => `Apply ${p.workspace}`,
    run: (p) => ({ msg: `Applied ${p.workspace}: 2 to change, 0 to destroy` }) },

  // ---- monitoring --------------------------------------------------------
  'datadog.event': { cat: 'Monitoring', kind: 'app', app: 'Datadog', label: 'Post event', icon: 'datadog',
    fields: [
      { key: 'title', label: 'Event title', type: 'text', required: true },
      { key: 'tags', label: 'Tags', type: 'text', placeholder: 'service:checkout' },
    ],
    defaults: () => ({ title: 'Deployment finished', tags: 'service:checkout' }),
    summary: (p) => p.title,
    run: (p) => ({ msg: `Event “${p.title}” posted${p.tags ? ` [${p.tags}]` : ''}` }) },
  'cloudwatch.alarm': { cat: 'Monitoring', kind: 'app', app: 'AWS CloudWatch', label: 'Set alarm', icon: 'amazoncloudwatch',
    fields: [
      { key: 'alarm', label: 'Alarm name', type: 'text', required: true },
      { key: 'metric', label: 'Metric', type: 'text' },
    ],
    defaults: () => ({ alarm: 'Missing health signal', metric: 'HealthCheckStatus' }),
    summary: (p) => p.alarm,
    run: (p) => ({ msg: `Alarm “${p.alarm}” set to ALARM` }) },
  'grafana.annotate': { cat: 'Monitoring', kind: 'app', app: 'Grafana', label: 'Annotate dashboard', icon: 'grafana',
    fields: [
      { key: 'dashboard', label: 'Dashboard', type: 'text', required: true },
      { key: 'text', label: 'Annotation', type: 'text' },
    ],
    defaults: () => ({ dashboard: 'Checkout overview', text: 'Release deployed' }),
    summary: (p) => p.dashboard,
    run: (p) => ({ msg: `Annotated “${p.dashboard}”` }) },
  'sentry.release': { cat: 'Monitoring', kind: 'app', app: 'Sentry', label: 'Create release', icon: 'sentry',
    fields: [{ key: 'project', label: 'Project', type: 'text', required: true }],
    defaults: () => ({ project: 'checkout-api' }),
    summary: (p) => `Release in ${p.project}`,
    run: (p) => ({ msg: `Release created in ${p.project}` }) },

  // ---- incidents ---------------------------------------------------------
  'pagerduty.incident': { cat: 'Incidents', kind: 'app', app: 'PagerDuty', label: 'Trigger incident', icon: 'pagerduty',
    fields: [
      { key: 'service', label: 'Service', type: 'text', required: true },
      { key: 'severity', label: 'Severity', type: 'select', options: ['critical', 'error', 'warning', 'info'] },
      { key: 'title', label: 'Title', type: 'text', required: true },
    ],
    defaults: () => ({ service: 'checkout-api', severity: 'error', title: 'Deployment needs attention' }),
    summary: (p) => p.title,
    run: (p) => ({ msg: `${cap(p.severity)} incident opened on ${p.service}` }) },
  'opsgenie.alert': { cat: 'Incidents', kind: 'app', app: 'Opsgenie', label: 'Create alert', icon: 'opsgenie',
    fields: [
      { key: 'team', label: 'Team', type: 'text', required: true },
      { key: 'priority', label: 'Priority', type: 'select', options: ['P1', 'P2', 'P3', 'P4', 'P5'] },
    ],
    defaults: () => ({ team: 'Platform', priority: 'P3' }),
    summary: (p) => `${p.priority} for ${p.team}`,
    run: (p) => ({ msg: `${p.priority} alert sent to ${p.team}` }) },

  // ---- tickets -----------------------------------------------------------
  'jira.transition': { cat: 'Tickets', kind: 'app', app: 'Jira', label: 'Transition issue', icon: 'jira',
    fields: [
      { key: 'project', label: 'Project key', type: 'text', required: true },
      { key: 'issue', label: 'Issue', type: 'text', required: true },
      { key: 'transition', label: 'Transition', type: 'select', options: ['To Do', 'In Progress', 'Investigate', 'Done', 'Failed'] },
    ],
    defaults: () => ({ project: 'REL', issue: 'Release ticket', transition: 'Done' }),
    summary: (p) => `${p.issue}: ${p.transition}`,
    run: (p) => ({ msg: `${p.project}-142 “${p.issue}” moved to ${p.transition}` }) },
  'jira.create': { cat: 'Tickets', kind: 'app', app: 'Jira', label: 'Create issue', icon: 'jira',
    fields: [
      { key: 'project', label: 'Project key', type: 'text', required: true },
      { key: 'type', label: 'Issue type', type: 'select', options: ['Task', 'Bug', 'Incident'] },
      { key: 'title', label: 'Summary', type: 'text', required: true },
    ],
    defaults: () => ({ project: 'OPS', type: 'Task', title: 'Look into the deployment' }),
    summary: (p) => p.title,
    run: (p) => ({ msg: `${p.type} ${p.project}-318 created: “${p.title}”` }) },
  'servicenow.incident': { cat: 'Tickets', kind: 'app', app: 'ServiceNow', label: 'Create incident', icon: 'ticket',
    fields: [
      { key: 'group', label: 'Assignment group', type: 'text', required: true },
      { key: 'impact', label: 'Impact', type: 'select', options: ['1 - High', '2 - Medium', '3 - Low'] },
      { key: 'title', label: 'Short description', type: 'text', required: true },
    ],
    defaults: () => ({ group: 'Platform Ops', impact: '2 - Medium', title: 'Deployment incident' }),
    summary: (p) => p.title,
    run: (p) => ({ msg: `INC0012894 (${p.impact}) assigned to ${p.group}` }) },

  // ---- messaging ---------------------------------------------------------
  'slack.message': { cat: 'Messaging', kind: 'app', app: 'Slack', label: 'Send message', icon: 'slack',
    fields: [
      { key: 'channel', label: 'Channel', type: 'text', required: true, placeholder: '#channel' },
      { key: 'message', label: 'Message', type: 'textarea' },
    ],
    defaults: () => ({ channel: '#deployments', message: 'Deployment finished' }),
    summary: (p) => p.channel || '#…',
    run: (p) => ({ msg: `Posted to ${p.channel}` }) },
  'discord.message': { cat: 'Messaging', kind: 'app', app: 'Discord', label: 'Send message', icon: 'discord',
    fields: [
      { key: 'channel', label: 'Channel', type: 'text', required: true },
      { key: 'message', label: 'Message', type: 'textarea' },
    ],
    defaults: () => ({ channel: '#releases', message: 'A new release is out' }),
    summary: (p) => p.channel || '#…',
    run: (p) => ({ msg: `Posted to ${p.channel}` }) },
  'gmail.send': { cat: 'Messaging', kind: 'app', app: 'Gmail', label: 'Send email', icon: 'gmail',
    fields: [
      { key: 'to', label: 'To', type: 'text', required: true },
      { key: 'subject', label: 'Subject', type: 'text', required: true },
    ],
    defaults: () => ({ to: 'release-managers@example.com', subject: 'Release report' }),
    summary: (p) => p.subject,
    run: (p) => ({ msg: `Email “${p.subject}” sent to ${p.to}` }) },
};

/** The step a fresh canvas starts with. */
export const PLACEHOLDER = 'placeholder';

/** The outputs a step has: [{ id, label }]. */
export function outputsOf(data: StepData): Output[] {
  const a = ACTIONS[data.action];
  if (data.action === PLACEHOLDER) return [{ id: 'out', label: '' }];
  if (!a) return [];
  if (a.kind === 'condition') return [{ id: 'true', label: 'true' }, { id: 'false', label: 'false' }];
  if (a.kind === 'switch') return (data.outputs || []).map((o) => ({ id: o.id, label: o.label, rule: o.rule }));
  return [{ id: 'out', label: '' }];
}

/** A fresh step's data for an action key. */
export function newStepData(action: string, overrides: { props?: Props; outputs?: Output[] } = {}): StepData {
  const a = ACTIONS[action];
  const data: StepData = { action, props: { ...a.defaults(), ...(overrides.props || {}) } };
  if (a.outputs) data.outputs = overrides.outputs || a.outputs();
  return data;
}

/** The first empty required field, or null. */
export function missingField(data: StepData): Field | null {
  const a = ACTIONS[data.action];
  if (!a) return null;
  for (const f of a.fields) if (f.required && String(data.props[f.key] ?? '').trim() === '') return f;
  return null;
}

/** The sample: a GitLab push that deploys, checks health and responds. */
export function sampleWorkflow(): WorkflowDoc {
  const s = (id: string, action: string, props: Props, extra?: { outputs?: Output[] }): DocStep => ({ id, x: 0, y: 0, data: newStepData(action, { props, ...(extra || {}) }) });
  const steps = [
    s('push', 'gitlab.push', { project: 'storefront/checkout-api', branch: 'main', event: 'Push' }),
    s('cond', 'logic.condition', { field: 'message', operator: 'contains', value: 'release' }),
    s('stage', 'k8s.deploy', { cluster: 'eks-staging-eu', namespace: 'checkout', environment: 'staging', strategy: 'Rolling update' }),
    s('health', 'logic.switch', { name: 'Health check' }),
    s('prod', 'k8s.deploy', { cluster: 'eks-prod-eu', namespace: 'checkout', environment: 'production', strategy: 'Canary' }),
    s('dd_prod', 'datadog.event', { title: 'Release live in production', tags: 'service:checkout,env:prod' }),
    s('slack_rel', 'slack.message', { channel: '#releases', message: 'checkout-api is live in production' }),
    s('pd_slow', 'pagerduty.incident', { service: 'checkout-api', severity: 'warning', title: 'Checkout running slow' }),
    s('jira_slow', 'jira.transition', { project: 'REL', issue: 'Release ticket', transition: 'Investigate' }),
    s('rollback', 'k8s.rollback', { cluster: 'eks-staging-eu', namespace: 'checkout', revision: 'previous' }),
    s('pd_down', 'pagerduty.incident', { service: 'checkout-api', severity: 'critical', title: 'Release failed health check' }),
    s('snow', 'servicenow.incident', { group: 'Platform Ops', impact: '1 - High', title: 'Checkout release rolled back' }),
    s('cw', 'cloudwatch.alarm', { alarm: 'Missing health signal', metric: 'HealthCheckStatus' }),
    s('jira_ops', 'jira.create', { project: 'OPS', type: 'Task', title: 'Health check sent no data' }),
    s('dev', 'k8s.deploy', { cluster: 'gke-dev-us', namespace: 'checkout', environment: 'development', strategy: 'Rolling update' }),
    s('dd_dev', 'datadog.event', { title: 'Dev build deployed', tags: 'service:checkout,env:dev' }),
  ];
  const L = (n: number, s0: string, out: string, t: string): DocLink => ({ id: 'l' + n, s: `${s0}__${out}`, t: `${t}__in` });
  const links = [
    L(1, 'push', 'out', 'cond'),
    L(2, 'cond', 'true', 'stage'), L(3, 'cond', 'false', 'dev'),
    L(4, 'stage', 'out', 'health'),
    L(5, 'health', 'o_healthy', 'prod'), L(6, 'prod', 'out', 'dd_prod'), L(7, 'dd_prod', 'out', 'slack_rel'),
    L(8, 'health', 'o_degraded', 'pd_slow'), L(9, 'pd_slow', 'out', 'jira_slow'),
    L(10, 'health', 'o_failed', 'rollback'), L(11, 'rollback', 'out', 'pd_down'), L(12, 'pd_down', 'out', 'snow'),
    L(13, 'health', 'o_else', 'cw'), L(14, 'cw', 'out', 'jira_ops'),
    L(15, 'dev', 'out', 'dd_dev'),
  ];
  const notes = [{
    id: 'note_health',
    title: 'After the health check',
    text: 'The Switch reads how the staging rollout is doing and runs exactly one response:\n'
      + '• healthy: promote to production and tell the team\n'
      + '• degraded or failed: page on-call and track it in a ticket\n'
      + '• no data: raise an alarm instead of guessing',
    members: ['prod', 'dd_prod', 'slack_rel', 'pd_slow', 'jira_slow', 'rollback', 'pd_down', 'snow', 'cw', 'jira_ops'],
  }];
  return { v: 1, title: 'Checkout release pipeline', steps, links, notes };
}
