interface Product {
  id: string;
  name: string;
  vendor: string;
  monthlyCostCents: number;
  totalSeats: number;
  seatsInUse: number;
  seatsAvailable: number;
}

type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'OFFBOARDED';

interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  status: EmployeeStatus;
  offboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ActiveLicense {
  assignmentId: string;
  productId: string;
  productName: string;
  assignedAt: string;
}

interface EmployeeDetail extends Employee {
  activeLicenses: ActiveLicense[];
}

interface LicenseAssignment {
  id: string;
  productId: string;
  productName: string;
  employeeId: string;
  employeeName: string;
  assignedAt: string;
  revokedAt: string | null;
  revokeReason: 'MANUAL' | 'OFFBOARDING' | null;
}

interface CostReport {
  totalMonthlyCostCents: number;
  byDepartment: Array<{
    department: string;
    activeLicenses: number;
    monthlyCostCents: number;
  }>;
  idleSeats: Array<{
    productId: string;
    productName: string;
    idleSeats: number;
    wastedMonthlyCostCents: number;
  }>;
  potentialMonthlySavingsCents: number;
}

interface OffboardResult {
  employeeId: string;
  status: 'OFFBOARDED';
  revokedLicenses: number;
  monthlySavingsCents: number;
}

interface SeatsThresholdEvent {
  productId: string;
  productName: string;
  seatsInUse: number;
  totalSeats: number;
}

interface SocketClient {
  on(event: 'connect' | 'disconnect', listener: () => void): void;
  on(
    event: 'seats.threshold',
    listener: (payload: SeatsThresholdEvent) => void,
  ): void;
}

declare const io: (() => SocketClient) | undefined;

class ApiError extends Error {
  constructor(
    readonly status: number | null,
    readonly messages: string[],
  ) {
    super(messages.join('\n'));
  }
}

const state: {
  report: CostReport | null;
  products: Product[];
  employees: Employee[];
  displayedEmployees: Employee[];
  licenses: LicenseAssignment[];
  displayedLicenses: LicenseAssignment[];
  loaded: boolean;
} = {
  report: null,
  products: [],
  employees: [],
  displayedEmployees: [],
  licenses: [],
  displayedLicenses: [],
  loaded: false,
};

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Element #${id} not found`);
  return found as T;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  );
}

function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

function formatMoneyInput(cents: number): string {
  const reais = Math.floor(cents / 100);
  const remainingCents = cents % 100;
  return `${reais},${remainingCents.toString().padStart(2, '0')}`;
}

function parseCurrencyToCents(value: string): number | null {
  const normalized = value.trim().replace(/^R\$\s*/i, '');
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(normalized);
  if (!match) return null;

  const reais = Number(match[1]);
  const cents = Number((match[2] ?? '').padEnd(2, '0'));
  const total = reais * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(null, [
      'Não foi possível conectar à aplicação. Verifique a conexão e tente novamente.',
    ]);
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new ApiError(response.status, [
      'A aplicação retornou uma resposta que não pôde ser lida. Tente novamente.',
    ]);
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? body.message
        : 'Erro inesperado.';
    const messages = Array.isArray(message)
      ? message.map(String)
      : [String(message)];
    throw new ApiError(response.status, messages);
  }

  return body as T;
}

