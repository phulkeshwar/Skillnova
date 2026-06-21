// ════════════════════════════════════════════════════════════
//  Analytics Controller — dashboard summaries and team metrics
// ════════════════════════════════════════════════════════════
import prisma from '../utils/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { lru } from '../utils/lru.js';

// GET /analytics/dashboard — Role-scoped dashboard counts & stats
export const getDashboardSummary = asyncHandler(async (req, res) => {
  const { role, id: userId } = req.user;
  const now = new Date();

  // We cache based on userId and role for 10 seconds to improve performance
  const cacheKey = `analytics:dashboard:${userId}:${role}`;
  const data = await lru.wrap(cacheKey, 10, async () => {
    const common = {
      unreadNotifications: await prisma.notification.count({
        where: { userId, read: false },
      }),
    };

    if (role === 'INTERN') {
      const [todo, inProgress, review, done, blocked, totalAttendance, presentAttendance] = await Promise.all([
        prisma.projectTask.count({ where: { assigneeId: userId, status: 'TODO' } }),
        prisma.projectTask.count({ where: { assigneeId: userId, status: 'IN_PROGRESS' } }),
        prisma.projectTask.count({ where: { assigneeId: userId, status: 'REVIEW' } }),
        prisma.projectTask.count({ where: { assigneeId: userId, status: 'DONE' } }),
        prisma.projectTask.count({ where: { assigneeId: userId, status: 'BLOCKED' } }),
        prisma.attendance.count({ where: { userId } }),
        prisma.attendance.count({ where: { userId, status: 'PRESENT' } }),
      ]);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { rating: true },
      });

      return {
        ...common,
        tasks: { todo, inProgress, review, done, blocked },
        attendanceRate: totalAttendance ? Math.round((presentAttendance / totalAttendance) * 100) : 0,
        rating: user?.rating || 0,
      };
    }

    if (role === 'MENTOR') {
      const interns = await prisma.user.findMany({
        where: { role: 'INTERN', internProfile: { mentorId: userId } },
        select: { id: true },
      });
      const internIds = interns.map((i) => i.id);

      const [assignedInterns, pendingReports, upcomingMeetings] = await Promise.all([
        prisma.internProfile.count({ where: { mentorId: userId } }),
        prisma.report.count({
          where: {
            userId: { in: internIds },
            status: 'PENDING',
          },
        }),
        prisma.meeting.count({
          where: {
            OR: [
              { organizerId: userId },
              { attendees: { some: { userId } } },
            ],
            startsAt: { gte: now },
          },
        }),
      ]);

      return {
        ...common,
        assignedInterns,
        pendingReports,
        upcomingMeetings,
      };
    }

    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      const [pendingUsers, pendingReports, activeSessions, totalLogsToday] = await Promise.all([
        prisma.user.count({ where: { status: 'PENDING' } }),
        prisma.report.count({ where: { status: 'PENDING' } }),
        prisma.userSession.count({ where: { lastActive: { gte: new Date(now - 15 * 60000) } } }),
        prisma.auditLog.count({
          where: {
            createdAt: { gte: new Date(now.setHours(0, 0, 0, 0)) },
          },
        }),
      ]);

      return {
        ...common,
        pendingUsers,
        pendingReports,
        activeSessions,
        totalLogsToday,
      };
    }

    return common;
  });

  res.json(data);
});

// GET /analytics/team-productivity — Summarize task & attendance performance for a mentor's team
export const getTeamProductivity = asyncHandler(async (req, res) => {
  let mentorId = req.user.id;

  // Admins/Super Admins can pass a specific mentorId to query their team
  if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role) && req.query.mentorId) {
    mentorId = req.query.mentorId;
  }

  const cacheKey = `analytics:team-productivity:${mentorId}`;
  const data = await lru.wrap(cacheKey, 15, async () => {
    const interns = await prisma.user.findMany({
      where: {
        role: 'INTERN',
        internProfile: { mentorId },
      },
      select: {
        id: true,
        name: true,
        email: true,
        rating: true,
        reports: {
          where: { status: 'REVIEWED' },
          select: { score: true },
        },
        projectTasks: {
          select: { status: true },
        },
        attendances: {
          where: { date: { gte: new Date(Date.now() - 30 * 86400000) } },
          select: { status: true },
        },
      },
    });

    const items = interns.map((intern) => {
      const totalScores = intern.reports.reduce((sum, r) => sum + (r.score || 0), 0);
      const avgScore = intern.reports.length ? totalScores / intern.reports.length : 0;

      const totalTasks = intern.projectTasks.length;
      const completedTasks = intern.projectTasks.filter((t) => t.status === 'DONE').length;

      const totalAttendance = intern.attendances.length;
      const presentAttendance = intern.attendances.filter((a) => a.status === 'PRESENT').length;
      const attendanceRate = totalAttendance ? (presentAttendance / totalAttendance) * 100 : 0;

      return {
        id: intern.id,
        name: intern.name,
        email: intern.email,
        rating: intern.rating,
        avgReportScore: Math.round(avgScore * 10) / 10,
        taskCompletionRate: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0,
        attendanceRate: Math.round(attendanceRate),
      };
    });

    return { items };
  });

  res.json(data);
});

export default { getDashboardSummary, getTeamProductivity };
