import { Message } from '@/utils/message';
import PortMessage from '@/utils/message/portMessage';
import browser from 'webextension-polyfill';

import { EXTENSION_MESSAGES } from '@/constant/message';
import { isManifestV3 } from '@/utils/env';

const createDefer = <T>() => {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: any) => void) | undefined;

  const promise: Promise<T> = new Promise(function (_resolve, _reject) {
    resolve = _resolve;
    reject = _reject;
  });

  return {
    promise,
    resolve,
    reject,
  };
};

const injectProviderScript = (isDefaultWallet: boolean) => {
  // the script element with src won't execute immediately
  // use inline script element instead!
  const container = document.head || document.documentElement;
  const ele = document.createElement('script');
  // in prevent of webpack optimized code do some magic(e.g. double/sigle quote wrap),
  // separate content assignment to two line
  // use AssetReplacePlugin to replace pageprovider content
  ele.setAttribute('src', browser.runtime.getURL('pageProvider.js'));
  container.insertBefore(ele, container.children[0]);
  container.removeChild(ele);
};

const { BroadcastChannelMessage } = Message;

let pm: PortMessage | null;
let defer = createDefer<PortMessage>();

const bcm = new BroadcastChannelMessage({
  name: 'rabby-content-script',
  target: 'rabby-page-provider',
}).listen((data) => {
  browser.runtime.sendMessage({ type: 'ping' });
  if (pm) {
    return pm?.request(data);
  }
  return defer.promise.then((pm) => pm?.request(data));
});

// A separate channel and port keep Solana requests out of EVM dispatch.
if (
  process.env.NODE_ENV === 'development' &&
  process.env.OMNI_SOLANA_DISCOVERY === '1' &&
  process.env.OMNI_SOLANA_READONLY === '1'
) {
  let solanaPort: PortMessage | null = null;
  const solanaChannel = new BroadcastChannelMessage({
    name: 'omni-solana-content',
    target: 'omni-solana-page',
  });
  const getSolanaPort = () => {
    if (solanaPort) return solanaPort;
    const current = new PortMessage().connect('omni-solana-v1');
    solanaPort = current;
    current.on('message', (message) => solanaChannel.send('message', message));
    current.on('disconnect', () => {
      if (solanaPort !== current) return;
      solanaPort = null;
      solanaChannel.send('message', { event: 'accountsChanged', accounts: [] });
      current.dispose();
    });
    return current;
  };
  solanaChannel.listen((data: unknown) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid Solana request');
    }
    const request = data as {
      method?: unknown;
      silent?: unknown;
      account?: unknown;
      messageHex?: unknown;
      transactionHex?: unknown;
    };
    if (request.method === 'connect') {
      if (request.silent !== undefined && typeof request.silent !== 'boolean')
        throw new Error('Invalid connection options');
      return getSolanaPort().request({
        method: 'connect',
        silent: request.silent === true,
      });
    }
    if (request.method === 'disconnect')
      return getSolanaPort().request({ method: 'disconnect' });
    if (
      typeof request.account !== 'string' ||
      request.account.length < 32 ||
      request.account.length > 44
    ) {
      throw new Error('Invalid Solana account');
    }
    if (
      request.method === 'signMessage' &&
      typeof request.messageHex === 'string' &&
      request.messageHex.length <= 2048 &&
      /^(?:[0-9a-f]{2})*$/.test(request.messageHex)
    ) {
      return getSolanaPort().request({
        method: 'signMessage',
        account: request.account,
        messageHex: request.messageHex,
      });
    }
    if (
      (request.method === 'signTransaction' ||
        request.method === 'signAndSendTransaction') &&
      typeof request.transactionHex === 'string' &&
      request.transactionHex.length <= 2464 &&
      /^(?:[0-9a-f]{2})+$/.test(request.transactionHex)
    ) {
      return getSolanaPort().request({
        method: request.method,
        account: request.account,
        transactionHex: request.transactionHex,
      });
    }
    throw new Error('Unsupported Solana request');
  });
  document.addEventListener('beforeunload', () => {
    solanaChannel.dispose();
    solanaPort?.dispose();
  });
}

// background notification

document.addEventListener('beforeunload', () => {
  bcm.dispose();
  pm?.dispose();
});

const handlePmMessage = (data) => bcm.send('message', data);

const onDisconnectDestroyStreams = (err) => {
  pm?.port?.onDisconnect.removeListener(onDisconnectDestroyStreams);
  pm?.off('message', handlePmMessage);

  pm?.dispose();
  pm = null;
  defer = createDefer<PortMessage>();
};

const setupExtensionStreams = () => {
  pm = new PortMessage().connect();
  pm?.on('message', handlePmMessage);
  defer.resolve?.(pm);
  pm?.port?.onDisconnect.addListener(onDisconnectDestroyStreams);
  bcm.send('message', { event: 'contentScriptConnected' });
};

setupExtensionStreams();

const onMessageSetUpExtensionStreams = (msg) => {
  if (msg.name === EXTENSION_MESSAGES.READY) {
    if (!pm) {
      setupExtensionStreams();
    }
    return Promise.resolve(`Rabby: handled ${EXTENSION_MESSAGES.READY}`);
  }
  return undefined;
};
browser.runtime.onMessage.addListener(onMessageSetUpExtensionStreams);

if (!isManifestV3) {
  injectProviderScript(false);
}

const getHardcodedBlockedHosts = (): string[] => {
  const hosts = ['app.hyperliquid.xyz'];
  try {
    hosts.push(new URL(browser.runtime.getURL('')).hostname);
  } catch {
    // best-effort: skip if the extension origin can't be resolved
  }
  return hosts;
};

(async () => {
  try {
    if (window.top !== window) return;
    // Disabled is the default, so gate on `enabled` first and skip the second
    // round-trip entirely on the (hot) every-page-load path when it's off.
    const enabled = (await browser.runtime.sendMessage({
      type: 'controller',
      method: 'getPerpsWidgetEnabled',
      params: [],
    })) as boolean;
    if (!enabled) return;
    const blockedHosts = (await browser.runtime.sendMessage({
      type: 'controller',
      method: 'getPerpsWidgetBlockedHosts',
      params: [],
    })) as string[];
    // webpackMode: 'eager' inlines the widget into content-script.js. Without it,
    // strict-CSP hosts (Google, GitHub) reject the chunk fetched from chrome-extension://.
    const { bootPerpsWidget } = await import(
      /* webpackMode: "eager" */ './perps-widget'
    );
    await bootPerpsWidget({
      enabled: true,
      blockedHosts: [
        ...getHardcodedBlockedHosts(),
        ...(Array.isArray(blockedHosts) ? blockedHosts : []),
      ],
    });
  } catch (err) {
    console.warn('[perps-widget] bootstrap failed', err);
  }
})();
