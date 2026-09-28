type PluginSession = { isAuthenticated: boolean; managementKey: string };

// Only explicitly trusted panels may receive the management credential.
export function attachPluginAuthBridge(
  frame: HTMLIFrameElement,
  panelUrl: string,
  pluginId: string,
  getSession: () => PluginSession
): () => void {
  const expected = new URL(panelUrl, window.location.href);
  if (
    pluginId !== 'codex-timezone' ||
    expected.origin !== window.location.origin ||
    expected.pathname !== '/v0/resource/plugins/codex-timezone/panel' ||
    expected.search ||
    expected.hash
  )
    return () => {};

  const target = frame.contentWindow;
  const matchesPanel = () => {
    try {
      return !!target && frame.contentWindow === target && target.location.href === expected.href;
    } catch {
      return false;
    }
  };
  const onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (
      event.origin !== expected.origin ||
      event.source !== target ||
      !matchesPanel() ||
      !data ||
      data.type !== 'cpa.plugin.auth.request' ||
      data.version !== 1 ||
      data.pluginId !== pluginId ||
      typeof data.nonce !== 'string' ||
      !/^[a-f0-9]{32}$/.test(data.nonce)
    )
      return;
    const session = getSession();
    if (!session.isAuthenticated || !session.managementKey) return;
    target?.postMessage(
      {
        type: 'cpa.plugin.auth.session',
        version: 1,
        pluginId,
        nonce: data.nonce,
        managementKey: session.managementKey,
      },
      expected.origin
    );
  };
  window.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener('message', onMessage);
    if (matchesPanel())
      target?.postMessage(
        {
          type: 'cpa.plugin.auth.revoked',
          version: 1,
          pluginId,
        },
        expected.origin
      );
  };
}
