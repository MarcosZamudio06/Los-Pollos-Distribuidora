import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../auth/auth.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const admin = { id: 'admin-1', name: 'Admin', email: 'admin@pollos.local', role: 'ADMIN', mustChangePassword: false };
const seller = { ...admin, id: 'seller-1', role: 'SELLER' };
const employee = { id: 'user-1', name: 'Ana', email: 'ana@pollos.local', phone: '2291234567', controlNumber: 'EPDP-000001', roleId: 'role-1', operationalLocationId: 'location-1', role: { id: 'role-1', name: 'SELLER' }, operationalLocation: { id: 'location-1', name: 'Matriz', type: 'BRANCH' }, isActive: true, mustChangePassword: true, createdAt: new Date(), updatedAt: new Date(), deactivatedAt: null, deactivatedByUserId: null, deactivationReason: null };

describe('UsersController employee API', () => {
  let app: INestApplication<App>; let service: jest.Mocked<Pick<UsersService, 'findAll' | 'create'>>;
  beforeEach(async () => {
    service = { findAll: jest.fn().mockResolvedValue({ items: [employee], total: 1, page: 1, limit: 20 }), create: jest.fn().mockResolvedValue({ ...employee, temporaryPassword: 'temporary-secret' }) };
    const module = await Test.createTestingModule({ controllers: [UsersController], providers: [
      { provide: UsersService, useValue: service },
      { provide: AuthService, useValue: { verifyAccessToken: jest.fn((token: string) => token === 'admin-token' ? Promise.resolve(admin) : token === 'seller-token' ? Promise.resolve(seller) : Promise.reject(new Error('invalid'))) } },
    ] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true })); await app.init();
  });
  afterEach(async () => app.close());
  it('denies unauthenticated and non-admin requests', async () => {
    await request(app.getHttpServer()).get('/api/users').expect(401);
    await request(app.getHttpServer()).get('/api/users').set('Authorization', 'Bearer seller-token').expect(403);
  });
  it('creates only valid employees and exposes temporary password only at creation', async () => {
    const payload = { name: 'Ana', email: 'ana@pollos.local', phone: '2291234567', roleId: 'role-1', operationalLocationId: 'location-1' };
    await request(app.getHttpServer()).post('/api/users').set('Authorization', 'Bearer admin-token').send(payload).expect(201).expect(({ body }) => { expect(body.data.temporaryPassword).toBe('temporary-secret'); expect(body.data.passwordHash).toBeUndefined(); });
    expect(service.create).toHaveBeenCalledWith(payload);
    await request(app.getHttpServer()).post('/api/users').set('Authorization', 'Bearer admin-token').send({ ...payload, phone: 'bad' }).expect(400);
  });
  it('forwards combined pagination filters for admins', async () => {
    await request(app.getHttpServer()).get('/api/users?search=ana&roleId=role-1&operationalLocationId=location-1&status=inactive&page=2&limit=10').set('Authorization', 'Bearer admin-token').expect(200).expect(({ body }) => { expect(body.data.total).toBe(1); expect(JSON.stringify(body)).not.toContain('temporary-secret'); });
    expect(service.findAll).toHaveBeenCalledWith({ search: 'ana', roleId: 'role-1', operationalLocationId: 'location-1', status: 'inactive', page: 2, limit: 10 });
  });
});