function jsonRequest<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body?: object,
): Promise<T> {
  return request<T>(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function showFeedback(kind: 'success' | 'error', message: string): void {
  const container = element<HTMLDivElement>('feedback');
  container.replaceChildren();
  const notice = document.createElement('div');
  notice.className = `notice ${kind}`;
  const text = document.createElement('span');
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fechar mensagem');
  close.textContent = '×';
  close.addEventListener('click', () => container.replaceChildren());
  notice.append(text, close);
  container.append(notice);
  container.focus();
}

function showError(error: unknown): void {
  if (error instanceof ApiError) {
    const prefix = error.status === null ? '' : `Erro ${error.status}: `;
    showFeedback('error', `${prefix}${error.messages.join('\n')}`);
    return;
  }
  showFeedback('error', 'Ocorreu um erro inesperado. Tente novamente.');
}

function employeeFilterPath(): string {
  const status = element<HTMLSelectElement>('employee-status-filter').value;
  const department = element<HTMLInputElement>(
    'employee-department-filter',
  ).value.trim();
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (department) params.set('department', department);
  return params.size ? `/employees?${params.toString()}` : '/employees';
}

function licenseFilterPath(): string {
  const productId = element<HTMLSelectElement>('license-product-filter').value;
  const employeeId = element<HTMLSelectElement>(
    'license-employee-filter',
  ).value;
  const active = element<HTMLSelectElement>('license-active-filter').value;
  const params = new URLSearchParams();
  if (productId) params.set('productId', productId);
  if (employeeId) params.set('employeeId', employeeId);
  if (active) params.set('active', active);
  return params.size ? `/licenses?${params.toString()}` : '/licenses';
}

async function refreshAll(): Promise<void> {
  const [report, products, employees, licenses] = await Promise.all([
    request<CostReport>('/reports/costs'),
    request<Product[]>('/products'),
    request<Employee[]>('/employees'),
    request<LicenseAssignment[]>('/licenses'),
  ]);

  state.report = report;
  state.products = products;
  state.employees = employees;
  state.licenses = licenses;
  state.displayedEmployees =
    employeeFilterPath() === '/employees'
      ? employees
      : await request<Employee[]>(employeeFilterPath());
  state.displayedLicenses =
    licenseFilterPath() === '/licenses'
      ? licenses
      : await request<LicenseAssignment[]>(licenseFilterPath());
  state.loaded = true;
  renderAll();
}

function renderAll(): void {
  renderOverview();
  renderProducts();
  renderEmployees();
  renderLicenses();
  renderSelects();
}

function renderOverview(): void {
  if (!state.report) return;
  element('overview-loading').hidden = true;
  element('overview-content').hidden = false;

  const activeLicenses = state.report.byDepartment.reduce(
    (total, item) => total + item.activeLicenses,
    0,
  );
  const idleSeats = state.report.idleSeats.reduce(
    (total, item) => total + item.idleSeats,
    0,
  );
  element('metrics').innerHTML = [
    ['Custo mensal total', formatMoney(state.report.totalMonthlyCostCents), ''],
    [
      'Economia mensal potencial',
      formatMoney(state.report.potentialMonthlySavingsCents),
      'savings',
    ],
    ['Licenças ativas', String(activeLicenses), ''],
    ['Vagas ociosas', String(idleSeats), 'savings'],
  ]
    .map(
      ([label, value, className]) => `
        <article class="metric-card ${className}">
          <span class="metric-label">${label}</span>
          <strong class="metric-value">${value}</strong>
        </article>`,
    )
    .join('');

  const maxDepartmentCost = Math.max(
    ...state.report.byDepartment.map((item) => item.monthlyCostCents),
    1,
  );
  element('department-costs').innerHTML = state.report.byDepartment.length
    ? `<div class="department-list">${state.report.byDepartment
        .map(
          (item) => `
          <div class="department-row">
            <div class="row-summary">
              <strong>${escapeHtml(item.department)}</strong>
              <span>${formatMoney(item.monthlyCostCents)}</span>
            </div>
            <div class="bar-track" aria-label="${item.activeLicenses} licenças ativas">
              <div class="bar-fill" style="width: ${(item.monthlyCostCents / maxDepartmentCost) * 100}%"></div>
            </div>
            <span class="row-detail">${item.activeLicenses} ${item.activeLicenses === 1 ? 'licença ativa' : 'licenças ativas'}</span>
          </div>`,
        )
        .join('')}</div>`
    : '<div class="empty-state">Nenhum custo por departamento.</div>';

  element('idle-seats').innerHTML = state.report.idleSeats.length
    ? `<div class="idle-list">${state.report.idleSeats
        .map(
          (item) => `
          <div class="idle-row">
            <div class="row-summary">
              <strong>${escapeHtml(item.productName)}</strong>
              <span>${formatMoney(item.wastedMonthlyCostCents)}</span>
            </div>
            <span class="row-detail">${item.idleSeats} ${item.idleSeats === 1 ? 'vaga ociosa' : 'vagas ociosas'} por mês</span>
          </div>`,
        )
        .join('')}</div>`
    : '<div class="empty-state">Nenhuma vaga ociosa.</div>';
}

function renderProducts(): void {
  const table = element<HTMLTableSectionElement>('products-table');
  element('products-empty').hidden = state.products.length > 0;
  table.innerHTML = state.products
    .map((product) => {
      const percentage =
        product.totalSeats === 0
          ? 0
          : Math.min(100, (product.seatsInUse / product.totalSeats) * 100);
      const high = percentage >= 90;
      return `
        <tr>
          <td><span class="cell-title">${escapeHtml(product.name)}</span></td>
          <td>${escapeHtml(product.vendor)}</td>
          <td>${formatMoney(product.monthlyCostCents)}</td>
          <td>
            <div class="occupancy ${high ? 'high' : ''}">
              <span>${product.seatsInUse} de ${product.totalSeats} em uso${high ? ' · limite alto' : ''}</span>
              <div class="bar-track"><div class="bar-fill ${high ? 'warning' : ''}" style="width: ${percentage}%"></div></div>
            </div>
          </td>
          <td><strong>${product.seatsAvailable}</strong></td>
          <td><button class="table-action" data-action="edit-product" data-id="${product.id}" type="button">Editar</button></td>
        </tr>`;
    })
    .join('');
}

function statusBadge(status: EmployeeStatus): string {
  const className =
    status === 'ACTIVE'
      ? 'active'
      : status === 'ON_LEAVE'
        ? 'leave'
        : 'offboarded';
  return `<span class="badge ${className}">${status}</span>`;
}

function renderEmployees(): void {
  const table = element<HTMLTableSectionElement>('employees-table');
  element('employees-empty').hidden = state.displayedEmployees.length > 0;
  table.innerHTML = state.displayedEmployees
    .map(
      (employee) => `
        <tr>
          <td>
            <span class="cell-title">${escapeHtml(employee.name)}</span>
            <span class="cell-subtitle">${escapeHtml(employee.email)}</span>
          </td>
          <td>${escapeHtml(employee.department)}</td>
          <td>${statusBadge(employee.status)}</td>
          <td>${formatDate(employee.offboardedAt)}</td>
          <td><button class="table-action" data-action="view-employee" data-id="${employee.id}" type="button">Ver detalhes</button></td>
        </tr>`,
    )
    .join('');
}

function renderLicenses(): void {
  const table = element<HTMLTableSectionElement>('licenses-table');
  element('licenses-empty').hidden = state.displayedLicenses.length > 0;
  table.innerHTML = state.displayedLicenses
    .map(
      (license) => `
        <tr>
          <td><span class="cell-title">${escapeHtml(license.productName)}</span></td>
          <td>${escapeHtml(license.employeeName)}</td>
          <td>${formatDate(license.assignedAt)}</td>
          <td>${license.revokedAt ? '<span class="badge revoked">REVOGADA</span>' : '<span class="badge active">ATIVA</span>'}</td>
          <td>
            <span class="cell-title">${formatDate(license.revokedAt)}</span>
            ${license.revokeReason ? `<span class="cell-subtitle">${license.revokeReason}</span>` : ''}
          </td>
          <td>
            ${license.revokedAt ? '' : `<button class="table-action" data-action="revoke-license" data-id="${license.id}" type="button">Revogar</button>`}
          </td>
        </tr>`,
    )
    .join('');
}

function optionsHtml<T>(
  items: T[],
  value: (item: T) => string,
  label: (item: T) => string,
  disabled: (item: T) => boolean = () => false,
): string {
  return items
    .map(
      (item) =>
        `<option value="${value(item)}" ${disabled(item) ? 'disabled' : ''}>${escapeHtml(label(item))}</option>`,
    )
    .join('');
}

function replaceOptions(
  select: HTMLSelectElement,
  firstLabel: string,
  options: string,
): void {
  const selected = select.value;
  select.innerHTML = `<option value="">${firstLabel}</option>${options}`;
  if ([...select.options].some((option) => option.value === selected)) {
    select.value = selected;
  }
}

function renderSelects(): void {
  const productOptions = optionsHtml(
    state.products,
    (product) => product.id,
    (product) => product.name,
  );
  const employeeOptions = optionsHtml(
    state.employees,
    (employee) => employee.id,
    (employee) => employee.name,
  );
  replaceOptions(
    element<HTMLSelectElement>('license-product-filter'),
    'Todos',
    productOptions,
  );
  replaceOptions(
    element<HTMLSelectElement>('license-employee-filter'),
    'Todos',
    employeeOptions,
  );

  const sortedProducts = [...state.products].sort(
    (left, right) =>
      Number(right.seatsAvailable > 0) - Number(left.seatsAvailable > 0),
  );
  const assignProductOptions = optionsHtml(
    sortedProducts,
    (product) => product.id,
    (product) => `${product.name} · ${product.seatsAvailable} disponíveis`,
    (product) => product.seatsAvailable < 1,
  );
  replaceOptions(
    element<HTMLSelectElement>('license-product'),
    'Selecione um produto',
    assignProductOptions,
  );

  const sortedEmployees = [...state.employees].sort(
    (left, right) =>
      Number(right.status === 'ACTIVE') - Number(left.status === 'ACTIVE'),
  );
  const assignEmployeeOptions = optionsHtml(
    sortedEmployees,
    (employee) => employee.id,
    (employee) => `${employee.name} · ${employee.status}`,
    (employee) => employee.status !== 'ACTIVE',
  );
  replaceOptions(
    element<HTMLSelectElement>('license-employee'),
    'Selecione um colaborador',
    assignEmployeeOptions,
  );
}

function openDialog(id: string): void {
  element<HTMLDialogElement>(id).showModal();
}

function closeDialog(dialog: HTMLDialogElement): void {
  dialog.close();
}

async function withBusyButton(
  button: HTMLButtonElement,
  action: () => Promise<void>,
): Promise<void> {
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
  }
}

function openProductForm(product?: Product): void {
  const form = element<HTMLFormElement>('product-form');
  form.reset();
  element<HTMLInputElement>('product-id').value = product?.id ?? '';
  element('product-form-title').textContent = product
    ? 'Editar produto'
    : 'Novo produto';
  element<HTMLInputElement>('product-name').value = product?.name ?? '';
  element<HTMLInputElement>('product-vendor').value = product?.vendor ?? '';
  element<HTMLInputElement>('product-cost').value =
    product === undefined ? '' : formatMoneyInput(product.monthlyCostCents);
  element<HTMLInputElement>('product-seats').value =
    product?.totalSeats.toString() ?? '';
  openDialog('product-dialog');
}

async function openEmployeeDetail(employeeId: string): Promise<void> {
  const detail = await request<EmployeeDetail>(`/employees/${employeeId}`);
  const licenses = detail.activeLicenses.length
    ? detail.activeLicenses
        .map(
          (license) => `
            <div class="license-card">
              <strong>${escapeHtml(license.productName)}</strong>
              <span class="row-detail">desde ${formatDate(license.assignedAt)}</span>
            </div>`,
        )
        .join('')
    : '<div class="empty-state">Nenhuma licença ativa.</div>';
  const statusAction =
    detail.status === 'ACTIVE'
      ? `<button class="secondary-button" data-detail-action="status" data-status="ON_LEAVE" type="button">Colocar em férias</button>`
      : detail.status === 'ON_LEAVE'
        ? `<button class="secondary-button" data-detail-action="status" data-status="ACTIVE" type="button">Reativar</button>`
        : '';
  const assignAction =
    detail.status === 'ACTIVE'
      ? '<button class="primary-button" data-detail-action="assign" type="button">Atribuir licença</button>'
      : '';
  const offboardAction =
    detail.status === 'OFFBOARDED'
      ? ''
      : '<button class="danger-button" data-detail-action="offboard" type="button">Desligar colaborador</button>';

  const container = element('employee-detail');
  container.innerHTML = `
    <div class="detail-content">
      <div class="detail-header">
        <div>
          <p class="eyebrow">COLABORADOR</p>
          <h2>${escapeHtml(detail.name)}</h2>
          <div class="detail-meta">${escapeHtml(detail.email)} · ${escapeHtml(detail.department)}</div>
        </div>
        <button class="icon-button" data-detail-action="close" type="button" aria-label="Fechar">×</button>
      </div>
      <div>${statusBadge(detail.status)}</div>
      <section class="detail-section">
        <h3>Licenças ativas (${detail.activeLicenses.length})</h3>
        <div class="department-list">${licenses}</div>
      </section>
      <div class="detail-actions">${assignAction}${statusAction}${offboardAction}</div>
    </div>`;
  container.dataset.employeeId = detail.id;
  container.dataset.employeeName = detail.name;
  openDialog('employee-detail-dialog');
}

async function updateEmployeeStatus(
  button: HTMLButtonElement,
  employeeId: string,
  status: 'ACTIVE' | 'ON_LEAVE',
): Promise<void> {
  await withBusyButton(button, async () => {
    await jsonRequest<Employee>(`/employees/${employeeId}/status`, 'PATCH', {
      status,
    });
    closeDialog(element<HTMLDialogElement>('employee-detail-dialog'));
    await refreshAll();
    showFeedback(
      'success',
      status === 'ON_LEAVE'
        ? 'Colaborador colocado em férias. As licenças existentes foram mantidas.'
        : 'Colaborador reativado com sucesso.',
    );
  });
}

async function offboardEmployee(
  button: HTMLButtonElement,
  employeeId: string,
  employeeName: string,
): Promise<void> {
  const confirmed = window.confirm(
    `Desligar ${employeeName}? Todas as licenças ativas desse colaborador serão revogadas.`,
  );
  if (!confirmed) return;
  await withBusyButton(button, async () => {
    const result = await jsonRequest<OffboardResult>(
      `/employees/${employeeId}/offboard`,
      'POST',
    );
    closeDialog(element<HTMLDialogElement>('employee-detail-dialog'));
    await refreshAll();
    showFeedback(
      'success',
      `${employeeName} foi desligado. ${result.revokedLicenses} ${result.revokedLicenses === 1 ? 'licença revogada' : 'licenças revogadas'} e ${formatMoney(result.monthlySavingsCents)} em economia mensal.`,
    );
  });
}

function setupNavigation(): void {
  const titles: Record<string, string> = {
    overview: 'Visão geral',
    products: 'Produtos',
    employees: 'Colaboradores',
    licenses: 'Atribuições',
  };

  const navigate = (section: string) => {
    const safeSection = section in titles ? section : 'overview';
    document.querySelectorAll<HTMLElement>('.page-section').forEach((item) => {
      item.hidden = item.id !== `${safeSection}-section`;
      item.classList.toggle('active', !item.hidden);
    });
    document
      .querySelectorAll<HTMLButtonElement>('.nav-item')
      .forEach((item) => {
        item.classList.toggle('active', item.dataset.section === safeSection);
      });
    element('page-title').textContent = titles[safeSection];
    window.history.replaceState(null, '', `#${safeSection}`);
  };

  document
    .querySelectorAll<HTMLButtonElement>('.nav-item')
    .forEach((button) => {
      button.addEventListener('click', () =>
        navigate(button.dataset.section ?? ''),
      );
    });
  navigate(window.location.hash.slice(1));
}

function setupDialogs(): void {
  document
    .querySelectorAll<HTMLButtonElement>('.close-dialog')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = button.closest('dialog');
        if (dialog instanceof HTMLDialogElement) closeDialog(dialog);
      });
    });
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });
}

