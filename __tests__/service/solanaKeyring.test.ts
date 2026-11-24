import { SolanaKeyring } from 'background/service/keyring/solanaKeyring';
import { SOLANA_KEYRING_TYPE } from 'background/service/keyring/solanaKeyringType';

// RFC 8032 test vector; never use real keys or funds.
const testSecret =
  '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const testAddress = 'FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z';

test('restores and serializes a test key without changing its public account', async () => {
  const keyring = new SolanaKeyring();
  expect(keyring.type).toBe(SOLANA_KEYRING_TYPE);
  await keyring.deserialize({ version: 1, secretKeys: [testSecret] });
  expect(await keyring.getAccounts()).toEqual([testAddress]);
  expect(await keyring.serialize()).toEqual({
    version: 1,
    secretKeys: [testSecret],
  });
  keyring.cleanUp();
  await expect(keyring.getAccounts()).rejects.toThrow('locked');
  await expect(keyring.serialize()).rejects.toThrow('locked');
});

test('rejects malformed vaults without replacing existing accounts', async () => {
  const keyring = new SolanaKeyring();
  await keyring.deserialize({ version: 1, secretKeys: [testSecret] });
  await expect(
    keyring.deserialize({ version: 1, secretKeys: [testSecret, testSecret] })
  ).rejects.toThrow('Invalid vault');
  await expect(
    keyring.deserialize({ version: 2, secretKeys: [] })
  ).rejects.toThrow('Invalid vault');
  expect(await keyring.getAccounts()).toEqual([testAddress]);
  keyring.cleanUp();
});

test('restores a Solana account from a disposable mnemonic without duplicates', async () => {
  const keyring = new SolanaKeyring();
  const mnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const address = await keyring.addAccountFromMnemonic(mnemonic, 0);
  expect(address).toBe('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
  await expect(keyring.addAccountFromMnemonic(mnemonic, 0)).rejects.toThrow(
    'already exists'
  );
  keyring.cleanUp();
  await expect(keyring.addAccountFromMnemonic(mnemonic, 0)).rejects.toThrow(
    'locked'
  );
});
