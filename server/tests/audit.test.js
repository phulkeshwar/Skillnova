import { test } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/utils/prisma.js';
import auditController from '../src/controllers/audit.controller.js';

test('Audit Controller - list returns paginated audit logs', async () => {
  const originalFindMany = prisma.auditLog.findMany;
  const originalCount = prisma.auditLog.count;

  let findManyCalled = 0;
  prisma.auditLog.findMany = async () => {
    findManyCalled++;
    return [
      {
        id: 'log-1',
        action: 'user.create',
        resource: 'user',
        resourceId: 'u-1',
        createdAt: new Date(),
        user: { name: 'Admin', email: 'admin@test.com', role: 'ADMIN' },
      },
    ];
  };

  let countCalled = 0;
  prisma.auditLog.count = async () => {
    countCalled++;
    return 1;
  };

  const req = {
    query: { page: '1', limit: '10', action: 'user.create' },
  };

  let responseData = null;
  const res = {
    json(data) {
      responseData = data;
      return this;
    },
  };

  try {
    await auditController.list(req, res, (err) => {
      if (err) assert.fail(err.message);
    });

    assert.equal(findManyCalled, 1);
    assert.equal(countCalled, 1);
    assert.ok(responseData);
    assert.equal(responseData.total, 1);
    assert.equal(responseData.items[0].id, 'log-1');
  } finally {
    prisma.auditLog.findMany = originalFindMany;
    prisma.auditLog.count = originalCount;
  }
});

test('Audit Controller - getByUser returns logs for target user', async () => {
  const originalFindUnique = prisma.user.findUnique;
  const originalFindMany = prisma.auditLog.findMany;
  const originalCount = prisma.auditLog.count;

  let findUniqueCalled = 0;
  prisma.user.findUnique = async () => {
    findUniqueCalled++;
    return {
      id: 'u-123',
      name: 'Test User',
    };
  };

  let findManyCalled = 0;
  prisma.auditLog.findMany = async () => {
    findManyCalled++;
    return [
      { id: 'log-2', action: 'auth.login.success', createdAt: new Date() },
    ];
  };

  let countCalled = 0;
  prisma.auditLog.count = async () => {
    countCalled++;
    return 1;
  };

  const req = {
    params: { userId: 'u-123' },
    query: { page: '1', limit: '10' },
  };

  let responseData = null;
  const res = {
    json(data) {
      responseData = data;
      return this;
    },
  };

  try {
    await auditController.getByUser(req, res, (err) => {
      if (err) assert.fail(err.message);
    });

    assert.equal(findUniqueCalled, 1);
    assert.equal(findManyCalled, 1);
    assert.equal(countCalled, 1);
    assert.ok(responseData);
    assert.equal(responseData.total, 1);
    assert.equal(responseData.items[0].id, 'log-2');
  } finally {
    prisma.user.findUnique = originalFindUnique;
    prisma.auditLog.findMany = originalFindMany;
    prisma.auditLog.count = originalCount;
  }
});
