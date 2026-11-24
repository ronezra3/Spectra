const mockRegister = jest.fn();

jest.mock('@rabby-wallet/page-provider', () => ({}));
jest.mock('@/chains/solana/discovery', () => ({
  registerExperimentalSolanaWallet: () => mockRegister(),
}));

const savedNodeEnv = process.env.NODE_ENV;
const savedFlag = process.env.OMNI_SOLANA_DISCOVERY;

afterEach(() => {
  process.env.NODE_ENV = savedNodeEnv;
  if (savedFlag === undefined) delete process.env.OMNI_SOLANA_DISCOVERY;
  else process.env.OMNI_SOLANA_DISCOVERY = savedFlag;
  mockRegister.mockClear();
});

test.each([
  ['development', undefined],
  ['development', '0'],
  ['production', '1'],
  ['production', undefined],
])('does not register for NODE_ENV=%s and flag=%s', (env, flag) => {
  process.env.NODE_ENV = env;
  if (flag === undefined) delete process.env.OMNI_SOLANA_DISCOVERY;
  else process.env.OMNI_SOLANA_DISCOVERY = flag;
  jest.isolateModules(() => require('@/content-script/page-provider'));
  expect(mockRegister).not.toHaveBeenCalled();
});

test('registers only for explicitly enabled development builds', () => {
  process.env.NODE_ENV = 'development';
  process.env.OMNI_SOLANA_DISCOVERY = '1';
  jest.isolateModules(() => require('@/content-script/page-provider'));
  expect(mockRegister).toHaveBeenCalledTimes(1);
});
