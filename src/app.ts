import {
  AccountValidationError, STORAGE_KEY, addAccount, loadAccounts,
  removeAccount, saveAccounts, updateAccount,
} from './accounts';
import type { Account, LoadResult } from './accounts';
import { formatOtp, generateTotp, getTimeStep } from './totp';

export function mountApp(root: HTMLElement): () => void {
  // This template is constant. Account values are assigned with textContent/value only.
  root.innerHTML = `
    <main>
      <div class="eyebrow">CÔNG CỤ TEST</div>
      <header class="page-header">
        <div><h1>2FA Local<span class="accent">.</span></h1><p>Các tài khoản test, ở cùng một chỗ.</p></div>
        <span class="badge"><span class="dot"></span>Lưu trên trình duyệt</span>
      </header>
      <section class="panel" aria-label="Quản lý tài khoản 2FA">
        <form id="account-form" novalidate autocomplete="off">
          <div class="field"><label for="email">Email</label>
            <input id="email" name="email" type="email" placeholder="tester@example.com" required aria-describedby="form-error" autocapitalize="none" spellcheck="false" />
          </div>
          <div class="field"><label for="secret">Secret key</label>
            <input id="secret" name="secret" type="text" placeholder="Dán key 2FA vào đây" required aria-describedby="form-error" autocomplete="off" autocapitalize="none" spellcheck="false" />
          </div>
          <div class="form-actions"><button class="primary" type="submit">+ Thêm tài khoản</button><button class="cancel" type="button" hidden>Hủy</button></div>
          <p id="form-error" class="error" role="alert" hidden></p>
        </form>
        <div class="toolbar">
          <span class="count">Tài khoản <span class="count-value">/ <span id="account-count">0</span></span></span>
          <span class="timer"><span class="dot"></span><span>Đổi mã sau <span id="remaining">30</span> giây</span><span class="timer-track" aria-hidden="true"><span class="timer-fill"></span></span></span>
        </div>
        <div class="table-wrap" tabindex="0" role="region" aria-label="Danh sách tài khoản; có thể cuộn ngang trên màn hình nhỏ">
          <table><thead><tr><th scope="col">EMAIL</th><th scope="col">KEY</th><th scope="col">MÃ OTP</th><th scope="col"><span class="sr-only">Thao tác</span></th></tr></thead><tbody></tbody></table>
        </div>
      </section>
      <p id="status" class="status" role="status" aria-live="polite"></p>
      <footer><span>Bấm vào mã OTP để copy.</span><span>Dữ liệu riêng theo trình duyệt và domain.</span></footer>
    </main>`;

  function find<T extends Element>(selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Thiếu thành phần giao diện: ${selector}`);
    return element;
  }

  const form = find<HTMLFormElement>('form');
  const emailInput = find<HTMLInputElement>('#email');
  const secretInput = find<HTMLInputElement>('#secret');
  const submitButton = find<HTMLButtonElement>('[type=submit]');
  const cancelButton = find<HTMLButtonElement>('.cancel');
  const errorElement = find<HTMLParagraphElement>('#form-error');
  const status = find<HTMLParagraphElement>('#status');
  const tbody = find<HTMLTableSectionElement>('tbody');
  const count = find<HTMLSpanElement>('#account-count');
  const remaining = find<HTMLSpanElement>('#remaining');
  const timerFill = find<HTMLSpanElement>('.timer-fill');

  let accounts: Account[] = [];
  let editingId: string | undefined;
  let readOnlyError = '';
  let revision = 0;
  let activeCounter = -1;
  let alive = true;
  let copyRequest = 0;
  const otpButtons = new Map<string, HTMLButtonElement>();

  function showError(message: string) {
    const visibleMessage = message || readOnlyError;
    errorElement.textContent = visibleMessage;
    errorElement.hidden = !visibleMessage;
    status.textContent = '';
    emailInput.removeAttribute('aria-invalid');
    secretInput.removeAttribute('aria-invalid');
  }

  function announce(message: string) {
    showError('');
    status.textContent = message;
  }

  function readStorage(): LoadResult {
    try {
      return loadAccounts(window.localStorage);
    } catch {
      return { ok: false, message: 'Không thể truy cập localStorage. Hãy cho phép website lưu dữ liệu.' };
    }
  }

  function resetForm() {
    editingId = undefined;
    form.reset();
    submitButton.textContent = '+ Thêm tài khoản';
    cancelButton.hidden = true;
    emailInput.removeAttribute('aria-invalid');
    secretInput.removeAttribute('aria-invalid');
  }

  function lockWrites(message: string) {
    readOnlyError = message;
    revision++;
    copyRequest++;
    resetForm();
    submitButton.disabled = true;
    renderAccounts();
    showError(message);
  }

  function sameAccounts(next: Account[]): boolean {
    return JSON.stringify(next) === JSON.stringify(accounts);
  }

  // Returns a current snapshot. A changed edit snapshot must be reviewed by the user first.
  function freshAccounts(): Account[] | null {
    if (readOnlyError) { showError(readOnlyError); return null; }
    const result = readStorage();
    if (!result.ok) { lockWrites(result.message); return null; }
    if (!sameAccounts(result.accounts)) {
      const wasEditing = editingId !== undefined;
      accounts = result.accounts;
      revision++;
      copyRequest++;
      if (wasEditing) resetForm();
      renderAccounts();
      if (wasEditing) {
        announce('Dữ liệu đã thay đổi ở tab khác. Đã hủy sửa; hãy chọn lại tài khoản.');
        return null;
      }
    }
    return result.accounts;
  }

  function commit(next: Account[], message: string, resetDraft = true) {
    try {
      saveAccounts(window.localStorage, next);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Không thể lưu tài khoản.');
      return;
    }
    accounts = next;
    revision++;
    copyRequest++;
    if (resetDraft) resetForm();
    renderAccounts();
    announce(message);
  }

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const fresh = freshAccounts();
    if (!fresh) return;
    try {
      const input = { email: emailInput.value, secret: secretInput.value };
      const wasEditing = editingId !== undefined;
      const next = wasEditing
        ? updateAccount(fresh, editingId!, input)
        : addAccount(fresh, input, crypto.randomUUID());
      commit(next, wasEditing ? 'Đã lưu thay đổi.' : 'Đã thêm tài khoản.');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Không thể lưu tài khoản.');
      if (error instanceof AccountValidationError) {
        const field = error.field === 'email' ? emailInput : secretInput;
        field.setAttribute('aria-invalid', 'true');
        field.focus();
      }
    }
  }

  function beginEdit(id: string) {
    const fresh = freshAccounts();
    if (!fresh) return;
    const account = fresh.find((item) => item.id === id);
    if (!account) { showError('Tài khoản không còn tồn tại.'); return; }
    editingId = id;
    emailInput.value = account.email;
    secretInput.value = account.secret;
    submitButton.textContent = 'Lưu thay đổi';
    cancelButton.hidden = false;
    showError('');
    emailInput.focus();
  }

  function deleteAccount(id: string) {
    const fresh = freshAccounts();
    if (!fresh) return;
    const account = fresh.find((item) => item.id === id);
    if (!account) { showError('Tài khoản không còn tồn tại.'); return; }
    if (!window.confirm(`Xóa tài khoản ${account.email}?`)) return;
    // confirm may block while another tab changes storage; read once more before writing.
    const latest = freshAccounts();
    if (!latest) return;
    const current = latest.find((item) => item.id === id);
    if (!current || current.email !== account.email || current.secret !== account.secret) {
      showError('Tài khoản đã thay đổi ở tab khác. Hãy kiểm tra lại trước khi xóa.');
      return;
    }
    try { commit(removeAccount(latest, id), 'Đã xóa tài khoản.', editingId === id); }
    catch (error) { showError(error instanceof Error ? error.message : 'Không thể xóa tài khoản.'); }
  }

  function isCurrent(account: Account, expectedRevision: number): boolean {
    return alive && revision === expectedRevision
      && accounts.some((item) => item.id === account.id && item.secret === account.secret);
  }

  async function fillOtp(account: Account, button: HTMLButtonElement, counter: number, expectedRevision: number) {
    try {
      const code = await generateTotp(account.secret, counter * 30_000);
      if (!isCurrent(account, expectedRevision) || otpButtons.get(account.id) !== button) return;
      if (getTimeStep(Date.now()).counter !== counter) { refreshClock(); return; }
      button.textContent = formatOtp(code);
      button.disabled = false;
      button.classList.remove('otp-error');
      button.title = 'Bấm để copy mã OTP';
    } catch (error) {
      if (!isCurrent(account, expectedRevision) || otpButtons.get(account.id) !== button) return;
      if (getTimeStep(Date.now()).counter !== counter) { refreshClock(); return; }
      button.textContent = 'Lỗi tạo mã';
      button.classList.add('otp-error');
      button.title = error instanceof Error ? error.message : 'Không thể tạo OTP.';
      button.disabled = true;
    }
  }

  async function copyOtp(account: Account) {
    const expectedRevision = revision;
    const request = ++copyRequest;
    showError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard không được hỗ trợ.');
      // Retry once if the time step changes while Web Crypto is working.
      for (let attempt = 0; attempt < 2; attempt++) {
        const now = Date.now();
        const { counter } = getTimeStep(now);
        const code = await generateTotp(account.secret, now);
        if (!isCurrent(account, expectedRevision) || request !== copyRequest) return;
        if (getTimeStep(Date.now()).counter !== counter) { refreshClock(); continue; }
        await navigator.clipboard.writeText(code);
        if (isCurrent(account, expectedRevision) && request === copyRequest) {
          if (getTimeStep(Date.now()).counter !== counter) {
            refreshClock();
            showError('Mã vừa copy đã hết hạn. Hãy bấm lại để lấy mã mới.');
          } else {
            announce(`Đã copy mã OTP của ${account.email}.`);
          }
        }
        return;
      }
      throw new Error('Thời gian hệ thống thay đổi trong khi tạo mã.');
    } catch {
      if (isCurrent(account, expectedRevision) && request === copyRequest) {
        showError('Không thể copy mã OTP. Hãy kiểm tra quyền clipboard, mở trang qua HTTPS và thử lại.');
      }
    }
  }

  function renderAccounts() {
    otpButtons.clear();
    tbody.replaceChildren();
    count.textContent = String(accounts.length);
    if (!accounts.length) {
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.className = 'empty';
      cell.textContent = readOnlyError ? 'Không thể tải danh sách tài khoản.' : 'Chưa có tài khoản. Thêm email và key đầu tiên ở phía trên.';
      const row = document.createElement('tr');
      row.append(cell);
      tbody.append(row);
    }
    for (const account of accounts) {
      const row = document.createElement('tr');
      row.dataset.accountId = account.id;
      const email = document.createElement('td');
      email.textContent = account.email;
      const secret = document.createElement('td');
      secret.className = 'secret';
      secret.textContent = account.secret;
      const otpCell = document.createElement('td');
      const otpButton = document.createElement('button');
      otpButton.type = 'button';
      otpButton.className = 'otp';
      otpButton.disabled = true;
      otpButton.textContent = 'Đang tạo…';
      otpButton.setAttribute('aria-label', `Copy mã OTP của ${account.email}`);
      otpButton.addEventListener('click', () => { void copyOtp(account); });
      otpButtons.set(account.id, otpButton);
      otpCell.append(otpButton);
      const actionCell = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      for (const [label, action] of [
        ['Sửa', () => beginEdit(account.id)], ['Xóa', () => deleteAccount(account.id)],
      ] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-button';
        button.textContent = label;
        button.setAttribute('aria-label', `${label} tài khoản ${account.email}`);
        button.disabled = Boolean(readOnlyError);
        button.addEventListener('click', action);
        actions.append(button);
      }
      actionCell.append(actions);
      row.append(email, secret, otpCell, actionCell);
      tbody.append(row);
    }
    activeCounter = -1;
    refreshClock();
  }

  function refreshClock() {
    if (!alive) return;
    const { counter, remainingSeconds } = getTimeStep(Date.now());
    const text = String(remainingSeconds);
    if (remaining.textContent !== text) remaining.textContent = text;
    timerFill.style.width = `${remainingSeconds / 30 * 100}%`;
    if (activeCounter === counter) return;
    activeCounter = counter;
    for (const account of accounts) {
      const button = otpButtons.get(account.id);
      if (!button) continue;
      button.disabled = true;
      button.textContent = 'Đang tạo…';
      void fillOtp(account, button, counter, revision);
    }
  }

  function onCancel() { resetForm(); announce('Đã hủy sửa.'); }

  function onStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try { if (event.storageArea && event.storageArea !== window.localStorage) return; }
    catch { lockWrites('Không thể truy cập localStorage.'); return; }
    const result = readStorage();
    if (!result.ok) { lockWrites(result.message); return; }
    accounts = result.accounts;
    readOnlyError = '';
    submitButton.disabled = false;
    revision++;
    copyRequest++;
    resetForm();
    renderAccounts();
    announce('Dữ liệu đã cập nhật từ tab khác. Mọi thay đổi đang sửa đã được hủy.');
  }

  const initial = readStorage();
  if (initial.ok) { accounts = initial.accounts; renderAccounts(); }
  else lockWrites(initial.message);
  form.addEventListener('submit', onSubmit);
  cancelButton.addEventListener('click', onCancel);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', refreshClock);
  document.addEventListener('visibilitychange', refreshClock);
  const timer = window.setInterval(refreshClock, 250);

  return () => {
    alive = false;
    revision++;
    copyRequest++;
    window.clearInterval(timer);
    form.removeEventListener('submit', onSubmit);
    cancelButton.removeEventListener('click', onCancel);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', refreshClock);
    document.removeEventListener('visibilitychange', refreshClock);
  };
}
