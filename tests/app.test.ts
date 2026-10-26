import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../src/app';
import { STORAGE_KEY, loadAccounts, saveAccounts } from '../src/accounts';
import type { Account } from '../src/accounts';
import { generateTotp } from '../src/totp';

vi.mock('../src/totp', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/totp')>(),
  generateTotp: vi.fn(),
}));

const account: Account = { id: 'a', email: 'tester@example.com', secret: 'JBSWY3DPEHPK3PXP' };
const otp = vi.mocked(generateTotp);
let root: HTMLElement;
let dispose: (() => void) | undefined;
let writeText: ReturnType<typeof vi.fn>;

function input(id: string): HTMLInputElement { return root.querySelector<HTMLInputElement>(`#${id}`)!; }
function button(text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((element) => element.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
function submit(email = 'new@example.com', secret = 'MY') {
  input('email').value = email;
  input('secret').value = secret;
  root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function mount(accounts?: Account[]) {
  if (accounts) saveAccounts(localStorage, accounts);
  dispose = mountApp(root);
}
function external(accounts: Account[] | null) {
  if (accounts) saveAccounts(localStorage, accounts); else localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(30_000);
  localStorage.clear();
  root = document.createElement('div');
  document.body.append(root);
  otp.mockReset().mockImplementation(async (_secret, now) => String(Math.floor(now / 30_000)).padStart(6, '0'));
  writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { clipboard: { writeText } }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  root.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('account UI', () => {
  it('starts empty, adds one account and preserves it after remount', async () => {
    mount();
    expect(root.textContent).toContain('Chưa có tài khoản');
    submit();
    await settle();
    expect(root.querySelector('tbody')!.textContent).toContain('new@example.com');
    expect(root.querySelector('tbody')!.textContent).toContain('MY');
    dispose!();
    dispose = mountApp(root);
    expect(root.querySelector('tbody')!.textContent).toContain('new@example.com');
  });

  it('validates input, edits in place, cancels edits, and confirms deletion', async () => {
    mount([account]);
    submit('invalid', 'MZ');
    expect(root.querySelector('[role=alert]')!.textContent).toContain('Email');
    button('Sửa').click();
    expect(input('email').value).toBe(account.email);
    button('Hủy').click();
    expect(input('email').value).toBe('');
    button('Sửa').click();
    submit('edited@example.com', 'MY');
    expect(loadAccounts(localStorage)).toEqual({ ok: true, accounts: [{ ...account, email: 'edited@example.com', secret: 'MY' }] });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    button('Xóa').click();
    expect(root.querySelectorAll('tr[data-account-id]')).toHaveLength(1);
    button('Xóa').click();
    await settle();
    expect(root.textContent).toContain('Chưa có tài khoản');
  });

  it('preserves email characters as text and rejects HTML in stored email', () => {
    mount([{ ...account, email: 'a&b@example.com' }]);
    expect(root.querySelector('tbody')!.textContent).toContain('a&b@example.com');
    expect(root.querySelector('tbody b')).toBeNull();
    external([{ ...account, email: '<img src=x onerror=alert(1)>@example.com' }]);
    expect(root.querySelector('tbody img')).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(true);
  });

  it('preserves an edit draft when deleting a different account', () => {
    mount([account, { id: 'b', email: 'other@example.com', secret: 'MY' }]);
    button('Sửa').click();
    input('secret').value = 'MY';
    const otherRow = root.querySelector('[data-account-id="b"]')!;
    [...otherRow.querySelectorAll('button')].find((element) => element.textContent === 'Xóa')!.click();
    expect(input('email').value).toBe(account.email);
    expect(input('secret').value).toBe('MY');
    expect(button('Lưu thay đổi')).toBeDefined();
    expect(loadAccounts(localStorage)).toEqual({ ok: true, accounts: [account] });
    submit(account.email, 'MY');
    expect(loadAccounts(localStorage)).toEqual({ ok: true, accounts: [{ ...account, secret: 'MY' }] });
  });

  it('preserves a new account draft when deleting an existing account', () => {
    mount([account]);
    input('email').value = 'draft@example.com';
    input('secret').value = 'MY';
    button('Xóa').click();
    expect(input('email').value).toBe('draft@example.com');
    expect(input('secret').value).toBe('MY');
    expect(button('+ Thêm tài khoản')).toBeDefined();
    expect(loadAccounts(localStorage)).toEqual({ ok: true, accounts: [] });
  });

  it('keeps form and list on a failed write and does not announce success', () => {
    mount([account]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
    submit();
    expect(input('email').value).toBe('new@example.com');
    expect(root.querySelectorAll('tr[data-account-id]')).toHaveLength(1);
    expect(root.querySelector('[role=alert]')!.textContent).toContain('Không thể lưu');
    expect(root.querySelector('[role=status]')!.textContent).not.toContain('Đã thêm');
  });

  it('locks writes for corrupt storage and preserves the original payload', () => {
    localStorage.setItem(STORAGE_KEY, '{broken');
    mount();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    submit();
    expect(root.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{broken');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('cancels an edit on a storage event and locks writes if external data is corrupt', () => {
    mount([account]);
    button('Sửa').click();
    external([{ ...account, email: 'external@example.com' }]);
    expect(input('email').value).toBe('');
    expect(root.querySelector('[role=status]')!.textContent).toContain('tab khác');
    expect(root.querySelector('tbody')!.textContent).toContain('external@example.com');
    localStorage.setItem(STORAGE_KEY, '{broken');
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, storageArea: localStorage }));
    expect(root.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(true);
  });
});

describe('OTP freshness and clipboard', () => {
  it('refreshes on focus and visibility changes after the system clock jumps', async () => {
    mount([account]);
    await settle();
    expect(root.querySelector('.otp')!.textContent).toBe('000 001');
    vi.setSystemTime(95_000);
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(root.querySelector('.otp')!.textContent).toBe('000 003');
    vi.setSystemTime(125_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(root.querySelector('.otp')!.textContent).toBe('000 004');
    expect(root.querySelector('#remaining')!.textContent).toBe('25');
  });

  it.each(['edit', 'delete'] as const)('discards a pending OTP after %s', async (action) => {
    let resolveOld!: (value: string) => void;
    otp.mockImplementationOnce(() => new Promise<string>((resolve) => { resolveOld = resolve; }));
    mount([account]);
    if (action === 'edit') {
      button('Sửa').click();
      submit(account.email, 'MY');
    } else button('Xóa').click();
    resolveOld('999999');
    await settle();
    expect(root.querySelector('tbody')!.textContent).not.toContain('999 999');
    if (action === 'edit') expect(root.querySelector('.otp')!.textContent).toBe('000 001');
    else expect(root.querySelectorAll('tr[data-account-id]')).toHaveLength(0);
  });

  it('recomputes a pending OTP that finishes in another time step', async () => {
    let finish!: (value: string) => void;
    otp.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
    mount([account]);
    vi.setSystemTime(60_000);
    finish('999999');
    await settle();
    expect(root.querySelector('.otp')!.textContent).toBe('000 002');
  });

  it('copies the current counter rather than the displayed stale code', async () => {
    mount([account]);
    await settle();
    vi.setSystemTime(60_000);
    (root.querySelector('.otp') as HTMLButtonElement).click();
    await settle();
    expect(writeText).toHaveBeenCalledWith('000002');
    expect(root.querySelector('[role=status]')!.textContent).toContain('Đã copy');
  });

  it('retries copy generation across a boundary and cancels it after account deletion', async () => {
    mount([account]);
    await settle();
    let finish!: (value: string) => void;
    otp.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
    (root.querySelector('.otp') as HTMLButtonElement).click();
    vi.setSystemTime(60_000);
    finish('000001');
    await settle();
    expect(writeText).toHaveBeenCalledWith('000002');
    writeText.mockClear();
    otp.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
    (root.querySelector('.otp') as HTMLButtonElement).click();
    button('Xóa').click();
    finish('000002');
    await settle();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('reports clipboard rejection without a success notification', async () => {
    mount([account]);
    await settle();
    writeText.mockRejectedValueOnce(new Error('Denied'));
    (root.querySelector('.otp') as HTMLButtonElement).click();
    await settle();
    expect(root.querySelector('[role=alert]')!.textContent).toContain('Không thể copy');
    expect(root.querySelector('[role=status]')!.textContent).not.toContain('Đã copy');
  });

  it('reports expiration instead of success when the clipboard write crosses a boundary', async () => {
    mount([account]);
    await settle();
    let finishWrite!: () => void;
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => { finishWrite = resolve; }));
    (root.querySelector('.otp') as HTMLButtonElement).click();
    await settle();
    expect(writeText).toHaveBeenCalledWith('000001');
    vi.setSystemTime(60_000);
    finishWrite();
    await settle();
    expect(root.querySelector('[role=alert]')!.textContent).toContain('hết hạn');
    expect(root.querySelector('[role=status]')!.textContent).not.toContain('Đã copy');
    expect(root.querySelector('.otp')!.textContent).toBe('000 002');
  });

  it('stops timers and pending results after unmount', async () => {
    let finish!: (value: string) => void;
    otp.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
    mount([account]);
    const before = root.textContent;
    dispose!();
    finish('999999');
    await vi.advanceTimersByTimeAsync(31_000);
    expect(root.textContent).toBe(before);
  });
});