function setupForms(): void {
  const productCost = element<HTMLInputElement>('product-cost');
  productCost.addEventListener('input', () =>
    productCost.setCustomValidity(''),
  );
  productCost.addEventListener('blur', () => {
    const cents = parseCurrencyToCents(productCost.value);
    if (cents !== null) productCost.value = formatMoneyInput(cents);
  });

  element('new-product-button').addEventListener('click', () =>
    openProductForm(),
  );
  element('new-employee-button').addEventListener('click', () => {
    element<HTMLFormElement>('employee-form').reset();
    openDialog('employee-dialog');
  });
  element('new-license-button').addEventListener('click', () => {
    element<HTMLFormElement>('license-form').reset();
    renderSelects();
    openDialog('license-dialog');
  });

  element<HTMLFormElement>('product-form').addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const button = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      if (!button) return;
      const costInput = element<HTMLInputElement>('product-cost');
      const monthlyCostCents = parseCurrencyToCents(costInput.value);
      if (monthlyCostCents === null) {
        costInput.setCustomValidity(
          'Informe um valor em reais com até duas casas decimais, como 189,00.',
        );
        costInput.reportValidity();
        return;
      }
      void withBusyButton(button, async () => {
        const id = element<HTMLInputElement>('product-id').value;
        const body = {
          name: element<HTMLInputElement>('product-name').value.trim(),
          vendor: element<HTMLInputElement>('product-vendor').value.trim(),
          monthlyCostCents,
          totalSeats: Number(element<HTMLInputElement>('product-seats').value),
        };
        await jsonRequest<Product>(
          id ? `/products/${id}` : '/products',
          id ? 'PATCH' : 'POST',
          body,
        );
        closeDialog(element<HTMLDialogElement>('product-dialog'));
        await refreshAll();
        showFeedback(
          'success',
          id
            ? 'Produto atualizado com sucesso.'
            : 'Produto criado com sucesso.',
        );
      });
    },
  );

  element<HTMLFormElement>('employee-form').addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const button = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      if (!button) return;
      void withBusyButton(button, async () => {
        await jsonRequest<Employee>('/employees', 'POST', {
          name: element<HTMLInputElement>('employee-name').value.trim(),
          email: element<HTMLInputElement>('employee-email').value.trim(),
          department: element<HTMLInputElement>(
            'employee-department',
          ).value.trim(),
        });
        closeDialog(element<HTMLDialogElement>('employee-dialog'));
        await refreshAll();
        showFeedback('success', 'Colaborador criado como ACTIVE.');
      });
    },
  );

  element<HTMLFormElement>('license-form').addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const button = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      if (!button) return;
      void withBusyButton(button, async () => {
        await jsonRequest<LicenseAssignment>('/licenses', 'POST', {
          productId: element<HTMLSelectElement>('license-product').value,
          employeeId: element<HTMLSelectElement>('license-employee').value,
        });
        closeDialog(element<HTMLDialogElement>('license-dialog'));
        await refreshAll();
        showFeedback('success', 'Licença atribuída com sucesso.');
      });
    },
  );
}

