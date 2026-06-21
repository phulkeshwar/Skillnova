import { test } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/utils/prisma.js';
import analyticsController from '../src/controllers/analytics.controller.js';

test('Analytics Controller - getDashboardSummary for INTERN', async () => {
  const originalNotificationCount = prisma.notification.count;
  const originalTaskCount = prisma.projectTask.count;
  const originalAttendanceCount = prisma.attendance.count;
  const originalUserFindUnique = prisma.user.findUnique;

  let notificationCountCalled = 0;
  prisma.notification.count = async () => {
    notificationCountCalled++;
    return 2;
  };

  let taskCountCalled = 0;
  prisma.projectTask.count = async () => {
    taskCountCalled++;
    return 1;
  };

  let attendanceCountCalled = 0;
  prisma.attendance.count = async () => {
    attendanceCountCalled++;
    return 5;
  };

  let findUniqueCalled = 0;
  prisma.user.findUnique = async () => {
    findUniqueCalled++;
    return { rating: 4.5 };
  };

  const req = {
    user: { id: 'u-intern', role: 'INTERN' },
    query: {},
  };

  let responseData = null;
  const res = {
    json(data) {
      responseData = data;
      return this;
    },
  };

  try {
    await analyticsController.getDashboardSummary(req, res, (err) => {
      if (err) assert.fail(err.message);
    });

    assert.equal(notificationCountCalled, 1);
    assert.equal(taskCountCalled, 5); // todo, inProgress, review, done, blocked
    assert.equal(attendanceCountCalled, 2);
    assert.equal(findUniqueCalled, 1);
    assert.ok(responseData);
    assert.equal(responseData.unreadNotifications, 2);
    assert.equal(responseData.rating, 4.5);
  } finally {
    prisma.notification.count = originalNotificationCount;
    prisma.projectTask.count = originalTaskCount;
    prisma.attendance.count = originalAttendanceCount;
    prisma.user.findUnique = originalUserFindUnique;
  }
});

test('Analytics Controller - getTeamProductivity returns mapped metrics', async () => {
  const originalUserFindMany = prisma.user.findMany;

  let findManyCalled = 0;
  prisma.user.findMany = async () => {
    findManyCalled++;
    return [
      {
        id: 'i-1',
        name: 'Intern One',
        email: 'i1@test.com',
        rating: 4.8,
        reports: [{ score: 8 }, { score: 10 }],
        projectTasks: [{ status: 'DONE' }, { status: 'TODO' }],
        attendances: [{ status: 'PRESENT' }, { status: 'ABSENT' }],
      },
    ];
  };

  const req = {
    user: { id: 'm-1', role: 'MENTOR' },
    query: {},
  };

  let responseData = null;
  const res = {
    json(data) {
      responseData = data;
      return this;
    },
  };

  try {
    await analyticsController.getTeamProductivity(req, res, (err) => {
      if (err) assert.fail(err.message);
    });

    assert.equal(findManyCalled, 1);
    assert.ok(responseData);
    assert.equal(responseData.items.length, 1);
    const intern = responseData.items[0];
    assert.equal(intern.id, 'i-1');
    assert.equal(intern.avgReportScore, 9);
    assert.equal(intern.taskCompletionRate, 50);
    assert.equal(intern.attendanceRate, 50);
  } finally {
    prisma.user.findMany = originalUserFindMany;
  }
});
