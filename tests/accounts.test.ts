import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountValidationError, STORAGE_KEY, addAccount, loadAccounts,
  removeAccount, saveAccounts, updateAccount, validateAccount,
} from '../src/accounts';
import type { Account } from '../src/accounts';

const first: Account = { id: 'a', email: 'tester@example.com', secret: 'JBSWY3DPEHPK3PXP' };
const second: Account = { id: 'b', email: 'other@example.com', secret: 'MY' };

beforeEach(() => localStorage.clear());

describe('account validation and CRUD', () => {
  it('normalizes input and allows the same email with another key', () => {
    expect(validateAccount({ email: ' tester@example.com ', secret: ' my====== ' }, [first]))
      .toEqual({ email: first.email, secret: 'MY' });
    expect(validateAccount(first, [first], first.id)).toEqual({ email: first.email, secret: first.secret });
  });

  it('rejects duplicate normalized email/key pairs on add and edit', () => {
    expect(() => validateAccount({ email: 'TESTER@example.com', secret: first.secret.toLowerCase() }, [first]))
      .toThrow('đã tồn tại');
    expect(() => updateAccount([first, second], 'b', first)).toThrow('đã tồn tại');
    expect(() => validateAccount({ email: '', secret: 'MY' }, [])).toThrow(AccountValidationError);
    expect(() => validateAccount({ email: 'wrong', secret: 'MY' }, [])).toThrow('Email');
    expect(() => validateAccount({ email: 'a\nb@example.com', secret: 'MY' }, [])).toThrow('Email');
    expect(() => validateAccount({ email: first.email, secret: 'MZ' }, [])).toThrow('Base32');
  });

  it('adds last, edits in place, removes by ID and keeps original arrays unchanged', () => {
    const original = [first];
    const added = addAccount(original, second, second.id);
    expect(original).toEqual([first]);
    expect(added).toEqual([first, second]);
    const updated = updateAccount(added, 'a', { email: 'edited@example.com', secret: 'MY' });
    expect(updated.map((account) => account.id)).toEqual(['a', 'b']);
    expect(updated[0].email).toBe('edited@example.com');
    expect(removeAccount(updated, 'a')).toEqual([second]);
    expect(() => updateAccount(added, 'missing', first)).toThrow();
    expect(() => removeAccount(added, 'missing')).toThrow();
    expect(() => addAccount(added, { email: 'new@example.com', secret: 'MY' }, 'a')).toThrow();
  });
});

describe('versioned storage', () => {
  it('loads empty storage without writing and roundtrips IDs/order without OTPs', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    expect(loadAccounts(localStorage)).toEqual({ ok: true, accounts: [] });
    expect(setItem).not.toHaveBeenCalled();
    saveAccounts(localStorage, [first, second]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({ version: 1, accounts: [first, second] });
    expect(loadAccounts(localStorage)).toEqual({ ok: true, accounts: [first, second] });
  });

  it.each([
    '{broken', 'null', '', JSON.stringify({ version: 2, accounts: [] }),
    JSON.stringify({ version: 1, accounts: [{ id: 'a' }] }),
    JSON.stringify({ version: 1, accounts: [first, { ...second, id: 'a' }] }),
    JSON.stringify({ version: 1, accounts: [{ ...first, secret: 'MZ' }] }),
    JSON.stringify({ version: 1, accounts: [first, { ...first, id: 'b' }] }),
  ])('preserves malformed/unsupported payload %s without overwriting it', (raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    expect(loadAccounts(localStorage).ok).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('reports blocked reads and throws failed writes without changing existing storage', () => {
    expect(loadAccounts({ getItem: () => { throw new DOMException('Blocked', 'SecurityError'); } }).ok).toBe(false);
    saveAccounts(localStorage, [first]);
    const original = localStorage.getItem(STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    expect(() => saveAccounts(localStorage, [second])).toThrow('Không thể lưu');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original);
  });
});
