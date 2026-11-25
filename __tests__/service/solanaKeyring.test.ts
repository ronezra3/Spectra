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

test('legacy migration metadata remains readable but cannot identify a source snapshot', async () => {
  const keyring = new SolanaKeyring();
  await keyring.deserialize({
    version: 1,
    secretKeys: [],
    migration: 'legacy-devnet-v1',
  });
  expect(keyring.isMigratedFromLegacyDevnet()).toBe(false);
  expect(keyring.getMigrationSourceFingerprint()).toBeNull();
  expect((await keyring.serialize()).migration).toBe('legacy-devnet-v1');
  await expect(
    keyring.deserialize({
      version: 1,
      secretKeys: [],
      migration: { kind: 'legacy-devnet-v2', sourceFingerprint: 'invalid' },
    })
  ).rejects.toThrow('Invalid vault');
  keyring.cleanUp();
});

test('native custody metadata round-trips without impersonating a migration', async () => {
  const keyring = new SolanaKeyring();
  await keyring.deserialize({ version: 1, secretKeys: [testSecret] });
  keyring.markNativeDevnetCustody();
  const data = await keyring.serialize();
  expect(data.custody).toBe('native-devnet-v1');
  expect(keyring.isMigratedFromLegacyDevnet()).toBe(false);
  expect(keyring.getMigrationSourceFingerprint()).toBeNull();
  const restored = new SolanaKeyring();
  await restored.deserialize(data);
  expect(restored.isNativeDevnetCustody()).toBe(true);
  expect(await restored.getAccounts()).toEqual([testAddress]);
  await expect(
    restored.deserialize({ ...data, migration: 'legacy-devnet-v1' })
  ).rejects.toThrow('Invalid vault');
  expect(restored.isNativeDevnetCustody()).toBe(true);
  keyring.cleanUp();
  restored.cleanUp();
});

test('round-trips explicit account associations and rejects orphaned or duplicate links', async () => {
  const keyring = new SolanaKeyring();
  await keyring.deserialize({ version: 1, secretKeys: [testSecret] });
  const association = {
    evmAddress: '0x0000000000000000000000000000000000000001',
    solanaAddress: testAddress,
    accountIndex: 0,
  };
  await keyring.associateEvmAccount(association);
  await expect(keyring.associateEvmAccount(association)).rejects.toThrow(
    'association'
  );
  const data = await keyring.serialize();
  const restored = new SolanaKeyring();
  await restored.deserialize(data);
  expect(restored.getEvmAssociations()).toEqual([association]);
  await expect(
    restored.deserialize({
      ...data,
      associations: [{ ...association, solanaAddress: 'other' }],
    })
  ).rejects.toThrow('Invalid vault');
  await expect(
    restored.deserialize({ ...data, associations: [association, association] })
  ).rejects.toThrow('Invalid vault');
  expect(restored.getEvmAssociations()).toEqual([association]);
  expect(await restored.getAccounts()).toEqual([testAddress]);
  keyring.cleanUp();
  restored.cleanUp();
});