function setupFilters(): void {
  element<HTMLFormElement>('employee-filters').addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const button = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      if (!button) return;
      void withBusyButton(button, async () => {
        state.displayedEmployees =
          await request<Employee[]>(employeeFilterPath());
        renderEmployees();
      });
    },
  );
  element('clear-employee-filters').addEventListener('click', () => {
    element<HTMLSelectElement>('employee-status-filter').value = '';
    element<HTMLInputElement>('employee-department-filter').value = '';
    state.displayedEmployees = state.employees;
    renderEmployees();
  });

  element<HTMLFormElement>('license-filters').addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const button = form.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      if (!button) return;
      void withBusyButton(button, async () => {
        state.displayedLicenses =
          await request<LicenseAssignment[]>(licenseFilterPath());
        renderLicenses();
      });
    },
  );
  element('clear-license-filters').addEventListener('click', () => {
    element<HTMLSelectElement>('license-product-filter').value = '';
    element<HTMLSelectElement>('license-employee-filter').value = '';
    element<HTMLSelectElement>('license-active-filter').value = '';
    state.displayedLicenses = state.licenses;
    renderLicenses();
  });
}

function setupTableActions(): void {
  element('products-table').addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.action === 'edit-product') {
      const product = state.products.find(
        (item) => item.id === target.dataset.id,
      );
      if (product) openProductForm(product);
    }
  });

  element('employees-table').addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.action === 'view-employee' && target.dataset.id) {
      void withBusyButton(target, () => openEmployeeDetail(target.dataset.id!));
    }
  });

  element('licenses-table').addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.action !== 'revoke-license' || !target.dataset.id)
      return;
    const assignment = state.licenses.find(
      (item) => item.id === target.dataset.id,
    );
    if (!assignment) return;
    const confirmed = window.confirm(
      `Revogar ${assignment.productName} de ${assignment.employeeName}?`,
    );
    if (!confirmed) return;
    void withBusyButton(target, async () => {
      await jsonRequest<LicenseAssignment>(
        `/licenses/${assignment.id}/revoke`,
        'POST',
      );
      await refreshAll();
      showFeedback('success', 'Licença revogada manualmente.');
    });
  });

  element('employee-detail').addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const container = element('employee-detail');
    const employeeId = container.dataset.employeeId;
    const employeeName = container.dataset.employeeName;
    if (!employeeId || !employeeName) return;

    if (target.dataset.detailAction === 'close') {
      closeDialog(element<HTMLDialogElement>('employee-detail-dialog'));
    } else if (target.dataset.detailAction === 'assign') {
      closeDialog(element<HTMLDialogElement>('employee-detail-dialog'));
      renderSelects();
      element<HTMLSelectElement>('license-employee').value = employeeId;
      openDialog('license-dialog');
    } else if (target.dataset.detailAction === 'status') {
      const status = target.dataset.status;
      if (status === 'ACTIVE' || status === 'ON_LEAVE') {
        void updateEmployeeStatus(target, employeeId, status);
      }
    } else if (target.dataset.detailAction === 'offboard') {
      void offboardEmployee(target, employeeId, employeeName);
    }
  });
}

