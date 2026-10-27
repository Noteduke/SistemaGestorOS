import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ServiceOrderOpeningPage } from './ServiceOrderOpeningPage';
import { emptyIntake } from '../../api/openingWorkflow';

const customer = { publicId: '10000000-0000-0000-0000-000000000001', name: 'CLIENTE NOVO', personType: 'PF', documentHint: null };
const type = { publicId: '20000000-0000-0000-0000-000000000001', name: 'NOTEBOOK' };
const brand = { publicId: '30000000-0000-0000-0000-000000000001', name: 'DELL' };
const equipment = { publicId: '40000000-0000-0000-0000-000000000001', type, brand, model: 'LATITUDE', serialNumber: 'ABC', serialIdentificationStatus: 'IDENTIFIED', owner: customer, updatedAt: '2026-10-22T12:00:00.000Z' };
const initial = { publicId: '50000000-0000-0000-0000-000000000001', visibleNumber: 'HOS-0000001', numberValue: '1', status: 'IN_PROGRESS', customerPublicId: null, equipmentPublicId: null, equipmentDraft: null, equipmentDraftVersion: null, transferRequested: false, complaint: null, createdAt: '2026-10-22T12:00:00Z', updatedAt: '2026-10-22T12:00:00Z' };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

function setup(linked = false, existing = false, alreadyCreated = false) {
  let opening = { ...initial, customerCreatedDuringOpening: alreadyCreated, ...(linked ? { customerPublicId: customer.publicId, customer } : {}), ...(existing ? { equipmentPublicId: equipment.publicId, equipment } : {}) };
  let failCustomer = false, failIntake = false, duplicate = false;
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const fetch = vi.fn(async (url: string, options: RequestInit = {}) => {
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(String(options.body)) : {};
    calls.push({ url: String(url), method, body });
    if (url.endsWith('/openings/current')) return response({ data: opening });
    if (url.endsWith('/openings/options')) return response({ data: { initialStatus: { publicId: type.publicId, name: 'RECEPÇÃO' } } });
    if (url.endsWith('/people/customers') && method === 'POST') return failCustomer ? response({ error: { code: 'INVALID_CPF', message: 'CPF inválido.' } }, 400) : response({ data: customer, warnings: [] }, 201);
    if (url.startsWith('/api/v1/equipment-types')) return response({ data: [type], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } });
    if (url.startsWith('/api/v1/equipment-brands')) return response({ data: [brand], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } });
    if (url.includes('/equipment/opening-search')) return response({ data: duplicate || !url.includes('search=') ? [equipment] : [] });
    if (url.endsWith(`/openings/${initial.publicId}`) && method === 'PATCH') {
      if (failIntake && body.intakeData) return response({ error: { code: 'VALIDATION_ERROR', message: 'Validação recusada; campos preservados.' } }, 400);
      opening = { ...opening, ...body, ...(body.customerPublicId ? { customer } : {}), ...(body.equipmentPublicId ? { equipment } : {}) };
      return response({ data: opening });
    }
    if (url.endsWith('/confirm')) return response({ data: { publicId: 'saved-order', visibleNumber: initial.visibleNumber } }, 201);
    throw new Error(`Unexpected ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  const onConfirmed = vi.fn();
  render(<ServiceOrderOpeningPage csrfToken="csrf" canConfirmServiceOrderOpening canCreateEquipment canCreateCustomer canUpdateEquipment onConfirmed={onConfirmed} onBack={vi.fn()} />);
  return { user: userEvent.setup(), calls, onConfirmed, setFailure: (kind: 'customer' | 'intake', value: boolean) => { if (kind === 'customer') failCustomer = value; else failIntake = value; }, duplicate: () => { duplicate = true; } };
}

test('novo cliente é salvo uma vez, selecionado e seus equipamentos são carregados', async () => {
  const { user, calls } = setup();
  await screen.findByText('HOS-0000001');
  await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
  await user.type(screen.getByLabelText('Nome / Razão social'), 'Cliente novo');
  const form = screen.getByRole('dialog').querySelector('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect((await screen.findAllByText('CLIENTE NOVO')).length).toBeGreaterThan(0);
  expect(calls.filter(call => call.method === 'POST' && call.url.endsWith('/people/customers'))).toHaveLength(1);
  expect(calls.some(call => call.url.endsWith(`ownerPublicId=${customer.publicId}`))).toBe(true);
  expect(screen.queryByRole('button', { name: 'Novo cliente' })).not.toBeInTheDocument();
});

test('cancelar modal preserva atendimento; validação do cliente não apaga formulário', async () => {
  const { user, setFailure } = setup();
  await screen.findByText('HOS-0000001');
  await user.click(screen.getByRole('button', { name: 'Dados do atendimento' }));
  expect(screen.getByLabelText('Sintoma identificado')).toHaveValue('');
  expect(screen.getByLabelText('Reclamação do cliente')).toHaveValue('');
  expect(screen.getByLabelText('Acessórios')).toHaveValue('');
  await user.type(screen.getByLabelText('Acessórios'), 'CARREGADOR');
  await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
  await user.click(screen.getByRole('button', { name: 'Cancelar cadastro' }));
  expect(screen.getByLabelText('Acessórios')).toHaveValue('CARREGADOR');
  await user.click(screen.getByRole('button', { name: 'Novo cliente' }));
  await user.type(screen.getByLabelText('Nome / Razão social'), 'NOME PRESERVADO');
  setFailure('customer', true);
  await user.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
  expect(await screen.findByText('CPF inválido.')).toBeInTheDocument();
  expect(screen.getByLabelText('Nome / Razão social')).toHaveValue('NOME PRESERVADO');
});

test('sem série salva draft e permite confirmar; série duplicada oferece registro existente', async () => {
  const { user, calls, duplicate } = setup(true);
  await screen.findByText('CLIENTE NOVO');
  await user.click(screen.getByRole('button', { name: 'Novo equipamento' }));
  await screen.findByRole('option', { name: 'NOTEBOOK' });
  await user.selectOptions(screen.getByLabelText('Tipo do equipamento'), type.publicId);
  await user.selectOptions(screen.getByLabelText('Marca'), brand.publicId);
  await user.type(screen.getByLabelText('Modelo'), 'LATITUDE');
  await user.type(screen.getByLabelText('Número de série'), 'ABC');
  duplicate();
  await user.click(screen.getByRole('button', { name: 'Salvar novo equipamento na abertura' }));
  expect(await screen.findByRole('button', { name: /Usar equipamento existente/ })).toBeInTheDocument();
  expect(calls.filter(call => call.method === 'PATCH' && call.body.equipmentDraft)).toHaveLength(0);
  await user.click(screen.getByLabelText('Série não identificada'));
  await user.click(screen.getByRole('button', { name: 'Salvar novo equipamento na abertura' }));
  await screen.findByText('Novo equipamento da abertura');
  expect(calls.find(call => call.body.equipmentDraft)?.body.equipmentDraft).toEqual({ typePublicId: type.publicId, brandPublicId: brand.publicId, model: 'LATITUDE', serialNumber: null, serialIdentificationStatus: 'NOT_IDENTIFIED' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar OS' })).toBeEnabled());
});

test('atendimento recusado preserva campos e impede confirmação; nova tentativa salva uma única OS', async () => {
  const { user, calls, setFailure, onConfirmed } = setup(true, true);
  await screen.findByText('HOS-0000001');
  await user.click(screen.getByRole('button', { name: 'Dados do atendimento' }));
  await user.type(screen.getByLabelText('Reclamação do cliente'), 'NÃO LIGA');
  await user.type(screen.getByLabelText('Bateria'), 'SEM TESTE');
  setFailure('intake', true);
  await user.click(screen.getByRole('button', { name: 'Confirmar OS' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Prosseguir sem informar' }));
  await screen.findByText('A confirmação da OS não foi aceita. Revise os dados da abertura.');
  expect(screen.getByLabelText('Reclamação do cliente')).toHaveValue('NÃO LIGA');
  expect(calls.filter(call => call.url.endsWith('/confirm'))).toHaveLength(0);
  setFailure('intake', false);
  await user.click(screen.getByRole('button', { name: 'Confirmar OS' }));
  const save = within(screen.getByRole('dialog')).getByRole('button', { name: 'Prosseguir sem informar' });
  fireEvent.click(save); fireEvent.click(save);
  await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith('saved-order'));
  expect(calls.filter(call => call.url.endsWith('/confirm'))).toHaveLength(1);
  expect(calls.filter(call => call.body.intakeData).at(-1)?.body).toEqual({ complaint: 'NÃO LIGA', intakeData: { ...emptyIntake(), battery: 'SEM TESTE' } });
});


test('retomada mantém bloqueio de novo cliente; prioridades têm ordem e padrão aprovados', async () => {
 const {user}=setup(true,false,true);await screen.findByText('CLIENTE NOVO');expect(screen.queryByRole('button',{name:'Novo cliente'})).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'Dados do atendimento'}));
 const priority=screen.getByLabelText(/Prioridade/);expect(priority).toHaveValue('NORMAL');expect(within(priority).getAllByRole('option').map(x=>x.textContent)).toEqual(['Baixa prioridade','Normal','Urgente','Muito urgente']);
});
test('equipamento seleciona catálogo existente; obrigatório inválido recebe foco e erro', async () => {
 const {user}=setup(true);await screen.findByText('CLIENTE NOVO');await user.click(screen.getByRole('button',{name:'Novo equipamento'}));await screen.findByRole('option',{name:'NOTEBOOK'});
 expect(screen.queryByRole('button',{name:/Adicionar tipo|Adicionar marca|Novo fabricante/i})).not.toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'Salvar novo equipamento na abertura'}));expect(screen.getByLabelText('Tipo do equipamento')).toHaveFocus();expect(screen.getByLabelText('Tipo do equipamento')).toHaveAttribute('aria-invalid','true');
 await user.selectOptions(screen.getByLabelText('Tipo do equipamento'),'20000000-0000-0000-0000-000000000001');expect(screen.getByLabelText('Tipo do equipamento')).toHaveAttribute('aria-invalid','false');
});
