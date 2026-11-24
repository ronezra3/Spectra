import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { base58 } from '@scure/base';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { Message } from '@/utils/message';
import { parseSolanaReadOnlyAddress } from './readOnlyAddress';
import { EXPERIMENTAL_WALLET_ICON } from './experimentalIcon';

type AccountsChanged = { accounts: readonly WalletAccount[] };
type Listener = (event: AccountsChanged) => void;

/** Page-side Wallet Standard adapter. All consent is decided in background. */
export function createConnectableSolanaWallet(): Wallet {
  let accounts: readonly WalletAccount[] = Object.freeze([]);
  let generation = 0;
  const listeners = new Set<Listener>();
  const channel = new Message.BroadcastChannelMessage({
    name: 'omni-solana-page',
    target: 'omni-solana-content',
  }).connect();

  const clear = () => {
    generation += 1;
    if (!accounts.length) return;
    accounts = Object.freeze([]);
    listeners.forEach((listener) => {
      try {
        listener({ accounts });
      } catch {
        /* A dapp listener cannot block revocation. */
      }
    });
  };
  channel.on('message', (message) => {
    if (message?.event === 'accountsChanged') clear();
  });
  window.addEventListener('beforeunload', () => channel.dispose(), {
    once: true,
  });

  const noOptions = (value: unknown): boolean =>
    value === undefined ||
    (!!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0);

  const features = Object.freeze({
    'standard:connect': Object.freeze({
      version: '1.0.0',
      connect: async (options?: { silent?: boolean }) => {
        if (
          options?.silent !== undefined &&
          typeof options.silent !== 'boolean'
        ) {
          throw new Error('Invalid connection options');
        }
        const requestedGeneration = generation;
        const result = (await channel.request({
          method: 'connect',
          silent: options?.silent === true,
        })) as { address?: unknown; cluster?: unknown };
        if (requestedGeneration !== generation)
          throw new Error('Solana connection expired');
        if (
          typeof result?.address !== 'string' ||
          parseSolanaReadOnlyAddress(result.address)?.address !==
            result.address ||
          result.cluster !== 'solana:devnet'
        )
          throw new Error('Invalid Solana account response');
        const address = result.address;
        const publicKey = base58.decode(address);
        const account: WalletAccount = Object.freeze({
          address,
          get publicKey() {
            return new Uint8Array(publicKey);
          },
          chains: Object.freeze(['solana:devnet'] as const),
          features: Object.freeze([
            'solana:signMessage',
            'solana:signTransaction',
            'solana:signAndSendTransaction',
          ] as const),
        });
        accounts = Object.freeze([account]);
        listeners.forEach((listener) => {
          try {
            listener({ accounts });
          } catch {
            /* Ignore dapp listener failures. */
          }
        });
        return { accounts };
      },
    }),
    'solana:signMessage': Object.freeze({
      version: '1.0.0',
      signMessage: async (
        ...inputs: readonly { account: WalletAccount; message: Uint8Array }[]
      ) => {
        if (inputs.length > 10) throw new Error('Too many messages');
        const outputs: {
          signedMessage: Uint8Array;
          signature: Uint8Array;
        }[] = [];
        for (const input of inputs) {
          if (
            !accounts.length ||
            input.account !== accounts[0] ||
            !(input.message instanceof Uint8Array) ||
            input.message.length > 1024
          ) {
            throw new Error('Invalid Solana signing request');
          }
          const generationAtRequest = generation;
          const message = new Uint8Array(input.message);
          const signatureHex = await channel.request({
            method: 'signMessage',
            account: input.account.address,
            messageHex: bytesToHex(message),
          });
          if (
            generationAtRequest !== generation ||
            input.account !== accounts[0]
          )
            throw new Error('Solana signing expired');
          if (
            typeof signatureHex !== 'string' ||
            !/^[0-9a-f]{128}$/.test(signatureHex)
          )
            throw new Error('Invalid Solana signature response');
          outputs.push({
            signedMessage: message,
            signature: hexToBytes(signatureHex),
          });
        }
        return outputs;
      },
    }),
    'solana:signTransaction': Object.freeze({
      version: '1.0.0',
      supportedTransactionVersions: Object.freeze(['legacy'] as const),
      signTransaction: async (
        ...inputs: readonly {
          account: WalletAccount;
          transaction: Uint8Array;
          chain?: string;
          options?: unknown;
        }[]
      ) => {
        if (inputs.length > 10) throw new Error('Too many transactions');
        const outputs: { signedTransaction: Uint8Array }[] = [];
        for (const input of inputs) {
          if (
            !accounts.length ||
            input.account !== accounts[0] ||
            !(input.transaction instanceof Uint8Array) ||
            input.transaction.length === 0 ||
            input.transaction.length > 1232 ||
            (input.chain !== undefined && input.chain !== 'solana:devnet') ||
            !noOptions(input.options)
          ) {
            throw new Error('Unsupported Solana transaction request');
          }
          const generationAtRequest = generation;
          const transaction = new Uint8Array(input.transaction);
          const signedHex = await channel.request({
            method: 'signTransaction',
            account: input.account.address,
            transactionHex: bytesToHex(transaction),
          });
          if (
            generationAtRequest !== generation ||
            input.account !== accounts[0]
          )
            throw new Error('Solana signing expired');
          if (
            typeof signedHex !== 'string' ||
            signedHex.length > 2464 ||
            !/^(?:[0-9a-f]{2})+$/.test(signedHex)
          )
            throw new Error('Invalid signed transaction response');
          outputs.push({ signedTransaction: hexToBytes(signedHex) });
        }
        return outputs;
      },
    }),
    'solana:signAndSendTransaction': Object.freeze({
      version: '1.0.0',
      supportedTransactionVersions: Object.freeze(['legacy'] as const),
      signAndSendTransaction: async (
        ...inputs: readonly {
          account: WalletAccount;
          transaction: Uint8Array;
          chain?: string;
          options?: unknown;
        }[]
      ) => {
        if (inputs.length > 10) throw new Error('Too many transactions');
        const outputs: { signature: Uint8Array }[] = [];
        for (const input of inputs) {
          if (
            !accounts.length ||
            input.account !== accounts[0] ||
            !(input.transaction instanceof Uint8Array) ||
            input.transaction.length === 0 ||
            input.transaction.length > 1232 ||
            (input.chain !== undefined && input.chain !== 'solana:devnet') ||
            !noOptions(input.options)
          ) {
            throw new Error('Unsupported Solana transaction request');
          }
          const generationAtRequest = generation;
          const transaction = new Uint8Array(input.transaction);
          const signatureHex = await channel.request({
            method: 'signAndSendTransaction',
            account: input.account.address,
            transactionHex: bytesToHex(transaction),
          });
          if (
            generationAtRequest !== generation ||
            input.account !== accounts[0]
          )
            throw new Error(
              'Solana submission expired; the transaction may have been submitted'
            );
          if (
            typeof signatureHex !== 'string' ||
            !/^[0-9a-f]{128}$/.test(signatureHex)
          )
            throw new Error('Invalid Solana submission response');
          outputs.push({ signature: hexToBytes(signatureHex) });
        }
        return outputs;
      },
    }),
    'standard:disconnect': Object.freeze({
      version: '1.0.0',
      disconnect: async () => {
        clear();
        await channel.request({ method: 'disconnect' });
      },
    }),
    'standard:events': Object.freeze({
      version: '1.0.0',
      on: (event: string, listener: Listener) => {
        if (event !== 'change' || typeof listener !== 'function')
          return () => undefined;
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    }),
  });
  return Object.freeze({
    version: '1.0.0' as const,
    name: 'OmniWallet (experimental)',
    icon: EXPERIMENTAL_WALLET_ICON,
    chains: Object.freeze(['solana:devnet'] as const),
    get accounts() {
      return accounts;
    },
    features,
  });
}
