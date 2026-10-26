import { normalizeSecret } from './totp';

export const STORAGE_KEY = '2fa-local.accounts.v1';
export type Account = { id: string; email: string; secret: string };
export type AccountInput = { email: string; secret: string };
export type LoadResult = { ok: true; accounts: Account[] } | { ok: false; message: string };

export class AccountValidationError extends Error {
  constructor(message: string, public readonly field: 'email' | 'secret') {
    super(message);
    this.name = 'AccountValidationError';
  }
}

export function validateAccount(
  input: AccountInput, accounts: readonly Account[], editingId?: string,
): AccountInput {
  const email = input.email.trim();
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.required = true;
  emailInput.value = email;
  if (!email || emailInput.value !== email || !emailInput.validity.valid) {
    throw new AccountValidationError('Email không hợp lệ. Hãy nhập đầy đủ địa chỉ email.', 'email');
  }
  let secret: string;
  try {
    secret = normalizeSecret(input.secret);
  } catch (error) {
    throw new AccountValidationError(error instanceof Error ? error.message : 'Key không hợp lệ.', 'secret');
  }
  if (accounts.some((account) => account.id !== editingId
    && account.email.toLowerCase() === email.toLowerCase() && account.secret === secret)) {
    throw new AccountValidationError('Tài khoản với email và key này đã tồn tại.', 'secret');
  }
  return { email, secret };
}

export function addAccount(accounts: readonly Account[], input: AccountInput, id: string): Account[] {
  if (!id || accounts.some((account) => account.id === id)) throw new Error('ID tài khoản đã tồn tại.');
  return [...accounts, { id, ...validateAccount(input, accounts) }];
}

export function updateAccount(accounts: readonly Account[], id: string, input: AccountInput): Account[] {
  if (!accounts.some((account) => account.id === id)) throw new Error('Tài khoản không còn tồn tại.');
  const normalized = validateAccount(input, accounts, id);
  return accounts.map((account) => account.id === id ? { id, ...normalized } : account);
}

export function removeAccount(accounts: readonly Account[], id: string): Account[] {
  if (!accounts.some((account) => account.id === id)) throw new Error('Tài khoản không còn tồn tại.');
  return accounts.filter((account) => account.id !== id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadAccounts(storage: Pick<Storage, 'getItem'>): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, message: 'Không thể đọc localStorage. Hãy cho phép website lưu dữ liệu trong trình duyệt.' };
  }
  if (raw === null) return { ok: true, accounts: [] };
  try {
    const payload: unknown = JSON.parse(raw);
    if (!isRecord(payload) || payload.version !== 1 || !Array.isArray(payload.accounts)) throw new Error();
    const accounts: Account[] = [];
    for (const value of payload.accounts) {
      if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()
        || typeof value.email !== 'string' || typeof value.secret !== 'string') throw new Error();
      if (accounts.some((account) => account.id === value.id)) throw new Error();
      const input = validateAccount({ email: value.email, secret: value.secret }, accounts);
      accounts.push({ id: value.id, ...input });
    }
    return { ok: true, accounts };
  } catch {
    return {
      ok: false,
      message: 'Dữ liệu đã lưu bị lỗi hoặc có phiên bản chưa hỗ trợ. Đã khóa ghi để giữ nguyên dữ liệu; xem hướng dẫn khôi phục trong README.',
    };
  }
}

export function saveAccounts(storage: Pick<Storage, 'setItem'>, accounts: readonly Account[]): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      accounts: accounts.map(({ id, email, secret }) => ({ id, email, secret })),
    }));
  } catch {
    throw new Error('Không thể lưu vào localStorage. Dữ liệu chưa được thay đổi; hãy kiểm tra quyền lưu và dung lượng trình duyệt.');
  }
}