function setupSocket(): void {
  const status = element('realtime-status');
  if (typeof io !== 'function') return;
  const socket = io();
  socket.on('connect', () => {
    status.classList.add('connected');
    status.classList.remove('disconnected');
    status.querySelector('span:last-child')!.textContent =
      'Tempo real conectado';
  });
  socket.on('disconnect', () => {
    status.classList.remove('connected');
    status.classList.add('disconnected');
    status.querySelector('span:last-child')!.textContent =
      'Tempo real desconectado';
  });
  socket.on('seats.threshold', (payload) => {
    const container = element('socket-alerts');
    const notice = document.createElement('div');
    notice.className = 'notice socket';
    const text = document.createElement('span');
    text.textContent = `Limite de ocupação: ${payload.productName} está com ${payload.seatsInUse} de ${payload.totalSeats} licenças em uso.`;
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar alerta');
    close.textContent = '×';
    close.addEventListener('click', () => notice.remove());
    notice.append(text, close);
    container.prepend(notice);
  });
}

async function initialize(): Promise<void> {
  setupNavigation();
  setupDialogs();
  setupForms();
  setupFilters();
  setupTableActions();
  setupSocket();
  try {
    await refreshAll();
  } catch (error) {
    showError(error);
    element('overview-loading').textContent =
      'Não foi possível carregar os dados. Recarregue a página para tentar novamente.';
  }
}

void initialize();
