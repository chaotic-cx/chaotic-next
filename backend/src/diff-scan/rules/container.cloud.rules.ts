import { regexRule, type Rule } from './rule';

export const CONTAINER_CLOUD_RULES: Rule[] = [
  regexRule({
    id: 'CAUR-CLOUD-METADATA',
    name: 'Cloud metadata endpoint access',
    severity: 'critical',
    description: 'Contacts the link-local instance metadata service to steal cloud IAM credentials.',
    pattern: /\b169\.254\.169\.254\b|\bmetadata\.google\.internal\b/,
    scopes: ['code'],
  }),
  regexRule({
    id: 'CAUR-K8S-TOKEN',
    name: 'Kubernetes service-account token access',
    severity: 'critical',
    description: 'Reads the mounted service-account token.',
    pattern: /\/var\/run\/secrets\/kubernetes\.io\/serviceaccount\b/,
    scopes: ['code'],
  }),
  regexRule({
    id: 'CAUR-CONTAINER-SOCKET',
    name: 'Container runtime socket reference',
    severity: 'warning',
    description: 'References the Docker/containerd/Podman control socket, which yields host-level container control.',
    pattern: /\/var\/run\/docker\.sock\b|\/run\/containerd\/containerd\.sock\b|\/run\/podman\/podman\.sock\b/,
    scopes: ['code'],
  }),
  regexRule({
    id: 'CAUR-HOST-NSENTER',
    name: 'Host namespace entry via nsenter',
    severity: 'critical',
    description: 'Uses nsenter against PID 1 or host /proc entries to escape into the host namespaces.',
    pattern: /\bnsenter\b[^#\n]*(?:\s-t\s*=?\s*1\b|\/proc\/1\/)/,
    scopes: ['code'],
  }),
  regexRule({
    id: 'CAUR-CGROUP-RELEASE',
    name: 'Cgroup release_agent escape',
    severity: 'critical',
    description: 'Manipulates cgroup release_agent to execute commands on the host.',
    pattern: /\brelease_agent\b/,
    scopes: ['code'],
  }),
];
